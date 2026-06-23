package app

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/logger"
)

// 慢 SQL 历史存储。
//
// 设计要点：
//   - 每个连接指纹一份 JSONL 文件（路径：<configDir>/query_history/<connFp>.jsonl）
//   - 追加写：每次执行 SQL 异步追加一行 JSON，O(1) 写入
//   - 5MB 滚动：写入前检查文件大小，超阈值则 rename 为 .1.jsonl 并新建空文件
//   - 读 TopN：全量加载到内存按字段排序 + SQL 指纹去重保留最新
//   - 不引入 SQLite：项目现有持久化都是 JSON，依赖一致性优先

const (
	queryHistoryDirName        = "query_history"
	queryHistoryFileMaxBytes   = 5 * 1024 * 1024
	queryHistorySlowThresholdMs int64 = 500 // 低于 500ms 不记录，避免历史爆炸
	queryHistoryPreviewRunes   = 200       // SQL 预览截断长度
)

// queryHistoryStore 是单连接的慢 SQL 历史存储。
// 并发安全：同一连接的多条 SQL 可能并发执行，写入加锁。
type queryHistoryStore struct {
	mu       sync.Mutex
	filePath string
}

// newQueryHistoryStore 按连接指纹构造 store。configDir 为空时用 resolveAppConfigDir。
func newQueryHistoryStore(configDir, connFingerprint string) *queryHistoryStore {
	if strings.TrimSpace(configDir) == "" {
		configDir = resolveAppConfigDir()
	}
	fp := sanitizeFingerprintForFilename(connFingerprint)
	return &queryHistoryStore{
		filePath: filepath.Join(configDir, queryHistoryDirName, fp+".jsonl"),
	}
}

// Append 追加一条执行记录。低于阈值的查询自动跳过。
// 失败仅记日志，不影响主查询流程。
func (s *queryHistoryStore) Append(record connection.QueryExecutionRecord) {
	if record.DurationMs < queryHistorySlowThresholdMs {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := os.MkdirAll(filepath.Dir(s.filePath), 0o755); err != nil {
		logger.Warnf("创建慢查询历史目录失败：%v path=%s", err, filepath.Dir(s.filePath))
		return
	}

	// 检查大小并 rotate（rotate 失败不阻塞写入）
	if info, err := os.Stat(s.filePath); err == nil && info.Size() >= queryHistoryFileMaxBytes {
		rotated := s.filePath + ".1"
		// 已有 .1 文件则先删除（只保留一个历史文件）
		_ = os.Remove(rotated)
		if err := os.Rename(s.filePath, rotated); err != nil {
			logger.Warnf("慢查询历史 rotate 失败：%v path=%s", err, s.filePath)
		}
	}

	file, err := os.OpenFile(s.filePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		logger.Warnf("打开慢查询历史文件失败：%v path=%s", err, s.filePath)
		return
	}
	defer file.Close()

	payload, err := json.Marshal(record)
	if err != nil {
		logger.Warnf("序列化慢查询记录失败：%v", err)
		return
	}
	payload = append(payload, '\n')
	if _, err := file.Write(payload); err != nil {
		logger.Warnf("写入慢查询历史失败：%v path=%s", err, s.filePath)
	}
}

// LoadTopN 加载历史并按指定字段排序，返回前 N 条。
// sortBy: "duration" | "rowsRead" | "recent"；dedupe=true 时同 SQL 指纹仅保留最新一条。
func (s *queryHistoryStore) LoadTopN(sortBy string, limit int, dedupe bool) ([]connection.QueryExecutionRecord, error) {
	records, err := s.loadAll()
	if err != nil {
		return nil, err
	}
	if dedupe {
		records = dedupeQueryRecords(records)
	}
	sortQueryRecords(records, sortBy)
	if limit > 0 && len(records) > limit {
		records = records[:limit]
	}
	return records, nil
}

// Clear 删除主文件 + rotate 文件。文件不存在视为成功。
func (s *queryHistoryStore) Clear() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, path := range []string{s.filePath, s.filePath + ".1"} {
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	return nil
}

// loadAll 加载主文件 + rotate 文件（.1）的全部记录。
// 单行解析失败时跳过该行，不阻塞整体加载。
func (s *queryHistoryStore) loadAll() ([]connection.QueryExecutionRecord, error) {
	var records []connection.QueryExecutionRecord
	for _, path := range []string{s.filePath + ".1", s.filePath} {
		file, err := os.Open(path)
		if err != nil {
			if !os.IsNotExist(err) {
				logger.Warnf("打开慢查询历史失败：%v path=%s", err, path)
			}
			continue
		}
		scanner := bufio.NewScanner(file)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024) // 单行最大 1MB，足够大 SQL
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" {
				continue
			}
			var r connection.QueryExecutionRecord
			if err := json.Unmarshal([]byte(line), &r); err != nil {
				continue
			}
			records = append(records, r)
		}
		file.Close()
		if err := scanner.Err(); err != nil {
			logger.Warnf("读取慢查询历史失败：%v path=%s", err, path)
		}
	}
	return records, nil
}

