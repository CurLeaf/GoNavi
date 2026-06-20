import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Spin, Tooltip } from 'antd';
import {
  ApartmentOutlined,
  ArrowRightOutlined,
  DatabaseOutlined,
  LinkOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import dagre from 'dagre';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  Position,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { t as defaultTranslate, type I18nParams } from '../i18n';
import type { BuildErDiagramGraphResult, ErDiagramEdge, ErDiagramNode } from './dataGridErDiagramModel';
import { useDataGridErDiagram } from './useDataGridErDiagram';

type DataGridMetadataTranslate = (key: string, params?: I18nParams) => string;

export interface DataGridErDiagramProps {
  connections: any[];
  connectionId?: string;
  dbName?: string;
  tableName?: string;
  translate?: DataGridMetadataTranslate;
  onOpenTable?: (tableName: string) => void;
}

type ErDiagramNodeData = {
  node: ErDiagramNode;
  selected: boolean;
  translate: DataGridMetadataTranslate;
  onOpenTable?: (tableName: string) => void;
};

const NODE_WIDTH = 320;
const NODE_BASE_HEIGHT = 108;
const NODE_ROW_HEIGHT = 28;
const NODE_FOOTER_HEIGHT = 28;

const getRoleBadgeKey = (role: ErDiagramNode['role']): string => {
  switch (role) {
    case 'current':
      return 'data_grid.metadata_view.er_current_badge';
    case 'incoming':
      return 'data_grid.metadata_view.er_referenced_by_badge';
    case 'outgoing':
      return 'data_grid.metadata_view.er_reference_badge';
    default:
      return 'data_grid.metadata_view.er_table_badge';
  }
};

const estimateNodeHeight = (node: ErDiagramNode): number => (
  NODE_BASE_HEIGHT +
  (node.columns.length * NODE_ROW_HEIGHT) +
  (node.hiddenColumnCount > 0 ? NODE_FOOTER_HEIGHT : 0)
);

const edgeColorByDirection: Record<ErDiagramEdge['direction'], string> = {
  incoming: '#2f9e44',
  outgoing: '#1971c2',
  self: '#7c3aed',
};

const layoutGraph = (
  graph: BuildErDiagramGraphResult,
  translate: DataGridMetadataTranslate,
  onOpenTable?: (tableName: string) => void,
): { nodes: Node<ErDiagramNodeData>[]; edges: Edge[] } => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setGraph({
    rankdir: 'LR',
    nodesep: 56,
    ranksep: 96,
    marginx: 24,
    marginy: 24,
  });
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  graph.nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: NODE_WIDTH,
      height: estimateNodeHeight(node),
    });
  });
  graph.edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });
  dagre.layout(dagreGraph);

  return {
    nodes: graph.nodes.map((node) => {
      const height = estimateNodeHeight(node);
      const position = dagreGraph.node(node.id);
      return {
        id: node.id,
        type: 'erTable',
        position: {
          x: (position?.x ?? NODE_WIDTH / 2) - (NODE_WIDTH / 2),
          y: (position?.y ?? height / 2) - (height / 2),
        },
        data: {
          node,
          selected: false,
          translate,
          onOpenTable,
        },
        draggable: true,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      };
    }),
    edges: graph.edges.map((edge) => {
      const color = edgeColorByDirection[edge.direction];
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        type: 'smoothstep',
        animated: edge.direction === 'self',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 18,
          height: 18,
          color,
        },
        style: {
          stroke: color,
          strokeWidth: edge.direction === 'self' ? 2 : 1.7,
        },
        labelStyle: {
          fill: 'var(--gn-fg-4)',
          fontSize: 11,
          fontWeight: 600,
        },
        labelBgPadding: [6, 3],
        labelBgBorderRadius: 4,
        labelBgStyle: {
          fill: 'var(--gn-bg-panel-2)',
          stroke: 'var(--gn-br-1)',
        },
      };
    }),
  };
};

const ErTableNode = memo(function ErTableNode({ data }: { data: ErDiagramNodeData }) {
  const { node, selected, translate, onOpenTable } = data;
  const roleBadgeKey = getRoleBadgeKey(node.role);
  const canOpen = !node.isCurrent && typeof onOpenTable === 'function';

  return (
    <div
      className={`gn-er-node-card${selected ? ' is-selected' : ''}${node.isCurrent ? ' is-current' : ''}`}
      data-role={node.role}
    >
      <div className="gn-er-node-header">
        <div className="gn-er-node-title">
          <span className="gn-er-node-badge">{translate(roleBadgeKey)}</span>
          <strong title={node.tableName}>{node.tableName}</strong>
        </div>
        {canOpen && (
          <Tooltip title={translate('data_grid.metadata_view.er_open_table')}>
            <Button
              size="small"
              type="text"
              className="gn-er-node-open"
              icon={<ArrowRightOutlined />}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpenTable?.(node.tableName);
              }}
            />
          </Tooltip>
        )}
      </div>

      <div className="gn-er-node-stats">
        <Tooltip title={translate('data_grid.metadata_view.er_referenced_by_badge')}>
          <span>
            <ApartmentOutlined />
            {node.incomingCount}
          </span>
        </Tooltip>
        <Tooltip title={translate('data_grid.metadata_view.er_reference_badge')}>
          <span>
            <LinkOutlined />
            {node.outgoingCount}
          </span>
        </Tooltip>
      </div>

      <div className="gn-er-node-columns">
        {node.columns.map((column) => (
          <div
            key={column.name}
            className={`gn-er-node-column${column.isRelationField ? ' is-relation' : ''}`}
          >
            <div className="gn-er-node-column-name">
              {column.isPrimary && <em className="is-pk">PK</em>}
              {!column.isPrimary && column.isForeign && <em className="is-fk">FK</em>}
              <code title={column.comment || column.name}>{column.name}</code>
            </div>
            <span className="gn-er-node-column-type">{column.type || '-'}</span>
          </div>
        ))}
      </div>

      {node.hiddenColumnCount > 0 && (
        <div className="gn-er-node-footer">
          {translate('data_grid.metadata_view.er_hidden_columns', { count: node.hiddenColumnCount })}
        </div>
      )}
    </div>
  );
});

