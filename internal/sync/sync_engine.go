package sync

import (
	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
	"GoNavi-Wails/internal/logger"
	"fmt"
	"sort"
	"strings"
	"time"
)

// SyncConfig defines the parameters for a synchronization task
type SyncConfig struct {
	SourceConfig        connection.ConnectionConfig `json:"sourceConfig"`
	TargetConfig        connection.ConnectionConfig `json:"targetConfig"`
	Tables              []string                    `json:"tables"`
	SourceQuery         string                      `json:"sourceQuery,omitempty"`
	Content             string                      `json:"content,omitempty"` // "data", "schema", "both"
	Mode                string                      `json:"mode"`              // "insert_update", "insert_only", "full_overwrite"
	JobID               string                      `json:"jobId,omitempty"`
	AutoAddColumns      bool                        `json:"autoAddColumns,omitempty"` // 自动补齐缺失字段
	TargetTableStrategy string                      `json:"targetTableStrategy,omitempty"`
	CreateIndexes       bool                        `json:"createIndexes,omitempty"`
	MongoCollectionName string                      `json:"mongoCollectionName,omitempty"`
	TableOptions        map[string]TableOptions     `json:"tableOptions,omitempty"`
}

// SyncResult holds the result of the sync operation
type SyncResult struct {
	Success      bool     `json:"success"`
	Message      string   `json:"message"`
	Logs         []string `json:"logs"`
	TablesSynced int      `json:"tablesSynced"`
	RowsInserted int      `json:"rowsInserted"`
	RowsUpdated  int      `json:"rowsUpdated"`
	RowsDeleted  int      `json:"rowsDeleted"`
}

type SyncEngine struct {
	reporter Reporter
}

func NewSyncEngine(reporter Reporter) *SyncEngine {
	return &SyncEngine{reporter: reporter}
}

