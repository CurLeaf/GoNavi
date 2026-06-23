package app

import (
	"encoding/json"
	"errors"
	"fmt"
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

func supportsConnectionReadOnlyMode(config connection.ConnectionConfig) bool {
	_, ok := connectionReadOnlySupportedTypes[resolveDDLDBType(config)]
	return ok
}

func isConnectionForcedReadOnly(config connection.ConnectionConfig) bool {
	return config.ReadOnly && supportsConnectionReadOnlyMode(config)
}

func readOnlyConnectionQueryBlockedMessage() string {
	return "当前连接已启用生产保护，仅允许执行查询操作"
}

func readOnlyConnectionActionBlockedMessage(action string) string {
	label := strings.TrimSpace(action)
	if label == "" {
		return readOnlyConnectionQueryBlockedMessage()
	}
	return fmt.Sprintf("当前连接已启用生产保护，禁止执行%s", label)
}

func ensureReadOnlyConnectionAllowsQuery(config connection.ConnectionConfig, query string) error {
	if !isConnectionForcedReadOnly(config) {
		return nil
	}
	for _, statement := range splitSQLStatements(query) {
		if trimmed := strings.TrimSpace(statement); trimmed != "" && !isReadOnlySQLQuery(resolveDDLDBType(config), trimmed) {
			return errors.New(readOnlyConnectionQueryBlockedMessage())
		}
	}
	return nil
}

func ensureReadOnlyConnectionAllowsAction(config connection.ConnectionConfig, action string) error {
	if !isConnectionForcedReadOnly(config) {
		return nil
	}
	return errors.New(readOnlyConnectionActionBlockedMessage(action))
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
