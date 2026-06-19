package app

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"GoNavi-Wails/internal/connection"
)

func TestQueryHistoryStore_AppendAndLoad(t *testing.T) {
	dir := t.TempDir()
	store := newQueryHistoryStore(dir, "test-conn-fp")

	store.Append(connection.QueryExecutionRecord{
		ID:             "r1",
		ConnectionFP:   "test-conn-fp",
		SQLFingerprint: "fp-select-1",
		SQLPreview:     "SELECT * FROM t",
		DBType:         "mysql",
		DurationMs:     1000,
		ExecutedAt:     time.Now(),
	})
	store.Append(connection.QueryExecutionRecord{
		ID:             "r2",
		ConnectionFP:   "test-conn-fp",
		SQLFingerprint: "fp-select-2",
		SQLPreview:     "SELECT * FROM u WHERE id = 1",
		DBType:         "mysql",
		DurationMs:     2000,
		ExecutedAt:     time.Now().Add(time.Second),
	})

	records, err := store.LoadTopN("duration", 10, false)
	if err != nil {
		t.Fatalf("LoadTopN 失败：%v", err)
	}
	if len(records) != 2 {
		t.Fatalf("应有 2 条记录，got=%d", len(records))
	}
	// duration 排序：r2 (2000ms) 应在前面
	if records[0].ID != "r2" {
		t.Fatalf("按 duration 排序后首条应为 r2，got=%s", records[0].ID)
	}
}

func TestQueryHistoryStore_SkipBelowThreshold(t *testing.T) {
	dir := t.TempDir()
	store := newQueryHistoryStore(dir, "test-conn-fp")

	// 低于 500ms 阈值应被跳过
	store.Append(connection.QueryExecutionRecord{
		ID:           "fast",
		DurationMs:   100,
		SQLPreview:   "SELECT 1",
		ExecutedAt:   time.Now(),
	})
	records, _ := store.LoadTopN("duration", 10, false)
	if len(records) != 0 {
		t.Fatalf("低于阈值的查询不应被记录，got=%d", len(records))
	}
}

func TestQueryHistoryStore_DedupeBySQLFingerprint(t *testing.T) {
	dir := t.TempDir()
	store := newQueryHistoryStore(dir, "test-conn-fp")

	base := time.Now()
	// 同一 SQL 指纹，3 次执行（不同时间）
	for i := 0; i < 3; i++ {
		store.Append(connection.QueryExecutionRecord{
			ID:             "r" + string(rune('1'+i)),
			SQLFingerprint: "same-fp",
			DurationMs:     int64(1000 + i*500),
			ExecutedAt:     base.Add(time.Duration(i) * time.Second),
		})
	}
	records, _ := store.LoadTopN("duration", 10, true)
	if len(records) != 1 {
		t.Fatalf("去重后应剩 1 条，got=%d", len(records))
	}
	// 应保留最新一条（ExecutedAt 最大）
	if records[0].ID != "r3" {
		t.Fatalf("去重应保留最新，got ID=%s", records[0].ID)
	}
}

func TestQueryHistoryStore_RotationAtThreshold(t *testing.T) {
	dir := t.TempDir()
	store := newQueryHistoryStore(dir, "test-conn-fp")

	// 写入大量记录触发 rotate（5MB 阈值）
	for i := 0; i < 50000; i++ {
		store.Append(connection.QueryExecutionRecord{
			ID:             "r",
			SQLFingerprint: "fp",
			SQLPreview:     "SELECT * FROM some_very_large_table WHERE col = 'long string to fill up space quickly'",
			DurationMs:     1000,
			ExecutedAt:     time.Now(),
		})
	}

	// 主文件存在 + rotate 文件存在
	if _, err := os.Stat(store.filePath); err != nil {
		t.Fatalf("主文件应存在：%v", err)
	}
	if _, err := os.Stat(store.filePath + ".1"); err != nil {
		t.Fatalf("rotate 文件 .1 应存在：%v", err)
	}

	records, _ := store.LoadTopN("duration", 1000, false)
	if len(records) == 0 {
		t.Fatal("rotate 后应仍能加载历史")
	}
}

func TestQueryHistoryStore_SortByRecent(t *testing.T) {
	dir := t.TempDir()
	store := newQueryHistoryStore(dir, "test-conn-fp")

	base := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	times := []time.Time{
		base.Add(2 * time.Second),
		base.Add(0 * time.Second),
		base.Add(1 * time.Second),
	}
	for i, ts := range times {
		store.Append(connection.QueryExecutionRecord{
			ID:             "r" + string(rune('1'+i)),
			SQLFingerprint: "fp-" + string(rune('1'+i)),
			DurationMs:     1000,
			ExecutedAt:     ts,
		})
	}

	records, _ := store.LoadTopN("recent", 10, false)
	if len(records) != 3 {
		t.Fatalf("应有 3 条，got=%d", len(records))
	}
	// recent 排序：最新（time[0]）应在前面
	if records[0].ID != "r1" {
		t.Fatalf("recent 排序后首条应为 r1（最新），got=%s", records[0].ID)
	}
}

