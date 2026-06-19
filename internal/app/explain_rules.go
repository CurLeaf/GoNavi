package app

import (
	"fmt"
	"strings"

	"GoNavi-Wails/internal/connection"
)

// SQL 诊断工作台规则引擎。
//
// 设计要点：
//   - 规则跨方言通用，基于归一化后的 ExplainNode 字段匹配
//   - 每条规则只描述问题 + 给出 Reason；不强行生成 CREATE INDEX（避免瞎猜列名误导用户）
//   - 规则触发按 Severity 严重度排序：critical > warning > info
//   - 同一节点可能触发多条规则（如 FULL_SCAN 节点同时触发"全表扫描"+"缺索引"）
//
// 规则 ID 列表（前端按 ID 显示本地化文案 + 图标）：
//   - full_scan_on_large_table：大表全表扫描（critical）
//   - full_scan_with_filter：带 WHERE 的全表扫描（critical，索引建议价值最高）
//   - missing_index_lookup：JOIN 中存在无索引扫描节点（critical）
//   - filesort_on_large_result：大结果集排序（warning）
//   - temp_table_for_distinct：DISTINCT/GROUP BY 物化临时表（warning）
//   - low_buffer_hit_rate：缓冲命中率低（warning，需 ANALYZE 才有数据）
//   - high_estimation_skew：估算与实际行数偏差大（info，需 ANALYZE）
//   - high_total_cost：总成本过高（warning）
//   - nested_loop_high_fanout：Nested Loop 高扇出（warning）
//   - using_temp_btree_order：SQLite 风格 ORDER BY 临时表（info）

// 规则阈值常量。值的选择基于工程经验：
//   - 1000 行：单节点扫描超过此值视为"非小表"
//   - 10000 行：超过此值视为"大表"，触发 critical 建议索引
//   - 0.5：缓冲命中率低于 50% 视为差
//   - 10x：估算与实际偏差超过 10 倍视为显著
const (
	ruleFullScanLargeTableRows   int64   = 10000
	ruleFullScanSmallTableRows   int64   = 1000
	ruleFilesortRowsThreshold    int64   = 5000
	ruleLowBufferHitThreshold    float64 = 0.5
	ruleEstimationSkewRatio     float64 = 10.0
	ruleHighTotalCostThreshold   float64 = 1000.0
	ruleNestedLoopFanoutRows     int64   = 10000
)

// runExplainRules 对归一化的 ExplainResult 跑全部规则，返回排序后的建议列表。
// 按 Severity 排序（critical > warning > info），同 Severity 内按 EstRows 降序。
func runExplainRules(result connection.ExplainResult) []connection.IndexSuggestion {
	var suggestions []connection.IndexSuggestion

	// 全局规则（基于 Stats）
	if s := ruleHighTotalCost(result); s != nil {
		suggestions = append(suggestions, *s)
	}
	if s := ruleLowBufferHitRate(result); s != nil {
		suggestions = append(suggestions, *s)
	}

	// 节点级规则
	for _, node := range result.Nodes {
		rules := []func(connection.ExplainResult, connection.ExplainNode) *connection.IndexSuggestion{
			ruleFullScanLargeTable,
			ruleFullScanWithFilter,
			ruleMissingIndexLookup,
			ruleFilesortOnLargeResult,
			ruleTempTableForDistinct,
			ruleHighEstimationSkew,
			ruleNestedLoopHighFanout,
			ruleUsingTempBTreeOrder,
		}
		for _, ruleFn := range rules {
			if s := ruleFn(result, node); s != nil {
				suggestions = append(suggestions, *s)
			}
		}
	}

	sortExplainSuggestions(suggestions)
	return suggestions
}

// sortExplainSuggestions 按 Severity + EstRows 排序（in-place）。
func sortExplainSuggestions(s []connection.IndexSuggestion) {
	// 简单插入排序：建议数量通常 < 20，无需 sort.Slice 的反射开销
	severityRank := map[string]int{
		connection.SeverityCritical: 0,
		connection.SeverityWarning:  1,
		connection.SeverityInfo:     2,
	}
	for i := 1; i < len(s); i++ {
		for j := i; j > 0; j-- {
			si := severityRank[s[j].Severity]
			sj := severityRank[s[j-1].Severity]
			if si < sj || (si == sj && s[j].EstRows > s[j-1].EstRows) {
				s[j], s[j-1] = s[j-1], s[j]
				continue
			}
			break
		}
	}
}

