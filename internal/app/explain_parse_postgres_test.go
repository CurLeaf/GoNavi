package app

import (
	"testing"

	"GoNavi-Wails/internal/connection"
)

// PG FORMAT JSON fixture：单 Seq Scan + 低缓冲命中。
const postgresFormatJSONSeqScan = `[
  {
    "Plan": {
      "Node Type": "Seq Scan",
      "Relation Name": "users",
      "Schema": "public",
      "Alias": "users",
      "Startup Cost": 0.00,
      "Total Cost": 154.00,
      "Plan Rows": 1540,
      "Plan Width": 36,
      "Actual Startup Time": 0.012,
      "Actual Total Time": 1.234,
      "Actual Rows": 1500,
      "Actual Loops": 1,
      "Filter": "(age > 18)",
      "Rows Removed by Filter": 40,
      "Shared Hit Blocks": 10,
      "Shared Read Blocks": 50
    },
    "Planning Time": 0.123,
    "Execution Time": 1.456
  }
]`

func TestParsePostgresExplain_SeqScan(t *testing.T) {
	result, err := parsePostgresExplain("postgres", "SELECT * FROM users WHERE age > 18", postgresFormatJSONSeqScan, connection.ExplainFormatJSON)
	if err != nil {
		t.Fatalf("解析失败：%v", err)
	}
	if len(result.Nodes) != 1 {
		t.Fatalf("应有 1 个节点，got=%d", len(result.Nodes))
	}
	node := result.Nodes[0]
	if node.OpType != connection.ExplainOpScan {
		t.Fatalf("Seq Scan 应为 SCAN，got=%s", node.OpType)
	}
	if node.Table != "public.users" {
		t.Fatalf("Table 应含 schema，got=%q", node.Table)
	}
	if node.EstRows != 1540 {
		t.Fatalf("EstRows got=%d want=1540", node.EstRows)
	}
	if node.ActualRows != 1500 {
		t.Fatalf("ActualRows got=%d want=1500", node.ActualRows)
	}
	if node.Loops != 1 {
		t.Fatalf("Loops got=%d want=1", node.Loops)
	}
	// BufferHit = 10 / (10+50) = 0.166...
	if node.BufferHit < 0.16 || node.BufferHit > 0.17 {
		t.Fatalf("BufferHit 应约 0.167，got=%v", node.BufferHit)
	}
	if !containsFlag(node.Flags, connection.ExplainFlagLowBufferHit) {
		t.Fatalf("缓冲命中率低应有 LOW_BUFFER_HIT flag")
	}
	if !containsFlag(node.Flags, connection.ExplainFlagFullScan) {
		t.Fatalf("Seq Scan 应有 FULL_SCAN flag")
	}
	if result.Stats.TotalDurationMs != 1.456 {
		t.Fatalf("Execution Time 应写到 Stats.TotalDurationMs，got=%v", result.Stats.TotalDurationMs)
	}
}

// PG FORMAT JSON fixture：Hash Join + 子节点（Seq Scan + Index Scan）。
const postgresFormatJSONHashJoin = `[
  {
    "Plan": {
      "Node Type": "Hash Join",
      "Join Type": "Inner",
      "Hash Cond": "(o.user_id = u.id)",
      "Startup Cost": 50.00,
      "Total Cost": 200.00,
      "Plan Rows": 1000,
      "Actual Rows": 950,
      "Actual Loops": 1,
      "Plans": [
        {
          "Node Type": "Seq Scan",
          "Relation Name": "orders",
          "Alias": "o",
          "Startup Cost": 0.00,
          "Total Cost": 100.00,
          "Plan Rows": 5000,
          "Actual Rows": 5000,
          "Actual Loops": 1
        },
        {
          "Node Type": "Hash",
          "Startup Cost": 25.00,
          "Total Cost": 25.00,
          "Plan Rows": 100,
          "Plans": [
            {
              "Node Type": "Index Scan",
              "Relation Name": "users",
              "Alias": "u",
              "Index Name": "users_pkey",
              "Startup Cost": 0.15,
              "Total Cost": 25.00,
              "Plan Rows": 100
            }
          ]
        }
      ]
    },
    "Execution Time": 5.5
  }
]`

