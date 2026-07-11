package app

import (
	"testing"

	"GoNavi-Wails/internal/connection"
)

func TestParseDistributedMySQLTextExplainBuildsRealOperators(t *testing.T) {
	raw := "Explain String\n" +
		"PLAN FRAGMENT 0\n" +
		"  8:AGGREGATE (merge finalize)\n" +
		"  |  cardinality: 1\n" +
		"  0:OlapScanNode\n" +
		"     TABLE: store_returns\n" +
		"     partitions=1/1\n" +
		"     rollup: store_returns\n" +
		"     cardinality=277502\n"

	for _, dbType := range []string{"diros", "starrocks"} {
		result := parseDistributedMySQLTextExplain(dbType, "SELECT * FROM store_returns", raw, connection.ExplainFormatTable)
		if len(result.Nodes) != 2 {
			t.Fatalf("%s expected aggregate and scan nodes, got %+v", dbType, result.Nodes)
		}
		if result.Nodes[0].OpType != connection.ExplainOpAggregate || result.Nodes[1].OpType != connection.ExplainOpScan {
			t.Fatalf("%s operator classification mismatch: %+v", dbType, result.Nodes)
		}
		if result.Nodes[1].Table != "store_returns" || result.Nodes[1].EstRows != 277502 {
			t.Fatalf("%s scan metadata mismatch: %+v", dbType, result.Nodes[1])
		}
		if !containsFlag(result.Nodes[1].Flags, connection.ExplainFlagFullScan) {
			t.Fatalf("%s full partition scan should be flagged: %+v", dbType, result.Nodes[1])
		}
		if len(result.Edges) != 1 {
			t.Fatalf("%s expected a pipeline edge, got %+v", dbType, result.Edges)
		}
	}
}

func TestParseDistributedMySQLTextExplainFallsBackToRawWithoutFakeNodes(t *testing.T) {
	result := parseDistributedMySQLTextExplain("diros", "SELECT 1", "Explain String\nPLAN FRAGMENT 0\nRESULT SINK", connection.ExplainFormatTable)
	if len(result.Nodes) != 0 || len(result.Warnings) == 0 || result.RawPayload == "" {
		t.Fatalf("unrecognized text should remain raw-only, got %+v", result)
	}
}
