package app

import (
	"testing"

	"GoNavi-Wails/internal/connection"
)

// ClickHouse EXPLAIN JSON fixture：ReadFromMergeTree + Aggregating。
const clickHouseExplainJSONScanAndAggregate = `{
  "Plan": {
    "Node Type": "Aggregating",
    "Aggregation": {
      "Keys": ["user_id"],
      "Functions": ["count()"]
    },
    "Plans": [
      {
        "Node Type": "ReadFromMergeTree",
        "ReadType": "Default",
        "Parts": 12,
        "Index Granules": 240,
        "Table": "events",
        "Database": "default"
      }
    ]
  }
}`

func TestParseClickHouseExplain_ScanAndAggregate(t *testing.T) {
	result, err := parseClickHouseExplain("SELECT user_id, count() FROM events GROUP BY user_id", clickHouseExplainJSONScanAndAggregate, connection.ExplainFormatJSON)
	if err != nil {
		t.Fatalf("解析失败：%v", err)
	}
	if len(result.Nodes) != 2 {
		t.Fatalf("应有 2 个节点（Aggregating + ReadFromMergeTree），got=%d", len(result.Nodes))
	}
	aggNode := result.Nodes[0]
	if aggNode.OpType != connection.ExplainOpAggregate {
		t.Fatalf("Aggregating 应为 AGGREGATE，got=%s", aggNode.OpType)
	}
	if !containsFlag(aggNode.Flags, connection.ExplainFlagTempTable) {
		t.Fatalf("Aggregating 应有 TEMP_TABLE flag")
	}
	scanNode := result.Nodes[1]
	if scanNode.OpType != connection.ExplainOpScan {
		t.Fatalf("ReadFromMergeTree 应为 SCAN，got=%s", scanNode.OpType)
	}
	if scanNode.Table != "default.events" {
		t.Fatalf("Table got=%s want=default.events", scanNode.Table)
	}
	// EstRows = Index Granules × 8192 = 240 × 8192 = 1966080
	if scanNode.EstRows != 240*8192 {
		t.Fatalf("EstRows got=%d want=%d", scanNode.EstRows, 240*8192)
	}
	if !containsFlag(scanNode.Flags, connection.ExplainFlagFullScan) {
		t.Fatalf("ReadType=Default 的 MergeTree 应有 FULL_SCAN flag")
	}
	if !containsFlag(scanNode.Flags, connection.ExplainFlagNoIndex) {
		t.Fatalf("ReadType=Default 的 MergeTree 应有 NO_INDEX flag")
	}
	// Edges：Aggregating -> ReadFromMergeTree
	if len(result.Edges) != 1 || result.Edges[0].From != aggNode.ID || result.Edges[0].To != scanNode.ID {
		t.Fatalf("应有 1 条边连接 AGGREGATE -> SCAN")
	}
}

func TestParseClickHouseExplain_IndexedReadNoFullScanFlag(t *testing.T) {
	raw := `{
		"Plan": {
			"Node Type": "ReadFromMergeTree",
			"ReadType": "InReverseOrder",
			"Parts": 5,
			"Index Granules": 30,
			"Table": "t",
			"Database": "default"
		}
	}`
	result, err := parseClickHouseExplain("SELECT * FROM default.t ORDER BY id DESC", raw, connection.ExplainFormatJSON)
	if err != nil {
		t.Fatalf("解析失败：%v", err)
	}
	if len(result.Nodes) != 1 {
		t.Fatalf("应有 1 个节点，got=%d", len(result.Nodes))
	}
	node := result.Nodes[0]
	// ReadType 不是 Default，不应触发 FULL_SCAN
	if containsFlag(node.Flags, connection.ExplainFlagFullScan) {
		t.Fatalf("ReadType=InReverseOrder 不应是 FULL_SCAN")
	}
}

func TestParseClickHouseExplain_MissingIndexEvidenceDoesNotReportFullScan(t *testing.T) {
	raw := `{
		"Plan": {
			"Node Type": "ReadFromMergeTree",
			"Table": "events",
			"Database": "default"
		}
	}`
	result, err := parseClickHouseExplain("SELECT * FROM events", raw, connection.ExplainFormatJSON)
	if err != nil {
		t.Fatalf("parse failed: %v", err)
	}
	if len(result.Nodes) != 1 {
		t.Fatalf("expected one plan node, got %d", len(result.Nodes))
	}
	if containsFlag(result.Nodes[0].Flags, connection.ExplainFlagFullScan) ||
		containsFlag(result.Nodes[0].Flags, connection.ExplainFlagNoIndex) {
		t.Fatalf("missing optional index evidence must not be reported as a full scan: %v", result.Nodes[0].Flags)
	}
}

func TestParseClickHouseExplain_EmptyReportedIndexesAreExplicitNoIndexEvidence(t *testing.T) {
	raw := `{
		"Plan": {
			"Node Type": "ReadFromMergeTree",
			"Indexes": [],
			"Table": "events"
		}
	}`
	result, err := parseClickHouseExplain("SELECT * FROM events", raw, connection.ExplainFormatJSON)
	if err != nil {
		t.Fatalf("parse failed: %v", err)
	}
	node := result.Nodes[0]
	if !containsFlag(node.Flags, connection.ExplainFlagFullScan) ||
		!containsFlag(node.Flags, connection.ExplainFlagNoIndex) {
		t.Fatalf("an explicitly empty Indexes array should be treated as no-index evidence: %v", node.Flags)
	}
}

func TestParseClickHouseExplain_ArrayForm(t *testing.T) {
	raw := `[
		{
			"Plan": {
				"Node Type": "Limit",
				"Plans": [
					{"Node Type": "ReadFromMergeTree", "ReadType": "Default", "Parts": 1, "Index Granules": 10, "Table": "t"}
				]
			}
		}
	]`
	result, err := parseClickHouseExplain("SELECT * FROM t LIMIT 10", raw, connection.ExplainFormatJSON)
	if err != nil {
		t.Fatalf("数组形式解析失败：%v", err)
	}
	if len(result.Nodes) != 2 {
		t.Fatalf("应有 2 个节点（Limit + ReadFromMergeTree），got=%d", len(result.Nodes))
	}
	if result.Nodes[0].OpType != connection.ExplainOpLimit {
		t.Fatalf("Limit 节点应为 LIMIT，got=%s", result.Nodes[0].OpType)
	}
}

func TestParseClickHouseExplain_InvalidJSONReturnsError(t *testing.T) {
	_, err := parseClickHouseExplain("SELECT 1", "{ not valid json", connection.ExplainFormatJSON)
	if err == nil {
		t.Fatal("非法 JSON 应返回 error")
	}
}

func TestParseClickHouseExplain_EmptyReturnsError(t *testing.T) {
	_, err := parseClickHouseExplain("SELECT 1", "  ", connection.ExplainFormatJSON)
	if err == nil {
		t.Fatal("空输入应返回 error")
	}
}
