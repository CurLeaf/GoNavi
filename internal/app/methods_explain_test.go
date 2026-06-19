package app

import (
	"strings"
	"testing"

	"GoNavi-Wails/internal/connection"
)

// buildExplainQuery 测试：验证各方言生成的 SQL 是否符合预期。
func TestBuildExplainQuery_MySQLUsesFormatJSON(t *testing.T) {
	wrapped, post, format, cleanup, err := buildExplainQuery("mysql", "SELECT * FROM t")
	if err != nil {
		t.Fatalf("mysql 构造失败：%v", err)
	}
	if want := "EXPLAIN FORMAT=JSON SELECT * FROM t"; wrapped != want {
		t.Fatalf("got=%q want=%q", wrapped, want)
	}
	if len(post) != 0 {
		t.Fatalf("mysql 不应有 post 查询，got=%v", post)
	}
	if len(cleanup) != 0 {
		t.Fatalf("mysql 不应有 cleanup，got=%v", cleanup)
	}
	if format != connection.ExplainFormatJSON {
		t.Fatalf("format got=%v want=json", format)
	}
}

func TestBuildExplainQuery_PostgresUsesAnalyzeBuffersJSON(t *testing.T) {
	wrapped, _, format, _, err := buildExplainQuery("postgres", "SELECT * FROM t WHERE id = 1")
	if err != nil {
		t.Fatalf("postgres 构造失败：%v", err)
	}
	if !strings.Contains(wrapped, "ANALYZE") || !strings.Contains(wrapped, "BUFFERS") || !strings.Contains(wrapped, "FORMAT JSON") {
		t.Fatalf("postgres SQL 应含 ANALYZE BUFFERS FORMAT JSON，got=%q", wrapped)
	}
	if format != connection.ExplainFormatJSON {
		t.Fatalf("format got=%v want=json", format)
	}
}

func TestBuildExplainQuery_SQLiteUsesEQP(t *testing.T) {
	wrapped, _, format, _, err := buildExplainQuery("sqlite", "SELECT * FROM t")
	if err != nil {
		t.Fatalf("sqlite 构造失败：%v", err)
	}
	if want := "EXPLAIN QUERY PLAN SELECT * FROM t"; wrapped != want {
		t.Fatalf("got=%q want=%q", wrapped, want)
	}
	if format != connection.ExplainFormatTable {
		t.Fatalf("format got=%v want=table", format)
	}
}

func TestBuildExplainQuery_OracleReturnsStatementIDAndCleanup(t *testing.T) {
	wrapped, post, _, cleanup, err := buildExplainQuery("oracle", "SELECT * FROM t")
	if err != nil {
		t.Fatalf("oracle 构造失败：%v", err)
	}
	if !strings.Contains(wrapped, "EXPLAIN PLAN SET STATEMENT_ID") {
		t.Fatalf("oracle 主语句应含 STATEMENT_ID，got=%q", wrapped)
	}
	if len(post) != 1 || !strings.Contains(post[0], "DBMS_XPLAN.DISPLAY") {
		t.Fatalf("oracle post 应含 DBMS_XPLAN.DISPLAY，got=%v", post)
	}
	if len(cleanup) != 1 || !strings.Contains(cleanup[0], "DELETE FROM plan_table") {
		t.Fatalf("oracle cleanup 应含 DELETE FROM plan_table，got=%v", cleanup)
	}
	// 验证 statement_id 在三条 SQL 中一致
	idInWrapped := extractBetween(wrapped, "STATEMENT_ID = '", "' FOR")
	idInPost := extractBetween(post[0], "NULL, '", "'")
	idInCleanup := extractBetween(cleanup[0], "statement_id = '", "'")
	if idInWrapped == "" || idInWrapped != idInPost || idInWrapped != idInCleanup {
		t.Fatalf("statement_id 不一致：wrapped=%q post=%q cleanup=%q", idInWrapped, idInPost, idInCleanup)
	}
}

func TestBuildExplainQuery_SQLServerSetsShowplanXML(t *testing.T) {
	wrapped, post, _, _, err := buildExplainQuery("sqlserver", "SELECT * FROM t")
	if err != nil {
		t.Fatalf("sqlserver 构造失败：%v", err)
	}
	if !strings.Contains(wrapped, "SET SHOWPLAN_XML ON") {
		t.Fatalf("sqlserver 应 SET SHOWPLAN_XML ON，got=%q", wrapped)
	}
	if !strings.Contains(wrapped, "SELECT * FROM t") {
		t.Fatalf("sqlserver 应保留原 SQL，got=%q", wrapped)
	}
	if len(post) != 1 || !strings.Contains(post[0], "SET SHOWPLAN_XML OFF") {
		t.Fatalf("sqlserver post 应 SET SHOWPLAN_XML OFF，got=%v", post)
	}
}

func TestBuildExplainQuery_ClickHouseUsesExplainJSON(t *testing.T) {
	wrapped, _, format, _, err := buildExplainQuery("clickhouse", "SELECT * FROM t")
	if err != nil {
		t.Fatalf("clickhouse 构造失败：%v", err)
	}
	if want := "EXPLAIN JSON SELECT * FROM t"; wrapped != want {
		t.Fatalf("got=%q want=%q", wrapped, want)
	}
	if format != connection.ExplainFormatJSON {
		t.Fatalf("format got=%v want=json", format)
	}
}

func TestBuildExplainQuery_PGLikeDialectsSharePath(t *testing.T) {
	// gaussdb/opengauss/kingbase/highgo/vastbase 应该复用 PG 的 ANALYZE BUFFERS 路径
	for _, dbType := range []string{"gaussdb", "opengauss", "kingbase", "highgo", "vastbase"} {
		wrapped, _, format, _, err := buildExplainQuery(dbType, "SELECT 1")
		if err != nil {
			t.Errorf("%s 构造失败：%v", dbType, err)
			continue
		}
		if !strings.Contains(wrapped, "FORMAT JSON") {
			t.Errorf("%s 应使用 FORMAT JSON 路径，got=%q", dbType, wrapped)
		}
		if format != connection.ExplainFormatJSON {
			t.Errorf("%s format got=%v want=json", dbType, format)
		}
	}
}

func TestBuildExplainQuery_UnsupportedDialectReturnsError(t *testing.T) {
	_, _, _, _, err := buildExplainQuery("mongodb", "db.t.find()")
	if err == nil {
		t.Fatal("未支持方言应返回 error")
	}
}

// extractBetween 取 s 中 between start 和 end 的第一个匹配子串（测试辅助）。
func extractBetween(s, start, end string) string {
	startIdx := strings.Index(s, start)
	if startIdx < 0 {
		return ""
	}
	startIdx += len(start)
	endIdx := strings.Index(s[startIdx:], end)
	if endIdx < 0 {
		return ""
	}
	return s[startIdx : startIdx+endIdx]
}