func TestQueryHistoryStore_Clear(t *testing.T) {
	dir := t.TempDir()
	store := newQueryHistoryStore(dir, "test-conn-fp")

	store.Append(connection.QueryExecutionRecord{
		ID:           "r1",
		DurationMs:   1000,
		SQLPreview:   "SELECT 1",
		ExecutedAt:   time.Now(),
	})
	if err := store.Clear(); err != nil {
		t.Fatalf("Clear 失败：%v", err)
	}
	records, _ := store.LoadTopN("duration", 10, false)
	if len(records) != 0 {
		t.Fatalf("清空后应无记录，got=%d", len(records))
	}
}

func TestQueryHistoryStore_EmptyReturnsEmpty(t *testing.T) {
	dir := t.TempDir()
	store := newQueryHistoryStore(dir, "missing-fp")
	records, err := store.LoadTopN("duration", 10, false)
	if err != nil {
		t.Fatalf("不存在的文件应返回空而非 error：%v", err)
	}
	if len(records) != 0 {
		t.Fatalf("空历史应返回 0 条，got=%d", len(records))
	}
}

func TestBuildSQLFingerprint_NormalizesLiterals(t *testing.T) {
	sql1 := "SELECT * FROM users WHERE id = 1 AND name = 'alice'"
	sql2 := "SELECT * FROM users WHERE id = 999 AND name = 'bob'"
	fp1 := buildSQLFingerprint(sql1)
	fp2 := buildSQLFingerprint(sql2)
	if fp1 != fp2 {
		t.Fatalf("字面量不同应归一化为同一指纹：fp1=%s fp2=%s", fp1, fp2)
	}
	if fp1 == "" {
		t.Fatal("指纹不应为空")
	}
}

func TestBuildSQLFingerprint_DifferentSQLDifferentFingerprint(t *testing.T) {
	sql1 := "SELECT * FROM users WHERE id = 1"
	sql2 := "SELECT * FROM orders WHERE id = 1"
	fp1 := buildSQLFingerprint(sql1)
	fp2 := buildSQLFingerprint(sql2)
	if fp1 == fp2 {
		t.Fatal("不同 SQL 应有不同指纹")
	}
}

func TestBuildSQLFingerprint_CaseInsensitiveKeywords(t *testing.T) {
	sql1 := "SELECT * FROM users"
	sql2 := "select * from users"
	if buildSQLFingerprint(sql1) != buildSQLFingerprint(sql2) {
		t.Fatal("大小写不同的关键字应归一化为同一指纹")
	}
}

func TestBuildQueryPreview_TruncatesLongSQL(t *testing.T) {
	longSQL := ""
	for i := 0; i < 500; i++ {
		longSQL += "a"
	}
	preview := buildQueryPreview(longSQL)
	if len([]rune(preview)) > queryHistoryPreviewRunes {
		t.Fatalf("预览应不超过 %d 字符，got=%d", queryHistoryPreviewRunes, len([]rune(preview)))
	}
}

func TestBuildQueryPreview_FoldsWhitespace(t *testing.T) {
	multiLine := "SELECT *\n  FROM\tusers\nWHERE id = 1"
	preview := buildQueryPreview(multiLine)
	if containsNewline(preview) {
		t.Fatalf("预览不应含换行符：%q", preview)
	}
	if !containsStr(preview, "SELECT * FROM users WHERE id = 1") {
		t.Fatalf("预览应折叠空白：%q", preview)
	}
}

func TestSanitizeFingerprintForFilename(t *testing.T) {
	if got := sanitizeFingerprintForFilename("abc123_-"); got != "abc123_-" {
		t.Fatalf("合法字符应保留：got=%s", got)
	}
	if got := sanitizeFingerprintForFilename("a/b\\c:d"); got != "abcd" {
		t.Fatalf("非法字符应被过滤：got=%s", got)
	}
	if got := sanitizeFingerprintForFilename(""); got != "default" {
		t.Fatalf("空指纹应回退为 default，got=%s", got)
	}
}

func TestNewQueryHistoryStore_CreatesDir(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "nested", "deep")
	store := newQueryHistoryStore(dir, "fp")
	store.Append(connection.QueryExecutionRecord{
		ID:           "r1",
		DurationMs:   1000,
		ExecutedAt:   time.Now(),
	})
	if _, err := os.Stat(store.filePath); err != nil {
		t.Fatalf("Append 应创建嵌套目录并写入：%v", err)
	}
}

func containsNewline(s string) bool {
	for _, ch := range s {
		if ch == '\n' || ch == '\r' {
			return true
		}
	}
	return false
}

func containsStr(s, substr string) bool {
	return len(s) >= len(substr) && indexOfSubstr(s, substr) >= 0
}

func indexOfSubstr(s, substr string) int {
	for i := 0; i+len(substr) <= len(s); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}