func TestParsePostgresExplain_HashJoinWithChildren(t *testing.T) {
	result, err := parsePostgresExplain("postgres", "SELECT * FROM orders o JOIN users u ON o.user_id = u.id", postgresFormatJSONHashJoin, connection.ExplainFormatJSON)
	if err != nil {
		t.Fatalf("解析失败：%v", err)
	}
	// 应该有 4 个节点：Hash Join + Seq Scan + Hash + Index Scan
	if len(result.Nodes) != 4 {
		t.Fatalf("应有 4 个节点，got=%d（nodes=%+v）", len(result.Nodes), result.Nodes)
	}
	join := result.Nodes[0]
	if join.OpType != connection.ExplainOpJoin {
		t.Fatalf("顶层应为 JOIN，got=%s", join.OpType)
	}
	if join.Extra["hashCond"] != "(o.user_id = u.id)" {
		t.Fatalf("HashCond 应保留，got=%v", join.Extra["hashCond"])
	}
	if join.Extra["joinType"] != "Inner" {
		t.Fatalf("JoinType 应保留，got=%v", join.Extra["joinType"])
	}
	if !containsFlag(join.Flags, connection.ExplainFlagTempTable) {
		t.Fatalf("Hash 节点应有 TEMP_TABLE flag")
	}
	// 找到 orders Seq Scan
	var seqScanNode *connection.ExplainNode
	var indexScanNode *connection.ExplainNode
	for i := range result.Nodes {
		switch result.Nodes[i].OpType {
		case connection.ExplainOpScan:
			seqScanNode = &result.Nodes[i]
		case connection.ExplainOpIndexScan:
			indexScanNode = &result.Nodes[i]
		}
	}
	if seqScanNode == nil {
		t.Fatal("应有一个 Seq Scan 节点")
	}
	if seqScanNode.Table != "orders" {
		t.Fatalf("Seq Scan 应为 orders 表，got=%s", seqScanNode.Table)
	}
	if indexScanNode == nil {
		t.Fatal("应有一个 Index Scan 节点")
	}
	if indexScanNode.Index != "users_pkey" {
		t.Fatalf("Index Scan 应使用 users_pkey，got=%s", indexScanNode.Index)
	}
	// Edges：3 条（顶层无父；Seq Scan + Hash 是顶层子；Index Scan 是 Hash 子）
	if len(result.Edges) != 3 {
		t.Fatalf("应有 3 条边，got=%d", len(result.Edges))
	}
}

// PG 老版本无 FORMAT JSON 时返回文本。
func TestParsePostgresExplain_TextFallbackKeepsRaw(t *testing.T) {
	raw := "Seq Scan on users  (cost=0.00..154.00 rows=1540)"
	result, err := parsePostgresExplain("postgres", "SELECT * FROM users", raw, connection.ExplainFormatText)
	if err != nil {
		t.Fatalf("非 JSON 输入应降级返回原文而非 error：%v", err)
	}
	if len(result.Warnings) == 0 {
		t.Fatal("应有降级 warning")
	}
	if result.RawPayload != raw {
		t.Fatalf("RawPayload 应保留原文")
	}
	if result.RawFormat != connection.ExplainFormatText {
		t.Fatalf("RawFormat got=%v want=text", result.RawFormat)
	}
}

func TestParsePostgresExplain_EmptyRawReturnsError(t *testing.T) {
	_, err := parsePostgresExplain("postgres", "SELECT 1", "  ", connection.ExplainFormatJSON)
	if err == nil {
		t.Fatal("空输入应返回 error")
	}
}
