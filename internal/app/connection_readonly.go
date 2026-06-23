package app

import (
	"encoding/json"
	"errors"
	"strings"

	"GoNavi-Wails/internal/connection"
)

var connectionReadOnlySupportedTypes = map[string]struct{}{
	"clickhouse": {},
	"dameng":     {},
	"diros":      {},
	"duckdb":     {},
	"gaussdb":    {},
	"highgo":     {},
	"iris":       {},
	"kingbase":   {},
	"mariadb":    {},
	"mongodb":    {},
	"mysql":      {},
	"oceanbase":  {},
	"opengauss":  {},
	"oracle":     {},
	"postgres":   {},
	"sphinx":     {},
	"sqlite":     {},
	"sqlserver":  {},
	"starrocks":  {},
	"tdengine":   {},
	"trino":      {},
	"vastbase":   {},
}

var mongoReadOnlyCommands = map[string]struct{}{
	"aggregate":        {},
	"buildinfo":        {},
	"collstats":        {},
	"connectionstatus": {},
	"count":            {},
	"countdocuments":   {},
	"dbstats":          {},
	"distinct":         {},
	"explain":          {},
	"find":             {},
	"findone":          {},
	"getparameter":     {},
	"hello":            {},
	"hostinfo":         {},
	"ismaster":         {},
	"listcollections":  {},
	"listdatabases":    {},
	"listindexes":      {},
	"ping":             {},
	"serverstatus":     {},
}

var mongoWriteCommands = map[string]struct{}{
	"bulkwrite":        {},
	"collmod":          {},
	"create":           {},
	"createindexes":    {},
	"delete":           {},
	"drop":             {},
	"dropdatabase":     {},
	"dropindexes":      {},
	"findandmodify":    {},
	"insert":           {},
	"mapreduce":        {},
	"renamecollection": {},
	"update":           {},
}

var mongoMetaCommandKeys = map[string]struct{}{
	"$db":                  {},
	"$readpreference":      {},
	"api":                  {},
	"apideprecationerrors": {},
	"apistrict":            {},
	"comment":              {},
	"let":                  {},
	"lsid":                 {},
	"maxtimems":            {},
	"ordered":              {},
	"readconcern":          {},
	"writeconcern":         {},
}

var readOnlyConnectionActionTextKeys = map[string]string{
	"创建数据库":                                       "connection.backend.action.create_database",
	"connection.backend.action.create_database":       "connection.backend.action.create_database",
	"创建模式":                                        "connection.backend.action.create_schema",
	"connection.backend.action.create_schema":         "connection.backend.action.create_schema",
	"重命名模式":                                       "connection.backend.action.rename_schema",
	"connection.backend.action.rename_schema":         "connection.backend.action.rename_schema",
	"删除模式":                                        "connection.backend.action.drop_schema",
	"connection.backend.action.drop_schema":           "connection.backend.action.drop_schema",
	"重命名数据库":                                      "connection.backend.action.rename_database",
	"connection.backend.action.rename_database":       "connection.backend.action.rename_database",
	"删除数据库":                                       "connection.backend.action.drop_database",
	"connection.backend.action.drop_database":         "connection.backend.action.drop_database",
	"重命名表":                                        "connection.backend.action.rename_table",
	"connection.backend.action.rename_table":          "connection.backend.action.rename_table",
	"删除表":                                         "connection.backend.action.drop_table",
	"connection.backend.action.drop_table":            "connection.backend.action.drop_table",
	"删除视图":                                        "connection.backend.action.drop_view",
	"connection.backend.action.drop_view":             "connection.backend.action.drop_view",
	"删除函数或存储过程":                                   "connection.backend.action.drop_function_or_procedure",
	"connection.backend.action.drop_function_or_procedure": "connection.backend.action.drop_function_or_procedure",
	"重命名视图":                                       "connection.backend.action.rename_view",
	"connection.backend.action.rename_view":           "connection.backend.action.rename_view",
	"导入数据":                                        "connection.backend.action.import_data",
	"connection.backend.action.import_data":           "connection.backend.action.import_data",
	"提交结果修改":                                      "connection.backend.action.apply_result_changes",
	"connection.backend.action.apply_result_changes":  "connection.backend.action.apply_result_changes",
	"预览结果修改":                                      "connection.backend.action.preview_result_changes",
	"connection.backend.action.preview_result_changes": "connection.backend.action.preview_result_changes",
	"clear_table":                                    "connection.backend.action.clear_table",
	"connection.backend.action.clear_table":           "connection.backend.action.clear_table",
	"truncate_table":                                 "connection.backend.action.truncate_table",
	"connection.backend.action.truncate_table":        "connection.backend.action.truncate_table",
	"数据同步写入":                                       "connection.backend.action.data_sync_write",
	"connection.backend.action.data_sync_write":       "connection.backend.action.data_sync_write",
}

