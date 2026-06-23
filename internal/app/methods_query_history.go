package app

import (
	"strings"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/logger"
)

// 慢 SQL 历史的 Wails 绑定入口。
//
// 前端调用：
//   - GetSlowQueries(connectionId, dbName, sortBy, limit) → []QueryExecutionRecord
//   - ClearSlowQueries(connectionId, dbName) → 错误（清空当前连接的历史）
//
// sortBy: "duration" | "rowsRead" | "recent"

// GetSlowQueries 返回当前连接的慢 SQL 历史，按指定字段排序、SQL 指纹去重后取前 N。
// limit <= 0 时返回前 100 条。
func (a *App) GetSlowQueries(config connection.ConnectionConfig, dbName, sortBy string, limit int) connection.QueryResult {
	runConfig := normalizeRunConfig(config, dbName)
	connFP, ok := buildConnectionFingerprint(runConfig)
	if !ok || connFP == "" {
		return connection.QueryResult{Success: false, Message: a.appText("query_history.backend.error.connection_fingerprint_invalid", nil)}
	}

	if limit <= 0 {
		limit = 100
	}
	store := newQueryHistoryStore(a.configDir, connFP)
	records, err := store.LoadTopN(strings.TrimSpace(sortBy), limit, true)
	if err != nil {
		logger.Warnf("GetSlowQueries 加载失败：connFp=%s err=%v", connFP, err)
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	return connection.QueryResult{Success: true, Message: a.appText("query_history.backend.message.loaded", nil), Data: records}
}

// ClearSlowQueries 清空当前连接的慢 SQL 历史。
// 删除主文件 + rotate 文件（.1）。
func (a *App) ClearSlowQueries(config connection.ConnectionConfig, dbName string) connection.QueryResult {
	runConfig := normalizeRunConfig(config, dbName)
	connFP, ok := buildConnectionFingerprint(runConfig)
	if !ok || connFP == "" {
		return connection.QueryResult{Success: false, Message: a.appText("query_history.backend.error.connection_fingerprint_invalid", nil)}
	}
	store := newQueryHistoryStore(a.configDir, connFP)
	if err := store.Clear(); err != nil {
		logger.Warnf("ClearSlowQueries 失败：connFp=%s err=%v", connFP, err)
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	return connection.QueryResult{Success: true, Message: a.appText("query_history.backend.message.cleared", nil)}
}

// recordQueryExecutionAsync 异步追加一条慢查询记录，不阻塞主查询返回。
// 调用方应传入已计算的 durationMs 和 rowsRead/Returned。
func (a *App) recordQueryExecutionAsync(config connection.ConnectionConfig, dbType, sql string, durationMs, rowsRead, rowsReturned int64) {
	if durationMs < queryHistorySlowThresholdMs {
		return
	}
	record := buildQueryExecutionRecord(config, dbType, sql, durationMs, rowsRead, rowsReturned)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				logger.Warnf("recordQueryExecutionAsync panic：%v", r)
			}
		}()
		store := newQueryHistoryStore(a.configDir, record.ConnectionFP)
		store.Append(record)
	}()
}
