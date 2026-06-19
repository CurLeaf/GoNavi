import { useCallback, useMemo } from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  type Node,
  type NodeMouseHandler,
  Position,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from 'reactflow'
import dagre from 'dagre'
import 'reactflow/dist/style.css'
import {
  type ExplainEdge,
  type ExplainNode,
  opTypeColor,
  formatNumber,
} from '../../utils/explainTypes'

// 执行计划图主组件。
// 使用 react-flow 渲染扁平节点数组，dagre 自动计算树形布局。
//
// 设计要点：
//   - 自定义节点（ExplainGraphNodeData）按 opType 着色 + 警告 flag 边框高亮
//   - 点击节点触发 onSelectNode 回调（详情抽屉联动）
//   - 节点尺寸自适应内容，避免长 SQL/表名截断
//   - 通过 React.memo 避免不必要的重渲染（88W 数据下很重要）

const NODE_WIDTH = 220
const NODE_HEIGHT = 80

export interface ExplainGraphNodeData {
  node: ExplainNode
  isSelected: boolean
}

interface ExplainGraphProps {
  nodes: ExplainNode[]
  edges: ExplainEdge[]
  selectedNodeId?: string
  onSelectNode?: (nodeId: string | null) => void
}

export default function ExplainGraph(props: ExplainGraphProps) {
  return (
    <ReactFlowProvider>
      <ExplainGraphInner {...props} />
    </ReactFlowProvider>
  )
}

function ExplainGraphInner({ nodes, edges, selectedNodeId, onSelectNode }: ExplainGraphProps) {
  const { rfNodes, rfEdges } = useMemo(
    () => layoutWithDagre(nodes, edges, selectedNodeId),
    [nodes, edges, selectedNodeId],
  )

  const [nodeState, , onNodesChange] = useNodesState(rfNodes)
  const [edgeState, , onEdgesChange] = useEdgesState(rfEdges)

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      onSelectNode?.(node.id)
    },
    [onSelectNode],
  )

  const handlePaneClick = useCallback(() => {
    onSelectNode?.(null)
  }, [onSelectNode])

  return (
    <div className="gn-explain-graph" style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodeState}
        edges={edgeState}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={{ explain: ExplainGraphNodeRenderer }}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

// layoutWithDagre 用 dagre 计算 react-flow 节点位置。
// 默认从上到下（TB）布局，符合执行计划的"父子层级"心智模型。
function layoutWithDagre(
  nodes: ExplainNode[],
  edges: ExplainEdge[],
  selectedNodeId?: string,
): { rfNodes: Node<ExplainGraphNodeData>[]; rfEdges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 60, marginx: 20, marginy: 20 })
  g.setDefaultEdgeLabel(() => ({}))

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }
  for (const edge of edges) {
    g.setEdge(edge.from, edge.to, { label: edge.label })
  }
  dagre.layout(g)

  const rfNodes: Node<ExplainGraphNodeData>[] = nodes.map((node) => {
    const pos = g.node(node.id)
    return {
      id: node.id,
      type: 'explain',
      position: { x: pos?.x ?? 0, y: pos?.y ?? 0 },
      data: { node, isSelected: node.id === selectedNodeId },
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
      draggable: false,
    }
  })

  const rfEdges: Edge[] = edges.map((edge, idx) => ({
    id: `e-${edge.from}-${edge.to}-${idx}`,
    source: edge.from,
    target: edge.to,
    label: edge.label,
    type: 'smoothstep',
    style: { stroke: 'var(--gn-explain-edge, #adb5bd)', strokeWidth: 1.5 },
  }))

  return { rfNodes, rfEdges }
}

import { memo } from 'react'

const ExplainGraphNodeRenderer = memo(function ExplainGraphNodeRenderer({
  data,
}: {
  data: ExplainGraphNodeData
}) {
  const { node, isSelected } = data
  const color = opTypeColor(node.opType)
  const hasFullScan = node.flags?.includes('FULL_SCAN')
  const hasFilesort = node.flags?.includes('FILESORT')
  const hasTempTable = node.flags?.includes('TEMP_TABLE')

  return (
    <div
      className="gn-explain-node"
      style={{
        width: NODE_WIDTH,
        minHeight: NODE_HEIGHT,
        border: `2px solid ${isSelected ? 'var(--gn-explain-selected, #1971c2)' : color}`,
        background: 'var(--gn-explain-node-bg, #ffffff)',
        boxShadow: isSelected ? '0 0 0 3px rgba(25, 113, 194, 0.2)' : 'none',
        borderRadius: 6,
        padding: 8,
        fontSize: 12,
        cursor: 'pointer',
      }}
    >
      <div style={{ fontWeight: 600, color, marginBottom: 4 }}>{node.opDetail || node.opType}</div>
      {node.table && (
        <div style={{ color: 'var(--gn-text-muted, #495057)', marginBottom: 2 }}>
          <span style={{ opacity: 0.6 }}>表：</span>
          <code style={{ fontSize: 11 }}>{node.table}</code>
        </div>
      )}
      {node.index && (
        <div style={{ color: 'var(--gn-text-muted, #495057)', marginBottom: 2 }}>
          <span style={{ opacity: 0.6 }}>索引：</span>
          <code style={{ fontSize: 11 }}>{node.index}</code>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
        {node.estRows !== undefined && node.estRows > 0 && (
          <span style={{ color: 'var(--gn-text-muted, #495057)' }}>
            估算 <strong>{formatNumber(node.estRows)}</strong>
          </span>
        )}
        {node.actualRows !== undefined && node.actualRows > 0 && (
          <span style={{ color: 'var(--gn-text-muted, #495057)' }}>
            实际 <strong>{formatNumber(node.actualRows)}</strong>
          </span>
        )}
        {node.cost !== undefined && node.cost > 0 && (
          <span style={{ color: 'var(--gn-text-muted, #495057)' }}>
            成本 <strong>{node.cost.toFixed(1)}</strong>
          </span>
        )}
      </div>
      {(hasFullScan || hasFilesort || hasTempTable) && (
        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
          {hasFullScan && <FlagBadge color="#fa5252" text="全表扫描" />}
          {hasFilesort && <FlagBadge color="#f08c00" text="额外排序" />}
          {hasTempTable && <FlagBadge color="#7048e8" text="临时表" />}
        </div>
      )}
    </div>
  )
})

function FlagBadge({ color, text }: { color: string; text: string }) {
  return (
    <span
      style={{
        background: color,
        color: 'white',
        padding: '1px 6px',
        borderRadius: 3,
        fontSize: 10,
        fontWeight: 500,
      }}
    >
      {text}
    </span>
  )
}
