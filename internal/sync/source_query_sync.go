package sync

import (
	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
	"fmt"
	"strings"
)

type sourceQuerySyncContext struct {
	TableName        string
	TargetSchema     string
	TargetTable      string
	TargetQueryTable string
	TargetType       string
	TargetCols       []connection.ColumnDefinition
	PKColumn         string
	SourceRows       []map[string]interface{}
	TargetRows       []map[string]interface{}
}

func hasSourceQuery(config SyncConfig) bool {
	return strings.TrimSpace(config.SourceQuery) != ""
}

func validateSourceQuerySyncConfig(config SyncConfig) (string, error) {
	sourceQuery := strings.TrimSpace(config.SourceQuery)
	if sourceQuery == "" {
		return "", fmt.Errorf("源查询 SQL 不能为空")
	}

	content := strings.ToLower(strings.TrimSpace(config.Content))
	if content != "" && content != "data" {
		return "", fmt.Errorf("SQL 结果集同步当前仅支持“仅同步数据”")
	}

	if len(config.Tables) != 1 {
		return "", fmt.Errorf("SQL 结果集同步要求且仅允许选择一个目标表")
	}

	tableName := strings.TrimSpace(config.Tables[0])
	if tableName == "" {
		return "", fmt.Errorf("目标表不能为空")
	}
	return tableName, nil
}

func resolveTargetQueryTable(config SyncConfig, tableName string) (string, string, string, string) {
	targetType := resolveMigrationDBType(config.TargetConfig)
	targetSchema, targetTable := normalizeSchemaAndTable(targetType, config.TargetConfig.Database, tableName)
	targetQueryTable := qualifiedNameForQuery(targetType, targetSchema, targetTable, tableName)
	return targetType, targetSchema, targetTable, targetQueryTable
}

func resolveSinglePKColumn(cols []connection.ColumnDefinition) (string, error) {
	pkCols := make([]string, 0, 2)
	for _, col := range cols {
		if col.Key == "PRI" || col.Key == "PK" {
			pkCols = append(pkCols, col.Name)
		}
	}
	if len(pkCols) == 0 {
		return "", fmt.Errorf("目标表无主键，不支持基于 SQL 结果集的差异分析")
	}
	if len(pkCols) > 1 {
		return "", fmt.Errorf("目标表为复合主键（%s），暂不支持基于 SQL 结果集的差异分析", strings.Join(pkCols, ","))
	}
	return pkCols[0], nil
}

func loadSourceQuerySyncContext(config SyncConfig, sourceDB db.Database, targetDB db.Database, needTargetRows bool, requirePK bool) (sourceQuerySyncContext, error) {
	tableName, err := validateSourceQuerySyncConfig(config)
	if err != nil {
		return sourceQuerySyncContext{}, err
	}

	targetType, targetSchema, targetTable, targetQueryTable := resolveTargetQueryTable(config, tableName)
	targetCols, err := targetDB.GetColumns(targetSchema, targetTable)
	if err != nil {
		return sourceQuerySyncContext{}, fmt.Errorf("获取目标表字段失败: %w", err)
	}
	if len(targetCols) == 0 {
		return sourceQuerySyncContext{}, fmt.Errorf("目标表 %s 不存在或未读取到字段定义", tableName)
	}

	sourceRows, _, err := sourceDB.Query(strings.TrimSpace(config.SourceQuery))
	if err != nil {
		return sourceQuerySyncContext{}, fmt.Errorf("执行源查询失败: %w", err)
	}

	ctx := sourceQuerySyncContext{
		TableName:        tableName,
		TargetSchema:     targetSchema,
		TargetTable:      targetTable,
		TargetQueryTable: targetQueryTable,
		TargetType:       targetType,
		TargetCols:       targetCols,
		SourceRows:       sourceRows,
		TargetRows:       make([]map[string]interface{}, 0),
	}

	if requirePK {
		pkColumn, err := resolveSinglePKColumn(targetCols)
		if err != nil {
			return sourceQuerySyncContext{}, err
		}
		ctx.PKColumn = pkColumn
	}

	if needTargetRows {
		targetRows, _, err := targetDB.Query(fmt.Sprintf("SELECT * FROM %s", quoteQualifiedIdentByType(targetType, targetQueryTable)))
		if err != nil {
			return sourceQuerySyncContext{}, fmt.Errorf("读取目标表失败: %w", err)
		}
		ctx.TargetRows = targetRows
	}

	return ctx, nil
}