// CompareAndSync performs the synchronization
func (s *SyncEngine) RunSync(config SyncConfig) SyncResult {
	result := SyncResult{Success: true, Logs: []string{}}
	logger.Infof("开始数据同步：源=%s 目标=%s 表数量=%d", formatConnSummaryForSync(config.SourceConfig), formatConnSummaryForSync(config.TargetConfig), len(config.Tables))
	if isRedisToMongoKeyspacePair(config) {
		return s.runRedisToMongoSync(config, result)
	}
	if isMongoToRedisKeyspacePair(config) {
		return s.runMongoToRedisSync(config, result)
	}
	if hasSourceQuery(config) {
		return s.runSourceQuerySync(config)
	}

	totalTables := len(config.Tables)
	s.progress(config.JobID, 0, totalTables, "", "开始同步")

	contentRaw := strings.ToLower(strings.TrimSpace(config.Content))
	syncSchema := false
	syncData := true
	switch contentRaw {
	case "", "data":
		syncData = true
	case "schema":
		syncSchema = true
		syncData = false
	case "both":
		syncSchema = true
		syncData = true
	default:
		s.appendLog(config.JobID, &result, "warn", fmt.Sprintf("未知同步内容 %q，已自动使用仅同步数据", config.Content))
		syncData = true
	}

	modeRaw := strings.ToLower(strings.TrimSpace(config.Mode))
	if modeRaw != "" && modeRaw != "insert_update" && modeRaw != "insert_only" && modeRaw != "full_overwrite" {
		s.appendLog(config.JobID, &result, "warn", fmt.Sprintf("未知同步模式 %q，已自动使用 insert_update", config.Mode))
	}
	defaultMode := normalizeSyncMode(config.Mode)
	strategy := normalizeTargetTableStrategy(config.TargetTableStrategy)

	contentLabel := "仅同步数据"
	if syncSchema && syncData {
		contentLabel = "同步结构+数据"
	} else if syncSchema {
		contentLabel = "仅同步结构"
	}
	s.appendLog(config.JobID, &result, "info", fmt.Sprintf("同步内容：%s；模式：%s；自动补字段：%v；目标表策略：%s；创建索引：%v", contentLabel, defaultMode, config.AutoAddColumns, strategy, config.CreateIndexes))

	sourceDB, err := newSyncDatabase(config.SourceConfig.Type)
	if err != nil {
		logger.Error(err, "初始化源数据库驱动失败：类型=%s", config.SourceConfig.Type)
		return s.fail(config.JobID, totalTables, result, "初始化源数据库驱动失败: "+err.Error())
	}
	if config.SourceConfig.Type == "custom" {
		// Custom DB setup would go here if needed
	}

	targetDB, err := newSyncDatabase(config.TargetConfig.Type)
	if err != nil {
		logger.Error(err, "初始化目标数据库驱动失败：类型=%s", config.TargetConfig.Type)
		return s.fail(config.JobID, totalTables, result, "初始化目标数据库驱动失败: "+err.Error())
	}

	// Connect Source
	s.appendLog(config.JobID, &result, "info", fmt.Sprintf("正在连接源数据库: %s...", config.SourceConfig.Host))
	s.progress(config.JobID, 0, totalTables, "", "连接源数据库")
	if err := sourceDB.Connect(config.SourceConfig); err != nil {
		logger.Error(err, "源数据库连接失败：%s", formatConnSummaryForSync(config.SourceConfig))
		return s.fail(config.JobID, totalTables, result, "源数据库连接失败: "+err.Error())
	}
	defer sourceDB.Close()

	// Connect Target
	s.appendLog(config.JobID, &result, "info", fmt.Sprintf("正在连接目标数据库: %s...", config.TargetConfig.Host))
	s.progress(config.JobID, 0, totalTables, "", "连接目标数据库")
	if err := targetDB.Connect(config.TargetConfig); err != nil {
		logger.Error(err, "目标数据库连接失败：%s", formatConnSummaryForSync(config.TargetConfig))
		return s.fail(config.JobID, totalTables, result, "目标数据库连接失败: "+err.Error())
	}
	defer targetDB.Close()

	for i, tableName := range config.Tables {
		func() {
			tableMode := defaultMode
			s.appendLog(config.JobID, &result, "info", fmt.Sprintf("正在同步表: %s", tableName))
			s.progress(config.JobID, i, totalTables, tableName, fmt.Sprintf("同步表(%d/%d)", i+1, totalTables))
			defer s.progress(config.JobID, i+1, totalTables, tableName, "表处理完成")

			plan, cols, targetCols, err := buildSchemaMigrationPlan(config, tableName, sourceDB, targetDB)
			if err != nil {
				s.appendLog(config.JobID, &result, "error", fmt.Sprintf("生成迁移计划失败：表=%s 错误=%v", tableName, err))
				return
			}
			for _, warning := range plan.Warnings {
				s.appendLog(config.JobID, &result, "warn", fmt.Sprintf("  -> %s", warning))
			}
			for _, unsupported := range plan.UnsupportedObjects {
				s.appendLog(config.JobID, &result, "warn", fmt.Sprintf("  -> %s", unsupported))
			}
			if strings.TrimSpace(plan.PlannedAction) != "" {
				s.appendLog(config.JobID, &result, "info", fmt.Sprintf("  -> %s", plan.PlannedAction))
			}

			if !plan.TargetTableExists && !plan.AutoCreate {
				s.appendLog(config.JobID, &result, "warn", fmt.Sprintf("表 %s 目标表不存在，当前策略不允许自动建表，已跳过", tableName))
				return
			}

			if !plan.TargetTableExists && plan.AutoCreate {
				s.progress(config.JobID, i, totalTables, tableName, "创建目标表")
				if len(plan.PreDataSQL) > 0 {
					if err := executeSQLStatements(targetDB.Exec, plan.PreDataSQL); err != nil {
						s.appendLog(config.JobID, &result, "error", fmt.Sprintf("预执行建表 SQL 失败：表=%s 错误=%v", tableName, err))
						return
					}
				}
				if strings.TrimSpace(plan.CreateTableSQL) == "" {
					s.appendLog(config.JobID, &result, "error", fmt.Sprintf("表 %s 自动建表失败：建表 SQL 为空", tableName))
					return
				}
				if _, err := targetDB.Exec(plan.CreateTableSQL); err != nil {
					s.appendLog(config.JobID, &result, "error", fmt.Sprintf("创建目标表失败：表=%s 错误=%v", tableName, err))
					return
				}
				s.appendLog(config.JobID, &result, "info", fmt.Sprintf("目标表创建成功：%s", tableName))
				targetCols, err = targetDB.GetColumns(plan.TargetSchema, plan.TargetTable)
				if err != nil {
					s.appendLog(config.JobID, &result, "error", fmt.Sprintf("创建目标表后获取字段失败：表=%s 错误=%v", tableName, err))
					return
				}
			} else if len(plan.PreDataSQL) > 0 {
				s.progress(config.JobID, i, totalTables, tableName, "同步表结构")
				if err := executeSQLStatements(targetDB.Exec, plan.PreDataSQL); err != nil {
					s.appendLog(config.JobID, &result, "error", fmt.Sprintf("同步表结构失败：表=%s 错误=%v", tableName, err))
					return
				}
				targetCols, err = targetDB.GetColumns(plan.TargetSchema, plan.TargetTable)
				if err != nil {
					s.appendLog(config.JobID, &result, "warn", fmt.Sprintf("补字段后刷新目标字段失败：表=%s 错误=%v", tableName, err))
				}
			}

			if !syncData {
				if len(plan.PostDataSQL) > 0 {
					s.progress(config.JobID, i, totalTables, tableName, "创建索引")
					if err := executeSQLStatements(targetDB.Exec, plan.PostDataSQL); err != nil {
						s.appendLog(config.JobID, &result, "error", fmt.Sprintf("创建索引失败：表=%s 错误=%v", tableName, err))
						return
					}
				}
				result.TablesSynced++
				return
			}

			targetType := resolveMigrationDBType(config.TargetConfig)
			sourceType := resolveMigrationDBType(config.SourceConfig)
			targetTable := plan.TargetTable
			sourceQueryTable, targetQueryTable := plan.SourceQueryTable, plan.TargetQueryTable
			applyTableName := targetTable
			switch targetType {
			case "postgres", "kingbase", "highgo", "vastbase", "opengauss", "sqlserver":
				applyTableName = targetQueryTable
			}

			sourceColsByLower := make(map[string]connection.ColumnDefinition, len(cols))
			for _, col := range cols {
				if strings.TrimSpace(col.Name) == "" {
					continue
				}
				sourceColsByLower[strings.ToLower(strings.TrimSpace(col.Name))] = col
			}

			pkCols := make([]string, 0, 2)
			for _, col := range cols {
				if col.Key == "PRI" || col.Key == "PK" {
					pkCols = append(pkCols, col.Name)
				}
			}
			requirePK := tableMode == "insert_update" && plan.TargetTableExists
			pkCol := ""
			if requirePK {
				if len(pkCols) == 0 {
					s.appendLog(config.JobID, &result, "warn", fmt.Sprintf("表 %s 未找到主键，当前模式需要差异对比，已跳过", tableName))
					return
				}
				if len(pkCols) > 1 {
					s.appendLog(config.JobID, &result, "warn", fmt.Sprintf("表 %s 为复合主键（%s），当前暂不支持差异同步", tableName, strings.Join(pkCols, ",")))
					return
				}
				pkCol = pkCols[0]
			}

			opts := TableOptions{Insert: true, Update: true, Delete: false}
			if config.TableOptions != nil {
				if t, ok := config.TableOptions[tableName]; ok {
					opts = t
				}
			}
			if !opts.Insert && !opts.Update && !opts.Delete {
				s.appendLog(config.JobID, &result, "info", fmt.Sprintf("表 %s 未勾选任何操作，已跳过", tableName))
				return
			}

			s.progress(config.JobID, i, totalTables, tableName, "读取源表数据")
			sourceRows, _, err := sourceDB.Query(fmt.Sprintf("SELECT * FROM %s", quoteQualifiedIdentByType(sourceType, sourceQueryTable)))
			if err != nil {
				logger.Error(err, "读取源表失败：表=%s", tableName)
				s.appendLog(config.JobID, &result, "error", fmt.Sprintf("读取源表 %s 失败: %v", tableName, err))
				return
			}

			var inserts []map[string]interface{}
			var updates []connection.UpdateRow
			var deletes []map[string]interface{}

			if tableMode == "insert_update" && plan.TargetTableExists {
				s.progress(config.JobID, i, totalTables, tableName, "读取目标表数据")
				targetRows, _, err := targetDB.Query(fmt.Sprintf("SELECT * FROM %s", quoteQualifiedIdentByType(targetType, targetQueryTable)))
				if err != nil {
					logger.Error(err, "读取目标表失败：表=%s", tableName)
					s.appendLog(config.JobID, &result, "error", fmt.Sprintf("读取目标表 %s 失败: %v", tableName, err))
					return
				}

				s.progress(config.JobID, i, totalTables, tableName, "对比差异")
				targetMap := make(map[string]map[string]interface{}, len(targetRows))
				for _, row := range targetRows {
					if row[pkCol] == nil {
						continue
					}
					pkVal := fmt.Sprintf("%v", row[pkCol])
					if strings.TrimSpace(pkVal) == "" || pkVal == "<nil>" {
						continue
					}
					targetMap[pkVal] = row
				}
				sourcePKSet := make(map[string]struct{}, len(sourceRows))
				for _, sRow := range sourceRows {
					if sRow[pkCol] == nil {
						continue
					}
					pkVal := fmt.Sprintf("%v", sRow[pkCol])
					if strings.TrimSpace(pkVal) == "" || pkVal == "<nil>" {
						continue
					}
					sourcePKSet[pkVal] = struct{}{}
					if tRow, exists := targetMap[pkVal]; exists {
						changes := make(map[string]interface{})
						for k, v := range sRow {
							if fmt.Sprintf("%v", v) != fmt.Sprintf("%v", tRow[k]) {
								changes[k] = v
							}
						}
						if len(changes) > 0 {
							updates = append(updates, connection.UpdateRow{Keys: map[string]interface{}{pkCol: sRow[pkCol]}, Values: changes})
						}
					} else {
						inserts = append(inserts, sRow)
					}
				}
				if opts.Delete {
					for pkStr, row := range targetMap {
						if _, ok := sourcePKSet[pkStr]; ok {
							continue
						}
						deletes = append(deletes, map[string]interface{}{pkCol: row[pkCol]})
					}
				}
				inserts = filterRowsByPKSelection(pkCol, inserts, opts.Insert, opts.SelectedInsertPKs)
				updates = filterUpdatesByPKSelection(pkCol, updates, opts.Update, opts.SelectedUpdatePKs)
				deletes = filterRowsByPKSelection(pkCol, deletes, opts.Delete, opts.SelectedDeletePKs)
			} else {
				inserts = sourceRows
				if !opts.Insert {
					inserts = nil
				}
				if tableMode == "full_overwrite" && plan.TargetTableExists {
					s.appendLog(config.JobID, &result, "warn", fmt.Sprintf("  -> 全量覆盖模式：即将清空目标表 %s", tableName))
					s.progress(config.JobID, i, totalTables, tableName, "清空目标表")
					clearSQL := ""
					if targetType == "mysql" {
						clearSQL = fmt.Sprintf("TRUNCATE TABLE %s", quoteQualifiedIdentByType(targetType, targetQueryTable))
					} else {
						clearSQL = fmt.Sprintf("DELETE FROM %s", quoteQualifiedIdentByType(targetType, targetQueryTable))
					}
					if _, err := targetDB.Exec(clearSQL); err != nil {
						s.appendLog(config.JobID, &result, "error", fmt.Sprintf("  -> 清空目标表失败: %v", err))
						return
					}
				}
			}

			changeSet := connection.ChangeSet{Inserts: inserts, Updates: updates, Deletes: deletes}
			s.progress(config.JobID, i, totalTables, tableName, "检查字段一致性")
			targetColsResolved := targetCols
			if len(targetColsResolved) == 0 {
				targetColsResolved, err = targetDB.GetColumns(plan.TargetSchema, plan.TargetTable)
				if err != nil {
					s.appendLog(config.JobID, &result, "warn", fmt.Sprintf("  -> 获取目标表字段失败，已跳过字段一致性检查: %v", err))
				}
			}
			if len(targetColsResolved) > 0 {
				targetColSet := make(map[string]struct{}, len(targetColsResolved))
				for _, c := range targetColsResolved {
					name := strings.ToLower(strings.TrimSpace(c.Name))
					if name == "" {
						continue
					}
					targetColSet[name] = struct{}{}
				}
				requiredCols := collectRequiredColumns(changeSet.Inserts, changeSet.Updates)
				missing := make([]string, 0)
				for lower, original := range requiredCols {
					if _, ok := targetColSet[lower]; !ok {
						missing = append(missing, original)
					}
				}
				sort.Strings(missing)
				if len(missing) > 0 {
					if config.AutoAddColumns && supportsAutoAddColumnsForPair(sourceType, targetType) {
						s.appendLog(config.JobID, &result, "warn", fmt.Sprintf("  -> 目标表缺少字段 %d 个，开始自动补齐: %s", len(missing), strings.Join(missing, ", ")))
						added := 0
						for _, colName := range missing {
							colLower := strings.ToLower(strings.TrimSpace(colName))
							srcCol, ok := sourceColsByLower[colLower]
							if !ok {
								continue
							}
							alterSQL, err := buildAddColumnSQLForPair(sourceType, targetType, targetQueryTable, srcCol)
							if err != nil {
								s.appendLog(config.JobID, &result, "error", fmt.Sprintf("  -> 自动补字段失败：字段=%s 错误=%v", colName, err))
								continue
							}
							if _, err := targetDB.Exec(alterSQL); err != nil {
								s.appendLog(config.JobID, &result, "error", fmt.Sprintf("  -> 自动补字段失败：字段=%s 错误=%v", colName, err))
								continue
							}
							added++
							targetColSet[colLower] = struct{}{}
						}
						s.appendLog(config.JobID, &result, "info", fmt.Sprintf("  -> 自动补字段完成：成功=%d 失败=%d", added, len(missing)-added))
					} else {
						s.appendLog(config.JobID, &result, "warn", fmt.Sprintf("  -> 目标表缺少字段 %d 个（未开启自动补齐），将自动忽略：%s", len(missing), strings.Join(missing, ", ")))
					}
					changeSet.Inserts = filterInsertRows(changeSet.Inserts, targetColSet)
					changeSet.Updates = filterUpdateRows(changeSet.Updates, targetColSet)
				}
			}

			s.progress(config.JobID, i, totalTables, tableName, "应用变更")
			if len(changeSet.Inserts) > 0 || len(changeSet.Updates) > 0 || len(changeSet.Deletes) > 0 {
				s.appendLog(config.JobID, &result, "info", fmt.Sprintf("  -> 需插入: %d 行, 需更新: %d 行, 需删除: %d 行", len(changeSet.Inserts), len(changeSet.Updates), len(changeSet.Deletes)))
				if applier, ok := targetDB.(db.BatchApplier); ok {
					if err := applier.ApplyChanges(applyTableName, changeSet); err != nil {
						s.appendLog(config.JobID, &result, "error", fmt.Sprintf("  -> 应用变更失败: %v", err))
						return
					}
					result.RowsInserted += len(changeSet.Inserts)
					result.RowsUpdated += len(changeSet.Updates)
					result.RowsDeleted += len(changeSet.Deletes)
				} else {
					s.appendLog(config.JobID, &result, "warn", "  -> 目标驱动不支持应用数据变更 (ApplyChanges).")
					return
				}
			} else {
				s.appendLog(config.JobID, &result, "info", "  -> 数据一致，无需变更.")
			}

			if len(plan.PostDataSQL) > 0 {
				s.progress(config.JobID, i, totalTables, tableName, "创建索引")
				if err := executeSQLStatements(targetDB.Exec, plan.PostDataSQL); err != nil {
					s.appendLog(config.JobID, &result, "error", fmt.Sprintf("创建索引失败：表=%s 错误=%v", tableName, err))
					return
				}
			}

			result.TablesSynced++
		}()
	}

	s.progress(config.JobID, totalTables, totalTables, "", "同步完成")
	return result
}

