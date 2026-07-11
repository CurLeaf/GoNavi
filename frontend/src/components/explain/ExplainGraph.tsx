import { memo, useCallback, useEffect, useMemo } from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  type Node,
  Position,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from 'reactflow'
import dagre from 'dagre'
import 'reactflow/dist/style.css'
import './ExplainAnalysis.css'
import {
  type ExplainEdge,
  type ExplainNode,
  formatNumber,
} from '../../utils/explainTypes'
import { useI18n } from '../../i18n/provider'

const NODE_WIDTH = 240
const NODE_HEIGHT = 128

export interface ExplainGraphNodeData {
  node: ExplainNode
  isSelected: boolean
  onSelect?: (nodeId: string) => void
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
  // Selection is deliberately excluded: highlighting a node must not run dagre again.
  const { rfNodes, rfEdges } = useMemo(
    () => layoutWithDagre(nodes, edges),
    [nodes, edges],
  )

  const [nodeState, setNodeState, onNodesChange] = useNodesState(
    applyGraphNodeState(rfNodes, selectedNodeId, onSelectNode),
  )
  const [edgeState, setEdgeState, onEdgesChange] = useEdgesState(rfEdges)

  // useNodesState/useEdgesState only consume their initial value. Keep controlled
  // ReactFlow state in sync when an asynchronously loaded plan replaces the props.
  useEffect(() => {
    setNodeState(applyGraphNodeState(rfNodes, selectedNodeId, onSelectNode))
  }, [onSelectNode, rfNodes, selectedNodeId, setNodeState])

  useEffect(() => {
    setEdgeState(rfEdges)
  }, [rfEdges, setEdgeState])

  const handlePaneClick = useCallback(() => {
    onSelectNode?.(null)
  }, [onSelectNode])

  return (
    <div className="gn-explain-graph">
      <ReactFlow
        nodes={nodeState}
        edges={edgeState}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onPaneClick={handlePaneClick}
        nodeTypes={EXPLAIN_NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

// layoutWithDagre only owns topology and positions. Interactive state is applied
// afterwards so selection and callback changes do not trigger an expensive layout.
export function layoutWithDagre(
  nodes: ExplainNode[],
  edges: ExplainEdge[],
): { rfNodes: Node<ExplainGraphNodeData>[]; rfEdges: Edge[] } {
  const graph = new dagre.graphlib.Graph()
  graph.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 60, marginx: 20, marginy: 20 })
  graph.setDefaultEdgeLabel(() => ({}))

  for (const node of nodes) {
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }
  for (const edge of edges) {
    graph.setEdge(edge.from, edge.to, { label: edge.label })
  }
  dagre.layout(graph)

  const rfNodes: Node<ExplainGraphNodeData>[] = nodes.map((node) => {
    const position = graph.node(node.id)
    return {
      id: node.id,
      type: 'explain',
      position: { x: position?.x ?? 0, y: position?.y ?? 0 },
      data: { node, isSelected: false },
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
      draggable: false,
      selectable: false,
      focusable: false,
    }
  })

  const rfEdges: Edge[] = edges.map((edge, index) => ({
    id: `e-${edge.from}-${edge.to}-${index}`,
    source: edge.from,
    target: edge.to,
    label: edge.label,
    type: 'smoothstep',
    style: { stroke: 'var(--gn-fg-5)', strokeWidth: 1.5 },
  }))

  return { rfNodes, rfEdges }
}

export function applyGraphNodeState(
  nodes: Node<ExplainGraphNodeData>[],
  selectedNodeId?: string,
  onSelectNode?: (nodeId: string | null) => void,
): Node<ExplainGraphNodeData>[] {
  return nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      isSelected: node.id === selectedNodeId,
      onSelect: onSelectNode,
    },
  }))
}

