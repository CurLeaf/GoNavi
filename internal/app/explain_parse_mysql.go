package app

import (
	"encoding/json"
	"fmt"
	"strings"

	"GoNavi-Wails/internal/connection"
)

// MySQL FORMAT=JSON 解析。
//
// 典型结构（8.0+）：
//
//	{
//	  "query_block": {
//	    "select_id": 1,
//	    "cost_info": {"query_cost": "100.00"},
//	    "table": { ... },                  // 单表
//	    "nested_loop": [{"table": {...}}], // 多表 JOIN
//	    "ordering_operation": { ... },     // ORDER BY 包装
//	    "grouping_operation": { ... },     // GROUP BY 包装
//	    "duplicates_removal": { ... }
//	  }
//	}
//
// 单个 table 节点字段：
//   - table_name / alias
//   - access_type：system/const/eq_ref/ref/range/index/ALL
//   - rows_examined_per_scan / rows_produced_per_join / filtered
//   - possible_keys / key / used_key_parts / key_length
//   - attached_condition / used_columns
//
// OceanBase MySQL 协议输出与 MySQL 8.0 几乎一致（可能多 range_info 列）。
//
// 5.7 不支持 FORMAT=JSON 时走 vanilla EXPLAIN，返回 8 列表格：id/select_type/table/type/
// possible_keys/key/key_len/ref/rows/Extra（OceanBase 可能多 range_info），由 parseMySQLTableExplain 处理。

func parseMySQLExplain(dbType, sourceSQL, raw string, format connection.ExplainFormat) (connection.ExplainResult, error) {
	result := connection.ExplainResult{
		DBType:    dbType,
		SourceSQL: sourceSQL,
	}
	resetExplainNodeID()

	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return result, fmt.Errorf("MySQL EXPLAIN 返回空内容")
	}

	// FORMAT=JSON 模式
	if format == connection.ExplainFormatJSON || strings.HasPrefix(trimmed, "{") {
		plan, warnings, err := parseMySQLJSONExplain(trimmed)
		if err != nil {
			// JSON 解析失败但确实是 JSON 开头：报错让上层决定降级
			return result, fmt.Errorf("解析 MySQL FORMAT=JSON 失败：%w", err)
		}
		result.Nodes = plan.Nodes
		result.Edges = plan.Edges
		result.Warnings = warnings
		result.RawFormat = connection.ExplainFormatJSON
		result.RawPayload = raw
		finalizeExplainStats(&result)
		return result, nil
	}

	// 表格模式（5.7 fallback 或 Doris/StarRocks）
	parsed, err := parseMySQLTableExplain(raw)
	if err != nil {
		result.RawFormat = connection.ExplainFormatText
		result.RawPayload = raw
		result.Warnings = []string{fmt.Sprintf("表格解析失败：%v；保留原文供调试", err)}
		return result, nil
	}
	result.Nodes = parsed.Nodes
	result.Edges = parsed.Edges
	result.RawFormat = connection.ExplainFormatTable
	result.RawPayload = raw
	finalizeExplainStats(&result)
	return result, nil
}

// mysqlQueryBlock 对应 MySQL FORMAT=JSON 顶层 query_block。
type mysqlQueryBlock struct {
	SelectID           json.Number            `json:"select_id"`
	CostInfo           map[string]string      `json:"cost_info"`
	Table              *mysqlTableNode        `json:"table"`
	NestedLoop         []map[string]json.RawMessage `json:"nested_loop"`
	OrderingOperation  *map[string]any        `json:"ordering_operation"`
	GroupingOperation  *map[string]any        `json:"grouping_operation"`
	DuplicatesRemoval  *map[string]any        `json:"duplicates_removal"`
	Windowing          *map[string]any        `json:"windowing"`
	Distinct           *map[string]any        `json:"distinct"`
	Message            string                 `json:"message"`
}

type mysqlTableNode struct {
	TableName             string            `json:"table_name"`
	Alias                 string            `json:"alias"`
	AccessType            string            `json:"access_type"`
	RowsExaminedPerScan   json.Number       `json:"rows_examined_per_scan"`
	RowsProducedPerJoin   json.Number       `json:"rows_produced_per_join"`
	Filtered              string            `json:"filtered"`
	PossibleKeys          []string          `json:"possible_keys"`
	Key                   string            `json:"key"`
	UsedKeyParts          []string          `json:"used_key_parts"`
	KeyLength             json.Number       `json:"key_length"`
	Ref                   []string          `json:"ref"`
	RowsExaminedPerJoin   json.Number       `json:"rows_examined_per_join"`
	CostInfo              map[string]string `json:"cost_info"`
	AttachedCondition    string            `json:"attached_condition"`
	AttachedSubqueries    []map[string]any  `json:"attached_subqueries"`
	UsingIntersection     []map[string]any  `json:"using_intersect"`
	Message               string            `json:"message"`
}

