package app

import (
	"fmt"
	"strings"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
)

func (a *App) ApplyChanges(config connection.ConnectionConfig, dbName, tableName string, changes connection.ChangeSet) (result connection.QueryResult) {
	auditSQL := fmt.Sprintf("APPLY CHANGES TO %s", strings.TrimSpace(tableName))
	defer a.beginSQLAuditUserAction(config, dbName, "data_editor", &auditSQL, &result)()
	if err := ensureConnectionAllowsDataEdit(config, "connection.backend.action.apply_result_changes"); err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	runConfig := normalizeRunConfig(config, dbName)

	dbInst, err := a.getDatabase(runConfig)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	if applier, ok := dbInst.(db.BatchApplier); ok && runtimeSupportsBatchApply(dbInst) {
		targetTableName := resolveChangeTargetTableName(config, dbName, tableName)
		preview := buildChangePreview(dbInst, config, targetTableName, changes)
		err := applier.ApplyChanges(targetTableName, changes)
		if err != nil {
			return connection.QueryResult{
				Success:        false,
				Message:        err.Error(),
				Data:           preview,
				OutcomeUnknown: db.IsWriteOutcomeUnknown(err),
			}
		}
		// 提交成功后才留快照：失败或结果未知时数据库状态本身不确定，生成反向语句会伪装成"可还原"。
		a.captureDMLSnapshot(config, dbName, targetTableName, changes)
		return connection.QueryResult{Success: true, Message: a.appText("file.backend.message.transaction_committed", nil), Data: preview}
	}

	return connection.QueryResult{Success: false, Message: a.appText("file.backend.error.batch_commit_unsupported", nil)}
}