func diffRowsByPK(pkCol string, sourceRows, targetRows []map[string]interface{}) ([]map[string]interface{}, []connection.UpdateRow, []map[string]interface{}, int) {
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
	inserts := make([]map[string]interface{}, 0)
	updates := make([]connection.UpdateRow, 0)
	same := 0
	for _, sourceRow := range sourceRows {
		if sourceRow[pkCol] == nil {
			continue
		}
		pkVal := strings.TrimSpace(fmt.Sprintf("%v", sourceRow[pkCol]))
		if pkVal == "" || pkVal == "<nil>" {
			continue
		}
		sourcePKSet[pkVal] = struct{}{}
		if targetRow, exists := targetMap[pkVal]; exists {
			changes := make(map[string]interface{})
			for key, value := range sourceRow {
				if fmt.Sprintf("%v", value) != fmt.Sprintf("%v", targetRow[key]) {
					changes[key] = value
				}
			}
			if len(changes) == 0 {
				same++
				continue
			}
			updates = append(updates, connection.UpdateRow{
				Keys:   map[string]interface{}{pkCol: sourceRow[pkCol]},
				Values: changes,
			})
			continue
		}
		inserts = append(inserts, sourceRow)
	}

	deletes := make([]map[string]interface{}, 0)
	for pkVal, row := range targetMap {
		if _, exists := sourcePKSet[pkVal]; exists {
			continue
		}
		deletes = append(deletes, map[string]interface{}{pkCol: row[pkCol]})
	}
	return inserts, updates, deletes, same
}

func buildTargetColumnSet(cols []connection.ColumnDefinition) map[string]struct{} {
	targetColSet := make(map[string]struct{}, len(cols))
	for _, col := range cols {
		lowerName := strings.ToLower(strings.TrimSpace(col.Name))
		if lowerName == "" {
			continue
		}
		targetColSet[lowerName] = struct{}{}
	}
	return targetColSet
}

func applyQuerySourceColumnFilter(changeSet connection.ChangeSet, targetCols []connection.ColumnDefinition) connection.ChangeSet {
	targetColSet := buildTargetColumnSet(targetCols)
	changeSet.Inserts = filterInsertRows(changeSet.Inserts, targetColSet)
	changeSet.Updates = filterUpdateRows(changeSet.Updates, targetColSet)
	return changeSet
}

func (s *SyncEngine) analyzeSourceQuery(config SyncConfig) SyncAnalyzeResult {
	result := SyncAnalyzeResult{Success: true, Tables: []TableDiffSummary{}}
	tableName, err := validateSourceQuerySyncConfig(config)
	if err != nil {
		return SyncAnalyzeResult{Success: false, Message: err.Error()}
	}

	totalTables := 1
	s.progress(config.JobID, 0, totalTables, tableName, "差异分析开始")

	sourceDB, err := newSyncDatabase(config.SourceConfig.Type)
	if err != nil {
		return SyncAnalyzeResult{Success: false, Message: "初始化源数据库驱动失败: " + err.Error()}
	}
	targetDB, err := newSyncDatabase(config.TargetConfig.Type)
	if err != nil {
		return SyncAnalyzeResult{Success: false, Message: "初始化目标数据库驱动失败: " + err.Error()}
	}

	if err := sourceDB.Connect(config.SourceConfig); err != nil {
		return SyncAnalyzeResult{Success: false, Message: "源数据库连接失败: " + err.Error()}
	}
	defer sourceDB.Close()

	if err := targetDB.Connect(config.TargetConfig); err != nil {
		return SyncAnalyzeResult{Success: false, Message: "目标数据库连接失败: " + err.Error()}
	}
	defer targetDB.Close()

	summary := TableDiffSummary{
		Table:   tableName,
		CanSync: false,
	}
	ctx, err := loadSourceQuerySyncContext(config, sourceDB, targetDB, true, true)
	if err != nil {
		summary.Message = err.Error()
		result.Tables = append(result.Tables, summary)
		result.Message = "已完成 1 个目标表的差异分析"
		s.progress(config.JobID, totalTables, totalTables, tableName, "差异分析完成")
		return result
	}

	inserts, updates, deletes, same := diffRowsByPK(ctx.PKColumn, ctx.SourceRows, ctx.TargetRows)
	summary.CanSync = true
	summary.PKColumn = ctx.PKColumn
	summary.Inserts = len(inserts)
	summary.Updates = len(updates)
	summary.Deletes = len(deletes)
	summary.Same = same
	summary.TargetTableExists = true
	summary.Message = "SQL 结果集差异分析完成"
	result.Tables = append(result.Tables, summary)
	result.Message = "已完成 1 个目标表的差异分析"
	s.progress(config.JobID, totalTables, totalTables, tableName, "差异分析完成")
	return result
}

