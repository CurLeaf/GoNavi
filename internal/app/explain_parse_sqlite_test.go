package app

import (
	"testing"

	"GoNavi-Wails/internal/connection"
)

// SQLite EQP fixture：单表全表扫描 + filesort。
const sqliteEQPFullScanWithSort = `id	parent	notused	detail
2	0	0	SCAN TABLE users
5	0	0	USE TEMP B-TREE FOR ORDER BY`

func TestParseSQLiteExplain_FullScanWithFileSort(t *testing.T) {
	result, err := parseSQLiteExplain("SELECT * FROM users ORDER BY name", sqliteEQPFullScanWithSort, connection.ExplainFormatTable)
	if err != nil {
		t.Fatalf("解析失败：%v", err)
	}
	// 2 个独立节点（id 不同，parent 都是 0，无父子关系）
	if len(result.Nodes) != 2 {
		t.Fatalf("应有 2 个节点，got=%d", len(result.Nodes))
	}
	scan := result.Nodes[0]
	if scan.OpType != connection.ExplainOpScan {
		t.Fatalf("第一个应为 SCAN，got=%s", scan.OpType)
	}
	if scan.Table != "users" {
		t.Fatalf("table got=%s want=users", scan.Table)
	}
	if !containsFlag(scan.Flags, connection.ExplainFlagFullScan) {
		t.Fatalf("SCAN 应有 FULL_SCAN flag")
	}
	if result.Stats.HasFullScan != true {
		t.Fatalf("Stats.HasFullScan 应为 true")
	}
	if result.Stats.HasFilesort != true {
		t.Fatalf("Stats.HasFilesort 应为 true")
	}
}

// SQLite EQP fixture：索引扫描。
const sqliteEQPIndexScan = `id	parent	notused	detail
3	0	0	SEARCH TABLE users USING INDEX idx_email (email=?)`

func TestParseSQLiteExplain_IndexScanExtractsIndex(t *testing.T) {
	result, err := parseSQLiteExplain("SELECT * FROM users WHERE email = 'x'", sqliteEQPIndexScan, connection.ExplainFormatTable)
	if err != nil {
		t.Fatalf("解析失败：%v", err)
	}
	if len(result.Nodes) != 1 {
		t.Fatalf("应有 1 个节点，got=%d", len(result.Nodes))
	}
	node := result.Nodes[0]
	if node.OpType != connection.ExplainOpIndexScan {
		t.Fatalf("USING INDEX 应为 INDEX_SCAN，got=%s", node.OpType)
	}
	if node.Table != "users" {
		t.Fatalf("table got=%s want=users", node.Table)
	}
	if node.Index != "idx_email" {
		t.Fatalf("index got=%s want=idx_email", node.Index)
	}
}

// SQLite EQP fixture：主键扫描 + 临时表（distinct）。
const sqliteEQPPrimaryKeyWithDistinct = `id	parent	notused	detail
3	0	0	SEARCH TABLE users USING PRIMARY KEY (id=?)
7	0	0	USE TEMP B-TREE FOR DISTINCT`

func TestParseSQLiteExplain_PrimaryKeyAndDistinct(t *testing.T) {
	result, err := parseSQLiteExplain("SELECT DISTINCT name FROM users WHERE id = 1", sqliteEQPPrimaryKeyWithDistinct, connection.ExplainFormatTable)
	if err != nil {
		t.Fatalf("解析失败：%v", err)
	}
	if len(result.Nodes) != 2 {
		t.Fatalf("应有 2 个节点，got=%d", len(result.Nodes))
	}
	pk := result.Nodes[0]
	if pk.OpType != connection.ExplainOpIndexScan {
		t.Fatalf("PRIMARY KEY 应为 INDEX_SCAN，got=%s", pk.OpType)
	}
	if pk.Index != "PRIMARY" {
		t.Fatalf("index got=%s want=PRIMARY", pk.Index)
	}
	if result.Stats.HasTempTable != true {
		t.Fatalf("FOR DISTINCT 应触发 TEMP_TABLE flag")
	}
}

// SQLite EQP fixture：父子关系（子查询）。
const sqliteEQPCorrelatedSubquery = `id	parent	notused	detail
2	0	0	SCAN TABLE orders
6	2	0	CORRELATED SCALAR SUBQUERY 1
8	6	0	SEARCH TABLE users USING INDEX idx_id (id=?)`

func TestParseSQLiteExplain_HierarchicalRelationShips(t *testing.T) {
	result, err := parseSQLiteExplain("SELECT *, (SELECT name FROM users WHERE id = o.user_id) FROM orders o", sqliteEQPCorrelatedSubquery, connection.ExplainFormatTable)
	if err != nil {
		t.Fatalf("解析失败：%v", err)
	}
	if len(result.Nodes) != 3 {
		t.Fatalf("应有 3 个节点，got=%d", len(result.Nodes))
	}
	// orders 是根（parent=0）
	// CORRELATED SCALAR SUBQUERY 的 parent=2 → orders
	// SEARCH 的 parent=6 → subquery
	if result.Nodes[0].ParentID != "" {
		t.Fatalf("根节点 ParentID 应为空，got=%q", result.Nodes[0].ParentID)
	}
	if result.Nodes[1].ParentID != result.Nodes[0].ID {
		t.Fatalf("subquery 节点的 ParentID 应指向 orders")
	}
	if result.Nodes[2].ParentID != result.Nodes[1].ID {
		t.Fatalf("SEARCH 节点的 ParentID 应指向 subquery")
	}
	if len(result.Edges) != 2 {
		t.Fatalf("应有 2 条边，got=%d", len(result.Edges))
	}
}

func TestParseSQLiteExplain_CoveringIndex(t *testing.T) {
	raw := `id	parent	notused	detail
3	0	0	SEARCH TABLE users USING COVERING INDEX idx_name_email (name=?)`
	result, err := parseSQLiteExplain("SELECT name FROM users WHERE name = 'x'", raw, connection.ExplainFormatTable)
	if err != nil {
		t.Fatalf("解析失败：%v", err)
	}
	if result.Nodes[0].OpType != connection.ExplainOpIndexOnly {
		t.Fatalf("COVERING INDEX 应为 INDEX_ONLY，got=%s", result.Nodes[0].OpType)
	}
}

func TestParseSQLiteExplain_MissingColumnsReturnsError(t *testing.T) {
	_, err := parseSQLiteExplain("SELECT 1", "id	parent\n1	0", connection.ExplainFormatTable)
	if err == nil {
		t.Fatal("缺少 detail 列应返回 error")
	}
}