// ruleFullScanLargeTable：单节点全表扫描 + 估算行数超过阈值。
// 严重度：EstRows > 10000 → critical；> 1000 → warning；否则不触发。
func ruleFullScanLargeTable(_ connection.ExplainResult, node connection.ExplainNode) *connection.IndexSuggestion {
	if !hasFlag(node.Flags, connection.ExplainFlagFullScan) {
		return nil
	}
	if node.EstRows < ruleFullScanSmallTableRows {
		return nil
	}
	severity := connection.SeverityWarning
	if node.EstRows >= ruleFullScanLargeTableRows {
		severity = connection.SeverityCritical
	}
	return &connection.IndexSuggestion{
		Severity:       severity,
		Rule:           "full_scan_on_large_table",
		Reason:         fmt.Sprintf("表 %s 全表扫描，估算扫描 %d 行；考虑为 WHERE/JOIN 条件字段添加索引", node.Table, node.EstRows),
		AffectedNodeID: node.ID,
		AffectedTable:  node.Table,
		EstRows:        node.EstRows,
	}
}

// ruleFullScanWithFilter：带 WHERE 的全表扫描（最有价值的索引建议场景）。
// 从 attachedCondition / Filter / Extra 提取等式字段，提示用户考虑建索引。
func ruleFullScanWithFilter(_ connection.ExplainResult, node connection.ExplainNode) *connection.IndexSuggestion {
	if !hasFlag(node.Flags, connection.ExplainFlagFullScan) {
		return nil
	}
	filter := extractNodeFilterText(node)
	if filter == "" {
		return nil
	}
	columns := extractEqualityColumns(filter)
	if len(columns) == 0 {
		return nil
	}
	return &connection.IndexSuggestion{
		Severity:       connection.SeverityCritical,
		Rule:           "full_scan_with_filter",
		Reason:         fmt.Sprintf("表 %s 全表扫描但带 WHERE 条件 %q；建议为字段 %s 建立索引", node.Table, truncateForReason(filter, 60), joinColumnsForReason(columns)),
		AffectedNodeID: node.ID,
		AffectedTable:  node.Table,
		EstRows:        node.EstRows,
	}
}

// ruleMissingIndexLookup：JOIN 中存在无索引扫描节点（NO_INDEX flag）。
func ruleMissingIndexLookup(_ connection.ExplainResult, node connection.ExplainNode) *connection.IndexSuggestion {
	if !hasFlag(node.Flags, connection.ExplainFlagNoIndex) {
		return nil
	}
	// 已被 full_scan_on_large_table 覆盖时跳过，避免重复
	if hasFlag(node.Flags, connection.ExplainFlagFullScan) {
		return nil
	}
	if node.EstRows < ruleFullScanSmallTableRows {
		return nil
	}
	return &connection.IndexSuggestion{
		Severity:       connection.SeverityCritical,
		Rule:           "missing_index_lookup",
		Reason:         fmt.Sprintf("JOIN 节点 %s 未命中索引，估算扫描 %d 行；JOIN 字段需要索引", node.Table, node.EstRows),
		AffectedNodeID: node.ID,
		AffectedTable:  node.Table,
		EstRows:        node.EstRows,
	}
}

// ruleFilesortOnLargeResult：大结果集排序。
func ruleFilesortOnLargeResult(_ connection.ExplainResult, node connection.ExplainNode) *connection.IndexSuggestion {
	if !hasFlag(node.Flags, connection.ExplainFlagFilesort) {
		return nil
	}
	if node.EstRows < ruleFilesortRowsThreshold {
		return nil
	}
	return &connection.IndexSuggestion{
		Severity:       connection.SeverityWarning,
		Rule:           "filesort_on_large_result",
		Reason:         fmt.Sprintf("对约 %d 行做额外排序；考虑为 ORDER BY 字段建立索引以避免 filesort", node.EstRows),
		AffectedNodeID: node.ID,
		AffectedTable:  node.Table,
		EstRows:        node.EstRows,
	}
}

