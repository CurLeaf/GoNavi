package app

import (
	"testing"

	"GoNavi-Wails/internal/connection"
)

// MySQL FORMAT=JSON fixture：单表全表扫描。
const mySQLFormatJSONSingleTableFullScan = `{
  "query_block": {
    "select_id": 1,
    "cost_info": {"query_cost": "100.00"},
    "table": {
      "table_name": "users",
      "access_type": "ALL",
      "rows_examined_per_scan": 10000,
      "rows_produced_per_join": 1000,
      "filtered": "10.00",
      "cost_info": {"read_cost": "100.00"},
      "used_columns": ["id", "name", "email"]
    }
  }
}`

func TestParseMySQLExplain_SingleTableFullScan(t *testing.T) {
	result, err := parseMySQLExplain("mysql", "SELECT * FROM users", mySQLFormatJSONSingleTableFullScan, connection.ExplainFormatJSON)
	if err != nil {
		t.Fatalf("解析失败：%v", err)
	}
	if len(result.Nodes) != 1 {
		t.Fatalf("应有 1 个节点，got=%d", len(result.Nodes))
	}
	node := result.Nodes[0]
	if node.OpType != connection.ExplainOpScan {
		t.Fatalf("access_type=ALL 应归一化为 SCAN，got=%s", node.OpType)
	}
	if node.Table != "users" {
		t.Fatalf("table got=%q want=users", node.Table)
	}
	if node.EstRows != 10000 {
		t.Fatalf("EstRows got=%d want=10000", node.EstRows)
	}
	if !containsFlag(node.Flags, connection.ExplainFlagFullScan) {
		t.Fatalf("全表扫描节点应有 FULL_SCAN flag，got=%v", node.Flags)
	}
	if !containsFlag(node.Flags, connection.ExplainFlagNoIndex) {
		t.Fatalf("全表扫描节点应有 NO_INDEX flag，got=%v", node.Flags)
	}
	if !result.Stats.HasFullScan {
		t.Fatalf("Stats.HasFullScan 应为 true")
	}
	if result.Stats.TotalCost != 100.0 {
		t.Fatalf("TotalCost got=%v want=100", result.Stats.TotalCost)
	}
	if result.Stats.RowsRead != 10000 {
		t.Fatalf("RowsRead got=%d want=10000", result.Stats.RowsRead)
	}
}

// MySQL FORMAT=JSON fixture：两表 JOIN（一个走索引，一个走全表）。
const mySQLFormatJSONJoinScanAndIndex = `{
  "query_block": {
    "select_id": 1,
    "cost_info": {"query_cost": "250.00"},
    "nested_loop": [
      {
        "table": {
          "table_name": "orders",
          "access_type": "ALL",
          "rows_examined_per_scan": 5000,
          "cost_info": {"read_cost": "100.00"}
        }
      },
      {
        "table": {
          "table_name": "users",
          "access_type": "eq_ref",
          "possible_keys": ["PRIMARY"],
          "key": "PRIMARY",
          "used_key_parts": ["id"],
          "rows_examined_per_scan": 1,
          "cost_info": {"read_cost": "150.00"}
        }
      }
    ]
  }
}`

func TestParseMySQLExplain_JoinScanAndIndex(t *testing.T) {
	result, err := parseMySQLExplain("mysql", "SELECT * FROM orders o JOIN users u ON o.user_id = u.id", mySQLFormatJSONJoinScanAndIndex, connection.ExplainFormatJSON)
	if err != nil {
		t.Fatalf("解析失败：%v", err)
	}
	if len(result.Nodes) != 2 {
		t.Fatalf("应有 2 个节点（nested_loop 内 2 个 table），got=%d", len(result.Nodes))
	}
	if result.Nodes[0].Table != "orders" {
		t.Fatalf("第一个表应是 orders，got=%s", result.Nodes[0].Table)
	}
	if result.Nodes[0].OpType != connection.ExplainOpScan {
		t.Fatalf("orders access_type=ALL 应为 SCAN，got=%s", result.Nodes[0].OpType)
	}
	if result.Nodes[1].Table != "users" {
		t.Fatalf("第二个表应是 users，got=%s", result.Nodes[1].Table)
	}
	if result.Nodes[1].OpType != connection.ExplainOpIndexScan {
		t.Fatalf("users access_type=eq_ref 应为 INDEX_SCAN，got=%s", result.Nodes[1].OpType)
	}
	if result.Nodes[1].Index != "PRIMARY" {
		t.Fatalf("users 使用 PRIMARY key，got=%s", result.Nodes[1].Index)
	}
	// stats：orders 估算 5000 行
	if result.Stats.RowsRead != 5000+1 {
		t.Fatalf("RowsRead 应为两表 EstRows 之和 (5000+1)，got=%d", result.Stats.RowsRead)
	}
}