func formatConnSummaryForSync(config connection.ConnectionConfig) string {
	timeoutSeconds := config.Timeout
	if timeoutSeconds <= 0 {
		timeoutSeconds = 30
	}

	dbName := strings.TrimSpace(config.Database)
	if dbName == "" {
		dbName = "(default)"
	}

	return fmt.Sprintf("类型=%s 地址=%s:%d 数据库=%s 用户=%s 超时=%ds",
		config.Type, config.Host, config.Port, dbName, config.User, timeoutSeconds)
}

func (s *SyncEngine) appendLog(jobID string, res *SyncResult, level string, msg string) {
	if res != nil {
		res.Logs = append(res.Logs, msg)
	}
	if s.reporter.OnLog != nil && strings.TrimSpace(jobID) != "" {
		s.reporter.OnLog(SyncLogEvent{
			JobID:   jobID,
			Level:   level,
			Message: msg,
			Ts:      time.Now().UnixMilli(),
		})
	}
}

func (s *SyncEngine) progress(jobID string, current, total int, table string, stage string) {
	if s.reporter.OnProgress == nil || strings.TrimSpace(jobID) == "" {
		return
	}
	percent := 0
	if total <= 0 {
		if current > 0 {
			percent = 100
		}
	} else {
		if current < 0 {
			current = 0
		}
		if current > total {
			current = total
		}
		percent = (current * 100) / total
	}
	s.reporter.OnProgress(SyncProgressEvent{
		JobID:   jobID,
		Percent: percent,
		Current: current,
		Total:   total,
		Table:   table,
		Stage:   stage,
	})
}

func (s *SyncEngine) fail(jobID string, totalTables int, res SyncResult, msg string) SyncResult {
	res.Success = false
	res.Message = msg
	s.appendLog(jobID, &res, "error", "致命错误: "+msg)
	s.progress(jobID, res.TablesSynced, totalTables, "", "同步失败")
	return res
}

func (s *SyncEngine) execDDLStatements(jobID string, res *SyncResult, database db.Database, tableName string, stage string, statements []string) error {
	for _, statement := range statements {
		sqlText := strings.TrimSpace(statement)
		if sqlText == "" {
			continue
		}
		if _, err := database.Exec(sqlText); err != nil {
			return fmt.Errorf("%s失败: %w", stage, err)
		}
		s.appendLog(jobID, res, "info", fmt.Sprintf("表 %s %s成功：%s", tableName, stage, shortenSyncSQL(sqlText)))
	}
	return nil
}

func shortenSyncSQL(sqlText string) string {
	text := strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(sqlText, "\n", " "), "\t", " "))
	text = strings.Join(strings.Fields(text), " ")
	if len(text) <= 120 {
		return text
	}
	return text[:117] + "..."
}