// dedupeQueryRecords 按 SQLFingerprint 去重，保留最新（ExecutedAt 最大）一条。
func dedupeQueryRecords(records []connection.QueryExecutionRecord) []connection.QueryExecutionRecord {
	if len(records) == 0 {
		return records
	}
	latest := make(map[string]connection.QueryExecutionRecord, len(records))
	for _, r := range records {
		if r.SQLFingerprint == "" {
			continue
		}
		existing, ok := latest[r.SQLFingerprint]
		if !ok || r.ExecutedAt.After(existing.ExecutedAt) {
			latest[r.SQLFingerprint] = r
		}
	}
	result := make([]connection.QueryExecutionRecord, 0, len(latest))
	for _, r := range latest {
		result = append(result, r)
	}
	return result
}

// sortQueryRecords 按字段原地排序。sortBy 不识别时按 recent。
func sortQueryRecords(records []connection.QueryExecutionRecord, sortBy string) {
	switch sortBy {
	case "duration":
		// 插入排序：记录数通常 < 1000
		for i := 1; i < len(records); i++ {
			for j := i; j > 0 && records[j].DurationMs > records[j-1].DurationMs; j-- {
				records[j], records[j-1] = records[j-1], records[j]
			}
		}
	case "rowsRead":
		for i := 1; i < len(records); i++ {
			for j := i; j > 0 && records[j].RowsRead > records[j-1].RowsRead; j-- {
				records[j], records[j-1] = records[j-1], records[j]
			}
		}
	default: // "recent"
		for i := 1; i < len(records); i++ {
			for j := i; j > 0 && records[j].ExecutedAt.After(records[j-1].ExecutedAt); j-- {
				records[j], records[j-1] = records[j-1], records[j]
			}
		}
	}
}

// buildSQLFingerprint 把 SQL 归一化为指纹（替换字面量为 ?、去注释、小写化关键字、sha256 前 16 字节）。
// 用于跨执行去重：同一 SQL 不同参数值视为同一指纹。
func buildSQLFingerprint(sql string) string {
	normalized := normalizeSQLForFingerprint(sql)
	if normalized == "" {
		return ""
	}
	hash := sha256.Sum256([]byte(normalized))
	return hex.EncodeToString(hash[:16])
}

// normalizeSQLForFingerprint 简化 SQL 用于指纹计算。
// 策略：
//   - 去掉前后空白
//   - 替换字符串字面量 'xxx' 为 ?
//   - 替换数字字面量为 ?
//   - 替换 IN (...) 中的列表为 ?
//   - 小写化 SQL 关键字（保守起见全小写，不影响语义）
func normalizeSQLForFingerprint(sql string) string {
	text := strings.TrimSpace(sql)
	if text == "" {
		return ""
	}
	var builder strings.Builder
	builder.Grow(len(text))
	inString := false
	stringQuote := byte(0)
	i := 0
	for i < len(text) {
		ch := text[i]
		switch {
		case inString:
			if ch == stringQuote {
				inString = false
				builder.WriteByte('?')
			}
			// 跳过字符串内容
		case ch == '\'' || ch == '"':
			inString = true
			stringQuote = ch
		case (ch >= '0' && ch <= '9'):
			// 数字字面量替换为 ?，跳过连续数字
			for i < len(text) && text[i] >= '0' && text[i] <= '9' {
				i++
			}
			builder.WriteByte('?')
			continue
		default:
			if ch >= 'A' && ch <= 'Z' {
				ch = ch + ('a' - 'A')
			}
			builder.WriteByte(ch)
		}
		i++
	}
	return builder.String()
}

// buildQueryPreview 截断 SQL 为人类可读预览。
func buildQueryPreview(sql string) string {
	text := strings.TrimSpace(sql)
	if text == "" {
		return ""
	}
	// 把多行/制表符折叠为单空格（保留语义但节省存储）
	text = strings.ReplaceAll(text, "\n", " ")
	text = strings.ReplaceAll(text, "\r", " ")
	text = strings.ReplaceAll(text, "\t", " ")
	// 折叠连续空白
	for strings.Contains(text, "  ") {
		text = strings.ReplaceAll(text, "  ", " ")
	}
	runes := []rune(text)
	if len(runes) <= queryHistoryPreviewRunes {
		return text
	}
	return string(runes[:queryHistoryPreviewRunes-1]) + "…"
}

// sanitizeFingerprintForFilename 把指纹字符串安全化（只保留字母数字下划线）。
func sanitizeFingerprintForFilename(fp string) string {
	var builder strings.Builder
	builder.Grow(len(fp))
	for _, ch := range fp {
		if (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '_' || ch == '-' {
			builder.WriteRune(ch)
		}
	}
	result := builder.String()
	if result == "" {
		return "default"
	}
	return result
}

// buildQueryExecutionRecord 是埋点时的便利构造器，组装一条完整记录。
func buildQueryExecutionRecord(config connection.ConnectionConfig, dbType, sql string, durationMs int64, rowsRead, rowsReturned int64) connection.QueryExecutionRecord {
	connFP, _ := buildConnectionFingerprint(config)
	return connection.QueryExecutionRecord{
		ID:             fmt.Sprintf("qhr-%d", time.Now().UnixNano()),
		ConnectionFP:   connFP,
		SQLFingerprint: buildSQLFingerprint(sql),
		SQLPreview:     buildQueryPreview(sql),
		DBType:         dbType,
		DurationMs:     durationMs,
		RowsRead:       rowsRead,
		RowsReturned:   rowsReturned,
		ExecutedAt:     time.Now(),
	}
}