// parseMySQLJSONExplain 递归解析 MySQL FORMAT=JSON 输出。
// 返回扁平的节点列表 + 解析过程中的警告（用于前端提示不识别的字段）。
func parseMySQLJSONExplain(raw string) (*connection.ExplainResult, []string, error) {
	var top map[string]json.RawMessage
	if err := json.Unmarshal([]byte(raw), &top); err != nil {
		return nil, nil, fmt.Errorf("顶层 JSON 解析失败：%w", err)
	}

	result := &connection.ExplainResult{}
	var warnings []string

	qbRaw, ok := top["query_block"]
	if !ok {
		return nil, nil, fmt.Errorf("缺少 query_block 字段")
	}

	// query_block 总成本
	var qb map[string]json.RawMessage
	if err := json.Unmarshal(qbRaw, &qb); err != nil {
		return nil, nil, fmt.Errorf("query_block 解析失败：%w", err)
	}
	if costRaw, ok := qb["cost_info"]; ok {
		var ci map[string]string
		if err := json.Unmarshal(costRaw, &ci); err == nil {
			result.Stats.TotalCost = parseExplainFloat64(ci["query_cost"])
		}
	}

	// 递归 query_block（可能套 ordering/grouping/distinct 等操作层）
	parseMySQLQueryBlock(qbRaw, "", result, &warnings)

	return result, warnings, nil
}

// parseMySQLQueryBlock 递归解析 query_block 内部结构。
// MySQL FORMAT=JSON 是深度嵌套的"操作层"结构，每层可能包含 table、nested_loop、ordering_operation 等。
func parseMySQLQueryBlock(qbRaw json.RawMessage, parentID string, result *connection.ExplainResult, warnings *[]string) {
	var qb mysqlQueryBlock
	if err := json.Unmarshal(qbRaw, &qb); err != nil {
		*warnings = append(*warnings, fmt.Sprintf("query_block JSON 反序列化失败：%v", err))
		return
	}

	// 单表：直接挂一个 table 节点
	if qb.Table != nil {
		node := buildMySQLTableNode(qb.Table)
		appendExplainChild(result, parentID, node)
	}

	// nested_loop：每个元素含 table，作为 parent 的子节点
	for _, item := range qb.NestedLoop {
		if tableRaw, ok := item["table"]; ok {
			var t mysqlTableNode
			if err := json.Unmarshal(tableRaw, &t); err == nil {
				node := buildMySQLTableNode(&t)
				appendExplainChild(result, parentID, node)
			}
		}
	}

	// 递归操作层：ordering_operation / grouping_operation / duplicates_removal / windowing
	type opLayer struct {
		raw    json.RawMessage
		opType string
	}
	layers := []opLayer{}
	if qb.OrderingOperation != nil {
		// 反向取原始 JSON（结构体已 unmarshal，但用 raw 更通用）
	}
	// 直接遍历原始 qb map 更省事
	var qbMap map[string]json.RawMessage
	_ = json.Unmarshal(qbRaw, &qbMap)
	for key, val := range qbMap {
		switch key {
		case "ordering_operation":
			layers = append(layers, opLayer{raw: val, opType: connection.ExplainOpSort})
		case "grouping_operation":
			layers = append(layers, opLayer{raw: val, opType: connection.ExplainOpAggregate})
		case "duplicates_removal":
			layers = append(layers, opLayer{raw: val, opType: connection.ExplainOpOther})
		case "windowing":
			layers = append(layers, opLayer{raw: val, opType: connection.ExplainOpWindow})
		case "distinct":
			layers = append(layers, opLayer{raw: val, opType: connection.ExplainOpAggregate})
		}
	}
	for _, layer := range layers {
		// 操作层本身作为一个节点（供前端展示层次）
		layerNode := connection.ExplainNode{
			OpType:   layer.opType,
			OpDetail: strings.Title(strings.ReplaceAll(layer.opType, "_", " ")),
		}
		layerID := appendExplainChild(result, parentID, layerNode)
		// 递归：操作层可能含 table、nested_loop、子操作层
		parseMySQLQueryBlock(layer.raw, layerID, result, warnings)
	}
}

