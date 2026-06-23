package app

import (
	"testing"

	"GoNavi-Wails/internal/connection"
)

// SQL Server SHOWPLAN_XML fixture：单 Clustered Index Scan + Predicate + RunTime。
const sqlServerShowPlanXMLSingleScan = `<?xml version="1.0" encoding="utf-16"?>
<ShowPlanXML Version="1.481" Build="15.0.2000.0" xmlns="http://schemas.microsoft.com/sqlserver/2004/07/showplan">
  <BatchSequence>
    <Batch>
      <Statements>
        <StmtSimple StatementText="SELECT * FROM users WHERE age &gt; 18" StatementId="1">
          <QueryPlan DegreeOfParallelism="1">
            <RelOp NodeId="0" PhysicalOp="Clustered Index Scan" LogicalOp="Clustered Scan"
                   EstimateRows="10000" EstimateIO="0.1" EstimateCPU="0.001"
                   EstimatedTotalSubtreeCost="0.2" Parallel="0" EstimateRebinds="0">
              <Object Database="[db]" Schema="[dbo]" Table="[users]" Index="[PK_users]" />
              <RunTimeInformation>
                <RunTimeCountersPerThread ActualRows="10000" ActualElapsedms="5" ActualScans="1" />
              </RunTimeInformation>
              <IndexScan Ordered="0" />
            </RelOp>
          </QueryPlan>
        </StmtSimple>
      </Statements>
    </Batch>
  </BatchSequence>
</ShowPlanXML>`

func TestParseSQLServerExplain_ClusteredIndexScan(t *testing.T) {
	result, err := parseSQLServerExplain("SELECT * FROM users WHERE age > 18", sqlServerShowPlanXMLSingleScan, connection.ExplainFormatXML)
	if err != nil {
		t.Fatalf("解析失败：%v", err)
	}
	if len(result.Nodes) != 1 {
		t.Fatalf("应有 1 个 RelOp 节点，got=%d", len(result.Nodes))
	}
	node := result.Nodes[0]
	if node.OpType != connection.ExplainOpScan {
		t.Fatalf("Clustered Index Scan 应为 SCAN，got=%s", node.OpType)
	}
	if node.Table != "users" {
		t.Fatalf("Table got=%s want=users", node.Table)
	}
	if node.Index != "PK_users" {
		t.Fatalf("Index got=%s want=PK_users", node.Index)
	}
	if node.EstRows != 10000 {
		t.Fatalf("EstRows got=%d want=10000", node.EstRows)
	}
	if node.ActualRows != 10000 {
		t.Fatalf("ActualRows got=%d want=10000", node.ActualRows)
	}
	if node.DurationMs != 5 {
		t.Fatalf("DurationMs got=%v want=5", node.DurationMs)
	}
	if !containsFlag(node.Flags, connection.ExplainFlagFullScan) {
		t.Fatalf("Clustered Scan 应有 FULL_SCAN flag")
	}
}

// SQL Server fixture：Nested Loops JOIN + 两个子节点。
const sqlServerShowPlanXMLNestedLoops = `<?xml version="1.0" encoding="utf-16"?>
<ShowPlanXML xmlns="http://schemas.microsoft.com/sqlserver/2004/07/showplan">
  <BatchSequence>
    <Batch>
      <Statements>
        <StmtSimple StatementText="SELECT * FROM orders o JOIN users u ON o.user_id = u.id">
          <QueryPlan>
            <RelOp NodeId="0" PhysicalOp="Nested Loops" LogicalOp="Inner Join"
                   EstimateRows="100" EstimatedTotalSubtreeCost="1.5">
              <NestedLoops>
                <OuterReferences>
                  <ColumnReference Database="[db]" Table="[orders]" Column="user_id" />
                </OuterReferences>
                <RelOp NodeId="1" PhysicalOp="Clustered Index Scan" LogicalOp="Clustered Scan"
                       EstimateRows="50000" EstimatedTotalSubtreeCost="0.5">
                  <Object Database="[db]" Table="[orders]" Index="[PK_orders]" />
                  <IndexScan />
                </RelOp>
                <RelOp NodeId="2" PhysicalOp="Index Seek" LogicalOp="Index Seek"
                       EstimateRows="1" EstimatedTotalSubtreeCost="0.003">
                  <Object Database="[db]" Table="[users]" Index="[IX_users_id]" />
                  <IndexScan Ordered="1" />
                </RelOp>
              </NestedLoops>
            </RelOp>
          </QueryPlan>
        </StmtSimple>
      </Statements>
    </Batch>
  </BatchSequence>
</ShowPlanXML>`

func TestParseSQLServerExplain_NestedLoopsRecursesChildren(t *testing.T) {
	result, err := parseSQLServerExplain("SELECT * FROM orders o JOIN users u ON o.user_id = u.id", sqlServerShowPlanXMLNestedLoops, connection.ExplainFormatXML)
	if err != nil {
		t.Fatalf("解析失败：%v", err)
	}
	if len(result.Nodes) != 3 {
		t.Fatalf("应有 3 个节点（Nested Loops + 2 子），got=%d", len(result.Nodes))
	}
	joinNode := result.Nodes[0]
	if joinNode.OpType != connection.ExplainOpJoin {
		t.Fatalf("顶层应为 JOIN，got=%s", joinNode.OpType)
	}
	// 两个子节点（通过 Edges 验证）
	childCount := 0
	for _, e := range result.Edges {
		if e.From == joinNode.ID {
			childCount++
		}
	}
	if childCount != 2 {
		t.Fatalf("JOIN 应有 2 个直接子节点，got=%d", childCount)
	}
	// 找到 Index Seek 子节点
	var indexSeek *connection.ExplainNode
	for i := range result.Nodes {
		if result.Nodes[i].OpType == connection.ExplainOpIndexScan {
			indexSeek = &result.Nodes[i]
		}
	}
	if indexSeek == nil {
		t.Fatal("应有一个 Index Seek 节点")
	}
	if indexSeek.Index != "IX_users_id" {
		t.Fatalf("Index Seek 应使用 IX_users_id，got=%s", indexSeek.Index)
	}
}

func TestParseSQLServerExplain_InvalidXMLReturnsWarning(t *testing.T) {
	result, err := parseSQLServerExplain("SELECT 1", "<not valid xml", connection.ExplainFormatXML)
	if err != nil {
		t.Fatalf("非法 XML 应降级返回 warning 而非 error：%v", err)
	}
	if result.RawFormat != connection.ExplainFormatText {
		t.Fatalf("RawFormat got=%v want=text", result.RawFormat)
	}
	if len(result.Warnings) == 0 {
		t.Fatal("应有解析失败 warning")
	}
}

func TestParseSQLServerExplain_EmptyReturnsError(t *testing.T) {
	_, err := parseSQLServerExplain("SELECT 1", "  ", connection.ExplainFormatXML)
	if err == nil {
		t.Fatal("空输入应返回 error")
	}
}
