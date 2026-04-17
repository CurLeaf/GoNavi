package sync

import (
	"GoNavi-Wails/internal/logger"
	"fmt"
	"strings"
)

type TableDiffSummary struct {
	Table              string   `json:"table"`
	PKColumn           string   `json:"pkColumn,omitempty"`
	CanSync            bool     `json:"canSync"`
	Inserts            int      `json:"inserts"`
	Updates            int      `json:"updates"`
	Deletes            int      `json:"deletes"`
	Same               int      `json:"same"`
	SchemaDiffCount    int      `json:"schemaDiffCount,omitempty"`
	Message            string   `json:"message,omitempty"`
	HasSchema          bool     `json:"hasSchema,omitempty"`
	TargetTableExists  bool     `json:"targetTableExists,omitempty"`
	PlannedAction      string   `json:"plannedAction,omitempty"`
	Warnings           []string `json:"warnings,omitempty"`
	UnsupportedObjects []string `json:"unsupportedObjects,omitempty"`
	IndexesToCreate    int      `json:"indexesToCreate,omitempty"`
	IndexesSkipped     int      `json:"indexesSkipped,omitempty"`
}

type SyncAnalyzeResult struct {
	Success bool               `json:"success"`
	Message string             `json:"message"`
	Tables  []TableDiffSummary `json:"tables"`
}