// ruleTempTableForDistinct：使用临时表（DISTINCT/GROUP BY）。
func ruleTempTableForDistinct(_ connection.ExplainResult, node connection.ExplainNode) *connection.IndexSuggestion {
	if !hasFlag(node.Flags, connection.ExplainFlagTempTable) {
		return nil
	}
	// OpDetail 含 distinct/group 时给出更精准的建议
	detail := strings.ToLower(node.OpDetail)
	var hint string
	switch {
	case strings.Contains(detail, "distinct"):
		hint = "DISTINCT 物化了临时表"
	case strings.Contains(detail, "group"):
		hint = "GROUP BY 物化了临时表"
	default:
		hint = "查询使用了临时表"
	}
	return &connection.IndexSuggestion{
		Severity:       connection.SeverityWarning,
		Rule:           "temp_table_for_distinct",
		Reason:         fmt.Sprintf("%s；考虑为分组字段建立索引避免物化", hint),
		AffectedNodeID: node.ID,
		AffectedTable:  node.Table,
		EstRows:        node.EstRows,
	}
}

// ruleHighEstimationSkew：估算与实际行数偏差大（需 ANALYZE 才有数据）。
func ruleHighEstimationSkew(_ connection.ExplainResult, node connection.ExplainNode) *connection.IndexSuggestion {
	if node.EstRows <= 0 || node.ActualRows <= 0 {
		return nil
	}
	ratio := float64(node.ActualRows) / float64(node.EstRows)
	if ratio < ruleEstimationSkewRatio && ratio > 1.0/ruleEstimationSkewRatio {
		return nil
	}
	return &connection.IndexSuggestion{
		Severity:       connection.SeverityInfo,
		Rule:           "high_estimation_skew",
		Reason:         fmt.Sprintf("估算 %d 行 / 实际 %d 行（偏差 %.1fx）；统计信息可能过期，考虑 ANALYZE TABLE", node.EstRows, node.ActualRows, ratio),
		AffectedNodeID: node.ID,
		AffectedTable:  node.Table,
		EstRows:        node.EstRows,
	}
}

// ruleNestedLoopHighFanout：Nested Loop 高扇出。
// 触发条件：JOIN 节点 + 子节点（被驱动表）估算行数 > 10000。
func ruleNestedLoopHighFanout(result connection.ExplainResult, node connection.ExplainNode) *connection.IndexSuggestion {
	if node.OpType != connection.ExplainOpJoin {
		return nil
	}
	// 找到该 JOIN 的直接子节点（被驱动表）
	var maxChildRows int64
	for _, edge := range result.Edges {
		if edge.From != node.ID {
			continue
		}
		for _, child := range result.Nodes {
			if child.ID == edge.To && child.EstRows > maxChildRows {
				maxChildRows = child.EstRows
			}
		}
	}
	if maxChildRows < ruleNestedLoopFanoutRows {
		return nil
	}
	return &connection.IndexSuggestion{
		Severity:       connection.SeverityWarning,
		Rule:           "nested_loop_high_fanout",
		Reason:         fmt.Sprintf("Nested Loop JOIN 被驱动表估算 %d 行，扇出过大；考虑改用 Hash Join 或为 JOIN 字段加索引", maxChildRows),
		AffectedNodeID: node.ID,
		AffectedTable:  node.Table,
		EstRows:        maxChildRows,
	}
}

// ruleUsingTempBTreeOrder：SQLite 风格的 ORDER BY 临时表（Info 级，提示性）。
func ruleUsingTempBTreeOrder(_ connection.ExplainResult, node connection.ExplainNode) *connection.IndexSuggestion {
	if !hasFlag(node.Flags, connection.ExplainFlagFilesort) {
		return nil
	}
	if node.EstRows >= ruleFilesortRowsThreshold {
		return nil // 已被 filesort_on_large_result 覆盖
	}
	return &connection.IndexSuggestion{
		Severity:       connection.SeverityInfo,
		Rule:           "using_temp_btree_order",
		Reason:         "ORDER BY 使用临时 B-Tree；如频繁执行，为排序字段建立索引可消除该开销",
		AffectedNodeID: node.ID,
		AffectedTable:  node.Table,
		EstRows:        node.EstRows,
	}
}

// ruleHighTotalCost：总成本过高（全局规则）。
func ruleHighTotalCost(result connection.ExplainResult) *connection.IndexSuggestion {
	if result.Stats.TotalCost < ruleHighTotalCostThreshold {
		return nil
	}
	return &connection.IndexSuggestion{
		Severity: connection.SeverityWarning,
		Rule:     "high_total_cost",
		Reason:   fmt.Sprintf("执行计划总成本 %.1f；考虑重写查询或加索引降低扫描量", result.Stats.TotalCost),
		EstRows:  result.Stats.RowsRead,
	}
}

