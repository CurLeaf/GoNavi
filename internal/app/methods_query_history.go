package app

import (
	"encoding/json"
	"os"
	"path/filepath"
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
// sortBy: "duration" | "frequency" | "rowsReturned" | "recent"

// GetSlowQueries 返回当前连接的慢 SQL 历史，按 SQL 指纹聚合执行统计、按指定字段排序后取前 N。
// limit <= 0 时返回前 100 条。
func (a *App) GetSlowQueries(config connection.ConnectionConfig, dbName, sortBy string, limit int) connection.QueryResult {
	fingerprints, ok := queryHistoryConnectionFingerprints(config, dbName)
	if !ok {
		return connection.QueryResult{Success: false, Message: a.appText("query_history.backend.error.connection_fingerprint_invalid", nil)}
	}

	limit = normalizeQueryHistoryLimit(limit)
	primaryFingerprint := fingerprints[0]
	primaryStore := newQueryHistoryStore(a.configDir, primaryFingerprint)
	failedLegacyStores := make([]*queryHistoryStore, 0)
	for _, fingerprint := range fingerprints[1:] {
		legacyStore := newQueryHistoryStore(a.configDir, fingerprint)
		if err := migrateQueryHistoryStore(legacyStore, primaryStore, primaryFingerprint); err != nil {
			logger.Warnf("GetSlowQueries 迁移旧历史失败：legacyFp=%s targetFp=%s err=%v", fingerprint, primaryFingerprint, err)
			failedLegacyStores = append(failedLegacyStores, legacyStore)
		}
	}

	records, err := primaryStore.LoadAll()
	if err != nil {
		logger.Warnf("GetSlowQueries 加载失败：connFp=%s err=%v", primaryFingerprint, err)
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	for _, legacyStore := range failedLegacyStores {
		storeRecords, err := legacyStore.LoadAll()
		if err != nil {
			logger.Warnf("GetSlowQueries 加载旧历史失败：path=%s err=%v", legacyStore.filePath, err)
			return connection.QueryResult{Success: false, Message: err.Error()}
		}
		records = append(records, storeRecords...)
	}
	records = dedupeRawQueryHistoryRecords(records)
	records = aggregateQueryRecords(records)
	sortQueryRecords(records, strings.TrimSpace(sortBy))
	if len(records) > limit {
		records = records[:limit]
	}
	return connection.QueryResult{Success: true, Message: a.appText("query_history.backend.message.loaded", nil), Data: records}
}

// ClearSlowQueries 清空当前连接的慢 SQL 历史。
// 删除主文件 + rotate 文件（.1）。
func (a *App) ClearSlowQueries(config connection.ConnectionConfig, dbName string) connection.QueryResult {
	fingerprints, ok := queryHistoryConnectionFingerprints(config, dbName)
	if !ok {
		return connection.QueryResult{Success: false, Message: a.appText("query_history.backend.error.connection_fingerprint_invalid", nil)}
	}
	for _, fingerprint := range fingerprints {
		if err := newQueryHistoryStore(a.configDir, fingerprint).Clear(); err != nil {
			logger.Warnf("ClearSlowQueries 失败：connFp=%s err=%v", fingerprint, err)
			return connection.QueryResult{Success: false, Message: err.Error()}
		}
	}
	return connection.QueryResult{Success: true, Message: a.appText("query_history.backend.message.cleared", nil)}
}

// queryHistoryConnectionFingerprints returns the stable ID-based fingerprint and
// the previous host/config-based fingerprint for backward-compatible reads/clear.
func queryHistoryConnectionFingerprints(config connection.ConnectionConfig, dbName string) ([]string, bool) {
	primary, ok := buildQueryHistoryConnectionFingerprint(config, dbName)
	if !ok || strings.TrimSpace(primary) == "" {
		return nil, false
	}
	fingerprints := []string{primary}
	seen := map[string]struct{}{primary: {}}
	for _, legacyConfig := range []connection.ConnectionConfig{normalizeRunConfig(config, dbName), config} {
		legacy, legacyOK := buildConnectionFingerprint(legacyConfig)
		if queryHistoryUsesOpaqueEndpoint(legacyConfig) || !legacyOK || strings.TrimSpace(legacy) == "" {
			continue
		}
		if _, exists := seen[legacy]; exists {
			continue
		}
		seen[legacy] = struct{}{}
		fingerprints = append(fingerprints, legacy)
	}
	return fingerprints, true
}

func migrateQueryHistoryStore(source, target *queryHistoryStore, targetFingerprint string) error {
	if source == nil || target == nil || source.filePath == target.filePath {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(target.filePath), 0o700); err != nil {
		return err
	}
	migrationLock, err := acquireQueryHistoryFileLock(target.filePath + ".migration.lock")
	if err != nil {
		return err
	}
	defer migrationLock.Close()
	// Source and target data locks stay held for the complete copy+clear window.
	// A legacy process that appends concurrently waits until clear finishes and
	// then writes a new source record, which the next read migrates; no record is
	// deleted between a stale snapshot and source.Clear().
	return withQueryHistoryStoresLocked([]*queryHistoryStore{source, target}, func() error {
		sourceRecords := decodeQueryHistorySnapshots(source.readFileSnapshots())
		if len(sourceRecords) == 0 {
			return nil
		}
		targetRecords := decodeQueryHistorySnapshots(target.readFileSnapshots())
		seen := make(map[string]struct{}, len(targetRecords)+len(sourceRecords))
		for _, record := range targetRecords {
			seen[queryHistoryRawRecordKey(record)] = struct{}{}
		}
		for _, record := range sourceRecords {
			key := queryHistoryRawRecordKey(record)
			if _, exists := seen[key]; exists {
				continue
			}
			record.ConnectionFP = targetFingerprint
			if err := target.appendLocked(record); err != nil {
				return err
			}
			seen[key] = struct{}{}
		}
		return source.clearLocked()
	})
}

func dedupeRawQueryHistoryRecords(records []connection.QueryExecutionRecord) []connection.QueryExecutionRecord {
	if len(records) < 2 {
		return records
	}
	seen := make(map[string]struct{}, len(records))
	result := make([]connection.QueryExecutionRecord, 0, len(records))
	for _, record := range records {
		key := queryHistoryRawRecordKey(record)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, record)
	}
	return result
}

func queryHistoryRawRecordKey(record connection.QueryExecutionRecord) string {
	if id := strings.TrimSpace(record.ID); id != "" {
		return "id:" + id
	}
	payload, _ := json.Marshal(record)
	return "record:" + string(payload)
}

// recordQueryExecution 追加一条慢查询记录。仅慢查询会触发一次小型追加写；同步写入确保
// 执行完成后立刻可见，并避免异步追加与清空操作发生乱序。
func (a *App) recordQueryExecution(config connection.ConnectionConfig, dbName, dbType, sql string, durationMs, rowsRead, rowsReturned int64) {
	if durationMs < queryHistorySlowThresholdMs {
		return
	}
	runConfig := normalizeRunConfig(config, dbName)
	record := buildQueryExecutionRecord(runConfig, dbName, dbType, sql, durationMs, rowsRead, rowsReturned)
	if strings.TrimSpace(record.ConnectionFP) == "" {
		logger.Warnf("跳过慢查询记录：连接指纹无效 dbType=%s", dbType)
		return
	}
	store := newQueryHistoryStore(a.configDir, record.ConnectionFP)
	store.Append(record)
}

// queryResultRowsReturned 只统计真实查询结果集，affectedRows 写操作摘要不计入返回行数。
func queryResultRowsReturned(result connection.QueryResult) int64 {
	if result.Data == nil {
		return 0
	}
	switch data := result.Data.(type) {
	case []map[string]interface{}:
		return int64(len(data))
	case []connection.ResultSetData:
		var total int64
		for _, resultSet := range data {
			if isAffectedRowsResultSet(resultSet) {
				continue
			}
			total += int64(len(resultSet.Rows))
		}
		return total
	default:
		return 0
	}
}

func isAffectedRowsResultSet(resultSet connection.ResultSetData) bool {
	return len(resultSet.Columns) == 1 && strings.EqualFold(strings.TrimSpace(resultSet.Columns[0]), "affectedRows")
}