func (s *SyncEngine) Analyze(config SyncConfig) SyncAnalyzeResult {
	result := SyncAnalyzeResult{Success: true, Tables: []TableDiffSummary{}}
	if isRedisToMongoKeyspacePair(config) {
		return s.analyzeRedisToMongo(config)
	}
	if isMongoToRedisKeyspacePair(config) {
		return s.analyzeMongoToRedis(config)
	}

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
		s.appendLog(config.JobID, nil, "warn", fmt.Sprintf("未知同步内容 %q，已自动使用仅同步数据", config.Content))
		syncData = true
	}

	totalTables := len(config.Tables)
	s.progress(config.JobID, 0, totalTables, "", "差异分析开始")

	sourceDB, err := newSyncDatabase(config.SourceConfig.Type)
	if err != nil {
		logger.Error(err, "初始化源数据库驱动失败：类型=%s", config.SourceConfig.Type)
		return SyncAnalyzeResult{Success: false, Message: "初始化源数据库驱动失败: " + err.Error()}
	}
	targetDB, err := newSyncDatabase(config.TargetConfig.Type)
	if err != nil {
		logger.Error(err, "初始化目标数据库驱动失败：类型=%s", config.TargetConfig.Type)
		return SyncAnalyzeResult{Success: false, Message: "初始化目标数据库驱动失败: " + err.Error()}
	}

	if err := sourceDB.Connect(config.SourceConfig); err != nil {
		logger.Error(err, "源数据库连接失败：%s", formatConnSummaryForSync(config.SourceConfig))
		return SyncAnalyzeResult{Success: false, Message: "源数据库连接失败: " + err.Error()}
	}
	defer sourceDB.Close()

	if err := targetDB.Connect(config.TargetConfig); err != nil {
		logger.Error(err, "目标数据库连接失败：%s", formatConnSummaryForSync(config.TargetConfig))
		return SyncAnalyzeResult{Success: false, Message: "目标数据库连接失败: " + err.Error()}
	}
	defer targetDB.Close()

	for i, tableName := range config.Tables {
		func() {
			s.progress(config.JobID, i, totalTables, tableName, fmt.Sprintf("分析表(%d/%d)", i+1, totalTables))

			summary := TableDiffSummary{
				Table:     tableName,
				CanSync:   false,
				Inserts:   0,
				Updates:   0,
				Deletes:   0,
				Same:      0,
				Message:   "",
				HasSchema: syncSchema,
			}

			plan, cols, _, err := buildSchemaMigrationPlan(config, tableName, sourceDB, targetDB)
			if err != nil {
				summary.Message = err.Error()
				result.Tables = append(result.Tables, summary)
				return
			}
			summary.TargetTableExists = plan.TargetTableExists
			summary.PlannedAction = plan.PlannedAction
			summary.Warnings = append(summary.Warnings, plan.Warnings...)
			summary.UnsupportedObjects = append(summary.UnsupportedObjects, plan.UnsupportedObjects...)
			summary.IndexesToCreate = plan.IndexesToCreate
			summary.IndexesSkipped = plan.IndexesSkipped
			summary.SchemaDiffCount = len(plan.PreDataSQL) + len(plan.PostDataSQL)

			if !plan.TargetTableExists && !plan.AutoCreate {
				summary.Message = firstNonEmpty(plan.PlannedAction, "目标表不存在，无法执行同步")
				result.Tables = append(result.Tables, summary)
				return
			}

			if !syncData {
				summary.CanSync = true
				if summary.SchemaDiffCount > 0 {
					summary.Message = firstNonEmpty(plan.PlannedAction, fmt.Sprintf("检测到 %d 条结构变更", summary.SchemaDiffCount))
				} else {
					summary.Message = firstNonEmpty(plan.PlannedAction, "仅同步结构，未执行数据差异分析")
				}
				result.Tables = append(result.Tables, summary)
				return
			}

			tableMode := normalizeSyncMode(config.Mode)
			pkCols := make([]string, 0, 2)
			for _, c := range cols {
				if c.Key == "PRI" || c.Key == "PK" {
					pkCols = append(pkCols, c.Name)
				}
			}

			sourceRows, _, err := sourceDB.Query(fmt.Sprintf("SELECT * FROM %s", quoteQualifiedIdentByType(config.SourceConfig.Type, plan.SourceQueryTable)))
			if err != nil {
				summary.Message = "读取源表失败: " + err.Error()
				result.Tables = append(result.Tables, summary)
				return
			}

			if !plan.TargetTableExists && plan.AutoCreate {
				summary.CanSync = true
				summary.Inserts = len(sourceRows)
				summary.Message = firstNonEmpty(plan.PlannedAction, "目标表不存在，执行时将自动建表并导入全部源数据")
				result.Tables = append(result.Tables, summary)
				return
			}

			if tableMode != "insert_update" {
				summary.CanSync = true
				summary.Inserts = len(sourceRows)
				summary.Message = firstNonEmpty(plan.PlannedAction, "当前模式无需差异对比，将按源表数据执行导入")
				result.Tables = append(result.Tables, summary)
				return
			}

			if len(pkCols) == 0 {
				summary.Message = "无主键，不支持差异对比同步；如需直接导入请使用仅插入或全量覆盖模式"
				result.Tables = append(result.Tables, summary)
				return
			}
			if len(pkCols) > 1 {
				summary.Message = fmt.Sprintf("复合主键（%s），暂不支持差异对比同步", strings.Join(pkCols, ","))
				result.Tables = append(result.Tables, summary)
				return
			}
			summary.PKColumn = pkCols[0]

			targetRows, _, err := targetDB.Query(fmt.Sprintf("SELECT * FROM %s", quoteQualifiedIdentByType(config.TargetConfig.Type, plan.TargetQueryTable)))
			if err != nil {
				summary.Message = "读取目标表失败: " + err.Error()
				result.Tables = append(result.Tables, summary)
				return
			}

			pkCol := summary.PKColumn
			targetMap := make(map[string]map[string]interface{}, len(targetRows))
			for _, row := range targetRows {
				if row[pkCol] == nil {
					continue
				}
				pkVal := strings.TrimSpace(fmt.Sprintf("%v", row[pkCol]))
				if pkVal == "" || pkVal == "<nil>" {
					continue
				}
				targetMap[pkVal] = row
			}

			sourcePKSet := make(map[string]struct{}, len(sourceRows))
			for _, sRow := range sourceRows {
				if sRow[pkCol] == nil {
					continue
				}
				pkVal := strings.TrimSpace(fmt.Sprintf("%v", sRow[pkCol]))
				if pkVal == "" || pkVal == "<nil>" {
					continue
				}
				sourcePKSet[pkVal] = struct{}{}

				if tRow, exists := targetMap[pkVal]; exists {
					changed := false
					for k, v := range sRow {
						if fmt.Sprintf("%v", v) != fmt.Sprintf("%v", tRow[k]) {
							changed = true
							break
						}
					}
					if changed {
						summary.Updates++
					} else {
						summary.Same++
					}
				} else {
					summary.Inserts++
				}
			}

			for pkVal := range targetMap {
				if _, ok := sourcePKSet[pkVal]; !ok {
					summary.Deletes++
				}
			}

			summary.CanSync = true
			if strings.TrimSpace(summary.Message) == "" {
				summary.Message = firstNonEmpty(plan.PlannedAction, "差异分析完成")
			}
			result.Tables = append(result.Tables, summary)
		}()
	}

	s.progress(config.JobID, totalTables, totalTables, "", "差异分析完成")
	result.Message = fmt.Sprintf("已完成 %d 张表的差异分析", len(result.Tables))
	return result
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
