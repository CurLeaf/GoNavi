package app

import (
	"testing"

	"GoNavi-Wails/internal/connection"
)

// Oracle DBMS_XPLAN.DISPLAY fixture：含主表 + Predicate + 多段落。
const oracleXPlanOutput = `Plan hash value: 1234567890

-----------------------------------------------------------------------------------------------------------
| Id  | Operation         | Name   | Rows  | Bytes | Cost (%CPU)| Time     |    Predicate Information    |
-----------------------------------------------------------------------------------------------------------
|   0 | SELECT STATEMENT  |        | 10000 |   200K|    50   (4)| 00:00:01 |                             |
|*  1 |  TABLE ACCESS FULL| USERS  | 10000 |   200K|    50   (4)| 00:00:01 | filter ("AGE">18)          |
-----------------------------------------------------------------------------------------------------------

Query Block Name / Object Alias (identified by operation id):
-------------------------------------------------------------
   1 - SEL$1 / USERS@SEL$1

Column Projection Information (identified by operation id):
-----------------------------------------------------------
   1 - "ID"[NUMBER,22], "NAME"[VARCHAR2,100]
`

func TestParseOracleExplain_TableAccessFullWithPredicate(t *testing.T) {
	result, err := parseOracleExplain("SELECT * FROM users WHERE age > 18", oracleXPlanOutput, connection.ExplainFormatTable)
	if err != nil {
		t.Fatalf("解析失败：%v", err)
	}
	if len(result.Nodes) != 2 {
		t.Fatalf("应有 2 个节点（SELECT STATEMENT + TABLE ACCESS），got=%d", len(result.Nodes))
	}
	// 节点 0 是 SELECT STATEMENT，节点 1 是 TABLE ACCESS FULL（带缩进，挂在 0 下）
	scan := result.Nodes[1]
	if scan.OpType != connection.ExplainOpScan {
		t.Fatalf("TABLE ACCESS FULL 应为 SCAN，got=%s", scan.OpType)
	}
	if scan.Table != "USERS" {
		t.Fatalf("table got=%s want=USERS", scan.Table)
	}
	if scan.EstRows != 10000 {
		t.Fatalf("EstRows got=%d want=10000", scan.EstRows)
	}
	if scan.Cost != 50 {
		t.Fatalf("Cost got=%v want=50", scan.Cost)
	}
	if !containsFlag(scan.Flags, connection.ExplainFlagFullScan) {
		t.Fatalf("TABLE ACCESS FULL 应有 FULL_SCAN flag")
	}
	if scan.Extra["filter"] != `filter ("AGE">18)` {
		t.Fatalf("Predicate 应附加到 Extra.filter，got=%v", scan.Extra["filter"])
	}
	// SELECT STATEMENT 是父节点
	if len(result.Edges) != 1 || result.Edges[0].To != scan.ID {
		t.Fatalf("应有 1 条边指向 TABLE ACCESS 节点")
	}
}

const oracleXPlanHashJoin = `Plan hash value: 9876543210

-------------------------------------------------------------------------
| Id  | Operation          | Name   | Rows  | Cost  |    Predicate Info  |
-------------------------------------------------------------------------
|   0 | SELECT STATEMENT   |        |  1000 |   200 |                   |
|   1 |  HASH JOIN         |        |  1000 |   200 |                   |
|   2 |   TABLE ACCESS FULL| USERS  |   100 |    10 |                   |
|   3 |   INDEX RANGE SCAN| ORD_IX | 50000 |    20 |access("UID" = 1) |
-------------------------------------------------------------------------
`

func TestParseOracleExplain_HashJoinWithNestedChildren(t *testing.T) {
	result, err := parseOracleExplain("SELECT * FROM users u JOIN orders o ON u.id = o.user_id", oracleXPlanHashJoin, connection.ExplainFormatTable)
	if err != nil {
		t.Fatalf("解析失败：%v", err)
	}
	if len(result.Nodes) != 4 {
		t.Fatalf("应有 4 个节点（SELECT + HASH JOIN + 2 子节点），got=%d", len(result.Nodes))
	}
	// HASH JOIN 是 SELECT STATEMENT 的子
	// TABLE ACCESS FULL 和 INDEX RANGE SCAN 是 HASH JOIN 的子（缩进更深）
	hashJoin := result.Nodes[1]
	if hashJoin.OpType != connection.ExplainOpJoin {
		t.Fatalf("HASH JOIN 应为 JOIN，got=%s", hashJoin.OpType)
	}
	// 找到 INDEX RANGE SCAN 节点
	var indexNode *connection.ExplainNode
	for i := range result.Nodes {
		if result.Nodes[i].OpType == connection.ExplainOpIndexScan {
			indexNode = &result.Nodes[i]
			break
		}
	}
	if indexNode == nil {
		t.Fatal("应有一个 INDEX RANGE SCAN 节点")
	}
	if indexNode.Index != "ORD_IX" {
		t.Fatalf("Index got=%s want=ORD_IX", indexNode.Index)
	}
	// Predicate 关联（id=3，独立 Predicate 段落覆盖了表格列的简短摘要）
	if indexNode.Extra["filter"] != `access("UID" = 1)` {
		t.Fatalf("Predicate 应附加到 INDEX RANGE SCAN 节点，got=%v", indexNode.Extra["filter"])
	}
}

func TestParseOracleExplain_EmptyReturnsError(t *testing.T) {
	_, err := parseOracleExplain("SELECT 1", "  ", connection.ExplainFormatTable)
	if err == nil {
		t.Fatal("空输入应返回 error")
	}
}

func TestParseOracleExplain_NoTableReturnsWarning(t *testing.T) {
	result, err := parseOracleExplain("SELECT 1", "Plan hash value: 1\nsome random text", connection.ExplainFormatTable)
	if err != nil {
		t.Fatalf("无表格的输入应降级返回 warning 而非 error：%v", err)
	}
	if result.RawFormat != connection.ExplainFormatText {
		t.Fatalf("RawFormat got=%v want=text", result.RawFormat)
	}
	if len(result.Warnings) == 0 {
		t.Fatal("应有降级 warning")
	}
}