func supportsConnectionReadOnlyMode(config connection.ConnectionConfig) bool {
	_, ok := connectionReadOnlySupportedTypes[resolveDDLDBType(config)]
	return ok
}

func isConnectionForcedReadOnly(config connection.ConnectionConfig) bool {
	return config.ReadOnly && supportsConnectionReadOnlyMode(config)
}

func normalizeReadOnlyConnectionText(text func(string, map[string]any) string) func(string, map[string]any) string {
	if text != nil {
		return text
	}
	return defaultAppText
}

func readOnlyConnectionQueryBlockedMessageWithText(text func(string, map[string]any) string) string {
	text = normalizeReadOnlyConnectionText(text)
	return text("query_editor.message.connection_readonly_blocked", nil)
}

func resolveReadOnlyConnectionActionLabel(action string, text func(string, map[string]any) string) string {
	label := strings.TrimSpace(action)
	if label == "" {
		return ""
	}
	text = normalizeReadOnlyConnectionText(text)
	if key, ok := readOnlyConnectionActionTextKeys[label]; ok {
		return text(key, nil)
	}
	return label
}

func readOnlyConnectionQueryBlockedMessage() string {
	return readOnlyConnectionQueryBlockedMessageWithText(defaultAppText)
}

func readOnlyConnectionActionBlockedMessageWithText(action string, text func(string, map[string]any) string) string {
	label := resolveReadOnlyConnectionActionLabel(action, text)
	if label == "" {
		return readOnlyConnectionQueryBlockedMessageWithText(text)
	}
	text = normalizeReadOnlyConnectionText(text)
	return text("connection.backend.error.readonly_action_blocked", map[string]any{"action": label})
}

func readOnlyConnectionActionBlockedMessage(action string) string {
	return readOnlyConnectionActionBlockedMessageWithText(action, defaultAppText)
}

func ensureReadOnlyConnectionAllowsQueryWithText(config connection.ConnectionConfig, query string, text func(string, map[string]any) string) error {
	text = normalizeReadOnlyConnectionText(text)
	if !isConnectionForcedReadOnly(config) {
		return nil
	}
	for _, statement := range splitSQLStatements(query) {
		if trimmed := strings.TrimSpace(statement); trimmed != "" && !isReadOnlySQLQuery(resolveDDLDBType(config), trimmed) {
			return errors.New(readOnlyConnectionQueryBlockedMessageWithText(text))
		}
	}
	return nil
}

func ensureReadOnlyConnectionAllowsQuery(config connection.ConnectionConfig, query string) error {
	return ensureReadOnlyConnectionAllowsQueryWithText(config, query, defaultAppText)
}

func ensureReadOnlyConnectionAllowsActionWithText(config connection.ConnectionConfig, action string, text func(string, map[string]any) string) error {
	text = normalizeReadOnlyConnectionText(text)
	if !isConnectionForcedReadOnly(config) {
		return nil
	}
	return errors.New(readOnlyConnectionActionBlockedMessageWithText(action, text))
}

func ensureReadOnlyConnectionAllowsAction(config connection.ConnectionConfig, action string) error {
	return ensureReadOnlyConnectionAllowsActionWithText(config, action, defaultAppText)
}

func isReadOnlyMongoCommand(query string) bool {
	trimmed := strings.TrimSpace(query)
	if !strings.HasPrefix(trimmed, "{") {
		return false
	}
	var doc map[string]interface{}
	if err := json.Unmarshal([]byte(trimmed), &doc); err != nil {
		return false
	}
	commandKey := resolveMongoCommandKey(doc)
	if commandKey == "" {
		return false
	}
	if _, blocked := mongoWriteCommands[commandKey]; blocked {
		return false
	}
	_, allowed := mongoReadOnlyCommands[commandKey]
	return allowed
}

func resolveMongoCommandKey(doc map[string]interface{}) string {
	commandKey := ""
	for key := range doc {
		normalized := strings.ToLower(strings.TrimSpace(key))
		if normalized == "" {
			continue
		}
		if _, isMeta := mongoMetaCommandKeys[normalized]; isMeta {
			continue
		}
		if _, isWrite := mongoWriteCommands[normalized]; isWrite {
			return normalized
		}
		if _, isRead := mongoReadOnlyCommands[normalized]; isRead {
			commandKey = normalized
		}
	}
	return commandKey
}