// buildMySQLTableNode 把 mysqlTableNode 转成归一化的 ExplainNode，并探测 Flags。
func buildMySQLTableNode(t *mysqlTableNode) connection.ExplainNode {
	node := connection.ExplainNode{
		OpType:   classifyMySQLAccessType(t.AccessType),
		OpDetail: fmt.Sprintf("access_type=%s", strings.ToLower(strings.TrimSpace(t.AccessType))),
		Table:    t.TableName,
		Index:    t.Key,
		EstRows:  parseExplainInt64(string(t.RowsExaminedPerScan)),
		Cost:     parseExplainFloat64(t.CostInfo["read_cost"]),
	}
	if t.Alias != "" && t.Alias != t.TableName {
		node.Extra = map[string]any{"alias": t.Alias}
	}
	if t.AttachedCondition != "" {
		if node.Extra == nil {
			node.Extra = map[string]any{}
		}
		node.Extra["attachedCondition"] = t.AttachedCondition
	}
	if len(t.UsedKeyParts) > 0 {
		if node.Extra == nil {
			node.Extra = map[string]any{}
		}
		node.Extra["usedKeyParts"] = t.UsedKeyParts
	}
	// 探测 Flags
	if node.OpType == connection.ExplainOpScan {
		node.Flags = append(node.Flags, connection.ExplainFlagFullScan, connection.ExplainFlagNoIndex)
	}
	return node
}

// classifyMySQLAccessType 把 MySQL access_type 归一化到通用 OpType。
// ALL → SCAN，range/eq_ref/ref/index → INDEX_SCAN 或 INDEX_ONLY，其他 → OTHER。
func classifyMySQLAccessType(accessType string) string {
	switch strings.ToLower(strings.TrimSpace(accessType)) {
	case "all":
		return connection.ExplainOpScan
	case "index":
		return connection.ExplainOpIndexOnly // 仅扫索引不回表
	case "range":
		return connection.ExplainOpIndexScan
	case "eq_ref", "ref", "ref_or_null", "unique_subquery", "index_subquery":
		return connection.ExplainOpIndexScan
	case "const", "system":
		return connection.ExplainOpOther // 单行命中，性能极佳
	default:
		return connection.ExplainOpOther
	}
}

// parseMySQLTableExplain 解析 MySQL 5.7 表格 / Doris / StarRocks 的 EXPLAIN 输出。
// 标准 MySQL 表格列：id|select_type|table|type|possible_keys|key|key_len|ref|rows|Extra
// OceanBase 可能多 range_info；Doris/StarRocks 是完全不同的结构化文本（PR2 优化）。
func parseMySQLTableExplain(raw string) (*connection.ExplainResult, error) {
	header, rows := parseExplainTSVRows(raw)
	if len(header) == 0 || len(rows) == 0 {
		return nil, fmt.Errorf("MySQL 表格 EXPLAIN 无有效行")
	}

	result := &connection.ExplainResult{}
	colID := lookupTSVColumn(header, "id")
	colType := lookupTSVColumn(header, "type")
	colTable := lookupTSVColumn(header, "table")
	colKey := lookupTSVColumn(header, "key")
	colRows := lookupTSVColumn(header, "rows")
	colExtra := lookupTSVColumn(header, "extra")

	// MySQL 的 id 字段表达父子：相同 id 是同一 SELECT 内的 join，id 不同代表子查询
	// 简化处理：每行作为独立节点，无父子（PR2 增强）
	var lastID string
	for _, row := range rows {
		var idStr string
		if colID >= 0 && colID < len(row) {
			idStr = strings.TrimSpace(row[colID])
		}
		if idStr == "" {
			idStr = lastID
		}
		lastID = idStr

		var accessType string
		if colType >= 0 && colType < len(row) {
			accessType = strings.TrimSpace(row[colType])
		}
		node := connection.ExplainNode{
			OpType: classifyMySQLAccessType(accessType),
			OpDetail: fmt.Sprintf("id=%s type=%s", idStr, strings.ToLower(accessType)),
		}
		if colTable >= 0 && colTable < len(row) {
			node.Table = strings.TrimSpace(row[colTable])
		}
		if colKey >= 0 && colKey < len(row) {
			node.Index = strings.TrimSpace(row[colKey])
		}
		if colRows >= 0 && colRows < len(row) {
			node.EstRows = parseExplainInt64(row[colRows])
		}
		if colExtra >= 0 && colExtra < len(row) {
			extra := strings.TrimSpace(row[colExtra])
			if extra != "" {
				node.Extra = map[string]any{"extra": extra}
				lower := strings.ToLower(extra)
				if strings.Contains(lower, "using filesort") {
					node.Flags = append(node.Flags, connection.ExplainFlagFilesort)
				}
				if strings.Contains(lower, "using temporary") {
					node.Flags = append(node.Flags, connection.ExplainFlagTempTable)
				}
			}
		}
		if node.OpType == connection.ExplainOpScan {
			node.Flags = append(node.Flags, connection.ExplainFlagFullScan, connection.ExplainFlagNoIndex)
		}
		appendExplainChild(result, "", node)
	}
	return result, nil
}