// ruleLowBufferHitRate：缓冲命中率低（全局规则，PG/Oracle 才有此数据）。
func ruleLowBufferHitRate(result connection.ExplainResult) *connection.IndexSuggestion {
	if result.Stats.BufferHitRate <= 0 || result.Stats.BufferHitRate >= ruleLowBufferHitThreshold {
		return nil
	}
	return &connection.IndexSuggestion{
		Severity: connection.SeverityWarning,
		Rule:     "low_buffer_hit_rate",
		Reason:   fmt.Sprintf("缓冲命中率仅 %.1f%%；热门数据可能未被缓存，考虑增大 shared_buffers 或检查访问模式", result.Stats.BufferHitRate*100),
		EstRows:  result.Stats.RowsRead,
	}
}

// hasFlag 检查节点是否含指定 flag。
func hasFlag(flags []string, target string) bool {
	for _, f := range flags {
		if f == target {
			return true
		}
	}
	return false
}

// extractNodeFilterText 从节点的 attached_condition / Filter / Extra 中提取过滤条件文本。
func extractNodeFilterText(node connection.ExplainNode) string {
	if node.Extra == nil {
		return ""
	}
	for _, key := range []string{"attachedCondition", "filter"} {
		if v, ok := node.Extra[key]; ok {
			text := strings.TrimSpace(fmt.Sprintf("%v", v))
			if text != "" && text != "<nil>" {
				return text
			}
		}
	}
	return ""
}

// extractEqualityColumns 从 SQL 过滤条件中提取等值条件的列名（粗略解析）。
// 仅识别 "col = ?" / "col = literal" 形式；不处理复杂表达式（OR/函数调用）。
func extractEqualityColumns(filter string) []string {
	if filter == "" {
		return nil
	}
	// 简化：按 AND 切分后取每个等值条件的左边
	parts := splitTopLevelByKeyword(filter, " and ")
	seen := make(map[string]struct{})
	var columns []string
	for _, part := range parts {
		part = strings.TrimSpace(part)
		// 去除括号
		part = strings.Trim(part, "() ")
		eqIdx := strings.Index(part, "=")
		if eqIdx <= 0 {
			continue
		}
		left := strings.TrimSpace(part[:eqIdx])
		// 必须是简单标识符（字母数字下划线 + 点）
		if !isSimpleIdentifier(left) {
			continue
		}
		// 右边不是另一个列引用（粗略判断：不含点/字母前缀的字段）
		right := strings.TrimSpace(part[eqIdx+1:])
		if isSimpleIdentifier(right) {
			continue // col1 = col2 形式不算索引候选
		}
		if _, exists := seen[left]; !exists {
			seen[left] = struct{}{}
			columns = append(columns, left)
		}
	}
	return columns
}

// splitTopLevelByKeyword 按关键字（不区分大小写）切分字符串，忽略嵌套括号内的匹配。
func splitTopLevelByKeyword(text, keyword string) []string {
	var parts []string
	depth := 0
	lower := strings.ToLower(text)
	kw := strings.ToLower(keyword)
	start := 0
	for i := 0; i < len(lower); i++ {
		switch lower[i] {
		case '(':
			depth++
		case ')':
			if depth > 0 {
				depth--
			}
		}
		if depth > 0 {
			continue
		}
		if strings.HasPrefix(lower[i:], kw) {
			parts = append(parts, text[start:i])
			i += len(kw)
			start = i
		}
	}
	parts = append(parts, text[start:])
	return parts
}

// isSimpleIdentifier 判断字符串是否是简单 SQL 标识符（支持 schema.table 形式）。
func isSimpleIdentifier(s string) bool {
	if s == "" {
		return false
	}
	for i, ch := range s {
		ok := (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '_' || ch == '.'
		if !ok {
			return false
		}
		if i == 0 && ch >= '0' && ch <= '9' {
			return false
		}
	}
	return true
}

// truncateForReason 截断字符串到 maxLen，超出加省略号。
func truncateForReason(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-1] + "…"
}

// joinColumnsForReason 把列名列表格式化为人类可读的列表（最多 3 个）。
func joinColumnsForReason(columns []string) string {
	if len(columns) == 0 {
		return ""
	}
	if len(columns) > 3 {
		return strings.Join(columns[:3], ", ") + " 等"
	}
	return strings.Join(columns, ", ")
}