func (s *SyncEngine) previewSourceQuery(config SyncConfig, limit int) (TableDiffPreview, error) {
	sourceDB, err := newSyncDatabase(config.SourceConfig.Type)
	if err != nil {
		return TableDiffPreview{}, fmt.Errorf("初始化源数据库驱动失败: %w", err)
	}
	targetDB, err := newSyncDatabase(config.TargetConfig.Type)
	if err != nil {
		return TableDiffPreview{}, fmt.Errorf("初始化目标数据库驱动失败: %w", err)
	}

	if err := sourceDB.Connect(config.SourceConfig); err != nil {
		return TableDiffPreview{}, fmt.Errorf("源数据库连接失败: %w", err)
	}
	defer sourceDB.Close()

	if err := targetDB.Connect(config.TargetConfig); err != nil {
		return TableDiffPreview{}, fmt.Errorf("目标数据库连接失败: %w", err)
	}
	defer targetDB.Close()

	ctx, err := loadSourceQuerySyncContext(config, sourceDB, targetDB, true, true)
	if err != nil {
		return TableDiffPreview{}, err
	}

	inserts, updates, deletes, _ := diffRowsByPK(ctx.PKColumn, ctx.SourceRows, ctx.TargetRows)
	out := TableDiffPreview{
		Table:         ctx.TableName,
		PKColumn:      ctx.PKColumn,
		ColumnTypes:   make(map[string]string, len(ctx.TargetCols)),
		SchemaSummary: "SQL 结果集同步预览",
		TotalInserts:  len(inserts),
		TotalUpdates:  len(updates),
		TotalDeletes:  len(deletes),
		Inserts:       make([]PreviewRow, 0, minInt(limit, len(inserts))),
		Updates:       make([]PreviewUpdateRow, 0, minInt(limit, len(updates))),
		Deletes:       make([]PreviewRow, 0, minInt(limit, len(deletes))),
	}
	for _, col := range ctx.TargetCols {
		name := strings.ToLower(strings.TrimSpace(col.Name))
		typ := strings.TrimSpace(col.Type)
		if name == "" || typ == "" {
			continue
		}
		out.ColumnTypes[name] = typ
	}

	for idx, row := range inserts {
		if idx >= limit {
			break
		}
		pk := strings.TrimSpace(fmt.Sprintf("%v", row[ctx.PKColumn]))
		out.Inserts = append(out.Inserts, PreviewRow{PK: pk, Row: row})
	}
	for idx, update := range updates {
		if idx >= limit {
			break
		}
		pk := strings.TrimSpace(fmt.Sprintf("%v", update.Keys[ctx.PKColumn]))
		targetRow := map[string]interface{}{}
		for _, row := range ctx.TargetRows {
			if fmt.Sprintf("%v", row[ctx.PKColumn]) == fmt.Sprintf("%v", update.Keys[ctx.PKColumn]) {
				targetRow = row
				break
			}
		}
		sourceRow := map[string]interface{}{}
		for _, row := range ctx.SourceRows {
			if fmt.Sprintf("%v", row[ctx.PKColumn]) == fmt.Sprintf("%v", update.Keys[ctx.PKColumn]) {
				sourceRow = row
				break
			}
		}
		changedColumns := make([]string, 0, len(update.Values))
		for column := range update.Values {
			changedColumns = append(changedColumns, column)
		}
		out.Updates = append(out.Updates, PreviewUpdateRow{
			PK:             pk,
			ChangedColumns: changedColumns,
			Source:         sourceRow,
			Target:         targetRow,
		})
	}
	for idx, row := range deletes {
		if idx >= limit {
			break
		}
		pk := strings.TrimSpace(fmt.Sprintf("%v", row[ctx.PKColumn]))
		out.Deletes = append(out.Deletes, PreviewRow{PK: pk, Row: row})
	}
	return out, nil
}

