package app

import (
	"testing"

	"GoNavi-Wails/internal/connection"
)

// 规则引擎测试：验证各规则在合成 ExplainNode 上的触发与排序。

func TestRunExplainRules_FullScanLargeTableCritical(t *testing.T) {
	result := connection.ExplainResult{
		DBType:   "mysql",
		SourceSQL: "SELECT * FROM users",
		Nodes: []connection.ExplainNode{
			{
				ID:      "n1",
				OpType:  connection.ExplainOpScan,
				Table:   "users",
				EstRows: 100000,
				Flags:   []string{connection.ExplainFlagFullScan, connection.ExplainFlagNoIndex},
			},
		},
	}
	suggestions := runExplainRules(result)
	if len(suggestions) == 0 {
		t.Fatal("全表扫描大表应触发建议")
	}
	top := suggestions[0]
	if top.Severity != connection.SeverityCritical {
		t.Fatalf("大表全表扫描应为 critical，got=%s", top.Severity)
	}
	if top.Rule != "full_scan_with_filter" && top.Rule != "full_scan_on_large_table" {
		t.Fatalf("首条建议应与全表扫描相关，got=%s", top.Rule)
	}
	if top.AffectedTable != "users" {
		t.Fatalf("AffectedTable got=%s want=users", top.AffectedTable)
	}
}

func TestRunExplainRules_FullScanSmallTableSuppressed(t *testing.T) {
	result := connection.ExplainResult{
		DBType:   "mysql",
		SourceSQL: "SELECT * FROM small_table",
		Nodes: []connection.ExplainNode{
			{
				ID:      "n1",
				OpType:  connection.ExplainOpScan,
				Table:   "small_table",
				EstRows: 100, // 远低于 1000 阈值
				Flags:   []string{connection.ExplainFlagFullScan, connection.ExplainFlagNoIndex},
			},
		},
	}
	suggestions := runExplainRules(result)
	for _, s := range suggestions {
		if s.Rule == "full_scan_on_large_table" || s.Rule == "full_scan_with_filter" {
			t.Fatalf("小表（100 行）不应触发 full_scan 规则，got=%+v", s)
		}
	}
}

func TestRunExplainRules_FullScanWithFilterExtractsColumns(t *testing.T) {
	result := connection.ExplainResult{
		DBType:   "mysql",
		SourceSQL: "SELECT * FROM users WHERE email = 'x' AND status = 1",
		Nodes: []connection.ExplainNode{
			{
				ID:      "n1",
				OpType:  connection.ExplainOpScan,
				Table:   "users",
				EstRows: 10000,
				Flags:   []string{connection.ExplainFlagFullScan, connection.ExplainFlagNoIndex},
				Extra:   map[string]any{"attachedCondition": "(email = 'x') AND (status = 1)"},
			},
		},
	}
	suggestions := runExplainRules(result)
	foundFilterRule := false
	for _, s := range suggestions {
		if s.Rule == "full_scan_with_filter" {
			foundFilterRule = true
			if !contains(s.Reason, "email") || !contains(s.Reason, "status") {
				t.Fatalf("Reason 应提及 email 和 status 列，got=%s", s.Reason)
			}
		}
	}
	if !foundFilterRule {
		t.Fatal("带 WHERE 的全表扫描应触发 full_scan_with_filter 规则")
	}
}

func TestRunExplainRules_FilesortOnLargeResult(t *testing.T) {
	result := connection.ExplainResult{
		DBType:   "postgres",
		SourceSQL: "SELECT * FROM t ORDER BY id",
		Nodes: []connection.ExplainNode{
			{
				ID:      "n1",
				OpType:  connection.ExplainOpSort,
				EstRows: 10000,
				Flags:   []string{connection.ExplainFlagFilesort},
			},
		},
	}
	suggestions := runExplainRules(result)
	found := false
	for _, s := range suggestions {
		if s.Rule == "filesort_on_large_result" {
			found = true
			if s.Severity != connection.SeverityWarning {
				t.Fatalf("filesort 应为 warning，got=%s", s.Severity)
			}
		}
	}
	if !found {
		t.Fatal("大结果集 filesort 应触发建议")
	}
}