const DataGridErDiagramCanvasInner: React.FC<{
  graph: BuildErDiagramGraphResult;
  translate: DataGridMetadataTranslate;
  onOpenTable?: (tableName: string) => void;
}> = ({
  graph,
  translate,
  onOpenTable,
}) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(graph.nodes[0]?.id || null);
  const { fitView } = useReactFlow();

  useEffect(() => {
    setSelectedNodeId(graph.nodes[0]?.id || null);
  }, [graph.nodes]);

  const layout = useMemo(
    () => layoutGraph(graph, translate, onOpenTable),
    [graph, onOpenTable, translate],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layout.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layout.edges);

  useEffect(() => {
    setNodes(
      layout.nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          selected: node.id === selectedNodeId,
        },
      })),
    );
  }, [layout.nodes, setNodes]);

  useEffect(() => {
    setEdges(layout.edges);
  }, [layout.edges, setEdges]);

  useEffect(() => {
    setNodes((currentNodes) => currentNodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        selected: node.id === selectedNodeId,
      },
    })));
  }, [selectedNodeId, setNodes]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fitView({ padding: 0.18, duration: 220 });
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [fitView, layout.edges, layout.nodes]);

  const handleNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    setSelectedNodeId(node.id);
  }, []);

  const handleNodeDoubleClick: NodeMouseHandler = useCallback((_event, node) => {
    const nodeData = node.data as ErDiagramNodeData | undefined;
    if (nodeData?.node?.isCurrent) {
      return;
    }
    nodeData?.onOpenTable?.(nodeData.node.tableName);
  }, []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={{ erTable: ErTableNode }}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={handleNodeClick}
      onNodeDoubleClick={handleNodeDoubleClick}
      onPaneClick={() => setSelectedNodeId(null)}
      minZoom={0.35}
      maxZoom={1.8}
      fitView
      fitViewOptions={{ padding: 0.18 }}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
};

const DataGridErDiagramCanvas: React.FC<{
  graph: BuildErDiagramGraphResult;
  translate: DataGridMetadataTranslate;
  onOpenTable?: (tableName: string) => void;
}> = (props) => (
  <ReactFlowProvider>
    <DataGridErDiagramCanvasInner {...props} />
  </ReactFlowProvider>
);

const DataGridErDiagram: React.FC<DataGridErDiagramProps> = ({
  connections,
  connectionId,
  dbName,
  tableName,
  translate = defaultTranslate,
  onOpenTable,
}) => {
  const {
    graph,
    loading,
    reloading,
    error,
    partial,
    reload,
  } = useDataGridErDiagram({
    connections,
    connectionId,
    dbName,
    tableName,
  });

  return (
    <div className="gn-v2-data-grid-er-diagram">
      <div className="gn-v2-data-grid-er-toolbar">
        <div>
          <span>{translate('data_grid.metadata_view.er_table_badge')}</span>
          <strong>{tableName || translate('data_grid.table_fallback.query_result')}</strong>
        </div>
        <div className="gn-v2-data-grid-er-summary">
          <span className="gn-v2-data-grid-er-chip">
            <DatabaseOutlined />
            {translate('data_grid.metadata_view.er_related_table_count', { count: graph?.relatedTableCount ?? 0 })}
          </span>
          <span className="gn-v2-data-grid-er-chip">
            <ApartmentOutlined />
            {translate('data_grid.metadata_view.er_relation_count', { count: graph?.relationCount ?? 0 })}
          </span>
          <Button
            icon={<ReloadOutlined />}
            onClick={reload}
            loading={reloading}
          >
            {translate('common.refresh')}
          </Button>
        </div>
      </div>

      {partial && !error && (
        <div className="gn-v2-data-grid-er-alert">
          <Alert
            type="warning"
            showIcon
            message={translate('data_grid.metadata_view.er_partial_warning')}
          />
        </div>
      )}

      {error ? (
        <div className="gn-v2-data-grid-er-alert">
          <Alert type="error" showIcon message={error} />
        </div>
      ) : null}

      <div className="gn-v2-data-grid-er-canvas">
        <Spin spinning={loading || reloading}>
          {graph ? (
            <>
              {graph.isEmpty && (
                <div className="gn-v2-data-grid-er-empty">
                  {translate('data_grid.metadata_view.er_empty')}
                </div>
              )}
              <DataGridErDiagramCanvas
                graph={graph}
                translate={translate}
                onOpenTable={onOpenTable}
              />
            </>
          ) : (
            <div className="gn-v2-data-grid-er-placeholder" />
          )}
        </Spin>
      </div>
    </div>
  );
};

export default DataGridErDiagram;