const ExplainGraphNodeRenderer = memo(function ExplainGraphNodeRenderer({
  data,
}: {
  data: ExplainGraphNodeData
}) {
  const { language, t } = useI18n()
  const { node, isSelected, onSelect } = data
  const operationColor = resolveOperationColor(node.opType)
  const hasFullScan = node.flags?.includes('FULL_SCAN')
  const hasFilesort = node.flags?.includes('FILESORT')
  const hasTempTable = node.flags?.includes('TEMP_TABLE')
  const operationLabel = node.opDetail || formatOperationLabel(node.opType)

  return (
    <button
      type="button"
      className={`gn-explain-node${isSelected ? ' gn-explain-node--selected' : ''}`}
      style={{ borderColor: isSelected ? 'var(--gn-accent)' : operationColor }}
      aria-pressed={isSelected}
      title={operationLabel}
      onClick={(event) => {
        event.stopPropagation()
        onSelect?.(node.id)
      }}
    >
      <span
        className="gn-explain-node__label"
        style={{ color: operationColor }}
        title={operationLabel}
      >
        {operationLabel}
      </span>
      {node.table && (
        <span className="gn-explain-node__field" title={node.table}>
          <span className="gn-explain-node__field-label">
            {t('sql_analysis.explain_graph.label.table')}
          </span>
          <code>{node.table}</code>
        </span>
      )}
      {node.index && (
        <span className="gn-explain-node__field" title={node.index}>
          <span className="gn-explain-node__field-label">
            {t('sql_analysis.explain_graph.label.index')}
          </span>
          <code>{node.index}</code>
        </span>
      )}
      <span className="gn-explain-node__metrics">
        {isFiniteMetric(node.estRows) && (
          <span>
            {t('sql_analysis.explain_graph.metric.est_rows')}{' '}
            <strong>{formatNumber(node.estRows, language)}</strong>
          </span>
        )}
        {isFiniteMetric(node.actualRows) && (
          <span>
            {t('sql_analysis.explain_graph.metric.actual_rows')}{' '}
            <strong>{formatNumber(node.actualRows, language)}</strong>
          </span>
        )}
        {isFiniteMetric(node.cost) && (
          <span>
            {t('sql_analysis.explain_graph.metric.cost')}{' '}
            <strong>{node.cost?.toFixed(1)}</strong>
          </span>
        )}
      </span>
      {(hasFullScan || hasFilesort || hasTempTable) && (
        <span className="gn-explain-node__flags">
          {hasFullScan && (
            <FlagBadge tone="danger" text={t('sql_analysis.explain_graph.flag.full_scan')} />
          )}
          {hasFilesort && (
            <FlagBadge tone="warning" text={t('sql_analysis.explain_graph.flag.filesort')} />
          )}
          {hasTempTable && (
            <FlagBadge tone="info" text={t('sql_analysis.explain_graph.flag.temp_table')} />
          )}
        </span>
      )}
    </button>
  )
})

const EXPLAIN_NODE_TYPES = { explain: ExplainGraphNodeRenderer }

function FlagBadge({ tone, text }: { tone: 'danger' | 'warning' | 'info'; text: string }) {
  return <span className={`gn-explain-flag gn-explain-flag--${tone}`}>{text}</span>
}

function isFiniteMetric(value?: number): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function formatOperationLabel(operation: string): string {
  const normalized = String(operation || '')
    .trim()
    .toLocaleLowerCase()
    .replace(/[_-]+/g, ' ')
  return normalized ? normalized.charAt(0).toLocaleUpperCase() + normalized.slice(1) : '-'
}

function resolveOperationColor(operation: string): string {
  switch (operation) {
    case 'SCAN':
    case 'MATERIALIZE':
      return 'var(--gn-danger)'
    case 'INDEX_SCAN':
    case 'INDEX_ONLY':
      return 'var(--gn-accent)'
    case 'JOIN':
    case 'AGGREGATE':
    case 'SUBQUERY':
    case 'UNION':
    case 'WINDOW':
      return 'var(--gn-info)'
    case 'SORT':
      return 'var(--gn-warn)'
    default:
      return 'var(--gn-fg-3)'
  }
}