func TestRunExplainRules_HighEstimationSkewRequiresAnalyze(t *testing.T) {
	result := connection.ExplainResult{
		DBType:   "postgres",
		SourceSQL: "SELECT * FROM t WHERE id > 0",
		Nodes: []connection.ExplainNode{
			{
				ID:         "n1",
				OpType:     connection.ExplainOpIndexScan,
				EstRows:    100,
				ActualRows: 50000, // 偏差 500 倍
			},
		},
	}
	suggestions := runExplainRules(result)
	found := false
	for _, s := range suggestions {
		if s.Rule == "high_estimation_skew" {
			found = true
			if s.Severity != connection.SeverityInfo {
				t.Fatalf("估算偏差应为 info，got=%s", s.Severity)
			}
		}
	}
	if !found {
		t.Fatal("估算/实际偏差 > 10x 应触发建议")
	}
}

func TestRunExplainRules_LowBufferHitRateGlobalRule(t *testing.T) {
	result := connection.ExplainResult{
		DBType:    "postgres",
		SourceSQL: "SELECT * FROM t",
		Stats: connection.ExplainStats{
			BufferHitRate: 0.2, // 20% 命中率
			RowsRead:      10000,
		},
	}
	suggestions := runExplainRules(result)
	found := false
	for _, s := range suggestions {
		if s.Rule == "low_buffer_hit_rate" {
			found = true
		}
	}
	if !found {
		t.Fatal("缓冲命中率 < 50% 应触发建议")
	}
}

func TestRunExplainRules_NestedLoopHighFanout(t *testing.T) {
	result := connection.ExplainResult{
		DBType:   "mysql",
		SourceSQL: "SELECT * FROM a JOIN b ON a.id = b.aid",
		Nodes: []connection.ExplainNode{
			{ID: "n1", OpType: connection.ExplainOpJoin, Table: ""},
			{ID: "n2", OpType: connection.ExplainOpScan, Table: "a", EstRows: 10},
			{ID: "n3", OpType: connection.ExplainOpScan, Table: "b", EstRows: 50000},
		},
		Edges: []connection.ExplainEdge{
			{From: "n1", To: "n2"},
			{From: "n1", To: "n3"},
		},
	}
	suggestions := runExplainRules(result)
	found := false
	for _, s := range suggestions {
		if s.Rule == "nested_loop_high_fanout" {
			found = true
		}
	}
	if !found {
		t.Fatal("Nested Loop 被驱动表 > 10000 行应触发 nested_loop_high_fanout")
	}
}

func TestRunExplainRules_SortBySeverity(t *testing.T) {
	result := connection.ExplainResult{
		DBType:   "mysql",
		SourceSQL: "SELECT * FROM t1 JOIN t2 ON t1.id = t2.id ORDER BY t1.name",
		Nodes: []connection.ExplainNode{
			{
				ID:      "n1",
				OpType:  connection.ExplainOpScan,
				Table:   "t1",
				EstRows: 50000,
				Flags:   []string{connection.ExplainFlagFullScan, connection.ExplainFlagNoIndex},
			},
			{
				ID:      "n2",
				OpType:  connection.ExplainOpSort,
				EstRows: 100,
				Flags:   []string{connection.ExplainFlagFilesort},
			},
		},
	}
	suggestions := runExplainRules(result)
	if len(suggestions) < 2 {
		t.Fatalf("应触发至少 2 条建议，got=%d", len(suggestions))
	}
	// 第一条应是 critical（全表扫描）
	if suggestions[0].Severity != connection.SeverityCritical {
		t.Fatalf("首条建议应为 critical，got=%s（rule=%s）", suggestions[0].Severity, suggestions[0].Rule)
	}
}

func TestRunExplainRules_EmptyResultNoSuggestions(t *testing.T) {
	result := connection.ExplainResult{
		DBType:    "mysql",
		SourceSQL: "SELECT 1",
	}
	suggestions := runExplainRules(result)
	if len(suggestions) != 0 {
		t.Fatalf("空 ExplainResult 不应产生建议，got=%d", len(suggestions))
	}
}

// contains 检查字符串包含（避免和 strings.Contains 冲突，这里独立实现）。
func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || indexOfContains(s, substr) >= 0)
}

func indexOfContains(s, substr string) int {
	for i := 0; i+len(substr) <= len(s); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}