func (s *SyncEngine) runSourceQuerySync(config SyncConfig) SyncResult {
	result := SyncResult{Success: true, Logs: []string{}}
	tableName, err := validateSourceQuerySyncConfig(config)
	if err != nil {
		return s.fail(config.JobID, 1, result, err.Error())
	}

	totalTables := 1
	tableMode := normalizeSyncMode(config.Mode)
	s.progress(config.JobID, 0, totalTables, tableName, "开始同步")
	s.appendLog(config.JobID, &result, "info", fmt.Sprintf("同步来源：SQL 结果集 -> 目标表 %s；模式：%s", tableName, tableMode))

	sourceDB, err := newSyncDatabase(config.SourceConfig.Type)
	if err != nil {
		return s.fail(config.JobID, totalTables, result, "初始化源数据库驱动失败: "+err.Error())
	}
	targetDB, err := newSyncDatabase(config.TargetConfig.Type)
	if err != nil {
		return s.fail(config.JobID, totalTables, result, "初始化目标数据库驱动失败: "+err.Error())
	}

	if err := sourceDB.Connect(config.SourceConfig); err != nil {
		return s.fail(config.JobID, totalTables, result, "源数据库连接失败: "+err.Error())
	}
	defer sourceDB.Close()

	if err := targetDB.Connect(config.TargetConfig); err != nil {
		return s.fail(config.JobID, totalTables, result, "目标数据库连接失败: "+err.Error())
	}
	defer targetDB.Close()

	opts := TableOptions{Insert: true, Update: true, Delete: false}
	if config.TableOptions != nil {
		if configured, ok := config.TableOptions[tableName]; ok {
			opts = configured
		}
	}
	if !opts.Insert && !opts.Update && !opts.Delete {
		s.appendLog(config.JobID, &result, "info", fmt.Sprintf("目标表 %s 未勾选任何操作，已跳过", tableName))
		s.progress(config.JobID, totalTables, totalTables, tableName, "同步完成")
		return result
	}

	needTargetRows := tableMode == "insert_update"
	requirePK := tableMode == "insert_update"
	ctx, err := loadSourceQuerySyncContext(config, sourceDB, targetDB, needTargetRows, requirePK)
	if err != nil {
		return s.fail(config.JobID, totalTables, result, err.Error())
	}

	inserts := make([]map[string]interface{}, 0)
	updates := make([]connection.UpdateRow, 0)
	deletes := make([]map[string]interface{}, 0)
	if tableMode == "insert_update" {
		inserts, updates, deletes, _ = diffRowsByPK(ctx.PKColumn, ctx.SourceRows, ctx.TargetRows)
		inserts = filterRowsByPKSelection(ctx.PKColumn, inserts, opts.Insert, opts.SelectedInsertPKs)
		updates = filterUpdatesByPKSelection(ctx.PKColumn, updates, opts.Update, opts.SelectedUpdatePKs)
		deletes = filterRowsByPKSelection(ctx.PKColumn, deletes, opts.Delete, opts.SelectedDeletePKs)
	} else {
		inserts = ctx.SourceRows
		if !opts.Insert {
			inserts = nil
		}
		if tableMode == "full_overwrite" {
			s.progress(config.JobID, 0, totalTables, tableName, "清空目标表")
			clearSQL := fmt.Sprintf("DELETE FROM %s", quoteQualifiedIdentByType(ctx.TargetType, ctx.TargetQueryTable))
			if ctx.TargetType == "mysql" {
				clearSQL = fmt.Sprintf("TRUNCATE TABLE %s", quoteQualifiedIdentByType(ctx.TargetType, ctx.TargetQueryTable))
			}
			if _, err := targetDB.Exec(clearSQL); err != nil {
				return s.fail(config.JobID, totalTables, result, "清空目标表失败: "+err.Error())
			}
		}
	}

	changeSet := applyQuerySourceColumnFilter(connection.ChangeSet{
		Inserts: inserts,
		Updates: updates,
		Deletes: deletes,
	}, ctx.TargetCols)
	if len(changeSet.Inserts) == 0 && len(changeSet.Updates) == 0 && len(changeSet.Deletes) == 0 {
		s.appendLog(config.JobID, &result, "info", "SQL 结果集与目标表一致，无需应用变更")
		result.TablesSynced++
		s.progress(config.JobID, totalTables, totalTables, tableName, "同步完成")
		return result
	}

	applyTableName := ctx.TargetTable
	switch ctx.TargetType {
	case "postgres", "kingbase", "highgo", "vastbase", "opengauss", "sqlserver":
		applyTableName = ctx.TargetQueryTable
	}
	applier, ok := targetDB.(db.BatchApplier)
	if !ok {
		return s.fail(config.JobID, totalTables, result, "目标驱动不支持应用数据变更 (ApplyChanges)")
	}
	if err := applier.ApplyChanges(applyTableName, changeSet); err != nil {
		return s.fail(config.JobID, totalTables, result, "应用 SQL 结果集变更失败: "+err.Error())
	}

	result.TablesSynced++
	result.RowsInserted += len(changeSet.Inserts)
	result.RowsUpdated += len(changeSet.Updates)
	result.RowsDeleted += len(changeSet.Deletes)
	s.appendLog(config.JobID, &result, "info", fmt.Sprintf("SQL 结果集同步完成：插入=%d 更新=%d 删除=%d", len(changeSet.Inserts), len(changeSet.Updates), len(changeSet.Deletes)))
	s.progress(config.JobID, totalTables, totalTables, tableName, "同步完成")
	return result
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
