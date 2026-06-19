package app

import (
	"fmt"
	"strings"
	"sync/atomic"

	"GoNavi-Wails/internal/connection"
)

// SQL 诊断工作台：方言解析器公共工具。
//
// 本文件只放跨方言共享的辅助函数；每方言解析器在 explain_parse_<db>.go。

// explainNodeIDCounter 是单次解析内的递增节点 ID 生成器。
// 通过 resetExplainNodeID() 在解析开始时归零；并发安全（同一 query 串行解析）。
var explainNodeIDCounter uint64

func resetExplainNodeID() {
	atomic.StoreUint64(&explainNodeIDCounter, 0)
}

// nextExplainNodeID 返回下一个节点 ID（"n1"、"n2"……）。
func nextExplainNodeID() string {
	id := atomic.AddUint64(&explainNodeIDCounter, 1)
	return fmt.Sprintf("n%d", id)
}

// appendExplainChild 把子节点追加到 result.Nodes，并生成对应的 ExplainEdge。
// parentID 为空时不生成 Edge（根节点）。
func appendExplainChild(result *connection.ExplainResult, parentID string, node connection.ExplainNode) (nodeID string) {
	if node.ID == "" {
		node.ID = nextExplainNodeID()
	}
	if parentID != "" {
		node.ParentID = parentID
		result.Edges = append(result.Edges, connection.ExplainEdge{From: parentID, To: node.ID})
	}
	result.Nodes = append(result.Nodes, node)
	return node.ID
}

// finalizeExplainStats 遍历所有节点，计算聚合统计并写入 Stats 字段。
// 在解析器返回前调用。
//
// 注意：TotalDurationMs 在 PG/MySQL 8.0 中由解析器直接从 Execution Time 写入，
// 这里只在解析器未设置时（=0）才用节点累加值兜底，避免覆盖更精确的实例值。
func finalizeExplainStats(result *connection.ExplainResult) {
	if result == nil || len(result.Nodes) == 0 {
		return
	}
	var totalCost, accumulatedDuration float64
	var rowsRead, maxRows int64
	var bufferHitSum float64
	var bufferHitCount int
	for _, n := range result.Nodes {
		if n.Cost > 0 {
			totalCost += n.Cost
		}
		if n.DurationMs > 0 {
			accumulatedDuration += n.DurationMs
		}
		if n.OpType == connection.ExplainOpScan || n.OpType == connection.ExplainOpIndexScan || n.OpType == connection.ExplainOpIndexOnly {
			rowsRead += n.EstRows
		}
		if n.EstRows > maxRows {
			maxRows = n.EstRows
		}
		if n.BufferHit > 0 {
			bufferHitSum += n.BufferHit
			bufferHitCount++
		}
		for _, flag := range n.Flags {
			switch flag {
			case connection.ExplainFlagFullScan:
				result.Stats.HasFullScan = true
			case connection.ExplainFlagFilesort:
				result.Stats.HasFilesort = true
			case connection.ExplainFlagTempTable:
				result.Stats.HasTempTable = true
			}
		}
	}
	result.Stats.TotalCost = totalCost
	if result.Stats.TotalDurationMs == 0 && accumulatedDuration > 0 {
		result.Stats.TotalDurationMs = accumulatedDuration
	}
	result.Stats.RowsRead = rowsRead
	result.Stats.MaxEstRows = maxRows
	if bufferHitCount > 0 {
		result.Stats.BufferHitRate = bufferHitSum / float64(bufferHitCount)
	}
}

// parseExplainTSVRows 把 collectExplainRaw 生成的 TSV 原文重新切分为行（每行 []string 按列拆）。
// 第一行视为列头；空行跳过。
func parseExplainTSVRows(raw string) (header []string, rows [][]string) {
	lines := strings.Split(strings.TrimSpace(raw), "\n")
	if len(lines) == 0 {
		return nil, nil
	}
	header = strings.Split(lines[0], "\t")
	for i := 1; i < len(lines); i++ {
		line := strings.TrimRight(lines[i], "\r")
		if strings.TrimSpace(line) == "" {
			continue
		}
		rows = append(rows, strings.Split(line, "\t"))
	}
	return header, rows
}

// lookupTSVColumn 在 header 中按列名查找索引（大小写不敏感）；未找到返回 -1。
func lookupTSVColumn(header []string, names ...string) int {
	if len(header) == 0 || len(names) == 0 {
		return -1
	}
	for _, name := range names {
		target := strings.ToLower(strings.TrimSpace(name))
		if target == "" {
			continue
		}
		for i, h := range header {
			if strings.ToLower(strings.TrimSpace(h)) == target {
				return i
			}
		}
	}
	return -1
}

// parseExplainInt64 容错地把字符串解析为 int64（空/非法返回 0）。
func parseExplainInt64(s string) int64 {
	s = strings.TrimSpace(s)
	if s == "" || s == "NULL" || s == "<nil>" || s == "null" {
		return 0
	}
	var n int64
	for _, ch := range s {
		if ch < '0' || ch > '9' {
			if ch == '-' || ch == '+' {
				continue
			}
			break
		}
		n = n*10 + int64(ch-'0')
	}
	return n
}

// parseExplainFloat64 容错地把字符串解析为 float64（空/非法返回 0）。
// 支持形如 "100.00"、"1.5e3" 的简单浮点格式。
func parseExplainFloat64(s string) float64 {
	s = strings.TrimSpace(s)
	if s == "" || s == "NULL" || s == "<nil>" || s == "null" {
		return 0
	}
	var f float64
	_, err := fmt.Sscanf(s, "%f", &f)
	if err != nil {
		return 0
	}
	return f
}