// MySQL FORMAT=JSON fixture：含 ordering_operation 包装层。
const mySQLFormatJSONWithOrder = `{
  "query_block": {
    "select_id": 1,
    "ordering_operation": {
      "table": {
        "table_name": "t",
        "access_type": "ALL",
        "rows_examined_per_scan": 100,
        "cost_info": {"read_cost": "10.00"}
      }
    }
  }
}`

func TestParseMySQLExplain_WithOrderingOperation(t *testing.T) {
	result, err := parseMySQLExplain("mysql", "SELECT * FROM t ORDER BY id", mySQLFormatJSONWithOrder, connection.ExplainFormatJSON)
	if err != nil {
		t.Fatalf("解析失败：%v", err)
	}
	// 应该有 2 个节点：ordering 层 + table 层
	if len(result.Nodes) != 2 {
		t.Fatalf("ordering_operation 应展开为 2 个节点，got=%d", len(result.Nodes))
	}
	if result.Nodes[0].OpType != connection.ExplainOpSort {
		t.Fatalf("ordering_operation 顶层节点应为 SORT，got=%s", result.Nodes[0].OpType)
	}
	if result.Nodes[1].OpType != connection.ExplainOpScan {
		t.Fatalf("内层 table 应为 SCAN，got=%s", result.Nodes[1].OpType)
	}
	// 验证父子边
	if len(result.Edges) != 1 {
		t.Fatalf("应有 1 条边，got=%d", len(result.Edges))
	}
	if result.Edges[0].From != result.Nodes[0].ID || result.Edges[0].To != result.Nodes[1].ID {
		t.Fatalf("边应连接 SORT -> SCAN")
	}
}

// MySQL 5.7 表格模式 fallback。
const mySQLTableExplainOutput = `id	select_type	table	type	possible_keys	key	key_len	ref	rows	Extra
1	SIMPLE	users	ALL	NULL	NULL	NULL	NULL	10000	Using where
1	SIMPLE	orders	ref	idx_uid	idx_uid	4	const	5	Using filesort`

func TestParseMySQLExplain_TableFormatFallback(t *testing.T) {
	result, err := parseMySQLExplain("mysql", "SELECT * FROM users", mySQLTableExplainOutput, connection.ExplainFormatTable)
	if err != nil {
		t.Fatalf("表格解析失败：%v", err)
	}
	if len(result.Nodes) != 2 {
		t.Fatalf("应有 2 个节点，got=%d", len(result.Nodes))
	}
	if result.Nodes[0].OpType != connection.ExplainOpScan {
		t.Fatalf("users type=ALL 应为 SCAN，got=%s", result.Nodes[0].OpType)
	}
	if !containsFlag(result.Nodes[0].Flags, connection.ExplainFlagFullScan) {
		t.Fatalf("users 应有 FULL_SCAN flag")
	}
	if result.Nodes[1].Index != "idx_uid" {
		t.Fatalf("orders 使用 idx_uid，got=%s", result.Nodes[1].Index)
	}
	if !containsFlag(result.Nodes[1].Flags, connection.ExplainFlagFilesort) {
		t.Fatalf("orders Extra 含 Using filesort，应有 FILESORT flag")
	}
	if result.RawFormat != connection.ExplainFormatTable {
		t.Fatalf("RawFormat got=%v want=table", result.RawFormat)
	}
}

func TestParseMySQLExplain_EmptyRawReturnsError(t *testing.T) {
	_, err := parseMySQLExplain("mysql", "SELECT 1", "   ", connection.ExplainFormatJSON)
	if err == nil {
		t.Fatal("空输入应返回 error")
	}
}

func TestParseMySQLExplain_InvalidJSONReturnsError(t *testing.T) {
	_, err := parseMySQLExplain("mysql", "SELECT 1", "{ this is not valid json", connection.ExplainFormatJSON)
	if err == nil {
		t.Fatal("非法 JSON 应返回 error")
	}
}

// containsFlag 检查 flags 列表是否包含目标值。
func containsFlag(flags []string, target string) bool {
	for _, f := range flags {
		if f == target {
			return true
		}
	}
	return false
}
