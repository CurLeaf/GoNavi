import Modal from './common/ResizableDraggableModal';
import {
  V2_RAIL_UNGROUPED_CONNECTION_GROUP_ID,
  formatSidebarRowCount,
  hasSidebarLazyChildren,
  shouldClearSidebarActiveContextOnEmptySelect,
  getV2RailConnectionGroupBadgeText,
  isV2SidebarObjectNode,
  type V2ExplorerFilter,
} from './sidebar/sidebarHelpers';
// 重新导出，保持外部测试文件的 `from './Sidebar'` 兼容
export {
  V2_RAIL_UNGROUPED_CONNECTION_GROUP_ID,
  formatSidebarRowCount,
  hasSidebarLazyChildren,
  shouldClearSidebarActiveContextOnEmptySelect,
  getV2RailConnectionGroupBadgeText,
  isV2SidebarObjectNode,
} from './sidebar/sidebarHelpers';
import React, { useEffect, useState, useMemo, useRef, useCallback, useDeferredValue } from 'react';
import { createPortal } from 'react-dom';
import { Tree, message, Dropdown, MenuProps, Input, Button, Form, Badge, Checkbox, Space, Select, Popover, Tooltip, Progress, Switch } from 'antd';
	import {
	  DatabaseOutlined,
	  TableOutlined,
	  EyeOutlined,
	  ConsoleSqlOutlined,
  HddOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  FileTextOutlined,
  CopyOutlined,
  ExportOutlined,
  FolderAddOutlined,
  SaveOutlined,
  EditOutlined,
  DownOutlined,
  SearchOutlined,
  KeyOutlined,
  ThunderboltOutlined,
  UnorderedListOutlined,
  FunctionOutlined,
  LinkOutlined,
  FileAddOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
  DeleteOutlined,
  DisconnectOutlined,
  CloudOutlined,
  CheckSquareOutlined,
  CodeOutlined,
  TagOutlined,
  CheckOutlined,
  FilterOutlined,
  DashboardOutlined,
  WarningOutlined,
  ClockCircleOutlined,
  RobotOutlined,
  AimOutlined,
  MoreOutlined,
  ToolOutlined,
  SettingOutlined,
  BarsOutlined,
  StarFilled,
  StarOutlined
	} from '@ant-design/icons';
import {
    buildSidebarRootConnectionToken,
    buildSidebarRootTagToken,
    buildSidebarTablePinKey,
    resolveSidebarRootOrderTokens,
    useStore,
} from '../store';
import { buildOverlayWorkbenchTheme } from '../utils/overlayWorkbenchTheme';
		import { ConnectionTag, SavedConnection, SavedQuery, ExternalSQLDirectory, ExternalSQLTreeEntry, JVMCapability, JVMResourceSummary } from '../types';
import { getDbIcon } from './DatabaseIcons';
		import { DBGetDatabases, DBGetTables, DBQuery, DBShowCreateTable, DBReleaseConnection, ExportTableWithOptions, OpenSQLFile, ExecuteSQLFile, CancelSQLFileExecution, CreateDatabase, CreateSchema, RenameDatabase, DropDatabase, RenameTable, DropTable, DropView, DropFunction, RenameView, SelectSQLDirectory, ListSQLDirectory, ReadSQLFile, CreateSQLFile, CreateSQLDirectory, DeleteSQLFile, DeleteSQLDirectory, RenameSQLFile, RenameSQLDirectory, JVMProbeCapabilities, GetDriverStatusList } from '../../wailsjs/go/app/App';
import { getTableDataDangerActionMeta, supportsTableTruncateAction, type TableDataDangerActionKind } from './tableDataDangerActions';
  import { EventsOn } from '../../wailsjs/runtime/runtime';
  import { isMacLikePlatform, normalizeOpacityForPlatform, resolveAppearanceValues } from '../utils/appearance';
import { useAutoFetchVisibility } from '../utils/autoFetchVisibility';
import FindInDatabaseModal from './FindInDatabaseModal';
import { buildRpcConnectionConfig } from '../utils/connectionRpcConfig';
import { getDataSourceCapabilities, resolveDataSourceType } from '../utils/dataSourceCapabilities';
import { noAutoCapInputProps } from '../utils/inputAutoCap';
import {
  buildMySQLCompatibleViewMetadataSqls,
  isSidebarViewTableType,
  normalizeSidebarViewMetadataEntry,
  resolveSidebarMetadataDialect,
  resolveSidebarRuntimeDatabase,
  type SidebarViewMetadataEntry,
} from '../utils/sidebarMetadata';
import { splitQualifiedNameLast } from '../utils/qualifiedName';
import { buildStarRocksMaterializedViewPreviewSql } from './tableDesignerSchemaSql';
import { normalizeOceanBaseProtocol } from '../utils/oceanBaseProtocol';
import { resolveConnectionHostSummary, resolveConnectionHostTokens } from '../utils/tabDisplay';
import {
    findSidebarNodePathByKey,
    findSidebarNodePathForLocate,
    normalizeSidebarLocateObjectRequest,
    normalizeSidebarLocateObjectRequestFromTab,
    resolveSidebarLocateTarget,
    type SidebarLocateTreeNodeLike,
} from '../utils/sidebarLocate';
import { resolveConnectionAccentColor, resolveConnectionIconType } from '../utils/connectionVisual';
import { buildJVMTabTitle } from '../utils/jvmRuntimePresentation';
import { buildJVMDiagnosticActionDescriptor, buildJVMMonitoringActionDescriptors } from '../utils/jvmSidebarActions';
import { buildTableSelectQuery } from '../utils/objectQueryTemplates';
import {
    buildBatchDatabaseExportWorkbenchTab,
    buildBatchTableExportWorkbenchTab,
    buildTableExportTab,
} from '../utils/tableExportTab';
import { useExportProgressDialog } from './ExportProgressModal';
import { getShortcutPlatform, resolveShortcutDisplay } from '../utils/shortcuts';
import { buildExternalSQLDirectoryId, buildExternalSQLRootNode, buildExternalSQLTabId, type ExternalSQLTreeNode } from '../utils/externalSqlTree';
import { getCurrentLanguage, t } from '../i18n';
import { SIDEBAR_SQL_EDITOR_DRAG_MIME, encodeSidebarSqlEditorDragPayload } from '../utils/sidebarSqlDrag';
import { buildSqlServerObjectDefinitionQueries } from '../utils/sqlServerObjectDefinition';
import JVMModeBadge from './jvm/JVMModeBadge';
import MessagePublishModal from './MessagePublishModal';
import {
  SIDEBAR_CONTEXT_MENU_FALLBACK_HEIGHT,
  SIDEBAR_CONTEXT_MENU_FALLBACK_WIDTH,
  isExternalSQLDirectoryModalMode,
  normalizeMySQLViewDDLForEditing,
  resolveSidebarContextMenuPosition,
  resolveSidebarObjectDragText,
  type ExternalSQLFileModalMode,
  type SearchScope,
} from './sidebarCoreUtils';
export { resolveSidebarContextMenuPosition } from './sidebarCoreUtils';
export type { ExternalSQLFileModalMode, SearchScope } from './sidebarCoreUtils';
import {
    V2DatabaseContextMenuView,
    V2ConnectionGroupContextMenuView,
    V2ConnectionContextMenuView,
    V2SchemaContextMenuView,
    V2TableContextMenuView,
    V2TableGroupContextMenuView,
    type V2DatabaseContextMenuActionKey,
    type V2ConnectionGroupContextMenuActionKey,
    type V2ConnectionContextMenuActionKey,
    type V2SchemaContextMenuActionKey,
    type V2TableContextMenuActionKey,
    type V2TableContextMenuStats,
    type V2TableGroupContextMenuActionKey,
} from './V2TableContextMenu';
import {
  V2_TREE_HORIZONTAL_SCROLL_BOTTOM_RESERVE,
  estimateV2TreeHorizontalScrollWidth,
  filterV2CommandSearchTreeItems,
  resolveV2CommandSearchPersistentFilter,
  shouldCloseV2CommandSearchOnGlobalKey,
  shouldRunV2CommandSearchEnter,
} from './sidebarV2Utils';

export {
  estimateV2TreeHorizontalScrollWidth,
  filterV2CommandSearchTreeItems,
  resolveV2CommandSearchPersistentFilter,
  shouldCloseV2CommandSearchOnGlobalKey,
  shouldRunV2CommandSearchEnter,
};

const { Search } = Input;
type SidebarContextMenuState = {
  x: number;
  y: number;
  sourceX?: number;
  sourceY?: number;
  items: MenuProps['items'];
  kind?: 'v2-table' | 'v2-database' | 'v2-schema' | 'v2-table-group' | 'v2-connection' | 'v2-connection-group';
  node?: any;
  rootClassName?: string;
  overlayStyle?: React.CSSProperties;
  maxHeight?: number;
};

const SIDEBAR_LOCATE_LOAD_WAIT_INTERVAL_MS = 50;
const SIDEBAR_LOCATE_LOAD_WAIT_ATTEMPTS = 160;

interface TreeNode {
  title: string;
  key: string;
  isLeaf?: boolean;
  selectable?: boolean;
  children?: TreeNode[];
  icon?: React.ReactNode;
  dataRef?: any;
  type?: 'connection' | 'database' | 'table' | 'view' | 'materialized-view' | 'db-trigger' | 'db-event' | 'routine' | 'object-group' | 'v2-table-section' | 'queries-folder' | 'saved-query' | 'all-saved-queries' | 'saved-query-group' | 'unmatched-saved-queries' | 'external-sql-root' | 'external-sql-directory' | 'external-sql-folder' | 'external-sql-file' | 'folder-columns' | 'folder-indexes' | 'folder-fks' | 'folder-triggers' | 'redis-db' | 'tag' | 'jvm-mode' | 'jvm-resource' | 'jvm-diagnostic' | 'jvm-monitoring';
}

export const resolveV2ObjectGroupTitle = (node: Pick<TreeNode, 'type' | 'dataRef'> | null | undefined): string | null => {
  if (node?.type !== 'object-group') return null;
  const groupKey = String(node?.dataRef?.groupKey || '');
  if (groupKey === 'tables') return t('sidebar.v2_table_group_menu.title');
  if (groupKey === 'views') return t('sidebar.object_group.views');
  if (groupKey === 'routines') return t('sidebar.object_group.routines');
  if (groupKey === 'triggers') return t('sidebar.object_group.triggers');
  if (groupKey === 'events') return t('sidebar.object_group.events');
  if (groupKey === 'materializedViews') return t('sidebar.object_group.materialized_views');
  return null;
};

export type SQLFileExecutionStatus = 'running' | 'done' | 'cancelled' | 'error';

export type SQLFileExecutionProgressState = {
  fileSizeMB: string;
  status: SQLFileExecutionStatus;
  executed: number;
  failed: number;
  percent: number;
  currentSQL: string;
  resultMessage: string;
};

const resolveSQLFileExecutionStatusLabel = (status: SQLFileExecutionStatus): string => {
  switch (status) {
    case 'done':
      return `✅ ${t('sidebar.sql_file_exec.status.done')}`;
    case 'cancelled':
      return `⚠️ ${t('sidebar.sql_file_exec.status.cancelled')}`;
    case 'error':
      return `❌ ${t('sidebar.sql_file_exec.status.error')}`;
    case 'running':
    default:
      return t('sidebar.sql_file_exec.status.running');
  }
};

export const buildSQLFileExecutionFooter = ({
  status,
  onCancelExecution,
  onClose,
}: {
  status: SQLFileExecutionStatus;
  onCancelExecution: () => void;
  onClose: () => void;
}): React.ReactNode[] => {
  if (status === 'running') {
    return [
      <Button key="cancel" danger onClick={onCancelExecution}>
        {t('sidebar.sql_file_exec.cancel')}
      </Button>,
    ];
  }

  return [
    <Button key="close" type="primary" onClick={onClose}>
      {t('sidebar.action.close')}
    </Button>,
  ];
};

export const SQLFileExecutionProgressContent: React.FC<SQLFileExecutionProgressState> = ({
  fileSizeMB,
  status,
  executed,
  failed,
  percent,
  currentSQL,
  resultMessage,
}) => (
  <>
    <div style={{ marginBottom: 16 }}>
      <Progress
        percent={Math.round(percent)}
        status={status === 'error' ? 'exception' : status === 'done' ? 'success' : 'active'}
        strokeColor={status === 'cancelled' ? '#faad14' : undefined}
      />
    </div>
    <div style={{ fontSize: 13, lineHeight: '22px', marginBottom: 8 }}>
      <div>{t('sidebar.sql_file_exec.file_size')}<strong>{fileSizeMB} MB</strong></div>
      <div>{t('sidebar.sql_file_exec.status_label')}<strong>{resolveSQLFileExecutionStatusLabel(status)}</strong></div>
      <div>
        {t('sidebar.sql_file_exec.executed_label')}
        <strong style={{ color: '#52c41a' }}>{executed}</strong>
        {t('sidebar.sql_file_exec.rows_separator')}
        <strong style={{ color: failed > 0 ? '#ff4d4f' : undefined }}>{failed}</strong>
        {t('sidebar.sql_file_exec.rows_suffix')}
      </div>
    </div>
    {currentSQL && status === 'running' && (
      <div style={{ fontSize: 12, color: 'rgba(128,128,128,0.8)', background: 'rgba(128,128,128,0.06)', borderRadius: 6, padding: '6px 10px', marginTop: 8, fontFamily: 'var(--gn-font-mono)', wordBreak: 'break-all', maxHeight: 60, overflow: 'hidden' }}>
        {currentSQL}
      </div>
    )}
    {resultMessage && status !== 'running' && (
      <div style={{ fontSize: 12, marginTop: 12, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', background: 'rgba(128,128,128,0.06)', borderRadius: 6, padding: '8px 12px' }}>
        {resultMessage}
      </div>
    )}
  </>
);

export const shouldLoadSidebarNodeOnExpand = (
  node: Pick<TreeNode, 'type' | 'children' | 'isLeaf'> | null | undefined,
): boolean => {
  if (!node || node.isLeaf === true || hasSidebarLazyChildren(node.children)) return false;
  return node.type === 'connection'
      || node.type === 'database'
      || node.type === 'external-sql-root'
      || node.type === 'table'
      || node.type === 'jvm-mode'
      || node.type === 'jvm-resource';
};

export const resolveSidebarTableNameForCopy = (node: Pick<TreeNode, 'title' | 'dataRef'> | null | undefined): string => {
  return String(node?.dataRef?.tableName || node?.dataRef?.viewName || node?.dataRef?.eventName || node?.title || '').trim();
};

type SidebarTableSortPreference = 'name' | 'frequency';

type SidebarTableEntryForSort = {
  tableName: string;
  schemaName?: string;
  displayName: string;
  rowCount?: number;
};

export const isSidebarTablePinned = (
  pinnedKeys: string[],
  connectionId: string,
  dbName: string,
  tableName: string,
  schemaName = '',
): boolean => {
  const key = buildSidebarTablePinKey(connectionId, dbName, tableName, schemaName);
  return !!key && pinnedKeys.includes(key);
};

export const sortSidebarTableEntries = <T extends SidebarTableEntryForSort>(
  entries: T[],
  options: {
    connectionId: string;
    dbName: string;
    sortBy: SidebarTableSortPreference;
    tableAccessCount?: Record<string, number>;
    pinnedSidebarTables?: string[];
  },
): T[] => {
  const pinnedKeys = options.pinnedSidebarTables || [];
  const accessCount = options.tableAccessCount || {};
  const compareByName = (a: T, b: T) => a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase());
  const compareWithinPinnedGroup = (a: T, b: T) => {
    if (options.sortBy === 'frequency') {
      const keyA = `${options.connectionId}-${options.dbName}-${a.tableName}`;
      const keyB = `${options.connectionId}-${options.dbName}-${b.tableName}`;
      const countA = accessCount[keyA] || 0;
      const countB = accessCount[keyB] || 0;
      if (countA !== countB) {
        return countB - countA;
      }
    }
    return compareByName(a, b);
  };

  return [...entries].sort((a, b) => {
    const pinnedA = isSidebarTablePinned(pinnedKeys, options.connectionId, options.dbName, a.tableName, a.schemaName || '');
    const pinnedB = isSidebarTablePinned(pinnedKeys, options.connectionId, options.dbName, b.tableName, b.schemaName || '');
    if (pinnedA !== pinnedB) {
      return pinnedA ? -1 : 1;
    }
    return compareWithinPinnedGroup(a, b);
  });
};

export const buildV2SidebarTableSectionedChildren = (
  parentKey: string,
  tableNodes: TreeNode[],
): TreeNode[] => {
  const pinnedTables = tableNodes.filter((node) => node?.dataRef?.pinnedSidebarTable);
  if (pinnedTables.length === 0) return tableNodes;

  const regularTables = tableNodes.filter((node) => !node?.dataRef?.pinnedSidebarTable);
  const buildSectionNode = (kind: 'pinned' | 'all', title: string): TreeNode => ({
    title,
    key: `${parentKey}-v2-${kind}-tables-section`,
    type: 'v2-table-section',
    isLeaf: true,
    selectable: false,
    dataRef: {
      sectionKind: kind,
    },
  });

  return [
    buildSectionNode('pinned', t('table_overview.section.pinned')),
    ...pinnedTables,
    buildSectionNode('all', t('table_overview.section.all')),
    ...regularTables,
  ];
};

export const buildSidebarTableChildrenForUi = (
  parentKey: string,
  tableNodes: TreeNode[],
  isV2Ui: boolean,
): TreeNode[] => {
  if (!isV2Ui) return tableNodes;
  return buildV2SidebarTableSectionedChildren(parentKey, tableNodes);
};


const buildConnectionRootQueryTabTitle = () => t('query.new');

const buildConnectionRootRedisCommandTabTitle = (redisDbLabel = 'db0') =>
  t('sidebar.tab.redis_command', { database: redisDbLabel });

const buildConnectionRootRedisMonitorTabTitle = (redisDbLabel = 'db0') =>
  t('sidebar.tab.redis_monitor', { database: redisDbLabel });

type BatchTableExportMode = 'schema' | 'backup' | 'dataOnly';
type BatchObjectType = 'table' | 'view';
type BatchObjectFilterType = 'all' | BatchObjectType;
type BatchSelectionScope = 'filtered' | 'all';

export interface V2RailConnectionGroup {
  id: string;
  name: string;
  connections: SavedConnection[];
  isUngrouped?: boolean;
  rootToken: string;
}

export const buildV2RailConnectionGroups = (
  connections: SavedConnection[],
  connectionTags: ConnectionTag[],
  sidebarRootOrder: string[] = [],
): V2RailConnectionGroup[] => {
  const connectionById = new Map(connections.map((conn) => [conn.id, conn]));
  const groupedConnectionIds = new Set<string>();
  const tagGroups = new Map<string, V2RailConnectionGroup>();

  connectionTags.forEach((tag) => {
    const tagConnections: SavedConnection[] = [];
    tag.connectionIds.forEach((connectionId) => {
      const conn = connectionById.get(connectionId);
      if (!conn || groupedConnectionIds.has(conn.id)) return;
      groupedConnectionIds.add(conn.id);
      tagConnections.push(conn);
    });
    if (tagConnections.length === 0) return;
    tagGroups.set(tag.id, {
      id: tag.id,
      name: tag.name || t('connection.sidebar.group.untitled'),
      connections: tagConnections,
      rootToken: buildSidebarRootTagToken(tag.id),
    });
  });

  const ungroupedConnectionMap = new Map(
    connections
      .filter((conn) => !groupedConnectionIds.has(conn.id))
      .map((conn) => [conn.id, conn]),
  );
  const orderedRootTokens = resolveSidebarRootOrderTokens(
    sidebarRootOrder,
    connectionTags,
    connections,
  );
  const groups: V2RailConnectionGroup[] = [];

  orderedRootTokens.forEach((token) => {
    if (token.startsWith('tag:')) {
      const tagId = token.slice('tag:'.length);
      const group = tagGroups.get(tagId);
      if (!group) return;
      groups.push(group);
      tagGroups.delete(tagId);
      return;
    }
    if (token.startsWith('connection:')) {
      const connectionId = token.slice('connection:'.length);
      const conn = ungroupedConnectionMap.get(connectionId);
      if (!conn) return;
      groups.push({
        id: connectionId,
        name: conn.name,
        connections: [conn],
        isUngrouped: true,
        rootToken: buildSidebarRootConnectionToken(connectionId),
      });
      ungroupedConnectionMap.delete(connectionId);
    }
  });

  tagGroups.forEach((group) => {
    groups.push(group);
  });
  ungroupedConnectionMap.forEach((conn) => {
    groups.push({
      id: conn.id,
      name: conn.name,
      connections: [conn],
      isUngrouped: true,
      rootToken: buildSidebarRootConnectionToken(conn.id),
    });
  });

  return groups;
};


const V2_EXPLORER_FILTER_OPTIONS: Array<{ key: V2ExplorerFilter; labelKey: string }> = [
  { key: 'all', labelKey: 'sidebar.command_search.object_kind.all' },
  { key: 'tables', labelKey: 'sidebar.command_search.object_kind.tables' },
  { key: 'views', labelKey: 'sidebar.command_search.object_kind.views' },
  { key: 'routines', labelKey: 'sidebar.command_search.object_kind.routines' },
  { key: 'events', labelKey: 'sidebar.command_search.object_kind.events' },
];

const V2_EXPLORER_FILTER_GROUP_KEYS: Record<Exclude<V2ExplorerFilter, 'all'>, string[]> = {
  tables: ['tables'],
  views: ['views', 'materializedViews'],
  routines: ['routines'],
  events: ['events'],
};

export const filterV2ExplorerTreeByKind = (
  nodes: TreeNode[],
  filter: V2ExplorerFilter,
): TreeNode[] => {
  if (filter === 'all') return nodes;
  const allowedGroupKeys = new Set(V2_EXPLORER_FILTER_GROUP_KEYS[filter]);
  const objectTypeMatches = (node: TreeNode): boolean => {
    if (filter === 'tables') return node.type === 'table';
    if (filter === 'views') return node.type === 'view' || node.type === 'materialized-view';
    if (filter === 'routines') return node.type === 'routine';
    if (filter === 'events') return node.type === 'db-event';
    return false;
  };

  const visit = (node: TreeNode): TreeNode | null => {
    if (node.type === 'external-sql-root') {
      return null;
    }
    const groupKey = String(node?.dataRef?.groupKey || '');
    if (node.type === 'object-group') {
      if (allowedGroupKeys.has(groupKey)) {
        return node;
      }
      if (groupKey === 'schema') {
        const schemaChildren = (node.children || []).map(visit).filter(Boolean) as TreeNode[];
        return schemaChildren.length > 0 ? { ...node, children: schemaChildren, isLeaf: false } : null;
      }
      return null;
    }
    if (objectTypeMatches(node)) {
      return node;
    }
    if (node.type === 'database') {
      const filteredChildren = (node.children || []).map(visit).filter(Boolean) as TreeNode[];
      return filteredChildren.length > 0 ? { ...node, children: filteredChildren, isLeaf: false } : null;
    }
    return null;
  };

  return nodes.map(visit).filter(Boolean) as TreeNode[];
};

type SidebarMessagePublishTarget = {
  connection: SavedConnection;
  executionDbName: string;
  destination: string;
};

interface BatchObjectItem {
  title: string;
  key: string;
  objectName: string;
  objectType: BatchObjectType;
  dataRef: any;
}

export type V2CommandSearchItem =
  | {
      key: string;
      kind: 'node';
      title: string;
      meta: string;
      icon: React.ReactNode;
      node: TreeNode;
    }
  | {
      key: string;
      kind: 'action';
      title: string;
      meta: string;
      shortcut?: string;
      icon: React.ReactNode;
      onRun: () => void;
    }
  | {
      key: string;
      kind: 'recent';
      title: string;
      meta: string;
      icon: React.ReactNode;
      sql: string;
      connectionId?: string;
      dbName?: string;
    };

export type V2CommandSearchMode = 'default' | 'object' | 'ai';

export interface V2CommandSearchQuery {
  mode: V2CommandSearchMode;
  rawValue: string;
  keyword: string;
  normalizedKeyword: string;
  aiPrompt: string;
}

export const parseV2CommandSearchQuery = (value: unknown): V2CommandSearchQuery => {
  const rawValue = String(value ?? '');
  const trimmedValue = rawValue.trim();
  const firstChar = trimmedValue.charAt(0);

  if (firstChar === '@' || firstChar === '＠') {
    const keyword = trimmedValue.slice(1).trim();
    return {
      mode: 'object',
      rawValue,
      keyword,
      normalizedKeyword: keyword.toLowerCase(),
      aiPrompt: '',
    };
  }

  if (firstChar === '?' || firstChar === '？') {
    const aiPrompt = trimmedValue.slice(1).trim();
    return {
      mode: 'ai',
      rawValue,
      keyword: aiPrompt,
      normalizedKeyword: aiPrompt.toLowerCase(),
      aiPrompt,
    };
  }

  return {
    mode: 'default',
    rawValue,
    keyword: trimmedValue,
    normalizedKeyword: trimmedValue.toLowerCase(),
    aiPrompt: '',
  };
};

export const resolveSidebarConnectionIdFromKey = (
  key: unknown,
  connectionIds: string[],
): string => {
  const keyText = String(key ?? '').trim();
  if (!keyText) return '';

  const sortedIds = Array.from(new Set(connectionIds.filter(Boolean)))
      .sort((a, b) => b.length - a.length);
  return sortedIds.find((id) => keyText === id || keyText.startsWith(`${id}-`)) || '';
};

export const resolveSidebarNodeConnectionId = (
  node: { key?: unknown; dataRef?: Record<string, unknown> } | null | undefined,
  connectionIds: string[],
): string => {
  const directId = String(node?.dataRef?.id || node?.dataRef?.connectionId || '').trim();
  if (directId && connectionIds.includes(directId)) return directId;
  return resolveSidebarConnectionIdFromKey(node?.key, connectionIds);
};

export const normalizeSidebarTreeRelativeDropPosition = (
  absoluteDropPosition: number,
  nodePos: unknown,
): number => {
  const segments = String(nodePos || '').split('-');
  const tailIndex = Number(segments[segments.length - 1] || 0);
  return absoluteDropPosition - tailIndex;
};

export const resolveSidebarDropInsertBefore = (
  relativeDropPosition: number,
  metrics?: {
    clientY?: number;
    top?: number;
    height?: number;
  } | null,
): boolean => {
  if (relativeDropPosition < 0) return true;
  if (relativeDropPosition > 0) return false;
  const clientY = metrics?.clientY;
  const top = metrics?.top;
  const height = metrics?.height;
  if (
    typeof clientY !== 'number'
    || typeof top !== 'number'
    || typeof height !== 'number'
    || !Number.isFinite(clientY)
    || !Number.isFinite(top)
    || !Number.isFinite(height)
    || height <= 0
  ) {
    return false;
  }
  return clientY < (top + height / 2);
};

const resolveSidebarDropBaseElementFromDomEvent = (
  event: {
    clientX?: number;
    clientY?: number;
    target?: EventTarget | null;
  } | null | undefined,
): Element | null => {
  if (typeof document === 'undefined') return null;
  const fallbackTarget = event?.target && typeof (event.target as any).closest === 'function'
    ? (event.target as unknown as Element)
    : null;
  const pointTarget = (
    typeof event?.clientX === 'number'
    && typeof event?.clientY === 'number'
  )
    ? document.elementFromPoint(event.clientX, event.clientY)
    : null;
  const baseElement = pointTarget || fallbackTarget;
  if (!baseElement || typeof baseElement.closest !== 'function') return null;
  return baseElement;
};

export const resolveSidebarDropNodeFromDomEvent = (
  event: {
    clientX?: number;
    clientY?: number;
    target?: EventTarget | null;
  } | null | undefined,
): { key: string; type: string } | null => {
  const baseElement = resolveSidebarDropBaseElementFromDomEvent(event);
  if (!baseElement) return null;
  const marker = baseElement.closest('[data-sidebar-node-key]') as HTMLElement | null;
  if (!marker) return null;
  const key = String(marker.getAttribute('data-sidebar-node-key') || '').trim();
  const type = String(marker.getAttribute('data-sidebar-node-type') || '').trim();
  if (!key || !type) return null;
  return { key, type };
};

export const resolveSidebarDropTargetMetricsFromDomEvent = (
  event: {
    clientX?: number;
    clientY?: number;
    target?: EventTarget | null;
  } | null | undefined,
): { top: number; height: number } | null => {
  const baseElement = resolveSidebarDropBaseElementFromDomEvent(event);
  if (!baseElement) return null;
  const treeNode = baseElement.closest('.ant-tree-treenode') as HTMLElement | null;
  if (!treeNode || typeof treeNode.getBoundingClientRect !== 'function') return null;
  const rect = treeNode.getBoundingClientRect();
  if (!Number.isFinite(rect.top) || !Number.isFinite(rect.height) || rect.height <= 0) {
    return null;
  }
  return {
    top: rect.top,
    height: rect.height,
  };
};

export const resolveSidebarTagDropInsertBefore = (options: {
  currentTagOrder: string[];
  dragTagId: string;
  dropTagId: string;
  relativeDropPosition: number;
  fallbackInsertBefore: boolean;
  metrics?: {
    clientY?: number;
    top?: number;
    height?: number;
  } | null;
}): boolean => {
  const {
    currentTagOrder,
    dragTagId,
    dropTagId,
    relativeDropPosition,
    fallbackInsertBefore,
    metrics,
  } = options;

  if (relativeDropPosition !== 0) {
    return fallbackInsertBefore;
  }

  const clientY = metrics?.clientY;
  const top = metrics?.top;
  const height = metrics?.height;
  if (
    typeof clientY !== 'number'
    || typeof top !== 'number'
    || typeof height !== 'number'
    || !Number.isFinite(clientY)
    || !Number.isFinite(top)
    || !Number.isFinite(height)
    || height <= 0
  ) {
    return fallbackInsertBefore;
  }

  const ratio = (clientY - top) / height;
  if (ratio < 0.35) return true;
  if (ratio > 0.65) return false;

  const dragIndex = currentTagOrder.indexOf(dragTagId);
  const dropIndex = currentTagOrder.indexOf(dropTagId);
  if (dragIndex === -1 || dropIndex === -1 || dragIndex === dropIndex) {
    return fallbackInsertBefore;
  }
  return dragIndex > dropIndex;
};

export const shouldSkipSidebarSelectWhileDragging = (
  isTreeDragging: boolean,
  info: { selected?: boolean } | null | undefined,
): boolean => isTreeDragging || !info?.selected;

export const shouldSkipSidebarLoadOnExpandWhileDragging = (
  isTreeDragging: boolean,
  info: { expanded?: boolean; node?: Pick<TreeNode, 'type' | 'children' | 'isLeaf'> | null } | null | undefined,
): boolean => {
  if (isTreeDragging) return true;
  if (!info?.expanded) return true;
  return !shouldLoadSidebarNodeOnExpand(info.node);
};

export const resolveV2ActiveConnectionId = ({
  activeContextConnectionId,
  activeTabConnectionId,
  selectedKeys,
  connectionIds,
  fallbackConnectionId,
}: {
  activeContextConnectionId?: unknown;
  activeTabConnectionId?: unknown;
  selectedKeys: unknown[];
  connectionIds: string[];
  fallbackConnectionId?: unknown;
}): string => {
  const connectionIdSet = new Set(connectionIds);
  const normalizeDirectId = (value: unknown): string => {
    const text = String(value || '').trim();
    return text && connectionIdSet.has(text) ? text : '';
  };
  const selectedConnectionId = selectedKeys
      .map((key) => resolveSidebarConnectionIdFromKey(key, connectionIds))
      .find(Boolean) || '';

  return normalizeDirectId(activeContextConnectionId)
      || selectedConnectionId
      || normalizeDirectId(fallbackConnectionId)
      || normalizeDirectId(activeTabConnectionId)
      || '';
};


type DriverStatusSnapshot = {
  type: string;
  name: string;
  connectable: boolean;
  expectedRevision?: string;
  needsUpdate?: boolean;
  updateReason?: string;
  message?: string;
};

export const formatSidebarDriverAgentUpdateWarning = (
  driverName: string,
  status: Pick<DriverStatusSnapshot, 'message' | 'updateReason'>,
): string => {
  const rawMessage = String(status.message || '').trim();
  if (rawMessage) {
    return rawMessage;
  }
  const rawUpdateReason = String(status.updateReason || '').trim();
  if (rawUpdateReason) {
    return rawUpdateReason;
  }
  return t('connection.modal.driver.updateFallback', { name: driverName });
};

const buildConnectionReloadSignature = (conn?: SavedConnection | null): string => {
  if (!conn) return '';
  return JSON.stringify({
    config: conn.config || {},
    includeDatabases: conn.includeDatabases || [],
    includeRedisDatabases: conn.includeRedisDatabases || [],
  });
};

const isConnectionTreeKey = (key: React.Key, connectionId: string): boolean => {
  const text = String(key);
  return text === connectionId || text.startsWith(`${connectionId}-`);
};

const DRIVER_STATUS_CACHE_TTL_MS = 30_000;

const normalizeDriverType = (value: string): string => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'postgresql' || normalized === 'pg' || normalized === 'pq' || normalized === 'pgx') return 'postgres';
  if (normalized === 'doris') return 'diros';
  if (
    normalized === 'open_gauss' ||
    normalized === 'open-gauss' ||
    normalized === 'opengauss'
  ) return 'opengauss';
  if (
    normalized === 'intersystems' ||
    normalized === 'intersystemsiris' ||
    normalized === 'inter-systems' ||
    normalized === 'inter-systems-iris'
  ) return 'iris';
  return normalized;
};

const resolveSavedConnectionDriverType = (conn: SavedConnection | undefined): string => {
  const type = normalizeDriverType(conn?.config?.type || '');
  if (type !== 'custom') {
    return type;
  }
  return normalizeDriverType(conn?.config?.driver || '');
};

const isPostgresSchemaDialect = (dialect: string): boolean => (
  ['postgres', 'kingbase', 'highgo', 'vastbase', 'opengauss'].includes(normalizeDriverType(dialect))
);

const SEARCH_SCOPE_OPTIONS: Array<{ value: SearchScope; labelKey: string }> = [
  { value: 'smart', labelKey: 'sidebar.command_search.scope.smart' },
  { value: 'object', labelKey: 'sidebar.command_search.scope.object' },
  { value: 'database', labelKey: 'sidebar.command_search.scope.database' },
  { value: 'host', labelKey: 'sidebar.command_search.scope.host' },
  { value: 'tag', labelKey: 'sidebar.command_search.scope.tag' },
];

const SEARCH_SCOPE_LABEL_KEY_MAP: Record<SearchScope, string> = SEARCH_SCOPE_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.labelKey;
  return acc;
}, {} as Record<SearchScope, string>);
const SEARCH_SCOPE_ICON_MAP: Record<SearchScope, React.ReactNode> = {
  smart: <ThunderboltOutlined />,
  object: <TableOutlined />,
  database: <DatabaseOutlined />,
  host: <CloudOutlined />,
  tag: <TagOutlined />,
};

const isSavedQueryUnmatchedForConnectionIds = (query: SavedQuery, connectionIds: Set<string>): boolean => (
  query.bindingStatus === 'orphan' || !connectionIds.has(query.connectionId)
);

export const buildAllSavedQueriesTreeNode = (
  savedQueries: SavedQuery[],
  connections: SavedConnection[],
): TreeNode | null => {
  if (savedQueries.length === 0) {
      return null;
  }

  const connectionIds = new Set(connections.map((conn) => conn.id));
  const unmatchedSavedQueries = savedQueries.filter((query) => isSavedQueryUnmatchedForConnectionIds(query, connectionIds));
  const unmatchedIds = new Set(unmatchedSavedQueries.map((query) => query.id));
  const createQueryNode = (query: SavedQuery): TreeNode => ({
      title: query.name || t('sidebar.tree.untitled_query'),
      key: `all-saved-query-${query.id}`,
      icon: <FileTextOutlined />,
      type: 'saved-query',
      dataRef: query,
      isLeaf: true,
  });
  const buildDatabaseGroups = (queries: SavedQuery[], keyPrefix: string): TreeNode[] => {
      const groupedByDatabase = new Map<string, SavedQuery[]>();
      queries.forEach((query) => {
          const dbName = String(query.dbName || '').trim() || t('sidebar.tree.default_database');
          groupedByDatabase.set(dbName, [...(groupedByDatabase.get(dbName) || []), query]);
      });
      return Array.from(groupedByDatabase.entries()).map(([dbName, items]) => ({
          title: dbName,
          key: `${keyPrefix}-db-${encodeURIComponent(dbName)}`,
          icon: <DatabaseOutlined />,
          type: 'saved-query-group',
          selectable: false,
          isLeaf: false,
          children: items.map(createQueryNode),
      }));
  };

  const groupedByConnection = new Map<string, SavedQuery[]>();
  savedQueries.forEach((query) => {
      if (unmatchedIds.has(query.id)) {
          return;
      }
      groupedByConnection.set(query.connectionId, [
          ...(groupedByConnection.get(query.connectionId) || []),
          query,
      ]);
  });

  const children: TreeNode[] = [];
  connections.forEach((conn) => {
      const connectionQueries = groupedByConnection.get(conn.id);
      if (!connectionQueries || connectionQueries.length === 0) {
          return;
      }
      const iconType = resolveConnectionIconType(conn);
      const iconColor = resolveConnectionAccentColor(conn);
      children.push({
          title: conn.name || conn.id,
          key: `all-saved-queries-connection-${conn.id}`,
          icon: getDbIcon(iconType, iconColor, 22),
          type: 'saved-query-group',
          selectable: false,
          isLeaf: false,
          children: buildDatabaseGroups(connectionQueries, `all-saved-queries-connection-${conn.id}`),
      });
  });

  if (unmatchedSavedQueries.length > 0) {
      const groupedByOriginalConnection = new Map<string, SavedQuery[]>();
      unmatchedSavedQueries.forEach((query) => {
          const originalConnectionId = String(query.originalConnectionId || query.connectionId || t('sidebar.tree.unknown_connection')).trim() || t('sidebar.tree.unknown_connection');
          groupedByOriginalConnection.set(originalConnectionId, [
              ...(groupedByOriginalConnection.get(originalConnectionId) || []),
              query,
          ]);
      });
      children.push({
          title: t('sidebar.tree.unmatched_saved_queries'),
          key: 'all-saved-queries-unmatched',
          icon: <WarningOutlined />,
          type: 'saved-query-group',
          selectable: false,
          isLeaf: false,
          children: Array.from(groupedByOriginalConnection.entries()).map(([connectionLabel, items]) => ({
              title: connectionLabel,
              key: `all-saved-queries-unmatched-${encodeURIComponent(connectionLabel)}`,
              icon: <FolderOpenOutlined />,
              type: 'saved-query-group',
              selectable: false,
              isLeaf: false,
              children: buildDatabaseGroups(items, `all-saved-queries-unmatched-${encodeURIComponent(connectionLabel)}`),
          })),
      });
  }

  return {
      title: t('sidebar.tree.all_saved_queries'),
      key: 'all-saved-queries',
      icon: <FolderOpenOutlined />,
      type: 'all-saved-queries',
      isLeaf: false,
      selectable: false,
      children,
  };
};

const Sidebar: React.FC<{
  onCreateConnection?: () => void;
  onEditConnection?: (conn: SavedConnection) => void;
  onOpenTools?: () => void;
  onOpenSettings?: () => void;
  onToggleAI?: () => void;
  onToggleLogPanel?: () => void;
  sqlLogCount?: number;
  uiVersion?: 'legacy' | 'v2';
  onFocusCommandSearch?: () => void;
}> = React.memo(({
  onCreateConnection,
  onEditConnection,
  onOpenTools,
  onOpenSettings,
  onToggleAI,
  onToggleLogPanel,
  sqlLogCount = 0,
  uiVersion,
  onFocusCommandSearch,
}) => {
  const connections = useStore(state => state.connections);
  const savedQueries = useStore(state => state.savedQueries);
  const externalSQLDirectories = useStore(state => state.externalSQLDirectories);
  const saveQuery = useStore(state => state.saveQuery);
  const deleteQuery = useStore(state => state.deleteQuery);
  const saveExternalSQLDirectory = useStore(state => state.saveExternalSQLDirectory);
  const deleteExternalSQLDirectory = useStore(state => state.deleteExternalSQLDirectory);
  const addConnection = useStore(state => state.addConnection);
  const addTab = useStore(state => state.addTab);
  const updateQueryTabDraft = useStore(state => state.updateQueryTabDraft);
  const tabs = useStore(state => state.tabs);
  const activeTabId = useStore(state => state.activeTabId);
  const setActiveContext = useStore(state => state.setActiveContext);
  const removeConnection = useStore(state => state.removeConnection);
  const connectionTags = useStore(state => state.connectionTags);
  const sidebarRootOrder = useStore(state => state.sidebarRootOrder);
  const addConnectionTag = useStore(state => state.addConnectionTag);
  const updateConnectionTag = useStore(state => state.updateConnectionTag);
  const removeConnectionTag = useStore(state => state.removeConnectionTag);
  const moveConnectionToTag = useStore(state => state.moveConnectionToTag);
  const reorderConnections = useStore(state => state.reorderConnections);
  const reorderTags = useStore(state => state.reorderTags);
  const reorderSidebarRoot = useStore(state => state.reorderSidebarRoot);
  const closeTabsByConnection = useStore(state => state.closeTabsByConnection);
  const closeTabsByDatabase = useStore(state => state.closeTabsByDatabase);
  const theme = useStore(state => state.theme);
  const appearance = useStore(state => state.appearance);
  const activeContext = useStore(state => state.activeContext);
  const tableAccessCount = useStore(state => state.tableAccessCount);
  const tableSortPreference = useStore(state => state.tableSortPreference);
  const pinnedSidebarTables = useStore(state => state.pinnedSidebarTables);
  const recordTableAccess = useStore(state => state.recordTableAccess);
  const setTableSortPreference = useStore(state => state.setTableSortPreference);
  const setSidebarTablePinned = useStore(state => state.setSidebarTablePinned);
  const addSqlLog = useStore(state => state.addSqlLog);
  const sqlLogs = useStore(state => state.sqlLogs) || [];
  const shortcutOptions = useStore(state => state.shortcutOptions);
  const languagePreference = useStore(state => state.languagePreference);
  const setAppearance = useStore(state => state.setAppearance);
  const setAIPanelVisible = useStore(state => state.setAIPanelVisible);
  const addAIContext = useStore(state => state.addAIContext);
  void languagePreference;
  const darkMode = theme === 'dark';
  const resolvedAppearance = resolveAppearanceValues(appearance);
  const opacity = normalizeOpacityForPlatform(resolvedAppearance.opacity);
  const { exportProgressModal, runExportWithProgress } = useExportProgressDialog();
  const disableLocalBackdropFilter = isMacLikePlatform();
  const autoFetchVisible = useAutoFetchVisibility();
  const activeShortcutPlatform = getShortcutPlatform(isMacLikePlatform());
  const focusSidebarSearchShortcut = resolveShortcutDisplay(shortcutOptions, 'focusSidebarSearch', activeShortcutPlatform);
  const focusSidebarSearchShortcutTokens = focusSidebarSearchShortcut === '-'
      ? []
      : focusSidebarSearchShortcut.match(/Ctrl|Alt|Shift|Esc|Space|[⌘⌃⌥⇧↵↑↓←→]|[^+]/g) ?? [];
  const isV2Ui = (uiVersion ?? appearance.uiVersion) === 'v2';
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const activeTab = useMemo(() => tabs.find(tab => tab.id === activeTabId) || null, [tabs, activeTabId]);
  const activeTabLocateRequest = useMemo(() => normalizeSidebarLocateObjectRequestFromTab(activeTab), [activeTab]);
  const canLocateActiveTab = !!activeTabLocateRequest;

  // Background Helper (Duplicate logic for now, ideally shared)
  const getBg = (darkHex: string) => {
      if (!darkMode) return `rgba(255, 255, 255, ${opacity})`;
      const hex = darkHex.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  };
  const bgMain = getBg('#141414');
  const overlayTheme = useMemo(
      () => buildOverlayWorkbenchTheme(darkMode, { disableBackdropFilter: disableLocalBackdropFilter }),
      [darkMode, disableLocalBackdropFilter, appearance.uiVersion],
  );
  const modalPanelStyle = useMemo(() => ({
      background: overlayTheme.shellBg,
      border: overlayTheme.shellBorder,
      boxShadow: overlayTheme.shellShadow,
      backdropFilter: overlayTheme.shellBackdropFilter,
  }), [overlayTheme]);
  const modalSectionStyle = useMemo(() => ({
      padding: 14,
      borderRadius: 14,
      border: overlayTheme.sectionBorder,
      background: overlayTheme.sectionBg,
  }), [overlayTheme]);
  const modalScrollSectionStyle = useMemo(() => ({
      maxHeight: 400,
      overflow: 'auto' as const,
      border: overlayTheme.sectionBorder,
      borderRadius: 14,
      padding: 12,
      background: overlayTheme.sectionBg,
  }), [overlayTheme]);
  const modalHintTextStyle = useMemo(() => ({
      color: overlayTheme.mutedText,
      fontSize: 12,
      lineHeight: 1.6,
  }), [overlayTheme]);
  const renderSidebarModalTitle = (icon: React.ReactNode, title: string, description: string) => (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 12, display: 'grid', placeItems: 'center', background: overlayTheme.iconBg, color: overlayTheme.iconColor, flexShrink: 0 }}>
              {icon}
          </div>
          <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: overlayTheme.titleText }}>{title}</div>
              <div style={{ marginTop: 4, color: overlayTheme.mutedText, fontSize: 12, lineHeight: 1.6 }}>{description}</div>
          </div>
      </div>
  );
  const v2SidebarSearchMode = appearance.v2SidebarSearchMode ?? 'command';
  const v2UseLegacySidebarFilter = isV2Ui && v2SidebarSearchMode === 'filter';
  const v2CommandSearchPersistentFilterEnabled = appearance.v2CommandSearchPersistentFilterEnabled === true;
  const v2PersistedSidebarFilter = appearance.v2SidebarPersistedFilter ?? '';
  const [searchValue, setSearchValue] = useState(v2PersistedSidebarFilter);
  const deferredSearchValue = useDeferredValue(searchValue);
  const [searchScopes, setSearchScopes] = useState<SearchScope[]>(['smart']);
  const [v2ExplorerFilter, setV2ExplorerFilter] = useState<V2ExplorerFilter>('all');
  const [isSearchScopePopoverOpen, setIsSearchScopePopoverOpen] = useState(false);
  const searchInputRef = useRef<any>(null);
  const commandSearchInputRef = useRef<any>(null);
  const [isV2CommandSearchOpen, setIsV2CommandSearchOpen] = useState(false);
  const [v2CommandSearchValue, setV2CommandSearchValue] = useState('');
  const deferredV2CommandSearchValue = useDeferredValue(v2CommandSearchValue);
  const [v2CommandActiveIndex, setV2CommandActiveIndex] = useState(0);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [autoExpandParent, setAutoExpandParent] = useState(true);
  const [loadedKeys, setLoadedKeys] = useState<React.Key[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const selectedNodesRef = useRef<any[]>([]);
  const loadingNodesRef = useRef<Set<string>>(new Set());
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const treeDragSelectSuppressUntilRef = useRef(0);
  const treeDragSelectionSnapshotRef = useRef<{
      selectedKeys: React.Key[];
      selectedNodes: any[];
      activeContext: { connectionId: string; dbName: string } | null;
  }>({
      selectedKeys: [],
      selectedNodes: [],
      activeContext: null,
  });
  const connectionReloadSignaturesRef = useRef<Record<string, string>>({});
  const driverStatusCacheRef = useRef<{
      fetchedAt: number;
      items: Record<string, DriverStatusSnapshot>;
  } | null>(null);
  const driverUpdateWarningKeysRef = useRef<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<SidebarContextMenuState | null>(null);
  const contextMenuPortalRef = useRef<HTMLDivElement | null>(null);
  const [v2TableContextMenuStats, setV2TableContextMenuStats] = useState<Record<string, V2TableContextMenuStats>>({});
  const connectionIds = useMemo(() => connections.map((conn) => conn.id), [connections]);
  const connectionIdSet = useMemo(() => new Set(connectionIds), [connectionIds]);
  const unmatchedSavedQueries = useMemo(
      () => savedQueries.filter((query) => isSavedQueryUnmatchedForConnectionIds(query, connectionIdSet)),
      [connectionIdSet, savedQueries],
  );
  const allSavedQueriesNode = useMemo<TreeNode | null>(() => {
      return buildAllSavedQueriesTreeNode(savedQueries, connections);
  }, [connections, savedQueries]);
  const v2RailConnectionGroups = useMemo(
      () => buildV2RailConnectionGroups(connections, connectionTags, sidebarRootOrder),
      [connections, connectionTags, sidebarRootOrder],
  );
  const [collapsedV2RailGroupIds, setCollapsedV2RailGroupIds] = useState<string[]>([]);
  const collapsedV2RailGroupIdSet = useMemo(
      () => new Set(collapsedV2RailGroupIds),
      [collapsedV2RailGroupIds],
  );
  const hasV2RailConnectionGroups = v2RailConnectionGroups.some((group) => !group.isUngrouped);
  const [draggingV2RailRootToken, setDraggingV2RailRootToken] = useState('');

  const snapshotTreeSelectionBeforeDrag = useCallback(() => {
      treeDragSelectionSnapshotRef.current = {
          selectedKeys: [...selectedKeys],
          selectedNodes: [...selectedNodesRef.current],
          activeContext: activeContext ? { ...activeContext } : null,
      };
  }, [activeContext, selectedKeys]);

  const restoreTreeSelectionAfterDrag = useCallback(() => {
      const snapshot = treeDragSelectionSnapshotRef.current;
      treeDragSelectSuppressUntilRef.current = Date.now() + 1000;
      setSelectedKeys(snapshot.selectedKeys);
      selectedNodesRef.current = snapshot.selectedNodes;
      setActiveContext(snapshot.activeContext);
  }, [setActiveContext]);

  const openV2CommandSearch = useCallback(() => {
      setIsV2CommandSearchOpen(true);
      setV2CommandActiveIndex(0);
  }, []);

  const commitV2CommandSearchPersistentFilter = useCallback((value = v2CommandSearchValue) => {
      if (!v2CommandSearchPersistentFilterEnabled) {
          return;
      }
      const nextFilter = value.trim();
      setSearchValue(nextFilter);
      if (nextFilter !== v2PersistedSidebarFilter) {
          setAppearance({ v2SidebarPersistedFilter: nextFilter });
      }
  }, [setAppearance, v2CommandSearchPersistentFilterEnabled, v2CommandSearchValue, v2PersistedSidebarFilter]);

  const closeV2CommandSearch = useCallback(() => {
      commitV2CommandSearchPersistentFilter();
      setIsV2CommandSearchOpen(false);
      setV2CommandSearchValue('');
      setV2CommandActiveIndex(0);
  }, [commitV2CommandSearchPersistentFilter]);

  useEffect(() => {
      setSearchValue(v2PersistedSidebarFilter);
  }, [v2PersistedSidebarFilter]);

  useEffect(() => {
      if (!v2UseLegacySidebarFilter) {
          return;
      }
      const nextFilter = searchValue.trim();
      if (nextFilter !== v2PersistedSidebarFilter) {
          setAppearance({ v2SidebarPersistedFilter: nextFilter });
      }
  }, [searchValue, setAppearance, v2PersistedSidebarFilter, v2UseLegacySidebarFilter]);

  const handleV2CommandSearchValueChange = useCallback((value: string) => {
      setV2CommandSearchValue(value);
  }, []);

  useEffect(() => {
      if (!v2CommandSearchPersistentFilterEnabled) {
          return;
      }
      if (!isV2CommandSearchOpen) {
          return;
      }
      const nextFilter = resolveV2CommandSearchPersistentFilter({
          commandSearchValue: deferredV2CommandSearchValue,
          persistedFilter: v2PersistedSidebarFilter,
          enabled: v2CommandSearchPersistentFilterEnabled,
          isOpen: isV2CommandSearchOpen,
      });
      setSearchValue(nextFilter);
      const timer = window.setTimeout(() => {
          setAppearance({ v2SidebarPersistedFilter: nextFilter });
      }, 160);
      return () => window.clearTimeout(timer);
  }, [deferredV2CommandSearchValue, isV2CommandSearchOpen, setAppearance, v2CommandSearchPersistentFilterEnabled, v2PersistedSidebarFilter]);

  const toggleV2CommandSearchPersistentFilter = useCallback((enabled: boolean) => {
      const nextFilter = enabled ? v2CommandSearchValue.trim() : '';
      setSearchValue(nextFilter);
      setAppearance({
          v2CommandSearchPersistentFilterEnabled: enabled,
          v2SidebarPersistedFilter: nextFilter,
      });
      message.success(
          enabled
              ? t('sidebar.message.sidebar_filter_sync_enabled')
              : t('sidebar.message.sidebar_filter_sync_disabled'),
      );
  }, [setAppearance, v2CommandSearchValue]);

  const resetV2SidebarFilter = useCallback(() => {
      setSearchValue('');
      setAppearance({
          v2CommandSearchPersistentFilterEnabled: false,
          v2SidebarPersistedFilter: '',
      });
      message.success(t('sidebar.message.sidebar_filter_reset'));
  }, [setAppearance]);
  
  // Virtual Scroll State
  const [treeHeight, setTreeHeight] = useState(500);
  const [treeViewportWidth, setTreeViewportWidth] = useState(0);
  const treeContainerRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<any>(null);
  const treeDataRef = useRef<TreeNode[]>([]);
  const externalSQLDirectoryTreesRef = useRef<Record<string, ExternalSQLTreeEntry[]>>({});
  const findTreeNodeByKeyRef = useRef<(nodes: TreeNode[], targetKey: React.Key) => TreeNode | null>(() => null);
  const expandConnectionFromRailRef = useRef<(connectionId: string) => void>(() => {});
  useEffect(() => {
      treeDataRef.current = treeData;
  }, [treeData]);

  useEffect(() => {
      if (!treeContainerRef.current) return;
      const resizeObserver = new ResizeObserver(entries => {
          for (let entry of entries) {
              setTreeHeight(entry.contentRect.height);
              setTreeViewportWidth(entry.contentRect.width);
          }
      });
      resizeObserver.observe(treeContainerRef.current);
      return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
      const handleFocusSidebarSearch = () => {
          if (isV2Ui && !v2UseLegacySidebarFilter) {
              openV2CommandSearch();
              return;
          }
          const inputEl = searchInputRef.current?.input as HTMLInputElement | undefined;
          if (!inputEl) {
              return;
          }
          inputEl.focus();
          inputEl.select();
      };
      window.addEventListener('gonavi:focus-sidebar-search', handleFocusSidebarSearch as EventListener);
      return () => {
          window.removeEventListener('gonavi:focus-sidebar-search', handleFocusSidebarSearch as EventListener);
      };
  }, [isV2Ui, openV2CommandSearch, v2UseLegacySidebarFilter]);

  useEffect(() => {
      if (!isV2CommandSearchOpen) return;
      const timer = window.setTimeout(() => {
          const inputEl = commandSearchInputRef.current?.input as HTMLInputElement | undefined;
          inputEl?.focus();
          inputEl?.select();
      }, 0);
      return () => window.clearTimeout(timer);
  }, [isV2CommandSearchOpen]);

  useEffect(() => {
      if (!isV2CommandSearchOpen) return;
      const handleV2CommandSearchGlobalKeyDown = (event: KeyboardEvent) => {
          if (!shouldCloseV2CommandSearchOnGlobalKey({ key: event.key, isOpen: isV2CommandSearchOpen })) {
              return;
          }
          event.preventDefault();
          event.stopPropagation();
          closeV2CommandSearch();
      };
      window.addEventListener('keydown', handleV2CommandSearchGlobalKeyDown, true);
      return () => window.removeEventListener('keydown', handleV2CommandSearchGlobalKeyDown, true);
  }, [closeV2CommandSearch, isV2CommandSearchOpen]);
  
  // Connection Status State: key -> 'success' | 'error'
  const [connectionStates, setConnectionStates] = useState<Record<string, 'success' | 'error'>>({});
  const [isTreeDragging, setIsTreeDragging] = useState(false);

  // Create Database Modal
  const [isCreateDbModalOpen, setIsCreateDbModalOpen] = useState(false);
  const [createDbForm] = Form.useForm();
  const [targetConnection, setTargetConnection] = useState<any>(null);
  const [isCreateSchemaModalOpen, setIsCreateSchemaModalOpen] = useState(false);
  const [createSchemaForm] = Form.useForm();
  const [createSchemaTarget, setCreateSchemaTarget] = useState<any>(null);
  const [isRenameSchemaModalOpen, setIsRenameSchemaModalOpen] = useState(false);
  const [renameSchemaForm] = Form.useForm();
  const [renameSchemaTarget, setRenameSchemaTarget] = useState<any>(null);
  const [isRenameDbModalOpen, setIsRenameDbModalOpen] = useState(false);
  const [renameDbForm] = Form.useForm();
  const [renameDbTarget, setRenameDbTarget] = useState<any>(null);
  const [isRenameTableModalOpen, setIsRenameTableModalOpen] = useState(false);
  const [renameTableForm] = Form.useForm();
  const [renameTableTarget, setRenameTableTarget] = useState<any>(null);
  const [messagePublishTarget, setMessagePublishTarget] = useState<SidebarMessagePublishTarget | null>(null);
  const [isRenameViewModalOpen, setIsRenameViewModalOpen] = useState(false);
  const [renameViewForm] = Form.useForm();
  const [renameViewTarget, setRenameViewTarget] = useState<any>(null);
  const [isRenameSavedQueryModalOpen, setIsRenameSavedQueryModalOpen] = useState(false);
  const [renameSavedQueryForm] = Form.useForm();
  const [renameSavedQueryTarget, setRenameSavedQueryTarget] = useState<SavedQuery | null>(null);
  const [isExternalSQLFileModalOpen, setIsExternalSQLFileModalOpen] = useState(false);
  const [externalSQLFileForm] = Form.useForm();
  const [externalSQLFileModalMode, setExternalSQLFileModalMode] = useState<ExternalSQLFileModalMode>('create');
  const [externalSQLFileTarget, setExternalSQLFileTarget] = useState<any>(null);
  // Connection Tag Modals
  const [isCreateTagModalOpen, setIsCreateTagModalOpen] = useState(false);
  const [createTagForm] = Form.useForm();

  // Batch Operations Modal
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchTables, setBatchTables] = useState<BatchObjectItem[]>([]);
  const [checkedTableKeys, setCheckedTableKeys] = useState<string[]>([]);
  const [batchDbContext, setBatchDbContext] = useState<any>(null);
  const [selectedConnection, setSelectedConnection] = useState<string>('');
  const [selectedDatabase, setSelectedDatabase] = useState<string>('');
  const [availableDatabases, setAvailableDatabases] = useState<any[]>([]);
  const [batchFilterKeyword, setBatchFilterKeyword] = useState<string>('');
  const [batchFilterType, setBatchFilterType] = useState<BatchObjectFilterType>('all');
  const [batchSelectionScope, setBatchSelectionScope] = useState<BatchSelectionScope>('filtered');
  const filteredBatchObjects = useMemo(() => {
      const keyword = batchFilterKeyword.trim().toLowerCase();
      return batchTables.filter((item) => {
          if (batchFilterType !== 'all' && item.objectType !== batchFilterType) {
              return false;
          }
          if (!keyword) {
              return true;
          }
          return item.title.toLowerCase().includes(keyword) || item.objectName.toLowerCase().includes(keyword);
      });
  }, [batchFilterKeyword, batchFilterType, batchTables]);
  const groupedBatchObjects = useMemo(() => {
      const tables = filteredBatchObjects.filter(item => item.objectType === 'table');
      const views = filteredBatchObjects.filter(item => item.objectType === 'view');
      return { tables, views };
  }, [filteredBatchObjects]);
  const allBatchObjectKeys = useMemo(() => batchTables.map(item => item.key), [batchTables]);
  const allBatchObjectKeysByType = useMemo(() => {
      if (batchFilterType === 'all') {
          return allBatchObjectKeys;
      }
      return batchTables
          .filter((item) => item.objectType === batchFilterType)
          .map((item) => item.key);
  }, [allBatchObjectKeys, batchFilterType, batchTables]);
  const filteredBatchObjectKeys = useMemo(() => filteredBatchObjects.map(item => item.key), [filteredBatchObjects]);
  const selectionScopeTargetKeys = useMemo(
      () => (batchSelectionScope === 'filtered' ? filteredBatchObjectKeys : allBatchObjectKeysByType),
      [allBatchObjectKeysByType, batchSelectionScope, filteredBatchObjectKeys]
  );
  useEffect(() => {
      if (batchFilterType === 'all') {
          return;
      }
      const allowed = new Set(allBatchObjectKeysByType);
      setCheckedTableKeys((prev) => prev.filter((key) => allowed.has(key)));
  }, [allBatchObjectKeysByType, batchFilterType]);

  // Batch Database Operations Modal
  const [isBatchDbModalOpen, setIsBatchDbModalOpen] = useState(false);
  const [batchDatabases, setBatchDatabases] = useState<any[]>([]);
  const [checkedDbKeys, setCheckedDbKeys] = useState<string[]>([]);
  const [batchConnContext, setBatchConnContext] = useState<any>(null);
  const [selectedDbConnection, setSelectedDbConnection] = useState<string>('');

  // Find in Database Modal
  const [findInDbContext, setFindInDbContext] = useState<{ open: boolean; connectionId: string; dbName: string }>({ open: false, connectionId: '', dbName: '' });

  useEffect(() => {
      if (!autoFetchVisible) {
          return;
      }

      expandedKeys.forEach(key => {
          const node = findTreeNodeByKey(treeData, key);
          if (node && node.type === 'database') {
              loadTables(node);
          }
      });
  }, [autoFetchVisible, savedQueries]);

  useEffect(() => {
    const previousSignatures = connectionReloadSignaturesRef.current;
    const nextSignatures: Record<string, string> = {};
    const staleConnectionIds = new Set<string>();

    connections.forEach((conn) => {
      const signature = buildConnectionReloadSignature(conn);
      nextSignatures[conn.id] = signature;
      if (previousSignatures[conn.id] && previousSignatures[conn.id] !== signature) {
        staleConnectionIds.add(conn.id);
      }
    });
    connectionReloadSignaturesRef.current = nextSignatures;

    if (staleConnectionIds.size > 0) {
      const staleIds = Array.from(staleConnectionIds);
      setLoadedKeys((prev) =>
        prev.filter((key) => !staleIds.some((id) => isConnectionTreeKey(key, id))),
      );
      setExpandedKeys((prev) =>
        prev.filter((key) => !staleIds.some((id) => isConnectionTreeKey(key, id))),
      );
      setConnectionStates((prev) => {
        const next = { ...prev };
        staleIds.forEach((id) => {
          Object.keys(next).forEach((key) => {
            if (isConnectionTreeKey(key, id)) {
              delete next[key];
            }
          });
        });
        return next;
      });
      staleIds.forEach((id) => {
        Array.from(loadingNodesRef.current).forEach((key) => {
          if (key === `dbs-${id}` || key.startsWith(`tables-${id}-`)) {
            loadingNodesRef.current.delete(key);
          }
        });
      });
    }

    setTreeData((prev) => {
      const prevMap = new Map<string, TreeNode>();

      // We need to recursively extract connections from old tag structures
      // so if a user expands a connection that was tagged, the state remains
      const recurseCollect = (nodes: TreeNode[]) => {
          nodes.forEach((node) => {
            if (node.type === 'tag') {
               if (node.children) recurseCollect(node.children);
            } else if (node.type === 'connection') {
               prevMap.set(String(node.key), node);
            }
          });
      };
      recurseCollect(prev);

      const buildConnectionNode = (conn: SavedConnection): TreeNode => {
        const existing = prevMap.get(conn.id);
        const iconType = resolveConnectionIconType(conn);
        const iconColor = resolveConnectionAccentColor(conn);
        const preserveChildren = existing && !staleConnectionIds.has(conn.id);
        return {
          title: conn.name,
          key: conn.id,
          icon: getDbIcon(iconType, iconColor, 22),
          type: 'connection',
          dataRef: conn,
          isLeaf: false,
          children: preserveChildren ? existing.children : undefined,
        } as TreeNode;
      };

      const taggedConnIds = new Set<string>();
      const tagNodesById = new Map<string, TreeNode>();
      connectionTags.forEach((tag) => {
        tag.connectionIds.forEach(id => taggedConnIds.add(id));
        tagNodesById.set(tag.id, {
          title: tag.name,
          key: `tag-${tag.id}`,
          icon: (
            <span
              className="gn-v2-tree-folder-icon"
              data-sidebar-tree-folder-icon="true"
            >
              <FolderOutlined />
            </span>
          ),
          type: 'tag',
          dataRef: tag,
          isLeaf: false,
          children: tag.connectionIds
            .map(cid => connections.find(c => c.id === cid))
            .filter(Boolean)
            .map(conn => buildConnectionNode(conn!)),
        } as TreeNode);
      });

      const ungroupedNodesById = new Map<string, TreeNode>();
      connections
        .filter(c => !taggedConnIds.has(c.id))
        .forEach((conn) => {
          ungroupedNodesById.set(conn.id, buildConnectionNode(conn));
        });

      const orderedRootTokens = resolveSidebarRootOrderTokens(
        sidebarRootOrder,
        connectionTags,
        connections,
      );
      const orderedNodes: TreeNode[] = [];
      orderedRootTokens.forEach((token) => {
        if (token.startsWith('tag:')) {
          const tagNode = tagNodesById.get(token.slice('tag:'.length));
          if (!tagNode) return;
          orderedNodes.push(tagNode);
          tagNodesById.delete(token.slice('tag:'.length));
          return;
        }
        if (token.startsWith('connection:')) {
          const connectionNode = ungroupedNodesById.get(token.slice('connection:'.length));
          if (!connectionNode) return;
          orderedNodes.push(connectionNode);
          ungroupedNodesById.delete(token.slice('connection:'.length));
        }
      });

      orderedNodes.push(...Array.from(tagNodesById.values()));
      orderedNodes.push(...Array.from(ungroupedNodesById.values()));
      if (allSavedQueriesNode) {
        orderedNodes.push(allSavedQueriesNode);
      }
      const externalSQLRootNode = prev.find((node) => node.type === 'external-sql-root');
      return externalSQLRootNode ? [...orderedNodes, externalSQLRootNode] : orderedNodes;
    });
  }, [connections, connectionTags, sidebarRootOrder, allSavedQueriesNode]);

  const handleDuplicateConnection = async (conn: SavedConnection) => {
    if (!conn?.id) return;

    const backendApp = (window as any).go?.app?.App;
    if (typeof backendApp?.DuplicateConnection !== 'function') {
      message.error(t('connection.sidebar.duplicate.backendUnavailable'));
      return;
    }

    try {
      const duplicatedConnection = await backendApp.DuplicateConnection(conn.id);
      if (!duplicatedConnection) {
        throw new Error(t('connection.sidebar.duplicate.noResult'));
      }
      addConnection(duplicatedConnection);
      message.success(t('connection.sidebar.duplicate.success', {
        name: duplicatedConnection.name,
      }));
    } catch (error: any) {
      message.error(error?.message || t('connection.sidebar.duplicate.failureFallback'));
    }
  };
  const updateTreeData = (list: TreeNode[], key: React.Key, children: TreeNode[] | undefined): TreeNode[] => {
    return list.map(node => {
      if (node.key === key) {
        return { ...node, children };
      }
      if (node.children) {
        return { ...node, children: updateTreeData(node.children, key, children) };
      }
      return node;
    });
  };

  const findTreeNodeByKey = (nodes: TreeNode[], targetKey: React.Key): TreeNode | null => {
    for (const node of nodes) {
      if (node.key === targetKey) {
        return node;
      }
      if (node.children) {
        const child = findTreeNodeByKey(node.children, targetKey);
        if (child) {
          return child;
        }
      }
    }
    return null;
  };

  findTreeNodeByKeyRef.current = findTreeNodeByKey;

  const replaceTreeNodeChildren = (key: React.Key, children: TreeNode[] | undefined): TreeNode[] => {
      const nextTreeData = updateTreeData(treeDataRef.current, key, children);
      treeDataRef.current = nextTreeData;
      setTreeData(nextTreeData);
      return nextTreeData;
  };

  const mergeExpandedTreeKeys = (requiredKeys: React.Key[]) => {
      setExpandedKeys(prev => {
          const merged = [...prev];
          requiredKeys.forEach(key => {
              if (!merged.includes(key)) merged.push(key);
          });
          return merged;
      });
      setAutoExpandParent(true);
  };

  const scrollSidebarTreeToKey = (key: React.Key) => {
      const runAfterFrame = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
          ? window.requestAnimationFrame.bind(window)
          : (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 0);

      runAfterFrame(() => {
          treeRef.current?.scrollTo?.({ key, align: 'auto' });
          runAfterFrame(() => {
              const selectedNode = treeContainerRef.current?.querySelector('.ant-tree-treenode-selected') as HTMLElement | null;
              selectedNode?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
          });
      });
  };

  const decorateExternalSQLTreeNode = (node: ExternalSQLTreeNode): TreeNode => {
    const icon = (() => {
      switch (node.type) {
        case 'external-sql-root':
          return <FolderOpenOutlined />;
        case 'external-sql-directory':
          return <HddOutlined />;
        case 'external-sql-folder':
          return <FolderOutlined />;
        default:
          return <FileTextOutlined />;
      }
    })();

    return {
      ...node,
      icon,
      children: node.children?.map((child) => decorateExternalSQLTreeNode(child)),
    };
  };

  const buildExternalSQLRootTreeNode = useCallback((
      directories: ExternalSQLDirectory[] = externalSQLDirectories,
      directoryTrees: Record<string, ExternalSQLTreeEntry[]> = externalSQLDirectoryTreesRef.current,
  ): TreeNode => decorateExternalSQLTreeNode(buildExternalSQLRootNode({
      directories,
      directoryTrees,
  })), [externalSQLDirectories]);

  const refreshGlobalExternalSQLRootNode = useCallback(async (
      showSuccess = false,
      directoriesOverride?: ExternalSQLDirectory[],
  ) => {
      const targetDirectories = directoriesOverride || externalSQLDirectories;
      const directoryTrees: Record<string, ExternalSQLTreeEntry[]> = {};
      await Promise.all(targetDirectories.map(async (directory) => {
          const directoryRes = await ListSQLDirectory(directory.path);
          if (!directoryRes.success) {
              message.warning({
                  key: `external-sql-${directory.id}`,
                  content: t('sidebar.message.external_sql_directory_read_failed', {
                      name: directory.name,
                      error: directoryRes.message,
                  }),
              });
              directoryTrees[directory.id] = [];
              return;
          }
          directoryTrees[directory.id] = Array.isArray(directoryRes.data)
              ? directoryRes.data as ExternalSQLTreeEntry[]
              : [];
      }));
      externalSQLDirectoryTreesRef.current = directoryTrees;
      const rootNode = buildExternalSQLRootTreeNode(targetDirectories, directoryTrees);
      setTreeData((prev) => {
          const withoutExternalRoot = prev.filter((node) => node.type !== 'external-sql-root');
          const nextTreeData = [...withoutExternalRoot, rootNode];
          treeDataRef.current = nextTreeData;
          return nextTreeData;
      });
      if (showSuccess) {
          message.success(t('sidebar.message.external_sql_directory_refreshed'));
      }
  }, [buildExternalSQLRootTreeNode, externalSQLDirectories]);

  useEffect(() => {
      void refreshGlobalExternalSQLRootNode(false);
  }, [refreshGlobalExternalSQLRootNode]);

  const getNodeDatabaseContext = (node: any): { connectionId: string; dbName: string; dbNodeKey: string } | null => {
    if (!node) return null;
    if (node.type === 'database') {
      return {
        connectionId: String(node?.dataRef?.id || '').trim(),
        dbName: String(node?.dataRef?.dbName || '').trim(),
        dbNodeKey: String(node.key || '').trim(),
      };
    }

    if (
      node.type === 'external-sql-root'
      || node.type === 'external-sql-directory'
      || node.type === 'external-sql-folder'
      || node.type === 'external-sql-file'
    ) {
      return {
        connectionId: String(node?.dataRef?.connectionId || '').trim(),
        dbName: String(node?.dataRef?.dbName || '').trim(),
        dbNodeKey: String(node?.dataRef?.dbNodeKey || '').trim(),
      };
    }

    return null;
  };

  const SIDEBAR_SCHEMA_DB_TYPES = new Set([
      'postgres',
      'kingbase',
      'highgo',
      'vastbase',
      'opengauss',
      'gaussdb',
      'open_gauss',
      'open-gauss',
      'sqlserver',
      'iris',
      'oracle',
      'dameng',
  ]);

  const SIDEBAR_SCHEMA_CUSTOM_DRIVERS = new Set([
      'postgres',
      'kingbase',
      'highgo',
      'vastbase',
      'opengauss',
      'gaussdb',
      'open_gauss',
      'open-gauss',
      'sqlserver',
      'iris',
      'oracle',
      'dm',
  ]);

  const shouldHideSchemaPrefix = (conn: SavedConnection | undefined): boolean => {
      const dbType = String(conn?.config?.type || '').trim().toLowerCase();
      if (SIDEBAR_SCHEMA_DB_TYPES.has(dbType)) return true;
      if (dbType !== 'custom') return false;

      const customDriver = String(conn?.config?.driver || '').trim().toLowerCase();
      return SIDEBAR_SCHEMA_CUSTOM_DRIVERS.has(customDriver);
  };

  const getSidebarTableDisplayName = (conn: SavedConnection | undefined, tableName: string): string => {
      const rawName = String(tableName || '').trim();
      if (!rawName) return rawName;
      if (!shouldHideSchemaPrefix(conn)) return rawName;
      const parsed = splitQualifiedName(rawName);
      return parsed.objectName || rawName;
  };

  const getMetadataDialect = (conn: SavedConnection | undefined): string => {
      return resolveSidebarMetadataDialect(
          conn?.config?.type || '',
          conn?.config?.driver || '',
          conn?.config?.oceanBaseProtocol,
      );
  };

  const supportsDatabaseEvents = (conn: SavedConnection | undefined): boolean => {
      return getMetadataDialect(conn) === 'mysql';
  };

  const escapeSQLLiteral = (raw: string): string => String(raw || '').replace(/'/g, "''");
  const quoteSqlServerIdentifier = (raw: string): string => `[${String(raw || '').replace(/]/g, ']]')}]`;

  type MetadataQuerySpec = {
      sql: string;
      inferredType?: 'FUNCTION' | 'PROCEDURE';
  };

  type MetadataQueryResult = {
      rows: Record<string, any>[];
      inferredType?: 'FUNCTION' | 'PROCEDURE';
  };

  const isSphinxConnection = (conn: SavedConnection | undefined): boolean => {
      const type = String(conn?.config?.type || '').trim().toLowerCase();
      if (type === 'sphinx') return true;
      if (type !== 'custom') return false;
      const driver = String(conn?.config?.driver || '').trim().toLowerCase();
      return driver === 'sphinx' || driver === 'sphinxql';
  };

  const normalizeMetadataQuerySpecs = (specs: MetadataQuerySpec[]): MetadataQuerySpec[] => {
      const seen = new Set<string>();
      const normalized: MetadataQuerySpec[] = [];
      specs.forEach((spec) => {
          const sql = String(spec.sql || '').trim();
          if (!sql) return;
          const key = `${spec.inferredType || ''}@@${sql}`;
          if (seen.has(key)) return;
          seen.add(key);
          normalized.push({ sql, inferredType: spec.inferredType });
      });
      return normalized;
  };

  const getCaseInsensitiveValue = (row: Record<string, any>, candidateKeys: string[]): string => {
      const keyMap = new Map<string, any>();
      Object.keys(row || {}).forEach((key) => keyMap.set(key.toLowerCase(), row[key]));
      for (const key of candidateKeys) {
          const value = keyMap.get(key.toLowerCase());
          if (value !== undefined && value !== null) {
              const normalized = String(value).trim();
              if (normalized !== '') return normalized;
          }
      }
      return '';
  };

  const getCaseInsensitiveRawValue = (row: Record<string, any>, candidateKeys: string[]): any => {
      const keyMap = new Map<string, any>();
      Object.keys(row || {}).forEach((key) => keyMap.set(key.toLowerCase(), row[key]));
      for (const key of candidateKeys) {
          const value = keyMap.get(key.toLowerCase());
          if (value !== undefined && value !== null) {
              return value;
          }
      }
      return undefined;
  };

  const getFirstRowValue = (row: Record<string, any>): string => {
      for (const value of Object.values(row || {})) {
          if (value !== undefined && value !== null) {
              const normalized = String(value).trim();
              if (normalized !== '') return normalized;
          }
      }
      return '';
  };

  const extractSqlServerDefinitionRows = (rows: any[], definitionKeys: string[]): string => {
      if (!Array.isArray(rows) || rows.length === 0) return '';
      const directDefinition = getCaseInsensitiveRawValue(rows[0] as Record<string, any>, definitionKeys);
      if (directDefinition !== undefined && directDefinition !== null && String(directDefinition).trim() !== '') {
          return String(directDefinition);
      }
      return rows
          .map((row) => getCaseInsensitiveRawValue(row as Record<string, any>, ['Text', 'text']))
          .filter((value) => value !== undefined && value !== null)
          .map((value) => String(value))
          .join('');
  };

  const getMySQLShowTablesName = (row: Record<string, any>): string => {
      for (const key of Object.keys(row || {})) {
          if (!key.toLowerCase().startsWith('tables_in_')) continue;
          const value = row[key];
          if (value === undefined || value === null) continue;
          const normalized = String(value).trim();
          if (normalized !== '') return normalized;
      }
      return '';
  };

  const parseMetadataRowCount = (row: Record<string, any>): number | undefined => {
      const rawValue = getCaseInsensitiveRawValue(row, ['Rows', 'table_rows', 'TABLE_ROWS', 'num_rows', 'reltuples', 'total_rows']);
      if (rawValue === undefined || rawValue === null || rawValue === '') {
          return undefined;
      }
      const parsed = Number(String(rawValue).replace(/,/g, ''));
      if (!Number.isFinite(parsed) || parsed < 0) {
          return undefined;
      }
      return Math.round(parsed);
  };

  const buildSidebarTableStatusSQL = (conn: SavedConnection, dbName: string): string => {
      const dialect = getMetadataDialect(conn);
      const safeDbName = escapeSQLLiteral(dbName);
      switch (dialect) {
          case 'mysql':
          case 'starrocks':
              return [
                  'SELECT TABLE_NAME AS table_name, TABLE_ROWS AS table_rows',
                  'FROM information_schema.tables',
                  `WHERE table_schema = '${safeDbName}'`,
                  "AND table_type = 'BASE TABLE'",
                  'ORDER BY table_name',
              ].join('\n');
          case 'postgres':
          case 'kingbase':
          case 'vastbase':
          case 'highgo':
          case 'opengauss':
          case 'gaussdb':
              return [
                  "SELECT n.nspname || '.' || c.relname AS table_name, c.reltuples::bigint AS table_rows",
                  'FROM pg_class c',
                  'JOIN pg_namespace n ON n.oid = c.relnamespace',
                  "WHERE c.relkind = 'r'",
                  "AND n.nspname NOT IN ('information_schema', 'pg_catalog')",
                  "AND n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\'",
                  'ORDER BY n.nspname, c.relname',
              ].join('\n');
          case 'sqlserver': {
              const safeDb = quoteSqlServerIdentifier(dbName);
              return [
                  'SELECT s.name + \'.\' + t.name AS table_name, SUM(p.rows) AS table_rows',
                  `FROM ${safeDb}.sys.tables t`,
                  `JOIN ${safeDb}.sys.schemas s ON t.schema_id = s.schema_id`,
                  `LEFT JOIN ${safeDb}.sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0, 1)`,
                  'WHERE t.type = \'U\'',
                  'GROUP BY s.name, t.name',
                  'ORDER BY s.name, t.name',
              ].join('\n');
          }
          case 'clickhouse':
              return [
                  'SELECT name AS table_name, total_rows AS table_rows',
                  'FROM system.tables',
                  `WHERE database = '${safeDbName}'`,
                  "AND engine NOT IN ('View', 'MaterializedView')",
                  'ORDER BY name',
              ].join('\n');
          case 'oracle':
          case 'dm': {
              const owner = escapeSQLLiteral(dbName).toUpperCase();
              return [
                  'SELECT table_name, num_rows AS table_rows',
                  'FROM all_tables',
                  `WHERE owner = '${owner}'`,
                  'ORDER BY table_name',
              ].join('\n');
          }
          default:
              return '';
      }
  };

  const buildQualifiedName = (schemaName: string, objectName: string): string => {
      const schema = String(schemaName || '').trim();
      const name = String(objectName || '').trim();
      if (!name) return '';
      if (!schema) return name;
      if (name.includes('.')) return name;
      return `${schema}.${name}`;
  };

  const buildSidebarObjectKeyName = (dbName: string, schemaName: string, objectName: string): string => {
      const schema = String(schemaName || '').trim();
      const name = String(objectName || '').trim();
      if (!schema || !name || name.includes('.')) return name;
      if (schema.toLowerCase() === String(dbName || '').trim().toLowerCase()) return name;
      return `${schema}.${name}`;
  };

  const splitQualifiedName = (qualifiedName: string): { schemaName: string; objectName: string } => {
      const parsed = splitQualifiedNameLast(qualifiedName);
      return {
          schemaName: parsed.parentPath,
          objectName: parsed.objectName,
      };
  };

  const parseDuckDBParameterNames = (raw: any): string[] => {
      if (Array.isArray(raw)) {
          return raw
              .map((item) => String(item ?? '').trim())
              .filter((item) => item !== '' && item.toLowerCase() !== '<nil>');
      }

      const text = String(raw ?? '').trim();
      if (!text) return [];
      const normalized = text.startsWith('[') && text.endsWith(']')
          ? text.slice(1, -1)
          : text;
      return normalized
          .split(',')
          .map((part) => part.trim())
          .filter((part) => part !== '' && part.toLowerCase() !== '<nil>');
  };

  const buildDuckDBMacroDDL = (
      schemaName: string,
      functionName: string,
      parametersRaw: any,
      macroDefinitionRaw: any
  ): string => {
      const schema = String(schemaName || '').trim();
      const name = String(functionName || '').trim();
      const macroDefinition = String(macroDefinitionRaw || '').trim();
      if (!name || !macroDefinition) return '';

      const parameters = parseDuckDBParameterNames(parametersRaw).join(', ');
      const qualifiedName = schema ? `${schema}.${name}` : name;
      const isTableMacro = !macroDefinition.startsWith('(');
      if (isTableMacro) {
          return `CREATE OR REPLACE MACRO ${qualifiedName}(${parameters}) AS TABLE ${macroDefinition};`;
      }
      return `CREATE OR REPLACE MACRO ${qualifiedName}(${parameters}) AS ${macroDefinition};`;
  };

  const buildViewsMetadataQuerySpecs = (dialect: string, dbName: string): MetadataQuerySpec[] => {
      const safeDbName = escapeSQLLiteral(dbName);
      switch (dialect) {
          case 'mysql':
          case 'starrocks': {
              return normalizeMetadataQuerySpecs(
                  buildMySQLCompatibleViewMetadataSqls(dbName).map((sql) => ({ sql })),
              );
          }
          case 'postgres':
          case 'kingbase':
          case 'highgo':
          case 'vastbase':
          case 'opengauss':
          case 'gaussdb':
              return [{ sql: `SELECT schemaname AS schema_name, viewname AS view_name FROM pg_catalog.pg_views WHERE schemaname != 'information_schema' AND schemaname NOT LIKE 'pg|_%' ESCAPE '|' ORDER BY schemaname, viewname` }];
          case 'sqlserver': {
              const safeDb = quoteSqlServerIdentifier(dbName || 'master');
              return [{ sql: `SELECT s.name AS schema_name, v.name AS view_name FROM ${safeDb}.sys.views v JOIN ${safeDb}.sys.schemas s ON v.schema_id = s.schema_id ORDER BY s.name, v.name` }];
          }
          case 'oracle':
          case 'dm':
              return normalizeMetadataQuerySpecs([
                  { sql: `SELECT VIEW_NAME AS view_name FROM USER_VIEWS ORDER BY VIEW_NAME` },
                  { sql: `SELECT OWNER AS schema_name, VIEW_NAME AS view_name FROM ALL_VIEWS WHERE OWNER = USER ORDER BY VIEW_NAME` },
                  {
                      sql: safeDbName
                          ? `SELECT OWNER AS schema_name, VIEW_NAME AS view_name FROM ALL_VIEWS WHERE OWNER = '${safeDbName.toUpperCase()}' ORDER BY VIEW_NAME`
                          : '',
                  },
              ]);
          case 'sqlite':
              return [{ sql: `SELECT name AS view_name FROM sqlite_master WHERE type = 'view' ORDER BY name` }];
          case 'duckdb':
              return [{ sql: `SELECT table_schema AS schema_name, table_name AS view_name FROM information_schema.views WHERE table_schema NOT IN ('information_schema', 'pg_catalog') ORDER BY table_schema, table_name` }];
          default:
              return [];
      }
  };

  const buildTriggersMetadataQuerySpecs = (dialect: string, dbName: string): MetadataQuerySpec[] => {
      const safeDbName = escapeSQLLiteral(dbName);
      switch (dialect) {
          case 'mysql':
          case 'starrocks': {
              const dbIdent = String(dbName || '').replace(/`/g, '``').trim();
              return normalizeMetadataQuerySpecs([
                  {
                      sql: safeDbName
                          ? `SELECT TRIGGER_NAME AS trigger_name, EVENT_OBJECT_TABLE AS table_name, TRIGGER_SCHEMA AS schema_name FROM information_schema.triggers WHERE trigger_schema = '${safeDbName}' ORDER BY EVENT_OBJECT_TABLE, TRIGGER_NAME`
                          : '',
                  },
                  { sql: dbIdent ? `SHOW TRIGGERS FROM \`${dbIdent}\`` : '' },
                  { sql: `SHOW TRIGGERS` },
              ]);
          }
          case 'postgres':
          case 'kingbase':
          case 'highgo':
          case 'vastbase':
          case 'opengauss':
          case 'gaussdb':
              return [{ sql: `SELECT DISTINCT event_object_schema AS schema_name, event_object_table AS table_name, trigger_name FROM information_schema.triggers WHERE trigger_schema NOT IN ('pg_catalog', 'information_schema') AND trigger_schema NOT LIKE 'pg|_%' ESCAPE '|' ORDER BY event_object_schema, event_object_table, trigger_name` }];
          case 'sqlserver': {
              const safeDb = quoteSqlServerIdentifier(dbName || 'master');
              return [{ sql: `SELECT s.name AS schema_name, t.name AS table_name, tr.name AS trigger_name FROM ${safeDb}.sys.triggers tr JOIN ${safeDb}.sys.tables t ON tr.parent_id = t.object_id JOIN ${safeDb}.sys.schemas s ON t.schema_id = s.schema_id WHERE tr.parent_class = 1 ORDER BY s.name, t.name, tr.name` }];
          }
          case 'oracle':
          case 'dm':
              if (!safeDbName) {
                  return [{ sql: `SELECT TRIGGER_NAME AS trigger_name, TABLE_NAME AS table_name FROM USER_TRIGGERS ORDER BY TABLE_NAME, TRIGGER_NAME` }];
              }
              return [{ sql: `SELECT OWNER AS schema_name, TABLE_NAME AS table_name, TRIGGER_NAME AS trigger_name FROM ALL_TRIGGERS WHERE OWNER = '${safeDbName.toUpperCase()}' ORDER BY TABLE_NAME, TRIGGER_NAME` }];
          case 'sqlite':
              return [{ sql: `SELECT name AS trigger_name, tbl_name AS table_name FROM sqlite_master WHERE type = 'trigger' ORDER BY tbl_name, name` }];
          case 'duckdb':
              return [];
          default:
              return [];
      }
  };

  const buildFunctionsMetadataQuerySpecs = (dialect: string, dbName: string): MetadataQuerySpec[] => {
      const safeDbName = escapeSQLLiteral(dbName);
      switch (dialect) {
          case 'mysql':
          case 'starrocks':
              return normalizeMetadataQuerySpecs([
                  {
                      sql: safeDbName
                          ? `SELECT ROUTINE_NAME AS routine_name, ROUTINE_TYPE AS routine_type, ROUTINE_SCHEMA AS schema_name FROM information_schema.routines WHERE routine_schema = '${safeDbName}' ORDER BY ROUTINE_TYPE, ROUTINE_NAME`
                          : '',
                  },
                  {
                      sql: safeDbName
                          ? `SHOW FUNCTION STATUS WHERE Db = '${safeDbName}'`
                          : `SHOW FUNCTION STATUS`,
                      inferredType: 'FUNCTION',
                  },
                  {
                      sql: safeDbName
                          ? `SHOW PROCEDURE STATUS WHERE Db = '${safeDbName}'`
                          : `SHOW PROCEDURE STATUS`,
                      inferredType: 'PROCEDURE',
                  },
              ]);
          case 'postgres':
          case 'kingbase':
          case 'highgo':
          case 'vastbase':
          case 'opengauss':
          case 'gaussdb':
              return normalizeMetadataQuerySpecs([
                  {
                      // PostgreSQL 11+ / 部分 PG-like：通过 prokind 区分 FUNCTION/PROCEDURE
                      sql: `SELECT n.nspname AS schema_name, p.proname AS routine_name, CASE WHEN p.prokind = 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END AS routine_type FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg|_%' ESCAPE '|' ORDER BY n.nspname, routine_type, p.proname`,
                  },
                  {
                      // PostgreSQL 10 / 不支持 prokind 的兼容路径
                      sql: `SELECT r.routine_schema AS schema_name, r.routine_name AS routine_name, COALESCE(NULLIF(UPPER(r.routine_type), ''), 'FUNCTION') AS routine_type FROM information_schema.routines r WHERE r.routine_schema NOT IN ('pg_catalog', 'information_schema') AND r.routine_schema NOT LIKE 'pg|_%' ESCAPE '|' ORDER BY r.routine_schema, routine_type, r.routine_name`,
                  },
                  {
                      // 最后兜底：仅函数列表，确保 prokind/routines 视图异常时仍可展示
                      sql: `SELECT n.nspname AS schema_name, p.proname AS routine_name, 'FUNCTION' AS routine_type FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg|_%' ESCAPE '|' ORDER BY n.nspname, p.proname`,
                  },
              ]);
          case 'sqlserver': {
              const safeDb = quoteSqlServerIdentifier(dbName || 'master');
              return [{ sql: `SELECT s.name AS schema_name, o.name AS routine_name, CASE o.type WHEN 'P' THEN 'PROCEDURE' WHEN 'FN' THEN 'FUNCTION' WHEN 'IF' THEN 'FUNCTION' WHEN 'TF' THEN 'FUNCTION' END AS routine_type FROM ${safeDb}.sys.objects o JOIN ${safeDb}.sys.schemas s ON o.schema_id = s.schema_id WHERE o.type IN ('P','FN','IF','TF') ORDER BY o.type, s.name, o.name` }];
          }
          case 'oracle':
          case 'dm':
              return normalizeMetadataQuerySpecs([
                  { sql: `SELECT OBJECT_NAME AS routine_name, OBJECT_TYPE AS routine_type FROM USER_OBJECTS WHERE OBJECT_TYPE IN ('FUNCTION','PROCEDURE') ORDER BY OBJECT_TYPE, OBJECT_NAME` },
                  { sql: `SELECT OWNER AS schema_name, OBJECT_NAME AS routine_name, OBJECT_TYPE AS routine_type FROM ALL_OBJECTS WHERE OWNER = USER AND OBJECT_TYPE IN ('FUNCTION','PROCEDURE') ORDER BY OBJECT_TYPE, OBJECT_NAME` },
                  {
                      sql: safeDbName
                          ? `SELECT OWNER AS schema_name, OBJECT_NAME AS routine_name, OBJECT_TYPE AS routine_type FROM ALL_OBJECTS WHERE OWNER = '${safeDbName.toUpperCase()}' AND OBJECT_TYPE IN ('FUNCTION','PROCEDURE') ORDER BY OBJECT_TYPE, OBJECT_NAME`
                          : '',
                  },
              ]);
          case 'duckdb':
              return [{
                  sql: `SELECT schema_name, function_name AS routine_name, 'FUNCTION' AS routine_type FROM duckdb_functions() WHERE internal = false AND lower(function_type) = 'macro' AND COALESCE(macro_definition, '') <> '' ORDER BY schema_name, function_name`,
                  inferredType: 'FUNCTION',
              }];
          default:
              return [];
      }
  };

  const buildEventsMetadataQuerySpecs = (dialect: string, dbName: string): MetadataQuerySpec[] => {
      if (dialect !== 'mysql') {
          return [];
      }
      const safeDbName = escapeSQLLiteral(dbName);
      const dbIdent = String(dbName || '').replace(/`/g, '``').trim();
      return normalizeMetadataQuerySpecs([
          {
              sql: safeDbName
                  ? `SELECT EVENT_SCHEMA AS schema_name, EVENT_NAME AS event_name, EVENT_TYPE AS event_type, STATUS AS status FROM information_schema.events WHERE event_schema = '${safeDbName}' ORDER BY EVENT_NAME`
                  : '',
          },
          { sql: dbIdent ? `SHOW EVENTS FROM \`${dbIdent}\`` : '' },
          { sql: `SHOW EVENTS` },
      ]);
  };

  const buildSchemasMetadataQuerySpecs = (dialect: string): MetadataQuerySpec[] => {
      if (!isPostgresSchemaDialect(dialect)) {
          return [];
      }
      return [{
          sql: `SELECT nspname AS schema_name FROM pg_namespace WHERE nspname NOT IN ('pg_catalog', 'information_schema') AND nspname NOT LIKE 'pg|_%' ESCAPE '|' ORDER BY nspname`,
      }];
  };

  const queryMetadataRowsBySpecs = async (
      conn: any,
      dbName: string,
      specs: MetadataQuerySpec[]
  ): Promise<{ results: MetadataQueryResult[]; hasSuccessfulQuery: boolean }> => {
      const normalizedSpecs = normalizeMetadataQuerySpecs(specs);
      if (normalizedSpecs.length === 0) {
          return { results: [], hasSuccessfulQuery: false };
      }
      const config = buildRuntimeConfig(conn, dbName);
      const results: MetadataQueryResult[] = [];
      let hasSuccessfulQuery = false;

      for (const spec of normalizedSpecs) {
          try {
              const result = await DBQuery(buildRpcConnectionConfig(config) as any, dbName, spec.sql);
              if (!result.success || !Array.isArray(result.data)) {
                  continue;
              }
              hasSuccessfulQuery = true;
              results.push({
                  rows: result.data as Record<string, any>[],
                  inferredType: spec.inferredType,
              });
          } catch {
              // 忽略单条查询失败，继续尝试后续回退语句
          }
      }
      return { results, hasSuccessfulQuery };
  };

  const loadViews = async (conn: any, dbName: string): Promise<{ views: SidebarViewMetadataEntry[]; supported: boolean }> => {
      const savedConn = conn as SavedConnection;
      const dialect = getMetadataDialect(savedConn);
      const querySpecs = buildViewsMetadataQuerySpecs(dialect, dbName);
      const { results, hasSuccessfulQuery } = await queryMetadataRowsBySpecs(conn, dbName, querySpecs);
      const seen = new Set<string>();
      const views: SidebarViewMetadataEntry[] = [];

      results.forEach((queryResult) => {
          queryResult.rows.forEach((row) => {
              const tableType = getCaseInsensitiveValue(row, ['table_type', 'table type', 'type']);
              if (!isSidebarViewTableType(tableType)) return;
              const schemaName = getCaseInsensitiveValue(row, ['schema_name', 'schemaname', 'owner', 'table_schema', 'db']);
              const viewName =
                  getCaseInsensitiveValue(row, ['view_name', 'viewname', 'table_name', 'name'])
                  || getMySQLShowTablesName(row)
                  || getFirstRowValue(row);
              const entry = normalizeSidebarViewMetadataEntry(dialect, dbName, schemaName, viewName);
              if (!entry) return;
              const uniqueKey = `${entry.schemaName.toLowerCase()}@@${entry.viewName.toLowerCase()}`;
              if (seen.has(uniqueKey)) return;
              seen.add(uniqueKey);
              views.push(entry);
          });
      });
      return { views, supported: hasSuccessfulQuery };
  };

  const loadStarRocksMaterializedViews = async (
      conn: any,
      dbName: string
  ): Promise<{ views: SidebarViewMetadataEntry[]; supported: boolean }> => {
      const dialect = getMetadataDialect(conn as SavedConnection);
      if (dialect !== 'starrocks') {
          return { views: [], supported: false };
      }

      const safeDbName = escapeSQLLiteral(dbName);
      const dbIdent = String(dbName || '').replace(/`/g, '``').trim();
      const querySpecs = normalizeMetadataQuerySpecs([
          {
              sql: safeDbName
                  ? `SELECT TABLE_SCHEMA AS schema_name, TABLE_NAME AS object_name FROM information_schema.tables WHERE TABLE_SCHEMA = '${safeDbName}' AND UPPER(TABLE_TYPE) LIKE '%MATERIALIZED%' ORDER BY TABLE_NAME`
                  : '',
          },
          { sql: dbIdent ? `SHOW MATERIALIZED VIEWS FROM \`${dbIdent}\`` : '' },
          { sql: `SHOW MATERIALIZED VIEWS` },
      ]);
      const { results, hasSuccessfulQuery } = await queryMetadataRowsBySpecs(conn, dbName, querySpecs);
      const seen = new Set<string>();
      const views: SidebarViewMetadataEntry[] = [];

      results.forEach((queryResult) => {
          queryResult.rows.forEach((row) => {
              const schemaName = getCaseInsensitiveValue(row, ['schema_name', 'table_schema', 'db', 'database']);
              const viewName =
                  getCaseInsensitiveValue(row, ['object_name', 'view_name', 'table_name', 'name', 'materialized_view_name', 'mv_name'])
                  || getFirstRowValue(row);
              const entry = normalizeSidebarViewMetadataEntry(dialect, dbName, schemaName, viewName);
              if (!entry) return;
              const uniqueKey = `${entry.schemaName.toLowerCase()}@@${entry.viewName.toLowerCase()}`;
              if (seen.has(uniqueKey)) return;
              seen.add(uniqueKey);
              views.push(entry);
          });
      });

      return { views, supported: hasSuccessfulQuery };
  };

  const loadDatabaseTriggers = async (
      conn: any,
      dbName: string
  ): Promise<{ triggers: Array<{ displayName: string; triggerName: string; tableName: string }>; supported: boolean }> => {
      const dialect = getMetadataDialect(conn as SavedConnection);
      const querySpecs = buildTriggersMetadataQuerySpecs(dialect, dbName);
      const { results, hasSuccessfulQuery } = await queryMetadataRowsBySpecs(conn, dbName, querySpecs);
      const seen = new Set<string>();
      const triggers: Array<{ displayName: string; triggerName: string; tableName: string }> = [];

      results.forEach((queryResult) => {
          queryResult.rows.forEach((row) => {
              const rawTriggerName = getCaseInsensitiveValue(row, ['trigger_name', 'triggername', 'trigger', 'name']) || getFirstRowValue(row);
              if (!rawTriggerName) return;

              const rawSchemaName = getCaseInsensitiveValue(row, ['schema_name', 'schemaname', 'owner', 'event_object_schema', 'trigger_schema', 'db']);
              const rawTableName = getCaseInsensitiveValue(row, ['table_name', 'event_object_table', 'tbl_name', 'table']);

              const triggerParts = splitQualifiedName(rawTriggerName);
              const tableParts = splitQualifiedName(rawTableName);

              const resolvedSchema = (
                  rawSchemaName
                  || tableParts.schemaName
                  || triggerParts.schemaName
                  || dbName
              ).trim();
              const resolvedTriggerName = (triggerParts.objectName || rawTriggerName).trim();
              const resolvedTableName = (tableParts.objectName || rawTableName).trim();
              const fullTableName = buildQualifiedName(resolvedSchema, resolvedTableName);

              // MySQL 下 trigger 名在同 schema 内唯一，直接按 schema+trigger 去重可彻底规避多元数据查询导致的重复
              const uniqueKey = dialect === 'mysql'
                  ? `${resolvedSchema.toLowerCase()}@@${resolvedTriggerName.toLowerCase()}`
                  : `${resolvedSchema.toLowerCase()}@@${resolvedTriggerName.toLowerCase()}@@${resolvedTableName.toLowerCase()}`;
              if (seen.has(uniqueKey)) return;
              seen.add(uniqueKey);
              const displayName = fullTableName ? `${resolvedTriggerName} (${fullTableName})` : resolvedTriggerName;
              triggers.push({ displayName, triggerName: resolvedTriggerName, tableName: fullTableName || resolvedTableName });
          });
      });
      return { triggers, supported: hasSuccessfulQuery };
  };

  const loadFunctions = async (
      conn: any,
      dbName: string
  ): Promise<{ routines: Array<{ displayName: string; routineName: string; routineType: string }>; supported: boolean }> => {
      const dialect = getMetadataDialect(conn as SavedConnection);
      const querySpecs = buildFunctionsMetadataQuerySpecs(dialect, dbName);
      const { results, hasSuccessfulQuery } = await queryMetadataRowsBySpecs(conn, dbName, querySpecs);
      const seen = new Set<string>();
      const routines: Array<{ displayName: string; routineName: string; routineType: string }> = [];

      results.forEach((queryResult) => {
          queryResult.rows.forEach((row) => {
              const routineName = getCaseInsensitiveValue(row, ['routine_name', 'object_name', 'proname', 'name']);
              if (!routineName) return;
              const schemaName = getCaseInsensitiveValue(row, ['schema_name', 'nspname', 'owner', 'db', 'database']);
              const rawType = getCaseInsensitiveValue(row, ['routine_type', 'object_type', 'type']) || queryResult.inferredType || 'FUNCTION';
              const normalizedType = rawType.toUpperCase().includes('PROC') ? 'PROCEDURE' : 'FUNCTION';
              const fullName = buildQualifiedName(schemaName, routineName);
              const uniqueKey = `${fullName}@@${normalizedType}`;
              if (!fullName || seen.has(uniqueKey)) return;
              seen.add(uniqueKey);
              const typeLabel = normalizedType === 'PROCEDURE' ? 'P' : 'F';
              routines.push({ displayName: `${fullName} [${typeLabel}]`, routineName: fullName, routineType: normalizedType });
          });
	      });
	      return { routines, supported: hasSuccessfulQuery };
  };

  const loadDatabaseEvents = async (
      conn: any,
      dbName: string
  ): Promise<{ events: Array<{ displayName: string; eventName: string; schemaName: string; eventType: string; status: string }>; supported: boolean }> => {
      const dialect = getMetadataDialect(conn as SavedConnection);
      const querySpecs = buildEventsMetadataQuerySpecs(dialect, dbName);
      const { results, hasSuccessfulQuery } = await queryMetadataRowsBySpecs(conn, dbName, querySpecs);
      const seen = new Set<string>();
      const events: Array<{ displayName: string; eventName: string; schemaName: string; eventType: string; status: string }> = [];

      results.forEach((queryResult) => {
          queryResult.rows.forEach((row) => {
              const rawEventName = getCaseInsensitiveValue(row, ['event_name', 'eventname', 'name', 'event']);
              if (!rawEventName) return;

              const rawSchemaName = getCaseInsensitiveValue(row, ['schema_name', 'event_schema', 'db', 'database']);
              const parsed = splitQualifiedName(rawEventName);
              const schemaName = (rawSchemaName || parsed.schemaName || dbName).trim();
              const eventName = (parsed.objectName || rawEventName).trim();
              if (!eventName) return;

              const uniqueKey = `${schemaName.toLowerCase()}@@${eventName.toLowerCase()}`;
              if (seen.has(uniqueKey)) return;
              seen.add(uniqueKey);

              const eventType = getCaseInsensitiveValue(row, ['event_type', 'type']);
              const status = getCaseInsensitiveValue(row, ['status']);
              events.push({
                  displayName: eventName,
                  eventName,
                  schemaName,
                  eventType,
                  status,
              });
          });
      });

      return { events, supported: hasSuccessfulQuery };
  };

  const loadSchemas = async (conn: any, dbName: string): Promise<{ schemas: string[]; supported: boolean }> => {
      const dialect = getMetadataDialect(conn as SavedConnection);
      const querySpecs = buildSchemasMetadataQuerySpecs(dialect);
      const { results, hasSuccessfulQuery } = await queryMetadataRowsBySpecs(conn, dbName, querySpecs);
      const seen = new Set<string>();
      const schemas: string[] = [];

      results.forEach((queryResult) => {
          queryResult.rows.forEach((row) => {
              const schemaName = getCaseInsensitiveValue(row, ['schema_name', 'nspname', 'schemaname']) || getFirstRowValue(row);
              if (!schemaName) return;
              const key = schemaName.toLowerCase();
              if (seen.has(key)) return;
              seen.add(key);
              schemas.push(schemaName);
          });
      });

      return { schemas, supported: hasSuccessfulQuery };
  };

	  const fetchDriverStatusMap = async (): Promise<Record<string, DriverStatusSnapshot>> => {
	      const cached = driverStatusCacheRef.current;
	      if (cached && Date.now() - cached.fetchedAt < DRIVER_STATUS_CACHE_TTL_MS) {
	          return cached.items;
	      }
	      const result: Record<string, DriverStatusSnapshot> = {};
	      const res = await GetDriverStatusList('', '');
	      if (!res?.success) {
	          return result;
	      }
	      const data = (res.data || {}) as any;
	      const drivers = Array.isArray(data.drivers) ? data.drivers : [];
	      drivers.forEach((item: any) => {
	          const type = normalizeDriverType(String(item.type || '').trim());
	          if (!type) return;
	          result[type] = {
	              type,
	              name: String(item.name || item.type || type).trim(),
	              connectable: !!item.connectable,
	              expectedRevision: String(item.expectedRevision || '').trim() || undefined,
	              needsUpdate: !!item.needsUpdate,
	              updateReason: String(item.updateReason || '').trim() || undefined,
	              message: String(item.message || '').trim() || undefined,
	          };
	      });
	      driverStatusCacheRef.current = { fetchedAt: Date.now(), items: result };
	      return result;
	  };

	  const warnIfConnectionDriverAgentNeedsUpdate = async (conn: SavedConnection) => {
	      try {
	          const driverType = resolveSavedConnectionDriverType(conn);
	          if (!driverType || driverType === 'custom') {
	              return;
	          }
	          const statusMap = await fetchDriverStatusMap();
	          const status = statusMap[driverType];
	          if (!status?.connectable || !status.needsUpdate) {
	              return;
	          }
	          const revisionKey = status.expectedRevision || status.updateReason || status.message || 'unknown';
	          const warningKey = `${conn.id}:${driverType}:${revisionKey}`;
	          if (driverUpdateWarningKeysRef.current.has(warningKey)) {
	              return;
	          }
	          driverUpdateWarningKeysRef.current.add(warningKey);
	          const driverName = status.name || driverType;
	          message.warning({
	              content: formatSidebarDriverAgentUpdateWarning(driverName, status),
	              key: `driver-agent-update-${conn.id}`,
	              duration: 10,
	          });
	      } catch (error) {
	          console.warn('检查驱动代理更新状态失败', error);
	      }
	  };
		  const loadDatabases = async (node: any) => {
		      const conn = node.dataRef as SavedConnection;
		      const loadKey = `dbs-${conn.id}`;
	      if (loadingNodesRef.current.has(loadKey)) return;
	      loadingNodesRef.current.add(loadKey);
	      const config = {
	          ...conn.config,
          port: Number(conn.config.port),
          password: conn.config.password || "",
          database: conn.config.database || "",
	          useSSH: conn.config.useSSH || false,
	          ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
	      };

          if (conn.config.type === 'jvm') {
              try {
                  const res = await JVMProbeCapabilities(buildRuntimeConfig(conn) as any);
                  if (res.success) {
                      setConnectionStates(prev => ({ ...prev, [conn.id]: 'success' }));
                      const capabilities: JVMCapability[] = Array.isArray(res.data) ? res.data as JVMCapability[] : [];
                      const modeNodes: TreeNode[] = capabilities.map((capability) => ({
                          title: capability.displayLabel || capability.mode,
                          key: `${conn.id}-jvm-mode-${capability.mode}`,
                          icon: <HddOutlined />,
                          type: 'jvm-mode',
                          dataRef: {
                              ...conn,
                              providerMode: capability.mode,
                              canBrowse: capability.canBrowse,
                              canWrite: capability.canWrite,
                              reason: capability.reason,
                              displayLabel: capability.displayLabel,
                          },
                          isLeaf: capability.canBrowse !== true,
                      }));
                      const monitoringNodes: TreeNode[] = buildJVMMonitoringActionDescriptors(conn.id, capabilities).map((item) => ({
                          title: item.title,
                          key: item.key,
                          icon: <DashboardOutlined />,
                          type: 'jvm-monitoring',
                          dataRef: {
                              ...conn,
                              providerMode: item.providerMode,
                          },
                          isLeaf: true,
                      }));
                      const diagnosticNode = buildJVMDiagnosticTreeNodes(conn);
                      replaceTreeNodeChildren(node.key, [...monitoringNodes, ...modeNodes, ...diagnosticNode]);
                  } else {
                      const diagnosticNode = buildJVMDiagnosticTreeNodes(conn);
                      setConnectionStates(prev => ({ ...prev, [conn.id]: 'error' }));
                      if (diagnosticNode.length > 0) {
                          replaceTreeNodeChildren(node.key, diagnosticNode);
                          message.warning({
                              content: t('sidebar.message.jvm_provider_probe_failed_with_diagnostic', {
                                  error: res.message || t('sidebar.error.unknown'),
                              }),
                              key: `conn-${conn.id}-jvm-caps`,
                          });
                      } else {
                          setLoadedKeys(prev => prev.filter(k => k !== node.key));
                          message.error({ content: res.message, key: `conn-${conn.id}-jvm-caps` });
                      }
                  }
              } catch (e: any) {
                  const diagnosticNode = buildJVMDiagnosticTreeNodes(conn);
                  setConnectionStates(prev => ({ ...prev, [conn.id]: 'error' }));
                  if (diagnosticNode.length > 0) {
                      replaceTreeNodeChildren(node.key, diagnosticNode);
                      message.warning({
                          content: t('sidebar.message.jvm_provider_probe_exception_with_diagnostic', {
                              error: e?.message || String(e),
                          }),
                          key: `conn-${conn.id}-jvm-caps`,
                      });
                  } else {
                      setLoadedKeys(prev => prev.filter(k => k !== node.key));
                      message.error({
                          content: t('sidebar.message.connection_failed', { error: e?.message || String(e) }),
                          key: `conn-${conn.id}-jvm-caps`,
                      });
                  }
              } finally {
                  loadingNodesRef.current.delete(loadKey);
              }
              return;
          }

          // Handle Redis connections differently
          if (conn.config.type === 'redis') {
              try {
                  const res = await (window as any).go.app.App.RedisGetDatabases(buildRpcConnectionConfig(config));
                  if (res.success) {
                      setConnectionStates(prev => ({ ...prev, [conn.id]: 'success' }));
                      const redisRows: any[] = Array.isArray(res.data) ? res.data : [];
                      let dbs = redisRows.map((db: any) => ({
                          title: `db${db.index}${db.keys > 0 ? ` (${db.keys})` : ''}`,
                          key: `${conn.id}-db${db.index}`,
                          icon: <DatabaseOutlined style={{ color: '#DC382D' }} />,
                          type: 'redis-db' as const,
                          dataRef: { ...conn, redisDB: db.index },
                          isLeaf: true,
                          dbIndex: db.index,
                      }));
                      // Filter Redis databases if configured
                      if (conn.includeRedisDatabases && conn.includeRedisDatabases.length > 0) {
                          dbs = dbs.filter(db => conn.includeRedisDatabases!.includes(db.dbIndex));
                      }
                      replaceTreeNodeChildren(node.key, dbs);
                  } else {
                      setConnectionStates(prev => ({ ...prev, [conn.id]: 'error' }));
                      message.error({ content: res.message, key: `conn-${conn.id}-dbs` });
                  }
              } catch (e: any) {
                  setConnectionStates(prev => ({ ...prev, [conn.id]: 'error' }));
                  message.error({
                      content: t('sidebar.message.connection_failed', { error: e?.message || String(e) }),
                      key: `conn-${conn.id}-dbs`,
                  });
              } finally {
                  loadingNodesRef.current.delete(loadKey);
              }
              return;
          }

	      try {
	          const res = await DBGetDatabases(buildRpcConnectionConfig(config) as any);
	          if (res.success) {
	            setConnectionStates(prev => ({ ...prev, [conn.id]: 'success' }));
                const dbRows: any[] = Array.isArray(res.data) ? res.data : [];
	            let dbs = dbRows.map((row: any) => ({
	              title: row.Database || row.database,
              key: `${conn.id}-${row.Database || row.database}`,
              icon: <DatabaseOutlined />,
              type: 'database' as const,
              dataRef: { ...conn, dbName: row.Database || row.database },
              isLeaf: false,
            }));

            // Filter databases if configured
            if (conn.includeDatabases && conn.includeDatabases.length > 0) {
                dbs = dbs.filter(db => conn.includeDatabases!.includes(db.title));
            }

            if (dbs.length > 0) {
                replaceTreeNodeChildren(node.key, dbs);
            } else {
                // 空列表：清理 loadedKeys 以允许重新加载，不设置 children = []
                setLoadedKeys(prev => prev.filter(k => k !== node.key));
                message.warning({ content: t('sidebar.message.no_visible_databases'), key: `conn-${conn.id}-dbs` });
            }
	          } else {
	            setConnectionStates(prev => ({ ...prev, [conn.id]: 'error' }));
	            setLoadedKeys(prev => prev.filter(k => k !== node.key));
	            message.error({ content: res.message, key: `conn-${conn.id}-dbs` });
	          }
	      } catch (e: any) {
	          setConnectionStates(prev => ({ ...prev, [conn.id]: 'error' }));
	          setLoadedKeys(prev => prev.filter(k => k !== node.key));
	          message.error({
                content: t('sidebar.message.connection_failed', { error: e?.message || String(e) }),
                key: `conn-${conn.id}-dbs`,
            });
	      } finally {
	          loadingNodesRef.current.delete(loadKey);
	      }
  };

  const loadJVMResources = async (node: any) => {
      const conn = node.dataRef as SavedConnection & { providerMode?: string; resourcePath?: string };
      const providerMode = String(conn.providerMode || '').trim().toLowerCase();
      const parentPath = String(conn.resourcePath || '').trim();
      const loadKey = `jvm-resources-${conn.id}-${providerMode}-${parentPath}`;
      if (loadingNodesRef.current.has(loadKey)) return;
      loadingNodesRef.current.add(loadKey);

      try {
          const backendApp = (window as any).go?.app?.App;
          if (typeof backendApp?.JVMListResources !== 'function') {
              throw new Error(t('sidebar.message.jvm_resources_backend_unavailable'));
          }

          const res = await backendApp.JVMListResources(buildJVMRuntimeConfig(conn, providerMode), parentPath);
          if (res.success) {
              const resourceRows: JVMResourceSummary[] = Array.isArray(res.data) ? res.data as JVMResourceSummary[] : [];
              const resourceNodes: TreeNode[] = resourceRows.map((item) => ({
                  title: item.name || item.path || item.id,
                  key: `${conn.id}-jvm-resource-${providerMode}-${item.path}`,
                  icon: item.hasChildren ? <FolderOpenOutlined /> : <HddOutlined />,
                  type: 'jvm-resource',
                  dataRef: {
                      ...conn,
                      providerMode: item.providerMode || providerMode,
                      resourcePath: item.path,
                      resourceKind: item.kind,
                      canRead: item.canRead,
                      canWrite: item.canWrite,
                      hasChildren: item.hasChildren,
                      sensitive: item.sensitive,
                  },
                  isLeaf: item.hasChildren !== true,
              }));
              replaceTreeNodeChildren(node.key, resourceNodes);
          } else {
              setLoadedKeys(prev => prev.filter(k => k !== node.key));
              message.error({ content: res.message, key: `jvm-resource-${node.key}` });
          }
      } catch (e: any) {
          setLoadedKeys(prev => prev.filter(k => k !== node.key));
          message.error({
              content: t('sidebar.message.load_jvm_resources_failed', { error: e?.message || String(e) }),
              key: `jvm-resource-${node.key}`,
          });
      } finally {
          loadingNodesRef.current.delete(loadKey);
      }
  };

	  const loadTables = async (node: any) => {
	      const conn = node.dataRef; // has dbName
	      const dbName = conn.dbName;
      const key = node.key;
      const loadKey = `tables-${conn.id}-${dbName}`;
      if (loadingNodesRef.current.has(loadKey)) return;
      loadingNodesRef.current.add(loadKey);
      
      const dbQueries = savedQueries.filter(q => q.connectionId === conn.id && q.dbName === dbName);
      const queriesNode: TreeNode = {
          title: t('sidebar.tree.saved_queries'),
          key: `${key}-queries`,
          icon: <FolderOpenOutlined />,
          type: 'queries-folder',
          isLeaf: dbQueries.length === 0,
          children: dbQueries.map(q => ({
              title: resolveSavedQueryDisplayName(q.name),
              key: q.id,
              icon: <FileTextOutlined />,
              type: 'saved-query',
              dataRef: q,
              isLeaf: true
          }))
      };

      const config = { 
          ...conn.config, 
          port: Number(conn.config.port),
          password: conn.config.password || "",
          database: conn.config.database || "",
	          useSSH: conn.config.useSSH || false,
	          ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
	      };
	      try {
	          const res = await DBGetTables(buildRpcConnectionConfig(config) as any, conn.dbName);
	          if (res.success) {
	            setConnectionStates(prev => ({ ...prev, [key as string]: 'success' }));

                const tableRows: any[] = Array.isArray(res.data) ? res.data : [];
                const tableStatusSql = buildSidebarTableStatusSQL(conn as SavedConnection, conn.dbName);
                const tableStatsResult = tableStatusSql
                    ? await DBQuery(buildRpcConnectionConfig(config) as any, conn.dbName, tableStatusSql).catch(() => ({ success: false, data: [] as any[] }))
                    : { success: false, data: [] as any[] };
                const tableRowCountMap = new Map<string, number>();
                if (tableStatsResult?.success && Array.isArray(tableStatsResult.data)) {
                    tableStatsResult.data.forEach((row: Record<string, any>) => {
                        const rawTableName = String(
                            getCaseInsensitiveValue(row, ['table_name', 'TABLE_NAME', 'Name', 'name'])
                            || getMySQLShowTablesName(row)
                            || ''
                        ).trim();
                        if (!rawTableName) return;
                        const rowCount = parseMetadataRowCount(row);
                        if (rowCount === undefined) return;
                        tableRowCountMap.set(rawTableName.toLowerCase(), rowCount);
                    });
                }
	            const tableEntries = tableRows.map((row: any) => {
	                const tableName = Object.values(row)[0] as string;
	                const parsed = splitQualifiedName(tableName);
	                return {
	                    tableName,
	                    schemaName: parsed.schemaName,
	                    displayName: getSidebarTableDisplayName(conn, tableName),
                        rowCount: tableRowCountMap.get(String(tableName || '').trim().toLowerCase()),
	                };
	            });

	            const [schemasResult, viewsResult, materializedViewsResult, triggersResult, routinesResult, eventsResult] = await Promise.all([
	                loadSchemas(conn, conn.dbName),
	                loadViews(conn, conn.dbName),
	                loadStarRocksMaterializedViews(conn, conn.dbName),
	                loadDatabaseTriggers(conn, conn.dbName),
	                loadFunctions(conn, conn.dbName),
	                loadDatabaseEvents(conn, conn.dbName),
	            ]);
                const externalSQLDirectoryResults = await Promise.all(
                    externalSQLDirectories.map(async (directory: ExternalSQLDirectory) => {
                        const directoryRes = await ListSQLDirectory(directory.path);
                        if (!directoryRes.success) {
                            message.warning({
                                key: `external-sql-${directory.id}`,
                                content: t('sidebar.message.external_sql_directory_read_failed', {
                                    name: directory.name,
                                    error: directoryRes.message,
                                }),
                            });
                            return { id: directory.id, entries: [] as ExternalSQLTreeEntry[] };
                        }
                        return {
                            id: directory.id,
                            entries: Array.isArray(directoryRes.data) ? directoryRes.data as ExternalSQLTreeEntry[] : [],
                        };
                    }),
                );
                const externalSQLTrees = externalSQLDirectoryResults.reduce<Record<string, ExternalSQLTreeEntry[]>>((accumulator, item) => {
                    accumulator[item.id] = item.entries;
                    return accumulator;
                }, {});
                const externalSQLRootNode = decorateExternalSQLTreeNode(buildExternalSQLRootNode({
                    dbNodeKey: String(key),
                    connectionId: String(conn.id),
                    dbName: String(conn.dbName),
                    directories: externalSQLDirectories,
                    directoryTrees: externalSQLTrees,
                    labels: {
                        root: t('sidebar.external_sql.root'),
                        directoryFallback: t('sidebar.external_sql.directory_fallback'),
                    },
                }));
            const viewRows: SidebarViewMetadataEntry[] = Array.isArray(viewsResult.views) ? viewsResult.views : [];
            const materializedViewRows: SidebarViewMetadataEntry[] = Array.isArray(materializedViewsResult.views) ? materializedViewsResult.views : [];
            const triggerRows: any[] = Array.isArray(triggersResult.triggers) ? triggersResult.triggers : [];
            const routineRows: any[] = Array.isArray(routinesResult.routines) ? routinesResult.routines : [];
            const eventRows: any[] = Array.isArray(eventsResult.events) ? eventsResult.events : [];
            const schemaRows: string[] = Array.isArray(schemasResult.schemas) ? schemasResult.schemas : [];

            const viewEntries = viewRows.map((entry: SidebarViewMetadataEntry) => {
                const parsed = splitQualifiedName(entry.viewName);
                return {
                    viewName: entry.viewName,
	                    schemaName: entry.schemaName || parsed.schemaName,
	                    displayName: getSidebarTableDisplayName(conn, entry.viewName),
	                };
	            });

            const materializedViewEntries = materializedViewRows.map((entry: SidebarViewMetadataEntry) => {
                const parsed = splitQualifiedName(entry.viewName);
                return {
                    viewName: entry.viewName,
                    schemaName: entry.schemaName || parsed.schemaName,
                    displayName: getSidebarTableDisplayName(conn, entry.viewName),
                };
            });

            const triggerEntries = (() => {
                const deduped: Array<{ displayName: string; triggerName: string; tableName: string; schemaName: string }> = [];
                const triggerSeen = new Set<string>();
                const metadataDialect = getMetadataDialect(conn as SavedConnection);

                triggerRows.forEach((trigger: any) => {
                    const triggerParsed = splitQualifiedName(trigger.triggerName);
                    const tableParsed = splitQualifiedName(trigger.tableName);
                    const schemaName = tableParsed.schemaName || triggerParsed.schemaName || String(conn.dbName || '').trim();
                    const triggerObjectName = (triggerParsed.objectName || trigger.triggerName).trim();
                    const tableObjectName = (tableParsed.objectName || trigger.tableName).trim();
                    const displayName = tableObjectName ? `${triggerObjectName} (${tableObjectName})` : triggerObjectName;
                    const dedupeKey = metadataDialect === 'mysql'
                        ? `${schemaName.toLowerCase()}@@${triggerObjectName.toLowerCase()}`
                        : `${schemaName.toLowerCase()}@@${triggerObjectName.toLowerCase()}@@${tableObjectName.toLowerCase()}`;

                    if (triggerSeen.has(dedupeKey)) return;
                    triggerSeen.add(dedupeKey);
                    deduped.push({
                        ...trigger,
                        schemaName,
                        triggerName: triggerObjectName,
                        tableName: buildQualifiedName(schemaName, tableObjectName) || tableObjectName,
                        displayName,
                    });
                });

                return deduped;
            })();

            const routineEntries = routineRows.map((routine: any) => {
                const parsed = splitQualifiedName(routine.routineName);
                const typeLabel = routine.routineType === 'PROCEDURE' ? 'P' : 'F';
                return {
	                    ...routine,
	                    schemaName: parsed.schemaName,
                    displayName: `${parsed.objectName || routine.routineName} [${typeLabel}]`,
                };
            });

            const eventEntries = eventRows.map((event: any) => ({
                ...event,
                schemaName: String(event.schemaName || conn.dbName || '').trim(),
                displayName: String(event.displayName || event.eventName || '').trim(),
            })).filter((event: any) => event.eventName && event.displayName);

            if (isSphinxConnection(conn as SavedConnection)) {
                const unsupportedObjects: string[] = [];
                if (!viewsResult.supported) unsupportedObjects.push(t('sidebar.object_group.views'));
                if (!routinesResult.supported) unsupportedObjects.push(t('sidebar.object_group.routines'));
                if (!triggersResult.supported) unsupportedObjects.push(t('sidebar.object_group.triggers'));
                if (unsupportedObjects.length > 0) {
                    message.info({
                        key: `sphinx-capability-${conn.id}-${conn.dbName}`,
                        content: t('sidebar.message.sphinx_unsupported_objects', {
                            objects: unsupportedObjects.join(t('sidebar.punctuation.list_separator')),
                        }),
                    });
                }
            }

	            const currentStoreState = useStore.getState();
	            const currentTableSortPreference = currentStoreState.tableSortPreference || tableSortPreference;
	            const currentTableAccessCount = currentStoreState.tableAccessCount || tableAccessCount;
	            const currentPinnedSidebarTables = currentStoreState.pinnedSidebarTables || pinnedSidebarTables;

	            // 获取当前数据库的排序偏好
	            const sortPreferenceKey = `${conn.id}-${conn.dbName}`;
	            const sortBy = currentTableSortPreference[sortPreferenceKey] || 'name';

	            const sortedTableEntries = sortSidebarTableEntries(tableEntries, {
	                connectionId: conn.id,
	                dbName: conn.dbName,
	                sortBy,
	                tableAccessCount: currentTableAccessCount,
	                pinnedSidebarTables: isV2Ui ? currentPinnedSidebarTables : [],
	            });

	            // Sort views by name (case-insensitive)
	            viewEntries.sort((a, b) => a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase()));

	            materializedViewEntries.sort((a, b) => a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase()));

	            // Sort triggers by display name (case-insensitive)
	            triggerEntries.sort((a, b) => a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase()));

	            // Sort routines by display name (case-insensitive)
	            routineEntries.sort((a, b) => a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase()));

	            eventEntries.sort((a, b) => a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase()));

	            const buildTableNode = (entry: { tableName: string; schemaName: string; displayName: string; rowCount?: number }): TreeNode => {
	                const isPinned = isV2Ui && isSidebarTablePinned(
	                    currentPinnedSidebarTables,
	                    conn.id,
	                    conn.dbName,
	                    entry.tableName,
	                    entry.schemaName,
	                );
	                return {
	                    title: entry.displayName,
	                    key: `${conn.id}-${conn.dbName}-${entry.tableName}`,
	                    icon: <TableOutlined />,
	                    type: 'table',
	                    dataRef: {
	                        ...conn,
	                        tableName: entry.tableName,
	                        schemaName: entry.schemaName,
	                        rowCount: entry.rowCount,
	                        ...(isPinned ? { pinnedSidebarTable: true } : {}),
	                    },
	                    isLeaf: false,
	                };
	            };

	            const buildViewNode = (entry: { viewName: string; schemaName: string; displayName: string }): TreeNode => {
	                const keyName = buildSidebarObjectKeyName(conn.dbName, entry.schemaName, entry.viewName);
	                return {
	                    title: entry.displayName,
	                    key: `${conn.id}-${conn.dbName}-view-${keyName}`,
	                    icon: <EyeOutlined />,
	                    type: 'view',
	                    dataRef: { ...conn, viewName: entry.viewName, tableName: entry.viewName, schemaName: entry.schemaName },
	                    isLeaf: true,
	                };
	            };

	            const buildMaterializedViewNode = (entry: { viewName: string; schemaName: string; displayName: string }): TreeNode => {
	                const keyName = buildSidebarObjectKeyName(conn.dbName, entry.schemaName, entry.viewName);
	                return {
	                    title: entry.displayName,
	                    key: `${conn.id}-${conn.dbName}-materialized-view-${keyName}`,
	                    icon: <ThunderboltOutlined />,
	                    type: 'materialized-view',
	                    dataRef: { ...conn, viewName: entry.viewName, tableName: entry.viewName, schemaName: entry.schemaName, objectKind: 'materialized-view' },
	                    isLeaf: true,
	                };
	            };

	            const buildTriggerNode = (entry: { triggerName: string; tableName: string; schemaName: string; displayName: string }): TreeNode => ({
	                title: entry.displayName,
	                key: `${conn.id}-${conn.dbName}-trigger-${entry.triggerName}-${entry.tableName}`,
	                icon: <FunctionOutlined />,
	                type: 'db-trigger',
	                dataRef: { ...conn, triggerName: entry.triggerName, triggerTableName: entry.tableName, tableName: entry.tableName, schemaName: entry.schemaName },
	                isLeaf: true,
	            });

	            const buildRoutineNode = (entry: { routineName: string; routineType: string; schemaName: string; displayName: string }): TreeNode => ({
	                title: entry.displayName,
	                key: `${conn.id}-${conn.dbName}-routine-${entry.routineName}`,
	                icon: <CodeOutlined />,
	                type: 'routine',
	                dataRef: { ...conn, routineName: entry.routineName, routineType: entry.routineType, schemaName: entry.schemaName },
	                isLeaf: true,
	            });

	            const buildEventNode = (entry: { eventName: string; schemaName: string; displayName: string; eventType?: string; status?: string }): TreeNode => ({
	                title: entry.displayName,
	                key: `${conn.id}-${conn.dbName}-event-${entry.schemaName}-${entry.eventName}`,
	                icon: <ClockCircleOutlined />,
	                type: 'db-event',
	                dataRef: { ...conn, eventName: entry.eventName, schemaName: entry.schemaName, eventType: entry.eventType, eventStatus: entry.status },
	                isLeaf: true,
	            });

	            const buildObjectGroup = (
	                parentKey: string,
	                groupKey: string,
	                groupTitle: string,
	                groupIcon: React.ReactNode,
	                children: TreeNode[],
	                extraData: Record<string, any> = {}
	            ): TreeNode => {
	                const groupNodeKey = `${parentKey}-${groupKey}`;
	                const groupedChildren = groupKey === 'tables'
	                    ? buildSidebarTableChildrenForUi(groupNodeKey, children, isV2Ui)
	                    : children;
	                return {
	                    title: groupTitle,
	                    key: groupNodeKey,
	                    icon: groupIcon,
	                    type: 'object-group',
	                    isLeaf: children.length === 0,
	                    children: groupedChildren.length > 0 ? groupedChildren : undefined,
	                    dataRef: { ...conn, dbName: conn.dbName, groupKey, ...extraData }
	                };
	            };

	            const shouldGroupBySchema = shouldHideSchemaPrefix(conn as SavedConnection);
	            if (shouldGroupBySchema) {
	                type SchemaBucket = {
	                    schemaName: string;
	                    tables: TreeNode[];
	                    views: TreeNode[];
	                    materializedViews: TreeNode[];
	                    routines: TreeNode[];
	                    triggers: TreeNode[];
	                    events: TreeNode[];
	                };

	                const schemaMap = new Map<string, SchemaBucket>();
	                const getSchemaBucket = (rawSchemaName: string): SchemaBucket => {
	                    const schemaName = String(rawSchemaName || '').trim();
	                    const schemaKey = schemaName || '__default__';
	                    let bucket = schemaMap.get(schemaKey);
	                    if (!bucket) {
	                        bucket = {
	                            schemaName,
	                            tables: [],
	                            views: [],
	                            materializedViews: [],
	                            routines: [],
	                            triggers: [],
	                            events: [],
	                        };
	                        schemaMap.set(schemaKey, bucket);
	                    }
	                    return bucket;
	                };

	                schemaRows.forEach((schemaName) => getSchemaBucket(schemaName));
	                sortedTableEntries.forEach((entry) => getSchemaBucket(entry.schemaName).tables.push(buildTableNode(entry)));
	                viewEntries.forEach((entry) => getSchemaBucket(entry.schemaName).views.push(buildViewNode(entry)));
	                materializedViewEntries.forEach((entry) => getSchemaBucket(entry.schemaName).materializedViews.push(buildMaterializedViewNode(entry)));
	                routineEntries.forEach((entry) => getSchemaBucket(entry.schemaName).routines.push(buildRoutineNode(entry)));
	                triggerEntries.forEach((entry) => getSchemaBucket(entry.schemaName).triggers.push(buildTriggerNode(entry)));
	                eventEntries.forEach((entry) => getSchemaBucket(entry.schemaName).events.push(buildEventNode(entry)));

	                const dialect = getMetadataDialect(conn as SavedConnection);
	                const isOracleLike = (dialect === 'oracle' || dialect === 'dm');
	                const includeMaterializedViews = dialect === 'starrocks';
	                const includeEvents = supportsDatabaseEvents(conn as SavedConnection);

	                const schemaNodes: TreeNode[] = Array.from(schemaMap.values())
	                    .filter((bucket) => !(isOracleLike && !bucket.schemaName))
	                    .sort((a, b) => {
	                        if (!a.schemaName && !b.schemaName) return 0;
	                        if (!a.schemaName) return -1;
	                        if (!b.schemaName) return 1;
	                        return a.schemaName.toLowerCase().localeCompare(b.schemaName.toLowerCase());
	                    })
	                    .map((bucket) => {
	                    const schemaNodeKey = `${key}-schema-${bucket.schemaName || 'default'}`;
	                    const schemaTitle = bucket.schemaName || t('sidebar.tree.default_schema');
	                        const groupedNodes: TreeNode[] = [
	                            buildObjectGroup(schemaNodeKey, 'tables', t('sidebar.object_group.tables'), <TableOutlined />, bucket.tables, { schemaName: bucket.schemaName }),
	                            buildObjectGroup(schemaNodeKey, 'views', t('sidebar.object_group.views'), <EyeOutlined />, bucket.views, { schemaName: bucket.schemaName }),
	                            ...(includeMaterializedViews ? [buildObjectGroup(schemaNodeKey, 'materializedViews', t('sidebar.object_group.materialized_views'), <ThunderboltOutlined />, bucket.materializedViews, { schemaName: bucket.schemaName })] : []),
	                            buildObjectGroup(schemaNodeKey, 'routines', t('sidebar.object_group.routines'), <CodeOutlined />, bucket.routines, { schemaName: bucket.schemaName }),
	                            buildObjectGroup(schemaNodeKey, 'triggers', t('sidebar.object_group.triggers'), <FunctionOutlined />, bucket.triggers, { schemaName: bucket.schemaName }),
	                            ...(includeEvents ? [buildObjectGroup(schemaNodeKey, 'events', t('sidebar.object_group.events'), <ClockCircleOutlined />, bucket.events, { schemaName: bucket.schemaName })] : []),
	                        ];

	                        return {
	                            title: schemaTitle,
	                            key: schemaNodeKey,
	                            icon: <FolderOpenOutlined />,
	                            type: 'object-group' as const,
	                            isLeaf: groupedNodes.length === 0,
	                            children: groupedNodes,
	                            dataRef: { ...conn, dbName: conn.dbName, groupKey: 'schema', schemaName: bucket.schemaName }
	                        };
	                    });

	                replaceTreeNodeChildren(key, [queriesNode, ...schemaNodes]);
	            } else {
	                const includeMaterializedViews = getMetadataDialect(conn as SavedConnection) === 'starrocks';
	                const includeEvents = supportsDatabaseEvents(conn as SavedConnection);
	                const groupedNodes: TreeNode[] = [
	                    buildObjectGroup(key as string, 'tables', t('sidebar.object_group.tables'), <TableOutlined />, sortedTableEntries.map(buildTableNode)),
	                    buildObjectGroup(key as string, 'views', t('sidebar.object_group.views'), <EyeOutlined />, viewEntries.map(buildViewNode)),
	                    ...(includeMaterializedViews ? [buildObjectGroup(key as string, 'materializedViews', t('sidebar.object_group.materialized_views'), <ThunderboltOutlined />, materializedViewEntries.map(buildMaterializedViewNode))] : []),
	                    buildObjectGroup(key as string, 'routines', t('sidebar.object_group.routines'), <CodeOutlined />, routineEntries.map(buildRoutineNode)),
	                    buildObjectGroup(key as string, 'triggers', t('sidebar.object_group.triggers'), <FunctionOutlined />, triggerEntries.map(buildTriggerNode)),
	                    ...(includeEvents ? [buildObjectGroup(key as string, 'events', t('sidebar.object_group.events'), <ClockCircleOutlined />, eventEntries.map(buildEventNode))] : []),
	                ];

	                replaceTreeNodeChildren(key, [queriesNode, ...groupedNodes]);
	            }
	          } else {
	            setConnectionStates(prev => ({ ...prev, [key as string]: 'error' }));
	            message.error({ content: res.message, key: `db-${key}-tables` });
          }
	      } catch (e: any) {
	          setConnectionStates(prev => ({ ...prev, [key as string]: 'error' }));
	          message.error({
	              content: t('sidebar.message.load_table_list_failed', { error: e?.message || String(e) }),
	              key: `db-${key}-tables`,
	          });
	      } finally {
	          loadingNodesRef.current.delete(loadKey);
	      }
  };

  const locateObjectInSidebarRef = useRef<(detail: unknown) => Promise<void>>(async () => {});

  const waitForSidebarLoadKey = async (loadKey: string): Promise<boolean> => {
      for (let attempt = 0; attempt < SIDEBAR_LOCATE_LOAD_WAIT_ATTEMPTS && loadingNodesRef.current.has(loadKey); attempt += 1) {
          await new Promise(resolve => window.setTimeout(resolve, SIDEBAR_LOCATE_LOAD_WAIT_INTERVAL_MS));
      }
      return !loadingNodesRef.current.has(loadKey);
  };

  const locateObjectInSidebar = async (detail: unknown) => {
      const request = normalizeSidebarLocateObjectRequest(detail);
      if (!request) {
          message.warning(t('sidebar.message.locate_current_table_unavailable'));
          return;
      }

      if (request.objectGroup === 'externalSqlFiles') {
          await refreshGlobalExternalSQLRootNode(false);
          const target = resolveSidebarLocateTarget(request, { groupBySchema: false });
          const path = findSidebarNodePathForLocate(treeDataRef.current as SidebarLocateTreeNodeLike[], target);
          if (!path) {
              message.warning(t('sidebar.message.locate_external_sql_file_not_found', { path: request.filePath }));
              return;
          }
          const targetKey = path[path.length - 1];
          const targetNode = findTreeNodeByKey(treeDataRef.current, targetKey);
          setSearchValue('');
          mergeExpandedTreeKeys(path.slice(0, -1));
          setSelectedKeys([targetKey]);
          selectedNodesRef.current = targetNode ? [targetNode] : [];
          const connectionId = String(request.connectionId || activeContext?.connectionId || activeTab?.connectionId || '').trim();
          const dbName = String(request.dbName || activeContext?.dbName || activeTab?.dbName || '').trim();
          if (connectionId) {
              setActiveContext({ connectionId, dbName });
          }
          scrollSidebarTreeToKey(targetKey);
          return;
      }

      const conn = connections.find(item => item.id === request.connectionId);
      if (!conn) {
          message.warning(t('sidebar.message.locate_connection_not_found_for_object'));
          return;
      }

      const target = resolveSidebarLocateTarget(request, {
          groupBySchema: shouldHideSchemaPrefix(conn),
      });
      const objectLabel = request.objectGroup === 'materializedViews'
          ? t('sidebar.locate.object.materialized_view')
          : request.objectGroup === 'views'
              ? t('sidebar.locate.object.view')
              : request.objectGroup === 'triggers'
                  ? t('sidebar.locate.object.trigger')
                  : request.objectGroup === 'routines'
                      ? t('sidebar.locate.object.routine')
                      : t('sidebar.locate.object.table');

      let path = findSidebarNodePathForLocate(treeDataRef.current as SidebarLocateTreeNodeLike[], target);
      const dbLoadKey = `dbs-${request.connectionId}`;
      const tableLoadKey = `tables-${request.connectionId}-${request.dbName}`;

      if (!path && !findSidebarNodePathByKey(treeDataRef.current as SidebarLocateTreeNodeLike[], target.databaseKey)) {
          const connectionNode = findTreeNodeByKey(treeDataRef.current, target.connectionKey);
          if (!connectionNode) {
              message.warning(t('sidebar.message.locate_connection_not_in_tree'));
              return;
          }
          if (loadingNodesRef.current.has(dbLoadKey)) {
              const loaded = await waitForSidebarLoadKey(dbLoadKey);
              if (!loaded) {
                  message.info(t('sidebar.message.locate_database_loading', { database: request.dbName }));
                  return;
              }
          } else {
              await loadDatabases(connectionNode);
          }
      }

      const dbNode = findTreeNodeByKey(treeDataRef.current, target.databaseKey);
      if (!dbNode) {
          message.warning(t('sidebar.message.locate_database_not_found', { database: request.dbName }));
          return;
      }

      path = findSidebarNodePathForLocate(treeDataRef.current as SidebarLocateTreeNodeLike[], target);
      if (!path) {
          if (loadingNodesRef.current.has(tableLoadKey)) {
              const loaded = await waitForSidebarLoadKey(tableLoadKey);
              if (!loaded) {
                  message.info(t('sidebar.message.locate_object_loading', {
                      object: objectLabel,
                      database: request.dbName,
                  }));
                  return;
              }
          } else {
              await loadTables(dbNode);
          }
          path = findSidebarNodePathForLocate(treeDataRef.current as SidebarLocateTreeNodeLike[], target);
      }

      if (!path) {
          message.warning(t('sidebar.message.locate_object_not_found', {
              object: objectLabel,
              name: request.tableName,
          }));
          return;
      }

      const targetKey = path[path.length - 1];
      const targetNode = findTreeNodeByKey(treeDataRef.current, targetKey);
      setSearchValue('');
      mergeExpandedTreeKeys(path.slice(0, -1));
      setSelectedKeys([targetKey]);
      selectedNodesRef.current = targetNode ? [targetNode] : [];
      setActiveContext({ connectionId: request.connectionId, dbName: request.dbName });
      scrollSidebarTreeToKey(targetKey);
  };

  const handleLocateActiveTabInSidebar = () => {
      if (!activeTabLocateRequest) {
          message.warning(t('sidebar.message.locate_current_table_unavailable'));
          return;
      }
      void locateObjectInSidebar(activeTabLocateRequest);
  };

  useEffect(() => {
      locateObjectInSidebarRef.current = locateObjectInSidebar;
  });

  useEffect(() => {
      const handleLocateSidebarObject = (event: Event) => {
          void locateObjectInSidebarRef.current((event as CustomEvent).detail);
      };
      window.addEventListener('gonavi:locate-sidebar-object', handleLocateSidebarObject as EventListener);
      return () => {
          window.removeEventListener('gonavi:locate-sidebar-object', handleLocateSidebarObject as EventListener);
      };
  }, []);

  useEffect(() => {
      const handleSidebarTablePinChanged = (event: Event) => {
          const detail = (event as CustomEvent).detail || {};
          const connectionId = String(detail.connectionId || '').trim();
          const dbName = String(detail.dbName || '').trim();
          if (!connectionId || !dbName) return;
          const dbNode = findTreeNodeByKeyRef.current(treeDataRef.current, `${connectionId}-${dbName}`);
          if (dbNode) {
              void loadTables(dbNode);
          }
      };
      window.addEventListener('gonavi:sidebar-table-pin-changed', handleSidebarTablePinChanged as EventListener);
      return () => {
          window.removeEventListener('gonavi:sidebar-table-pin-changed', handleSidebarTablePinChanged as EventListener);
      };
  }, []);

  const onLoadData = async ({ key, children, dataRef, type }: any) => {
    if (type === 'tag' || type === 'all-saved-queries' || type === 'saved-query-group' || type === 'unmatched-saved-queries') return;
    if (hasSidebarLazyChildren(children)) return;

    if (type === 'connection') {
        await loadDatabases({ key, dataRef });
    } else if (type === 'jvm-mode' || type === 'jvm-resource') {
        await loadJVMResources({ key, dataRef });
    } else if (type === 'database') {
        await loadTables({ key, dataRef });
    } else if (type === 'external-sql-root') {
        await refreshGlobalExternalSQLRootNode(false);
    } else if (type === 'table') {
        // Expand table to show object categories
        const conn = dataRef; 

        const folders: TreeNode[] = [
            {
                title: t('sidebar.table_folder.columns'),
                key: `${key}-columns`,
                icon: <UnorderedListOutlined />,
                type: 'folder-columns',
                isLeaf: true,
                dataRef: conn
            },
            {
                title: t('sidebar.table_folder.indexes'),
                key: `${key}-indexes`,
                icon: <KeyOutlined style={{ transform: 'rotate(45deg)' }} />,
                type: 'folder-indexes',
                isLeaf: true,
                dataRef: conn
            },
            {
                title: t('sidebar.table_folder.foreign_keys'),
                key: `${key}-fks`,
                icon: <LinkOutlined />,
                type: 'folder-fks',
                isLeaf: true,
                dataRef: conn
            },
            {
                title: t('sidebar.table_folder.triggers'),
                key: `${key}-triggers`,
                icon: <ThunderboltOutlined />,
                type: 'folder-triggers',
                isLeaf: true,
                dataRef: conn
            }
        ];
        
        replaceTreeNodeChildren(key, folders);
    }
  };

  const isStructureOnlyDbType = (connectionId: string): boolean => {
      const conn = connections.find(c => c.id === connectionId);
      if (!conn) return false;
      const dbType = resolveDataSourceType(conn.config);
      return dbType === 'elasticsearch' || dbType === 'mongodb' || dbType === 'redis' || dbType === 'iotdb';
  };

  const openDesign = (node: any, initialTab: string, readOnly: boolean = false) => {
      const { tableName, dbName, id } = node.dataRef;
      const forceReadOnly = readOnly || isStructureOnlyDbType(id);
      addTab({
          id: `design-${id}-${dbName}-${tableName}`,
          title: forceReadOnly
              ? t('sidebar.tab.table_structure', { table: tableName })
              : t('sidebar.tab.design_table', { table: tableName }),
          type: 'design',
          connectionId: id,
          dbName: dbName,
          tableName: tableName,
          initialTab: initialTab,
          readOnly: forceReadOnly
      });
  };

  const openNewTableDesign = (node: any) => {
      const { dbName, id } = node.dataRef;
      if (isStructureOnlyDbType(id)) {
          message.warning(t('sidebar.message.visual_new_table_unsupported'));
          return;
      }
      addTab({
          id: `new-table-${id}-${dbName}-${Date.now()}`,
          title: t('sidebar.tab.new_table', { database: dbName }),
          type: 'design',
          connectionId: id,
          dbName: dbName,
          tableName: '', // Empty tableName signals creation mode
          initialTab: 'columns',
          readOnly: false
      });
  };

  const onSelect = (keys: React.Key[], info: any) => {
      if (isV2Ui && info?.node?.type === 'v2-table-section') {
          return;
      }
      if (Date.now() < treeDragSelectSuppressUntilRef.current) {
          return;
      }
      if (isTreeDragging) {
          return;
      }
      setSelectedKeys(keys);
      selectedNodesRef.current = info.selectedNodes || [];

      if (keys.length === 0) {
          if (shouldClearSidebarActiveContextOnEmptySelect(isV2Ui)) {
              setActiveContext(null);
          }
          return;
      }
      if (shouldSkipSidebarSelectWhileDragging(isTreeDragging, info)) return;

      const { type, dataRef, key, title } = info.node;
      const nodeConnectionId = resolveSidebarNodeConnectionId(info.node, connectionIds);

      // Update active context
      if (type === 'connection') {
          setActiveContext({ connectionId: key, dbName: '' });
      } else if (type === 'database') {
          setActiveContext({ connectionId: nodeConnectionId || dataRef.id, dbName: dataRef.dbName });
      } else if (type === 'table') {
          setActiveContext({ connectionId: nodeConnectionId || dataRef.id, dbName: dataRef.dbName });
      } else if (type === 'jvm-mode' || type === 'jvm-resource' || type === 'jvm-diagnostic' || type === 'jvm-monitoring') {
          setActiveContext({ connectionId: nodeConnectionId || dataRef.id, dbName: '' });
      } else if (type === 'view' || type === 'materialized-view' || type === 'db-trigger' || type === 'db-event' || type === 'routine') {
          setActiveContext({ connectionId: nodeConnectionId || dataRef.id, dbName: dataRef.dbName });
      } else if (type === 'saved-query') {
          setActiveContext({ connectionId: dataRef.connectionId, dbName: dataRef.dbName });
      } else if (type === 'redis-db') {
          setActiveContext({ connectionId: dataRef.id, dbName: `db${dataRef.redisDB}` });
      }

      if (type === 'folder-columns') openDesign(info.node, 'columns', false);
      else if (type === 'folder-indexes') openDesign(info.node, 'indexes', false);
      else if (type === 'folder-fks') openDesign(info.node, 'foreignKeys', false);
      else if (type === 'folder-triggers') openDesign(info.node, 'triggers', false);
      else if (type === 'object-group' && dataRef?.groupKey === 'tables') {
          // 单击延迟打开表概览，双击时会取消此定时器
          if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
          const { id, dbName: gDbName, schemaName } = dataRef;
          clickTimerRef.current = setTimeout(() => {
              clickTimerRef.current = null;
              addTab({
                  id: `table-overview-${id}-${gDbName}${schemaName ? `-${schemaName}` : ''}`,
                  title: t('sidebar.tab.table_overview', {
                      database: gDbName,
                      schema: schemaName ? ` (${schemaName})` : '',
                  }),
                  type: 'table-overview' as any,
                  connectionId: id,
                  dbName: gDbName,
                  schemaName,
              } as any);
          }, 250);
      }
  };

  const onExpand = (newExpandedKeys: React.Key[], info?: any) => {
    setExpandedKeys(newExpandedKeys);
    setAutoExpandParent(false);
    if (!shouldSkipSidebarLoadOnExpandWhileDragging(isTreeDragging, info)) {
        void onLoadData(info.node);
    }
  };

  const onDoubleClick = (e: any, node: any) => {
      // 双击时取消单击延迟动作（如表概览打开），让双击只触发展开/折叠
      if (clickTimerRef.current) {
          clearTimeout(clickTimerRef.current);
          clickTimerRef.current = null;
      }
      const { type, dataRef, key: nodeKey } = node;
      if (isV2Ui && type === 'v2-table-section') {
          return;
      }
      const nodeConnectionId = resolveSidebarNodeConnectionId(node, connectionIds);
      if (type === 'connection') {
          setSelectedKeys([nodeKey]);
          selectedNodesRef.current = [node];
          setActiveContext({ connectionId: nodeKey, dbName: '' });
      } else if (type === 'database') {
          setSelectedKeys([nodeKey]);
          selectedNodesRef.current = [node];
          setActiveContext({ connectionId: nodeConnectionId || dataRef.id, dbName: dataRef.dbName });
      } else if (type === 'jvm-mode' || type === 'jvm-resource' || type === 'jvm-diagnostic' || type === 'jvm-monitoring') {
          setActiveContext({ connectionId: nodeConnectionId || dataRef.id, dbName: '' });
      } else if (type === 'table' || type === 'view' || type === 'materialized-view' || type === 'db-trigger' || type === 'db-event' || type === 'routine') {
          setActiveContext({ connectionId: nodeConnectionId || dataRef.id, dbName: dataRef.dbName });
      } else if (type === 'saved-query') setActiveContext({ connectionId: dataRef.connectionId, dbName: dataRef.dbName });
      else if (type === 'redis-db') setActiveContext({ connectionId: dataRef.id, dbName: `db${dataRef.redisDB}` });

      if (node.type === 'table') {
          const { tableName, dbName, id } = node.dataRef;
          // 记录表访问
          recordTableAccess(id, dbName, tableName);
          addTab({
              id: node.key,
              title: tableName,
              type: 'table',
              connectionId: id,
              dbName,
              tableName,
              objectType: 'table',
          });
          return;
      } else if (node.type === 'view' || node.type === 'materialized-view') {
          const { viewName, dbName, id, schemaName } = node.dataRef;
          addTab({
              id: node.key,
              title: viewName,
              type: 'table',
              connectionId: id,
              dbName,
              tableName: viewName,
              objectType: node.type === 'materialized-view' ? 'materialized-view' : 'view',
              schemaName,
              sidebarLocateKey: String(node.key || ''),
          });
          return;
      } else if (node.type === 'saved-query') {
          const q = node.dataRef;
          addTab({
              id: q.id,
              title: resolveSavedQueryDisplayName(q.name),
              type: 'query',
              connectionId: q.connectionId,
              dbName: q.dbName,
              query: q.sql,
              savedQueryId: q.id,
          });
          return;
      } else if (node.type === 'external-sql-file') {
          void openExternalSQLFile(node);
          return;
      } else if (node.type === 'redis-db') {
          const { id, redisDB } = node.dataRef;
          addTab({
              id: `redis-keys-${id}-db${redisDB}`,
              title: `db${redisDB}`,
              type: 'redis-keys',
              connectionId: id,
              redisDB: redisDB
          });
          return;
      } else if (node.type === 'db-trigger') {
          const { triggerName, triggerTableName, schemaName, dbName, id } = node.dataRef;
          addTab({
              id: `trigger-${node.key}`,
              title: t('sidebar.tab.trigger', { name: triggerName }),
              type: 'trigger',
              connectionId: id,
              dbName,
              triggerName,
              triggerTableName,
              schemaName,
              sidebarLocateKey: String(node.key || ''),
          });
          return;
      } else if (node.type === 'db-event') {
          openEventDefinition(node);
          return;
      } else if (node.type === 'routine') {
          const { routineName, routineType, dbName, id } = node.dataRef;
          const typeLabel = t(routineType === 'PROCEDURE' ? 'sidebar.object.procedure' : 'sidebar.object.function');
          addTab({
              id: `routine-def-${node.key}`,
              title: t('sidebar.tab.routine_definition', { type: typeLabel, name: routineName }),
              type: 'routine-def',
              connectionId: id,
              dbName,
              routineName,
              routineType
          });
          return;
      } else if (node.type === 'jvm-mode') {
          const { providerMode, id } = node.dataRef;
          const conn = (connections.find((item) => item.id === id) || node.dataRef) as SavedConnection;
          openJVMOverviewTab(conn, providerMode);
          return;
      } else if (node.type === 'jvm-resource') {
          const { providerMode, resourcePath, resourceKind, id } = node.dataRef;
          const conn = (connections.find((item) => item.id === id) || node.dataRef) as SavedConnection;
          openJVMResourceTab(conn, providerMode, resourcePath, resourceKind);
          return;
      } else if (node.type === 'jvm-monitoring') {
          const { providerMode, id } = node.dataRef;
          const conn = (connections.find((item) => item.id === id) || node.dataRef) as SavedConnection;
          openJVMMonitoringTab(conn, providerMode);
          return;
      } else if (node.type === 'jvm-diagnostic') {
          const conn = (connections.find((item) => item.id === node.dataRef.id) || node.dataRef) as SavedConnection;
          openJVMDiagnosticTab(conn);
          return;
      }

      const key = node.key;
      const isExpanded = expandedKeys.includes(key);
      const newExpandedKeys = isExpanded
          ? expandedKeys.filter(k => k !== key)
          : [...expandedKeys, key];

      setExpandedKeys(newExpandedKeys);
      if (!isExpanded) {
          setAutoExpandParent(false);
          if (shouldLoadSidebarNodeOnExpand(node)) {
              void onLoadData(node);
          }
      }
  };
  
	  const handleCopyStructure = async (node: any) => {
	      const { config, dbName, tableName } = node.dataRef;
	      const res = await DBShowCreateTable(buildRpcConnectionConfig(config) as any, dbName, tableName);
      if (res.success) {
          navigator.clipboard.writeText(res.data as string);
          message.success(t('table_overview.message.copy_structure_success'));
      } else {
          message.error(res.message);
      }
  };

  const resolveCopyObjectNameLabel = (node: any): string => {
      if (node?.type === 'view') return t('sidebar.copy_object_name.label.view');
      if (node?.type === 'materialized-view') return t('sidebar.copy_object_name.label.materialized_view');
      if (node?.type === 'db-event') return t('sidebar.copy_object_name.label.event');
      return t('sidebar.copy_object_name.label.table');
  };

  const handleCopyTableName = async (node: any) => {
      const objectName = resolveSidebarTableNameForCopy(node);
      const label = resolveCopyObjectNameLabel(node);
      if (!objectName) {
          message.warning(t('sidebar.copy_object_name.empty', { label }));
          return;
      }
      try {
          await navigator.clipboard.writeText(objectName);
          message.success(t('sidebar.copy_object_name.copied', { label }));
      } catch (e: any) {
          message.error(t('sidebar.copy_object_name.failed', { label, error: e?.message || String(e) }));
      }
  };

  const handleExport = async (node: any, options: { format: string; xlsxMaxRowsPerSheet?: number }) => {
      const { config, dbName, tableName } = node.dataRef;
      const rowCount = Number(node?.dataRef?.rowCount);
      const totalRowsKnown = Number.isFinite(rowCount) && rowCount > 0;
      await runExportWithProgress({
          title: `导出 ${tableName}`,
          targetName: tableName,
          format: options.format,
          totalRows: totalRowsKnown ? rowCount : undefined,
          run: (jobId) => ExportTableWithOptions(
              buildRpcConnectionConfig(config) as any,
              dbName,
              tableName,
              {
                  ...options,
                  jobId,
                  totalRowsHint: totalRowsKnown ? rowCount : 0,
                  totalRowsKnown,
              } as any,
          ),
      });
  };

  const openExportDialog = async (node: any) => {
      const tableName = String(node?.dataRef?.tableName || node?.title || '').trim();
      if (!tableName) {
          message.warning('未识别到表名，无法导出');
          return;
      }
      const connectionId = resolveSidebarNodeConnectionId(node, connectionIds) || String(node?.dataRef?.id || '').trim();
      const dbName = String(node?.dataRef?.dbName || '').trim();
      addTab(buildTableExportTab({
          connectionId,
          dbName,
          tableName,
          title: `导出 ${tableName}`,
          objectType: node?.type === 'view' ? 'view' : (node?.type === 'materialized-view' ? 'materialized-view' : 'table'),
          schemaName: typeof node?.dataRef?.schemaName === 'string' ? node.dataRef.schemaName : undefined,
          sidebarLocateKey: typeof node?.key === 'string' ? node.key : undefined,
          rowCountByScope: Number.isFinite(Number(node?.dataRef?.rowCount)) && Number(node?.dataRef?.rowCount) > 0
              ? { all: Math.trunc(Number(node.dataRef.rowCount)) }
              : undefined,
        }));
  };

  const handleCopyTableAsInsert = async (node: any) => {
      await handleExport(node, { format: 'sql' });
  };

  const openTableDdlInDesigner = (node: any) => {
      openDesign(node, 'ddl', true);
  };

  const openTableInERView = (node: any) => {
      onDoubleClick(null, node);
      setTimeout(() => {
          window.dispatchEvent(new CustomEvent('gonavi:data-grid:set-view-mode', {
              detail: {
                  connectionId: node.dataRef?.id,
                  dbName: node.dataRef?.dbName,
                  tableName: node.dataRef?.tableName,
                  viewMode: 'er',
              },
          }));
      }, 0);
  };

  const injectTablePromptToAI = async (node: any, promptKind: 'explain' | 'query') => {
      const conn = node.dataRef;
      const tableName = String(conn?.tableName || node?.title || '').trim();
      if (!conn?.id || !conn?.dbName || !tableName) {
          message.warning('当前表缺少连接上下文，无法发送给 AI');
          return;
      }

      let ddl = '';
      try {
          const res = await DBShowCreateTable(buildRpcConnectionConfig(conn.config) as any, conn.dbName, tableName);
          if (res.success) {
              ddl = String(res.data || '').trim();
              addAIContext(conn.id, { dbName: conn.dbName, tableName, ddl });
          }
      } catch {
          // AI 入口仍可基于表名工作，DDL 获取失败不阻断打开面板。
      }

      const prompt = promptKind === 'explain'
          ? [
              `请解释数据表 ${conn.dbName}.${tableName} 的结构和业务含义。`,
              '重点说明字段含义、主键/索引、潜在关联关系、典型查询场景和风险点。',
              ddl ? `\n\`\`\`sql\n${ddl}\n\`\`\`` : '',
          ].filter(Boolean).join('\n')
          : [
              `请基于数据表 ${conn.dbName}.${tableName} 生成 3 条常用查询 SQL。`,
              '要求包含：数据预览查询、按关键字段过滤查询、一个聚合或统计查询。',
              ddl ? `\n\`\`\`sql\n${ddl}\n\`\`\`` : '',
          ].filter(Boolean).join('\n');

      const wasClosed = !useStore.getState().aiPanelVisible;
      if (wasClosed) setAIPanelVisible(true);
      setTimeout(() => {
          window.dispatchEvent(new CustomEvent('gonavi:ai:inject-prompt', { detail: { prompt } }));
      }, wasClosed ? 350 : 0);
  };

  const normalizeConnConfig = (raw: any) => (
      buildRpcConnectionConfig(raw)
  );

  const handleExportDatabaseSQL = async (node: any, includeData: boolean) => {
      const conn = node.dataRef;
      const dbName = conn.dbName || node.title;
      const hide = message.loading(
          includeData
              ? t('sidebar.message.exporting_database_backup', { database: dbName })
              : t('sidebar.message.exporting_database_schema', { database: dbName }),
          0,
      );
      try {
          const res = await (window as any).go.app.App.ExportDatabaseSQL(normalizeConnConfig(conn.config), dbName, includeData);
          hide();
          if (res.success) {
              message.success(t('sidebar.message.export_success'));
          } else if (res.message !== '已取消') {
              message.error(t('sidebar.message.export_failed', { error: res.message }));
          }
      } catch (e: any) {
          hide();
          message.error(t('sidebar.message.export_failed', { error: e?.message || String(e) }));
      }
  };

  const handleExportSchemaSQL = async (node: any, includeData: boolean) => {
      const conn = node?.dataRef;
      const dbName = String(conn?.dbName || '').trim();
      const schemaName = String(conn?.schemaName || '').trim();
      if (!conn || !dbName || !schemaName) {
          message.error(t('sidebar.message.schema_export_target_missing'));
          return;
      }
      const hide = message.loading(
          includeData
              ? t('sidebar.message.exporting_schema_backup', { schema: schemaName })
              : t('sidebar.message.exporting_schema_structure', { schema: schemaName }),
          0,
      );
      try {
          const res = await (window as any).go.app.App.ExportSchemaSQL(
              buildRpcConnectionConfig(conn.config, { database: dbName }) as any,
              dbName,
              schemaName,
              includeData,
          );
          hide();
          if (res.success) {
              message.success(t('sidebar.message.export_success'));
          } else if (res.message !== '已取消') {
              message.error(t('sidebar.message.export_failed', { error: res.message }));
          }
      } catch (e: any) {
          hide();
          message.error(t('sidebar.message.export_failed', { error: e?.message || String(e) }));
      }
  };

  const handleExportTablesSQL = async (nodes: any[], includeData: boolean) => {
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0].dataRef;
      const dbName = first.dbName;
      const connId = first.id;
      const allSame = nodes.every(n => n?.dataRef?.id === connId && n?.dataRef?.dbName === dbName);
      if (!allSame) {
          message.error(t('sidebar.message.export_tables_same_database_required'));
          return;
      }

      const tableNames = nodes.map(n => n.dataRef.tableName).filter(Boolean);
      const hide = message.loading(
          includeData
              ? t('sidebar.message.backing_up_selected_tables', { count: tableNames.length })
              : t('sidebar.message.exporting_selected_table_schema', { count: tableNames.length }),
          0,
      );
      try {
          const res = await (window as any).go.app.App.ExportTablesSQL(normalizeConnConfig(first.config), dbName, tableNames, includeData);
          hide();
          if (res.success) {
              message.success(t('sidebar.message.export_success'));
          } else if (res.message !== '已取消') {
              message.error(t('sidebar.message.export_failed', { error: res.message }));
          }
      } catch (e: any) {
          hide();
          message.error(t('sidebar.message.export_failed', { error: e?.message || String(e) }));
      }
  };

  const openBatchOperationModal = async () => {
      // Check if current selected node is database or table
      let connId = '';
      let dbName = '';

      if (selectedNodesRef.current.length > 0) {
          const node = selectedNodesRef.current[0];
          if (node.type === 'database') {
              connId = node.dataRef.id;
              dbName = node.title;
          } else if (node.type === 'table' || node.type === 'view' || node.type === 'materialized-view') {
              connId = node.dataRef.id;
              dbName = node.dataRef.dbName;
          }
      }

      setSelectedConnection(connId);
      setSelectedDatabase(dbName);
      setBatchTables([]);
      setCheckedTableKeys([]);
      setAvailableDatabases([]);
      setBatchFilterKeyword('');
      setBatchFilterType('all');
      setBatchSelectionScope('filtered');

      if (connId) {
          const conn = connections.find(c => c.id === connId);
          if (conn) {
              await loadDatabasesForBatch(conn);
              if (dbName) {
                  await loadTablesForBatch(conn, dbName);
              }
          }
      }

      setIsBatchModalOpen(true);
  };

  const openBatchTableExportWorkbench = () => {
      let connId = '';
      let dbName = '';

      if (selectedNodesRef.current.length > 0) {
          const node = selectedNodesRef.current[0];
          if (node.type === 'connection' && node.dataRef?.config?.type !== 'redis') {
              connId = node.key as string;
          } else if (node.type === 'database') {
              connId = node.dataRef.id;
              dbName = node.title;
          } else if (node.type === 'table' || node.type === 'view' || node.type === 'materialized-view') {
              connId = node.dataRef.id;
              dbName = node.dataRef.dbName;
          }
      }

      addTab(buildBatchTableExportWorkbenchTab({
          connectionId: connId,
          dbName: dbName || undefined,
          title: dbName ? `批量导出 ${dbName} 对象` : '批量导出对象',
      }));
  };

	  const loadDatabasesForBatch = async (conn: SavedConnection) => {
	      const config = {
          ...conn.config,
          port: Number(conn.config.port),
          password: conn.config.password || "",
          database: conn.config.database || "",
          useSSH: conn.config.useSSH || false,
          ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
      };

      const res = await DBGetDatabases(buildRpcConnectionConfig(config) as any);
      if (res.success) {
          const dbRows: any[] = Array.isArray(res.data) ? res.data : [];
          let dbs = dbRows.map((row: any) => {
              const dbName = row.Database || row.database;
              return {
                  title: dbName,
                  key: `${conn.id}-${dbName}`,
                  dbName: dbName
              };
          });

          if (conn.includeDatabases && conn.includeDatabases.length > 0) {
              dbs = dbs.filter(db => conn.includeDatabases!.includes(db.dbName));
          }

          setAvailableDatabases(dbs);
      } else {
          message.error(t('sidebar.message.load_database_list_failed', { error: res.message }));
      }
  };

  const loadTablesForBatch = async (conn: SavedConnection, dbName: string) => {
      setBatchDbContext({ conn, dbName });

      const config = {
          ...conn.config,
          port: Number(conn.config.port),
          password: conn.config.password || "",
          database: conn.config.database || "",
          useSSH: conn.config.useSSH || false,
          ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
      };

      const [res, viewResult] = await Promise.all([
          DBGetTables(buildRpcConnectionConfig(config) as any, dbName),
          loadViews(conn, dbName).catch(() => ({ views: [], supported: false })),
      ]);

      if (!res.success) {
          message.error(t('sidebar.message.load_table_list_failed', { error: res.message }));
          return;
      }

      const tableRows: any[] = Array.isArray(res.data) ? res.data : [];
      const viewRows: SidebarViewMetadataEntry[] = Array.isArray(viewResult.views) ? viewResult.views : [];
      const viewSet = new Set(
          viewRows.flatMap((view) => {
              const names = [view.viewName.toLowerCase()];
              if (view.schemaName && !view.viewName.includes('.')) {
                  names.push(`${view.schemaName}.${view.viewName}`.toLowerCase());
              }
              return names;
          })
      );

      const tableObjects: BatchObjectItem[] = tableRows
          .map((row: any) => Object.values(row)[0] as string)
          .filter((tableName: string) => !viewSet.has(tableName.toLowerCase()))
          .map((tableName: string) => ({
              title: getSidebarTableDisplayName(conn, tableName),
              key: `${conn.id}-${dbName}-table-${tableName}`,
              objectName: tableName,
              objectType: 'table' as const,
              dataRef: { ...conn, tableName, dbName, objectType: 'table' },
          }));

      const viewObjects: BatchObjectItem[] = viewRows.map((view) => {
          const keyName = buildSidebarObjectKeyName(dbName, view.schemaName, view.viewName);
          return {
              title: getSidebarTableDisplayName(conn, view.viewName),
              key: `${conn.id}-${dbName}-view-${keyName}`,
              objectName: view.viewName,
              objectType: 'view' as const,
              dataRef: { ...conn, tableName: view.viewName, schemaName: view.schemaName, dbName, objectType: 'view' },
          };
      });

      tableObjects.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
      viewObjects.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));

      setBatchTables([...tableObjects, ...viewObjects]);
      setCheckedTableKeys([]);
  };

  const handleConnectionChange = async (connId: string) => {
      setSelectedConnection(connId);
      setSelectedDatabase('');
      setBatchTables([]);
      setCheckedTableKeys([]);
      setBatchFilterKeyword('');
      setBatchFilterType('all');
      setBatchSelectionScope('filtered');

      const conn = connections.find(c => c.id === connId);
      if (conn) {
          await loadDatabasesForBatch(conn);
      }
  };

  const handleDatabaseChange = async (dbName: string) => {
      setSelectedDatabase(dbName);
      setBatchFilterKeyword('');
      setBatchFilterType('all');
      setBatchSelectionScope('filtered');

      const conn = connections.find(c => c.id === selectedConnection);
      if (conn && dbName) {
          await loadTablesForBatch(conn, dbName);
      }
  };

  const handleBatchExport = async (mode: BatchTableExportMode) => {
      const selectedObjects = batchTables.filter(t => checkedTableKeys.includes(t.key));
      if (selectedObjects.length === 0) {
          message.warning(t('sidebar.message.select_object_required'));
          return;
      }

      setIsBatchModalOpen(false);

      const { conn, dbName } = batchDbContext;
      const objectNames = selectedObjects.map(t => t.objectName);
      const selectedViewCount = selectedObjects.filter(item => item.objectType === 'view').length;

      const loadingText = mode === 'backup'
          ? t('sidebar.message.backing_up_selected_objects', { count: objectNames.length })
          : mode === 'dataOnly'
              ? t('sidebar.message.exporting_selected_object_data', { count: objectNames.length, format: 'INSERT' })
              : t('sidebar.message.exporting_selected_object_schema', { count: objectNames.length });
      const hide = message.loading(loadingText, 0);
      try {
          const app = (window as any).go.app.App;
          const res = mode === 'dataOnly'
              ? await app.ExportTablesDataSQL(normalizeConnConfig(conn.config), dbName, objectNames)
              : await app.ExportTablesSQL(normalizeConnConfig(conn.config), dbName, objectNames, mode === 'backup');
          hide();
          if (res.success) {
              if (mode !== 'schema' && selectedViewCount > 0) {
                  message.success(t('sidebar.message.export_success_skipped_views', { count: selectedViewCount }));
              } else {
                  message.success(t('sidebar.message.export_success'));
              }
          } else if (res.message !== '已取消') {
              message.error(t('sidebar.message.export_failed', { error: res.message }));
          }
      } catch (e: any) {
          hide();
          message.error(t('sidebar.message.export_failed', { error: e?.message || String(e) }));
      }
  };

  const handleBatchClear = async () => {
      const selectedObjects = batchTables.filter(t => checkedTableKeys.includes(t.key));
      if (selectedObjects.length === 0) {
          message.warning(t('sidebar.message.select_object_required'));
          return;
      }

      const { conn, dbName } = batchDbContext;
      const objectNames = selectedObjects.map(t => t.objectName);

      const ok = await new Promise<boolean>((resolve) => {
          Modal.confirm({
              title: t('sidebar.modal.confirm_clear_selected_tables.title'),
              content: t('sidebar.modal.confirm_clear_selected_tables.content', {
                  connection: conn.name,
                  database: dbName,
              }),
              okText: t('sidebar.action.continue'),
              cancelText: t('sidebar.action.cancel'),
              onOk: () => resolve(true),
              onCancel: () => resolve(false),
          });
      });
      if (!ok) return;

      setIsBatchModalOpen(false);
      const hide = message.loading(t('sidebar.message.clearing_selected_tables', { count: objectNames.length }), 0);
      const startTime = Date.now();
      try {
          const app = (window as any).go.app.App;
          const res = await app.ClearTables(normalizeConnConfig(conn.config), dbName, objectNames);
          hide();
          const duration = Date.now() - startTime;
          if (res.success) {
              message.success(t('sidebar.message.clear_success'));
              // 构造 SQL 日志
              let logSql = `/* Clear Tables (${objectNames.length} tables) */\n`;
              if (res.data && res.data.executedSQLs && Array.isArray(res.data.executedSQLs)) {
                  logSql += res.data.executedSQLs.join(';\n') + ';';
              } else {
                  logSql += objectNames.map(name => name).join('; ');
              }
              addSqlLog({
                  id: Date.now().toString(),
                  timestamp: Date.now(),
                  sql: logSql,
                  status: 'success',
                  duration,
                  message: res.message,
                  dbName,
                  affectedRows: res.data?.count || 0
              });
          } else if (res.message !== '已取消') {
              message.error(t('sidebar.message.clear_failed', { error: res.message }));
              // 记录失败的日志
              let logSql = `/* Clear Tables (${objectNames.length} tables) - FAILED */\n`;
              if (res.data && res.data.executedSQLs && Array.isArray(res.data.executedSQLs)) {
                  logSql += res.data.executedSQLs.join(';\n') + ';';
              } else {
                  logSql += objectNames.map(name => name).join('; ');
              }
              addSqlLog({
                  id: Date.now().toString(),
                  timestamp: Date.now(),
                  sql: logSql,
                  status: 'error',
                  duration,
                  message: res.message,
                  dbName
              });
          }
      } catch (e: any) {
          const duration = Date.now() - startTime;
          hide();
          const errMsg = e?.message || String(e);
          message.error(t('sidebar.message.clear_failed', { error: errMsg }));
          // 记录异常的日志
          let logSql = `/* Clear Tables (${objectNames.length} tables) - ERROR */\n`;
          logSql += objectNames.map(name => name).join('; ');
          addSqlLog({
              id: Date.now().toString(),
              timestamp: Date.now(),
              sql: logSql,
              status: 'error',
              duration,
              message: errMsg,
              dbName
          });
      }
  };

  const handleCheckAll = (checked: boolean) => {
      if (batchSelectionScope === 'all') {
          setCheckedTableKeys(checked ? allBatchObjectKeys : []);
          return;
      }
      if (filteredBatchObjectKeys.length === 0) {
          return;
      }
      if (checked) {
          setCheckedTableKeys(prev => {
              const nextSet = new Set(prev);
              filteredBatchObjectKeys.forEach((key) => nextSet.add(key));
              return allBatchObjectKeys.filter((key) => nextSet.has(key));
          });
          return;
      }
      const filteredKeySet = new Set(filteredBatchObjectKeys);
      setCheckedTableKeys(prev => prev.filter((key) => !filteredKeySet.has(key)));
  };

  const handleInvertSelection = () => {
      if (batchSelectionScope === 'all') {
          setCheckedTableKeys(prev => allBatchObjectKeys.filter((key) => !prev.includes(key)));
          return;
      }
      if (filteredBatchObjectKeys.length === 0) {
          return;
      }
      setCheckedTableKeys(prev => {
          const nextSet = new Set(prev);
          filteredBatchObjectKeys.forEach((key) => {
              if (nextSet.has(key)) {
                  nextSet.delete(key);
              } else {
                  nextSet.add(key);
              }
          });
          return allBatchObjectKeys.filter((key) => nextSet.has(key));
      });
  };

  const openBatchDatabaseModal = async () => {
      // Check if current selected node is connection or database
      let connId = '';

      if (selectedNodesRef.current.length > 0) {
          const node = selectedNodesRef.current[0];
          if (node.type === 'connection' && node.dataRef?.config?.type !== 'redis') {
              connId = node.key as string;
          } else if (node.type === 'database') {
              connId = node.dataRef.id;
          } else if (node.type === 'table') {
              connId = node.dataRef.id;
          }
      }

      setSelectedDbConnection(connId);
      setBatchDatabases([]);
      setCheckedDbKeys([]);

      if (connId) {
          const conn = connections.find(c => c.id === connId);
          if (conn) {
              await loadDatabasesForDbBatch(conn);
          }
      }

      setIsBatchDbModalOpen(true);
  };

  const openBatchDatabaseExportWorkbench = () => {
      let connId = '';

      if (selectedNodesRef.current.length > 0) {
          const node = selectedNodesRef.current[0];
          if (node.type === 'connection' && node.dataRef?.config?.type !== 'redis') {
              connId = node.key as string;
          } else if (node.type === 'database' || node.type === 'table' || node.type === 'view' || node.type === 'materialized-view') {
              connId = node.dataRef.id;
          }
      }

      addTab(buildBatchDatabaseExportWorkbenchTab({
          connectionId: connId,
          title: '批量导出库',
      }));
  };

	  const loadDatabasesForDbBatch = async (conn: SavedConnection) => {
	      setBatchConnContext(conn);

	      const config = {
          ...conn.config,
          port: Number(conn.config.port),
          password: conn.config.password || "",
          database: conn.config.database || "",
          useSSH: conn.config.useSSH || false,
          ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
      };

      const res = await DBGetDatabases(buildRpcConnectionConfig(config) as any);
      if (res.success) {
          const dbRows: any[] = Array.isArray(res.data) ? res.data : [];
          let dbs = dbRows.map((row: any) => {
              const dbName = row.Database || row.database;
              return {
                  title: dbName,
                  key: `${conn.id}-${dbName}`,
                  dbName: dbName,
                  dataRef: { ...conn, dbName }
              };
          });

          if (conn.includeDatabases && conn.includeDatabases.length > 0) {
              dbs = dbs.filter(db => conn.includeDatabases!.includes(db.dbName));
          }

          setBatchDatabases(dbs);
          setCheckedDbKeys([]);
      } else {
          message.error(t('sidebar.message.load_database_list_failed', { error: res.message }));
      }
  };

  const handleDbConnectionChange = async (connId: string) => {
      setSelectedDbConnection(connId);

      const conn = connections.find(c => c.id === connId);
      if (conn) {
          await loadDatabasesForDbBatch(conn);
      }
  };

  const handleBatchDbExport = async (includeData: boolean) => {
      const selectedDbs = batchDatabases.filter(db => checkedDbKeys.includes(db.key));
      if (selectedDbs.length === 0) {
          message.warning(t('sidebar.message.select_database_required'));
          return;
      }

      setIsBatchDbModalOpen(false);

      for (const db of selectedDbs) {
          const hide = message.loading(
              includeData
                  ? t('sidebar.message.exporting_database_backup', { database: db.dbName })
                  : t('sidebar.message.exporting_database_schema', { database: db.dbName }),
              0,
          );
          try {
              const res = await (window as any).go.app.App.ExportDatabaseSQL(normalizeConnConfig(batchConnContext.config), db.dbName, includeData);
              hide();
              if (res.success) {
                  message.success(t('sidebar.message.database_export_success', { database: db.dbName }));
              } else if (res.message !== '已取消') {
                  message.error(t('sidebar.message.database_export_failed', { database: db.dbName, error: res.message }));
                  break;
              } else {
                  break; // User cancelled
              }
          } catch (e: any) {
              hide();
              message.error(t('sidebar.message.database_export_failed', { database: db.dbName, error: e?.message || String(e) }));
              break;
          }
      }
  };

  const handleCheckAllDb = (checked: boolean) => {
      if (checked) {
          setCheckedDbKeys(batchDatabases.map(db => db.key));
      } else {
          setCheckedDbKeys([]);
      }
  };

  const handleInvertSelectionDb = () => {
      const allKeys = batchDatabases.map(db => db.key);
      const newChecked = allKeys.filter(k => !checkedDbKeys.includes(k));
      setCheckedDbKeys(newChecked);
  };

  const handleRunSQLFile = async (node: any) => {
      const res = await OpenSQLFile();
      if (res.success) {
          const data = normalizeSQLFileDialogData(res.data);
          // 大文件：后端返回文件路径，走流式执行
          if (data.isLargeFile) {
              const connId = node.type === 'connection' ? node.key : node.dataRef?.id;
              const dbName = node.dataRef?.dbName || '';
              const conn = connections.find(c => c.id === connId);
              if (!conn) {
                  message.error(t('sidebar.message.connection_config_not_found'));
                  return;
              }
              startSQLFileExecution(conn.config, dbName, data.filePath, data.fileSizeMB || '');
              return;
          }
          // 小文件：加载到编辑器
          const { dbName, id } = node.dataRef;
          const connectionId = node.type === 'connection' ? String(node.key) : String(id || node.dataRef.id || '');
          addTab({
              id: data.filePath ? buildExternalSQLTabId(connectionId, dbName || '', data.filePath) : `query-${Date.now()}`,
              title: data.fileName || t('sidebar.sql_file_exec.title'),
              type: 'query',
              connectionId,
              dbName: dbName,
              query: data.content,
              filePath: data.filePath || undefined,
          });
      } else if (res.message !== '已取消') {
          message.error(t('sidebar.message.read_file_failed', { error: res.message }));
      }
  };

  const handleOpenSQLFileFromToolbar = async () => {
      const ctx = useStore.getState().activeContext;
      if (!ctx?.connectionId) {
          message.warning(t('sidebar.message.select_connection_or_database_first'));
          return;
      }
      const res = await OpenSQLFile();
      if (res.success) {
          const data = normalizeSQLFileDialogData(res.data);
          // 大文件：后端流式执行
          if (data.isLargeFile) {
              const conn = connections.find(c => c.id === ctx.connectionId);
              if (!conn) {
                  message.error(t('sidebar.message.connection_config_not_found'));
                  return;
              }
              startSQLFileExecution(conn.config, ctx.dbName || '', data.filePath, data.fileSizeMB || '');
              return;
          }
          // 小文件
          addTab({
              id: data.filePath ? buildExternalSQLTabId(ctx.connectionId, ctx.dbName || '', data.filePath) : `query-${Date.now()}`,
              title: data.fileName || t('sidebar.sql_file_exec.title'),
              type: 'query',
              connectionId: ctx.connectionId,
              dbName: ctx.dbName || undefined,
              query: data.content,
              filePath: data.filePath || undefined,
          });
      } else if (res.message !== '已取消') {
          message.error(t('sidebar.message.read_file_failed', { error: res.message }));
      }
  };

  // SQL 文件流式执行状态
  const [sqlFileExecState, setSqlFileExecState] = useState<{
      open: boolean;
      jobId: string;
      fileSizeMB: string;
      status: SQLFileExecutionStatus;
      executed: number;
      failed: number;
      total: number;
      percent: number;
      currentSQL: string;
      resultMessage: string;
  }>({
      open: false, jobId: '', fileSizeMB: '', status: 'running',
      executed: 0, failed: 0, total: 0, percent: 0, currentSQL: '', resultMessage: ''
  });

  const startSQLFileExecution = (config: any, dbName: string, filePath: string, fileSizeMB: string) => {
      const jobId = `sqlfile-${Date.now()}`;
      setSqlFileExecState({
          open: true, jobId, fileSizeMB, status: 'running',
          executed: 0, failed: 0, total: 0, percent: 0, currentSQL: '', resultMessage: ''
      });

      // 监听进度事件
      const offProgress = EventsOn('sqlfile:progress', (event: any) => {
          if (!event || event.jobId !== jobId) return;
          setSqlFileExecState(prev => ({
              ...prev,
              status: event.status || prev.status,
              executed: typeof event.executed === 'number' ? event.executed : prev.executed,
              failed: typeof event.failed === 'number' ? event.failed : prev.failed,
              total: typeof event.total === 'number' ? event.total : prev.total,
              percent: typeof event.percent === 'number' ? Math.min(100, event.percent) : prev.percent,
              currentSQL: typeof event.currentSQL === 'string' ? event.currentSQL : prev.currentSQL,
          }));
      });

      // 异步执行
      ExecuteSQLFile(config, dbName, filePath, jobId).then(res => {
          offProgress();
          setSqlFileExecState(prev => ({
              ...prev,
              status: res.success ? 'done' : (prev.status === 'cancelled' ? 'cancelled' : 'error'),
              percent: 100,
              resultMessage: res.message || '',
          }));
      }).catch(err => {
          offProgress();
          setSqlFileExecState(prev => ({
              ...prev,
              status: 'error',
              resultMessage: String(err?.message || err),
          }));
      });
  };

  const refreshDatabaseNode = async (dbNodeKey: string) => {
      if (!dbNodeKey) {
          return;
      }
      const dbNode = findTreeNodeByKey(treeData, dbNodeKey);
      if (dbNode && dbNode.type === 'database') {
          await loadTables(dbNode);
      }
  };

  const normalizeExternalSQLFileName = (rawName: unknown): string => {
      const name = String(rawName || '').trim();
      if (!name) return '';
      return /\.sql$/i.test(name) ? name : `${name}.sql`;
  };

  const normalizeExternalSQLDirectoryName = (rawName: unknown): string => {
      return String(rawName || '').trim();
  };

  const getExternalSQLParentDirectoryPath = (node: any): string => {
      const path = String(node?.dataRef?.path || '').trim();
      if (node?.type === 'external-sql-directory' || node?.type === 'external-sql-folder') {
          return path;
      }
      if (node?.type === 'external-sql-file') {
          const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
          return index > 0 ? path.slice(0, index) : '';
      }
      return '';
  };

  const resolveExternalSQLExecutionContext = (): { connectionId: string; dbName: string } => {
      const activeStoreContext = useStore.getState().activeContext;
      const selectedConnectionId = selectedNodesRef.current
          .map((node) => resolveSidebarNodeConnectionId(node, connectionIds))
          .find(Boolean) || '';
      return {
          connectionId: String(
              activeStoreContext?.connectionId
              || activeTab?.connectionId
              || selectedConnectionId
              || '',
          ).trim(),
          dbName: String(
              activeStoreContext?.dbName
              || activeTab?.dbName
              || '',
          ).trim(),
      };
  };

  const normalizeSQLFileDialogData = (data: unknown): { content: string; filePath: string; fileName: string; isLargeFile: boolean; fileSizeMB?: string } => {
      if (data && typeof data === 'object') {
          const payload = data as Record<string, unknown>;
          const filePath = String(payload.filePath || '').trim();
          return {
              content: String(payload.content ?? ''),
              filePath,
              fileName: String(payload.name || filePath.split(/[\\/]/).filter(Boolean).pop() || t('sidebar.sql_file_exec.title')).trim(),
              isLargeFile: payload.isLargeFile === true,
              fileSizeMB: String(payload.fileSizeMB || '').trim() || undefined,
          };
      }
      return {
          content: String(data || ''),
          filePath: '',
          fileName: t('sidebar.sql_file_exec.title'),
          isLargeFile: false,
      };
  };

  const openExternalSQLFile = async (fileNode: any) => {
      const fileContext = {
          connectionId: String(fileNode?.dataRef?.connectionId || '').trim(),
          dbName: String(fileNode?.dataRef?.dbName || '').trim(),
      };
      const fallbackContext = resolveExternalSQLExecutionContext();
      const connectionId = fileContext.connectionId || fallbackContext.connectionId;
      const dbName = fileContext.dbName || fallbackContext.dbName;
      const filePath = String(fileNode?.dataRef?.path || '').trim();
      const fileName = String(fileNode?.dataRef?.name || fileNode?.title || t('sidebar.sql_file.default_name')).trim() || t('sidebar.sql_file.default_name');
      if (!filePath) {
          message.error(t('sidebar.message.sql_file_path_incomplete'));
          return;
      }

      const res = await ReadSQLFile(filePath);
      if (!res.success) {
          if (res.message !== '已取消') {
              message.error(t('sidebar.message.read_sql_file_failed', { error: res.message }));
          }
          return;
      }

      const data = res.data;
      if (data && typeof data === 'object' && data.isLargeFile) {
          if (!connectionId) {
              message.warning(t('sidebar.message.select_host_before_large_sql_file'));
              return;
          }
          const conn = connections.find((item) => item.id === connectionId);
          if (!conn) {
              message.error(t('sidebar.message.connection_config_not_found'));
              return;
          }
          startSQLFileExecution(conn.config, dbName, data.filePath, data.fileSizeMB);
          return;
      }

      addTab({
          id: buildExternalSQLTabId(connectionId, dbName, filePath),
          title: fileName,
          type: 'query',
          connectionId,
          dbName: dbName || undefined,
          query: String(data || ''),
          filePath,
      });
  };

  const openCreateExternalSQLFileModal = (node: any) => {
      const directoryPath = getExternalSQLParentDirectoryPath(node);
      if (!directoryPath) {
          message.error(t('sidebar.message.external_sql_file_parent_missing'));
          return;
      }
      setExternalSQLFileModalMode('create');
      setExternalSQLFileTarget(node);
      externalSQLFileForm.setFieldsValue({ name: 'new-query.sql' });
      setIsExternalSQLFileModalOpen(true);
  };

  const openRenameExternalSQLFileModal = (node: any) => {
      const currentName = String(node?.dataRef?.name || node?.title || '').trim();
      if (!currentName) {
          message.error(t('sidebar.message.external_sql_file_rename_target_missing'));
          return;
      }
      setExternalSQLFileModalMode('rename');
      setExternalSQLFileTarget(node);
      externalSQLFileForm.setFieldsValue({ name: currentName });
      setIsExternalSQLFileModalOpen(true);
  };

  const openCreateExternalSQLDirectoryModal = (node: any) => {
      const directoryPath = getExternalSQLParentDirectoryPath(node);
      if (!directoryPath) {
          message.error(t('sidebar.message.external_sql_directory_parent_missing'));
          return;
      }
      setExternalSQLFileModalMode('create-directory');
      setExternalSQLFileTarget(node);
      externalSQLFileForm.setFieldsValue({ name: 'new-folder' });
      setIsExternalSQLFileModalOpen(true);
  };

  const openRenameExternalSQLDirectoryModal = (node: any) => {
      const currentName = String(node?.dataRef?.name || node?.title || '').trim();
      if (!currentName) {
          message.error(t('sidebar.message.external_sql_directory_rename_target_missing'));
          return;
      }
      setExternalSQLFileModalMode('rename-directory');
      setExternalSQLFileTarget(node);
      externalSQLFileForm.setFieldsValue({ name: currentName });
      setIsExternalSQLFileModalOpen(true);
  };

  const handleExternalSQLFileModalOk = async () => {
      try {
          const values = await externalSQLFileForm.validateFields();
          const isDirectoryMode = isExternalSQLDirectoryModalMode(externalSQLFileModalMode);
          const name = isDirectoryMode
              ? normalizeExternalSQLDirectoryName(values.name)
              : normalizeExternalSQLFileName(values.name);
          if (!name) {
              message.error(t(isDirectoryMode ? 'sidebar.message.sql_directory_name_required' : 'sidebar.message.sql_file_name_required'));
              return;
          }

          if (externalSQLFileModalMode === 'create') {
              const directoryPath = getExternalSQLParentDirectoryPath(externalSQLFileTarget);
              if (!directoryPath) {
                  message.error(t('sidebar.message.external_sql_file_parent_missing'));
                  return;
              }
              const res = await CreateSQLFile(directoryPath, name);
              if (!res.success) {
                  message.error(t('sidebar.message.create_sql_file_failed', { error: res.message }));
                  return;
              }
              await refreshGlobalExternalSQLRootNode(false);
              message.success(t('sidebar.message.sql_file_created'));
          } else if (externalSQLFileModalMode === 'rename') {
              const filePath = String(externalSQLFileTarget?.dataRef?.path || '').trim();
              if (!filePath) {
                  message.error(t('sidebar.message.external_sql_file_rename_target_missing'));
                  return;
              }
              const res = await RenameSQLFile(filePath, name);
              if (!res.success) {
                  message.error(t('sidebar.message.rename_sql_file_failed', { error: res.message }));
                  return;
              }
              await refreshGlobalExternalSQLRootNode(false);
              message.success(t('sidebar.message.sql_file_renamed'));
          } else if (externalSQLFileModalMode === 'create-directory') {
              const directoryPath = getExternalSQLParentDirectoryPath(externalSQLFileTarget);
              if (!directoryPath) {
                  message.error(t('sidebar.message.external_sql_directory_parent_missing'));
                  return;
              }
              const res = await CreateSQLDirectory(directoryPath, name);
              if (!res.success) {
                  message.error(t('sidebar.message.create_sql_directory_failed', { error: res.message }));
                  return;
              }
              await refreshGlobalExternalSQLRootNode(false);
              message.success(t('sidebar.message.sql_directory_created'));
          } else {
              const directoryPath = String(externalSQLFileTarget?.dataRef?.path || '').trim();
              if (!directoryPath) {
                  message.error(t('sidebar.message.external_sql_directory_rename_target_missing'));
                  return;
              }
              const res = await RenameSQLDirectory(directoryPath, name);
              if (!res.success) {
                  message.error(t('sidebar.message.rename_sql_directory_failed', { error: res.message }));
                  return;
              }

              if (externalSQLFileTarget?.type === 'external-sql-directory') {
                  const payload = (res.data && typeof res.data === 'object') ? res.data as Record<string, unknown> : {};
                  const nextPath = String(payload.directoryPath || payload.path || '').trim();
                  const nextName = String(payload.name || name).trim();
                  const oldDirectoryId = String(externalSQLFileTarget?.dataRef?.id || '').trim();
                  if (!nextPath || !oldDirectoryId) {
                      message.error(t('sidebar.message.external_sql_directory_rename_sync_failed'));
                      await refreshGlobalExternalSQLRootNode(false);
                      return;
                  }
                  const nextDirectory: ExternalSQLDirectory = {
                      id: buildExternalSQLDirectoryId('', '', nextPath),
                      name: nextName || nextPath.split(/[\\/]/).filter(Boolean).pop() || t('sidebar.sql_directory.default_name'),
                      path: nextPath,
                      createdAt: Number(externalSQLFileTarget?.dataRef?.createdAt) || Date.now(),
                  };
                  deleteExternalSQLDirectory(oldDirectoryId);
                  saveExternalSQLDirectory(nextDirectory);
                  const nextDirectories = [
                      ...externalSQLDirectories.filter((item) => item.id !== oldDirectoryId),
                      nextDirectory,
                  ];
                  await refreshGlobalExternalSQLRootNode(false, nextDirectories);
              } else {
                  await refreshGlobalExternalSQLRootNode(false);
              }
              message.success(t('sidebar.message.sql_directory_renamed'));
          }

          setIsExternalSQLFileModalOpen(false);
          setExternalSQLFileTarget(null);
          externalSQLFileForm.resetFields();
      } catch {
          // Validate failed
      }
  };

  const handleDeleteExternalSQLFile = (node: any) => {
      const filePath = String(node?.dataRef?.path || '').trim();
      const fileName = String(node?.dataRef?.name || node?.title || t('sidebar.sql_file.default_name')).trim();
      if (!filePath) {
          message.error(t('sidebar.message.external_sql_file_delete_target_missing'));
          return;
      }

      Modal.confirm({
          title: t('sidebar.modal.confirm_delete_sql_file.title'),
          content: t('sidebar.modal.confirm_delete_sql_file.content', { name: fileName }),
          okText: t('sidebar.action.delete'),
          cancelText: t('sidebar.action.cancel'),
          okButtonProps: { danger: true },
          onOk: async () => {
              const res = await DeleteSQLFile(filePath);
              if (!res.success) {
                  message.error(t('sidebar.message.delete_sql_file_failed', { error: res.message }));
                  return;
              }
              await refreshGlobalExternalSQLRootNode(false);
              message.success(t('sidebar.message.sql_file_deleted'));
          },
      });
  };

  const handleDeleteExternalSQLDirectory = (node: any) => {
      const directoryPath = String(node?.dataRef?.path || '').trim();
      const directoryName = String(node?.dataRef?.name || node?.title || t('sidebar.sql_directory.default_name')).trim();
      if (!directoryPath) {
          message.error(t('sidebar.message.external_sql_directory_delete_target_missing'));
          return;
      }

      Modal.confirm({
          title: t('sidebar.modal.confirm_delete_sql_directory.title'),
          content: t('sidebar.modal.confirm_delete_sql_directory.content', { name: directoryName }),
          okText: t('sidebar.action.delete'),
          cancelText: t('sidebar.action.cancel'),
          okButtonProps: { danger: true },
          onOk: async () => {
              const res = await DeleteSQLDirectory(directoryPath);
              if (!res.success) {
                  message.error(t('sidebar.message.delete_sql_directory_failed', { error: res.message }));
                  return;
              }

              if (node?.type === 'external-sql-directory') {
                  const directoryId = String(node?.dataRef?.id || '').trim();
                  if (directoryId) {
                      deleteExternalSQLDirectory(directoryId);
                      const nextDirectories = externalSQLDirectories.filter((item) => item.id !== directoryId);
                      await refreshGlobalExternalSQLRootNode(false, nextDirectories);
                  } else {
                      await refreshGlobalExternalSQLRootNode(false);
                  }
              } else {
                  await refreshGlobalExternalSQLRootNode(false);
              }
              message.success(t('sidebar.message.sql_directory_deleted'));
          },
      });
  };

  const handleAddExternalSQLDirectory = async (node: any) => {
      const currentDirectory = externalSQLDirectories[0]?.path || '';
      const selection = await SelectSQLDirectory(currentDirectory);
      if (!selection.success) {
          if (selection.message !== '已取消') {
              message.error(t('sidebar.message.select_sql_directory_failed', { error: selection.message }));
          }
          return;
      }

      const payload = (selection.data && typeof selection.data === 'object') ? selection.data as Record<string, unknown> : {};
      const path = String(payload.path || '').trim();
      const name = String(payload.name || '').trim();
      if (!path) {
          message.error(t('sidebar.message.sql_directory_path_invalid'));
          return;
      }

      const directoryId = buildExternalSQLDirectoryId('', '', path);
      const nextDirectory: ExternalSQLDirectory = {
          id: directoryId,
          name: name || path.split(/[\\/]/).filter(Boolean).pop() || t('sidebar.sql_directory.default_name'),
          path,
          createdAt: Date.now(),
      };
      saveExternalSQLDirectory(nextDirectory);

      const nextDirectories = [
          ...externalSQLDirectories.filter((item) => item.path.replace(/\\/g, '/').toLowerCase() !== path.replace(/\\/g, '/').toLowerCase()),
          nextDirectory,
      ];
      setExpandedKeys((prev) => Array.from(new Set([...prev, 'external-sql-root'])));
      setAutoExpandParent(false);
      await refreshGlobalExternalSQLRootNode(false, nextDirectories);
      message.success(t('sidebar.message.external_sql_directory_added'));
  };

  const handleRemoveExternalSQLDirectory = async (node: any) => {
      const directoryId = String(node?.dataRef?.id || '').trim();
      if (!directoryId) {
          message.error(t('sidebar.message.external_sql_directory_not_found'));
          return;
      }
      deleteExternalSQLDirectory(directoryId);
      const nextDirectories = externalSQLDirectories.filter((item) => item.id !== directoryId);
      await refreshGlobalExternalSQLRootNode(false, nextDirectories);
      message.success(t('sidebar.message.external_sql_directory_removed'));
  };

  const handleRefreshExternalSQLDirectory = async (node: any) => {
      void node;
      await refreshGlobalExternalSQLRootNode(true);
      message.success(t('sidebar.message.external_sql_directory_refreshed'));
  };

  const handleCreateDatabase = async () => {
      try {
          const values = await createDbForm.validateFields();
          const conn = targetConnection.dataRef;
          const config = { 
              ...conn.config, 
              port: Number(conn.config.port),
              password: conn.config.password || "",
              database: (conn.config.type === 'oracle' || conn.config.type === 'dameng') ? (conn.config.database || "") : "",
              useSSH: conn.config.useSSH || false,
              ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
          };
          
          const res = await CreateDatabase(buildRpcConnectionConfig(config) as any, values.name);
          if (res.success) {
              message.success("数据库创建成功");
              setIsCreateDbModalOpen(false);
              createDbForm.resetFields();
              // Refresh node
              loadDatabases(targetConnection);
          } else {
              message.error("创建失败: " + res.message);
          }
      } catch (e) {
          // Validate failed
      }
  };

  const openCreateSchemaModal = (node: any) => {
      const dialect = getMetadataDialect(node?.dataRef as SavedConnection);
      if (!isPostgresSchemaDialect(dialect)) {
          message.warning(t('sidebar.message.schema_create_unsupported'));
          return;
      }
      setCreateSchemaTarget(node);
      createSchemaForm.resetFields();
      setIsCreateSchemaModalOpen(true);
  };

  const handleCreateSchema = async () => {
      try {
          const values = await createSchemaForm.validateFields();
          const node = createSchemaTarget;
          const conn = node?.dataRef;
          const dbName = String(conn?.dbName || node?.title || '').trim();
          if (!conn || !dbName) {
              message.error(t('sidebar.message.schema_target_missing'));
              return;
          }

          const res = await CreateSchema(buildRpcConnectionConfig(conn.config, { database: dbName }) as any, dbName, values.name);
          if (res.success) {
              message.success(t('sidebar.message.schema_created'));
              setIsCreateSchemaModalOpen(false);
              setCreateSchemaTarget(null);
              createSchemaForm.resetFields();
              await loadTables(node);
          } else {
              message.error(t('sidebar.message.operation_create_failed', { error: res.message }));
          }
      } catch (e) {
          // Validate failed
      }
  };

  const openRenameSchemaModal = (node: any) => {
      const dialect = getMetadataDialect(node?.dataRef as SavedConnection);
      const schemaName = String(node?.dataRef?.schemaName || '').trim();
      if (!isPostgresSchemaDialect(dialect) || !schemaName) {
          message.warning('当前节点不支持通过此入口编辑模式');
          return;
      }
      setRenameSchemaTarget(node);
      renameSchemaForm.setFieldsValue({ newName: schemaName });
      setIsRenameSchemaModalOpen(true);
  };

  const handleRenameSchema = async () => {
      try {
          const values = await renameSchemaForm.validateFields();
          const node = renameSchemaTarget;
          const conn = node?.dataRef;
          const dbName = String(conn?.dbName || '').trim();
          const oldSchemaName = String(conn?.schemaName || '').trim();
          const newSchemaName = String(values?.newName || '').trim();
          if (!conn || !dbName || !oldSchemaName || !newSchemaName) {
              message.error('未找到目标模式，无法编辑');
              return;
          }
          if (oldSchemaName === newSchemaName) {
              message.warning('新旧模式名称相同，无需修改');
              return;
          }

          const res = await (window as any).go.app.App.RenameSchema(
              buildRpcConnectionConfig(conn.config, { database: dbName }) as any,
              dbName,
              oldSchemaName,
              newSchemaName,
          );
          if (res.success) {
              message.success('模式重命名成功');
              const schemaKeyPrefix = `${conn.id}-${dbName}-schema-${oldSchemaName || 'default'}`;
              setExpandedKeys(prev => prev.filter(k => !k.toString().startsWith(schemaKeyPrefix)));
              setLoadedKeys(prev => prev.filter(k => !k.toString().startsWith(schemaKeyPrefix)));
              await loadTables(getDatabaseNodeRef(conn, dbName));
              setIsRenameSchemaModalOpen(false);
              setRenameSchemaTarget(null);
              renameSchemaForm.resetFields();
          } else {
              message.error('编辑失败: ' + res.message);
          }
      } catch (e) {
          // Validate failed
      }
  };

  const handleDeleteSchema = (node: any) => {
      const conn = node?.dataRef;
      const dbName = String(conn?.dbName || '').trim();
      const schemaName = String(conn?.schemaName || '').trim();
      if (!conn || !dbName || !schemaName) {
          message.error('未找到目标模式，无法删除');
          return;
      }
      Modal.confirm({
          title: '确认删除模式',
          content: `确定删除模式 "${schemaName}" 吗？这将删除该模式及其中所有对象，操作不可恢复。`,
          okButtonProps: { danger: true },
          onOk: async () => {
              const res = await (window as any).go.app.App.DropSchema(
                  buildRpcConnectionConfig(conn.config, { database: dbName }) as any,
                  dbName,
                  schemaName,
              );
              if (res.success) {
                  message.success('模式删除成功');
                  const schemaKeyPrefix = `${conn.id}-${dbName}-schema-${schemaName || 'default'}`;
                  setExpandedKeys(prev => prev.filter(k => !k.toString().startsWith(schemaKeyPrefix)));
                  setLoadedKeys(prev => prev.filter(k => !k.toString().startsWith(schemaKeyPrefix)));
                  await loadTables(getDatabaseNodeRef(conn, dbName));
              } else {
                  message.error('删除失败: ' + res.message);
              }
          }
      });
  };

  const buildRuntimeConfig = (conn: any, overrideDatabase?: string, clearDatabase: boolean = false) => {
      return buildRpcConnectionConfig(conn.config, {
          database: resolveSidebarRuntimeDatabase(
              conn?.config?.type,
              conn?.config?.driver,
              conn?.config?.database,
              overrideDatabase,
              clearDatabase,
              conn?.config?.oceanBaseProtocol,
          ),
      });
  };

  const buildJVMRuntimeConfig = (conn: SavedConnection & { dbName?: string }, providerMode: string) => {
      const sourceJVM = conn.config.jvm || {};
      return buildRpcConnectionConfig(conn.config, {
          database: '',
          jvm: {
              ...sourceJVM,
              preferredMode: providerMode as 'jmx' | 'endpoint' | 'agent',
              allowedModes: [providerMode as 'jmx' | 'endpoint' | 'agent'],
          },
      });
  };

  const openJVMOverviewTab = (conn: SavedConnection, providerMode: string) => {
      addTab({
          id: `jvm-overview-${conn.id}-${providerMode}`,
          title: buildJVMTabTitle(conn.name, 'overview', providerMode),
          type: 'jvm-overview',
          connectionId: conn.id,
          providerMode: providerMode as 'jmx' | 'endpoint' | 'agent',
      });
  };

  const openJVMMonitoringTab = (conn: SavedConnection, providerMode: string) => {
      addTab({
          id: `jvm-monitoring-${conn.id}-${providerMode}`,
          title: buildJVMTabTitle(conn.name, 'monitoring', providerMode),
          type: 'jvm-monitoring',
          connectionId: conn.id,
          providerMode: providerMode as 'jmx' | 'endpoint' | 'agent',
      });
  };

  const buildJVMDiagnosticTreeNodes = (conn: SavedConnection): TreeNode[] => {
      const descriptor = buildJVMDiagnosticActionDescriptor(conn.id, conn.config.jvm?.diagnostic);
      if (!descriptor) {
          return [];
      }
      return [{
          title: descriptor.title,
          key: descriptor.key,
          icon: <DashboardOutlined />,
          type: 'jvm-diagnostic',
          dataRef: {
              ...conn,
              diagnosticTransport: descriptor.transport,
          },
          isLeaf: true,
      }];
  };

  const openJVMResourceTab = (conn: SavedConnection, providerMode: string, resourcePath: string, resourceKind?: string) => {
      const trimmedResourcePath = String(resourcePath || '').trim();
      addTab({
          id: `jvm-resource-${conn.id}-${providerMode}-${encodeURIComponent(trimmedResourcePath)}`,
          title: trimmedResourcePath
              ? `${buildJVMTabTitle(conn.name, 'resource', providerMode)} · ${trimmedResourcePath}`
              : buildJVMTabTitle(conn.name, 'resource', providerMode),
          type: 'jvm-resource',
          connectionId: conn.id,
          providerMode: providerMode as 'jmx' | 'endpoint' | 'agent',
          resourcePath: trimmedResourcePath,
          resourceKind,
      });
  };

  const openJVMDiagnosticTab = (conn: SavedConnection) => {
      const transport = conn.config.jvm?.diagnostic?.transport || 'agent-bridge';
      addTab({
          id: `jvm-diagnostic-${conn.id}`,
          title: buildJVMTabTitle(conn.name, 'diagnostic', transport),
          type: 'jvm-diagnostic',
          connectionId: conn.id,
      });
  };

  const getConnectionNodeRef = (connRef: any) => {
      const latestConn = connections.find(c => c.id === connRef.id);
      return { key: connRef.id, dataRef: latestConn || connRef };
  };

  const getDatabaseNodeRef = (connRef: any, dbName: string) => {
      const latestConn = connections.find(c => c.id === connRef.id);
      return {
          key: `${connRef.id}-${dbName}`,
          dataRef: { ...(latestConn || connRef), dbName }
      };
  };

  const extractObjectName = (fullName: string) => {
      return splitQualifiedName(String(fullName || '').trim()).objectName || String(fullName || '').trim();
  };

  const handleRenameDatabase = async () => {
      if (!renameDbTarget) return;
      try {
          const values = await renameDbForm.validateFields();
          const conn = renameDbTarget.dataRef;
          const oldDbName = String(conn.dbName || '').trim();
          const newDbName = String(values.newName || '').trim();
          if (!oldDbName || !newDbName) {
              message.error(t('sidebar.message.database_name_required'));
              return;
          }
          if (oldDbName === newDbName) {
              message.warning(t('sidebar.message.database_name_unchanged'));
              return;
          }

          const config = buildRuntimeConfig(conn, conn.dbName);
          const res = await RenameDatabase(buildRpcConnectionConfig(config) as any, oldDbName, newDbName);
          if (res.success) {
              message.success(t('sidebar.message.database_renamed'));
              setExpandedKeys(prev => prev.filter(k => !k.toString().startsWith(`${conn.id}-${oldDbName}`)));
              setLoadedKeys(prev => prev.filter(k => !k.toString().startsWith(`${conn.id}-${oldDbName}`)));
              await loadDatabases(getConnectionNodeRef(conn));
              setIsRenameDbModalOpen(false);
              setRenameDbTarget(null);
              renameDbForm.resetFields();
          } else {
              message.error(t('sidebar.message.operation_rename_failed', { error: res.message }));
          }
      } catch (e) {
          // Validate failed
      }
  };

  const handleDeleteDatabase = (node: any) => {
      const conn = node.dataRef;
      const dbName = String(conn.dbName || '').trim();
      if (!dbName) return;
      Modal.confirm({
          title: t('sidebar.modal.confirm_delete_database.title'),
          content: t('sidebar.modal.confirm_delete_database.content', { name: dbName }),
          okButtonProps: { danger: true },
          onOk: async () => {
              const config = buildRuntimeConfig(conn, conn.dbName);
              const res = await DropDatabase(buildRpcConnectionConfig(config) as any, dbName);
              if (res.success) {
                  message.success(t('sidebar.message.database_deleted'));
                  closeTabsByDatabase(conn.id, dbName);
                  setExpandedKeys(prev => prev.filter(k => !k.toString().startsWith(`${conn.id}-${dbName}`)));
                  setLoadedKeys(prev => prev.filter(k => !k.toString().startsWith(`${conn.id}-${dbName}`)));
                  await loadDatabases(getConnectionNodeRef(conn));
              } else {
                  message.error(t('sidebar.message.operation_drop_failed', { error: res.message }));
              }
          }
      });
  };

  const handleRenameTable = async () => {
      if (!renameTableTarget) return;
      try {
          const values = await renameTableForm.validateFields();
          const conn = renameTableTarget.dataRef;
          const oldTableName = String(conn.tableName || '').trim();
          const newTableName = String(values.newName || '').trim();
          if (!oldTableName || !newTableName) {
              message.error("表名不能为空");
              return;
          }
          if (extractObjectName(oldTableName) === newTableName || oldTableName === newTableName) {
              message.warning("新旧表名相同，无需修改");
              return;
          }
          const config = buildRuntimeConfig(conn, conn.dbName);
          const res = await RenameTable(buildRpcConnectionConfig(config) as any, conn.dbName, oldTableName, newTableName);
          if (res.success) {
              message.success("表重命名成功");
              await loadTables(getDatabaseNodeRef(conn, conn.dbName));
              setIsRenameTableModalOpen(false);
              setRenameTableTarget(null);
              renameTableForm.resetFields();
          } else {
              message.error("重命名失败: " + res.message);
          }
      } catch (e) {
          // Validate failed
      }
  };

  const handleDeleteTable = (node: any) => {
      const conn = node.dataRef;
      const tableName = String(conn.tableName || '').trim();
      if (!tableName) return;
      Modal.confirm({
          title: '确认删除表',
          content: `确定删除表 "${tableName}" 吗？该操作不可恢复。`,
          okButtonProps: { danger: true },
          onOk: async () => {
              const config = buildRuntimeConfig(conn, conn.dbName);
              const res = await DropTable(buildRpcConnectionConfig(config) as any, conn.dbName, tableName);
              if (res.success) {
                  message.success("表删除成功");
                  await loadTables(getDatabaseNodeRef(conn, conn.dbName));
              } else {
                  message.error("删除失败: " + res.message);
              }
          }
      });
  };

  const handleTableDataDangerAction = async (node: any, action: TableDataDangerActionKind) => {
      const conn = node.dataRef;
      const tableName = String(conn.tableName || '').trim();
      if (!tableName) return;

      const { label, progressLabel } = getTableDataDangerActionMeta(action);
      const confirmed = await new Promise<boolean>((resolve) => {
          Modal.confirm({
              title: `确认${label}`,
              content: `${label}会永久删除表 "${tableName}" 中的所有数据，操作不可逆，是否继续？`,
              okText: '继续',
              cancelText: '取消',
              okButtonProps: { danger: true },
              onOk: () => resolve(true),
              onCancel: () => resolve(false),
          });
      });
      if (!confirmed) return;

      const config = buildRuntimeConfig(conn, conn.dbName);
      const app = (window as any).go.app.App;
      const methodName = action === 'truncate' ? 'TruncateTables' : 'ClearTables';
      const hide = message.loading(`正在${progressLabel} ${tableName}...`, 0);
      const startTime = Date.now();
      try {
          const res = await app[methodName](buildRpcConnectionConfig(config) as any, conn.dbName, [tableName]);
          hide();
          const duration = Date.now() - startTime;
          const executedSQLs = Array.isArray(res.data?.executedSQLs) ? res.data.executedSQLs : [];
          const logSql = executedSQLs.length > 0
              ? executedSQLs.join(';\n') + ';'
              : `/* ${label} ${tableName} */`;

          if (res.success) {
              message.success(`${progressLabel}成功`);
              addSqlLog({
                  id: Date.now().toString(),
                  timestamp: Date.now(),
                  sql: logSql,
                  status: 'success',
                  duration,
                  message: res.message,
                  dbName: conn.dbName,
                  affectedRows: res.data?.count || 0,
              });
              await loadTables(getDatabaseNodeRef(conn, conn.dbName));
              return;
          }

          addSqlLog({
              id: Date.now().toString(),
              timestamp: Date.now(),
              sql: logSql,
              status: 'error',
              duration,
              message: res.message,
              dbName: conn.dbName,
          });
          if (res.message !== '已取消') {
              message.error(`${progressLabel}失败: ${res.message}`);
          }
      } catch (e: any) {
          const duration = Date.now() - startTime;
          const errMsg = e?.message || String(e);
          hide();
          addSqlLog({
              id: Date.now().toString(),
              timestamp: Date.now(),
              sql: `/* ${label} ${tableName} - ERROR */`,
              status: 'error',
              duration,
              message: errMsg,
              dbName: conn.dbName,
          });
          message.error(`${progressLabel}失败: ${errMsg}`);
      }
  };

  // --- 视图操作 ---
  const openViewDefinition = (node: any) => {
      const { viewName, dbName, id, schemaName } = node.dataRef;
      const isMaterialized = node.type === 'materialized-view' || node.dataRef?.objectKind === 'materialized-view';
      addTab({
          id: `view-def-${id}-${dbName}-${viewName}`,
          title: t(isMaterialized ? 'sidebar.tab.materialized_view_definition' : 'sidebar.tab.view_definition', { name: viewName }),
          type: 'view-def',
          connectionId: id,
          dbName,
          viewName,
          viewKind: isMaterialized ? 'materialized' : 'view',
          schemaName,
          sidebarLocateKey: String(node.key || ''),
      });
  };

  const openEditView = async (node: any) => {
      const conn = node.dataRef;
      const { viewName, dbName, id } = conn;
      // 获取视图定义后打开查询编辑器
      const dialect = getMetadataDialect(conn as SavedConnection);
      const sqlTemplateHeader = `-- ${t('sidebar.sql_template.edit_view', { name: viewName })}`;
      let template = `${sqlTemplateHeader}\n-- ${t('sidebar.sql_template.modify_then_execute')}\nCREATE OR REPLACE VIEW ${viewName} AS\nSELECT * FROM your_table;`;

      try {
          const config = buildRuntimeConfig(conn, dbName);
          let queries: string[] = [];
          switch (dialect) {
              case 'mysql':
              case 'starrocks':
                  queries = [`SHOW CREATE VIEW \`${viewName.replace(/`/g, '``')}\``];
                  break;
              case 'postgres': case 'kingbase': case 'highgo': case 'vastbase': case 'opengauss': case 'gaussdb': {
                  const parts = splitQualifiedName(viewName);
                  const schema = parts.schemaName || 'public';
                  const name = parts.objectName || viewName;
                  queries = [`SELECT pg_get_viewdef('${escapeSQLLiteral(schema)}.${escapeSQLLiteral(name)}'::regclass, true) AS view_definition`];
                  break;
              }
              case 'sqlserver':
                  queries = buildSqlServerObjectDefinitionQueries('view', viewName, dbName, 'view_definition');
                  break;
              case 'sqlite':
                  queries = [`SELECT sql AS view_definition FROM sqlite_master WHERE type='view' AND name='${escapeSQLLiteral(viewName)}'`];
                  break;
              case 'duckdb': {
                  const parts = splitQualifiedName(viewName);
                  const viewSchema = escapeSQLLiteral(parts.schemaName || 'main');
                  const viewObject = escapeSQLLiteral(parts.objectName || viewName);
                  queries = [`SELECT view_definition FROM information_schema.views WHERE table_schema='${viewSchema}' AND table_name='${viewObject}' LIMIT 1`];
                  break;
              }
          }
          for (const query of queries) {
              const result = await DBQuery(buildRpcConnectionConfig(config) as any, dbName, query);
              if (result.success && Array.isArray(result.data) && result.data.length > 0) {
                  const row = result.data[0] as Record<string, any>;
                  const def = dialect === 'sqlserver'
                      ? extractSqlServerDefinitionRows(result.data, ['view_definition', 'definition'])
                      : row.view_definition || row.VIEW_DEFINITION || Object.values(row).find(v => typeof v === 'string' && String(v).length > 10) || '';
                  if (def) {
                      if (dialect === 'mysql') {
                          template = `${sqlTemplateHeader}\n${normalizeMySQLViewDDLForEditing(viewName, def)}`;
                      } else if (dialect === 'sqlserver') {
                          template = /^\s*create\s+view\b/i.test(String(def))
                              ? `${sqlTemplateHeader}\n${def}`
                              : `${sqlTemplateHeader}\nCREATE VIEW ${viewName} AS\n${def}`;
                      } else {
                          template = `${sqlTemplateHeader}\nCREATE OR REPLACE VIEW ${viewName} AS\n${def}`;
                      }
                      break;
                  }
              }
          }
      } catch { /* 降级使用模板 */ }

      addTab({
          id: `query-edit-view-${Date.now()}`,
          title: t('sidebar.tab.edit_view', { name: viewName }),
          type: 'query',
          connectionId: id,
          dbName,
          query: template
      });
  };

  const openCreateView = (node: any) => {
      const conn = node.dataRef;
      const { dbName, id } = conn;
      const dialect = getMetadataDialect(conn as SavedConnection);
      let template: string;
      switch (dialect) {
          case 'mysql':
          case 'starrocks':
              template = `CREATE VIEW \`view_name\` AS\nSELECT column1, column2\nFROM table_name\nWHERE condition;`;
              break;
          case 'postgres': case 'kingbase': case 'highgo': case 'vastbase': case 'opengauss': case 'gaussdb':
              template = `CREATE OR REPLACE VIEW view_name AS\nSELECT column1, column2\nFROM table_name\nWHERE condition;`;
              break;
          case 'sqlserver':
              template = `CREATE VIEW dbo.view_name AS\nSELECT column1, column2\nFROM table_name\nWHERE condition;`;
              break;
          case 'oracle': case 'dm':
              template = `CREATE OR REPLACE VIEW view_name AS\nSELECT column1, column2\nFROM table_name\nWHERE condition;`;
              break;
          case 'sqlite':
          case 'duckdb':
              template = `CREATE VIEW view_name AS\nSELECT column1, column2\nFROM table_name\nWHERE condition;`;
              break;
          default:
              template = `CREATE VIEW view_name AS\nSELECT column1, column2\nFROM table_name\nWHERE condition;`;
      }
      addTab({
          id: `query-create-view-${Date.now()}`,
          title: t('sidebar.tab.create_view'),
          type: 'query',
          connectionId: id,
          dbName,
          query: template
      });
  };

  const openCreateStarRocksMaterializedView = (node: any) => {
      const conn = node.dataRef;
      const { dbName, id } = conn;
      const schemaPrefix = String(conn.schemaName || dbName || '').trim();
      const mvName = schemaPrefix ? `${schemaPrefix}.mv_name` : 'mv_name';
      const template = buildStarRocksMaterializedViewPreviewSql({
          name: mvName,
          query: 'SELECT\n  column1,\n  COUNT(*) AS cnt\nFROM table_name\nGROUP BY column1',
          distributionColumnNames: ['column1'],
          refreshClause: 'REFRESH ASYNC',
          properties: '"replication_num" = "1"',
      });
      addTab({
          id: `query-create-starrocks-mv-${Date.now()}`,
          title: t('sidebar.v2_database_menu.new_materialized_view'),
          type: 'query',
          connectionId: id,
          dbName,
          query: template,
      });
  };

  const openCreateStarRocksExternalCatalog = (node: any) => {
      const conn = node.dataRef;
      const { dbName, id } = conn;
      addTab({
          id: `query-create-starrocks-catalog-${Date.now()}`,
          title: t('sidebar.v2_database_menu.new_external_catalog'),
          type: 'query',
          connectionId: id,
          dbName,
          query: `CREATE EXTERNAL CATALOG catalog_name\nPROPERTIES (\n  "type" = "hive",\n  "hive.metastore.uris" = "thrift://127.0.0.1:9083"\n);`,
      });
  };

  const openCreateStarRocksRollup = (node: any) => {
      const conn = node.dataRef;
      const { tableName, dbName, id } = conn;
      const safeTable = String(tableName || 'table_name').trim();
      const safeTableParts = [splitQualifiedName(safeTable).schemaName, splitQualifiedName(safeTable).objectName].filter(Boolean);
      const quotedTable = safeTable.includes('`')
          ? safeTable
          : (safeTableParts.length > 0 ? safeTableParts : [safeTable]).map(part => `\`${part.replace(/`/g, '``')}\``).join('.');
      addTab({
          id: `query-create-starrocks-rollup-${Date.now()}`,
          title: '新增 Rollup',
          type: 'query',
          connectionId: id,
          dbName,
          query: `ALTER TABLE ${quotedTable}\nADD ROLLUP rollup_name (column1, column2);`,
      });
  };

  const handleDropView = (node: any) => {
      const conn = node.dataRef;
      const viewName = String(conn.viewName || '').trim();
      if (!viewName) return;
      Modal.confirm({
          title: '确认删除视图',
          content: `确定删除视图 "${viewName}" 吗？该操作不可恢复。`,
          okButtonProps: { danger: true },
          onOk: async () => {
              const config = buildRuntimeConfig(conn, conn.dbName);
              const res = await DropView(buildRpcConnectionConfig(config) as any, conn.dbName, viewName);
              if (res.success) {
                  message.success("视图删除成功");
                  await loadTables(getDatabaseNodeRef(conn, conn.dbName));
              } else {
                  message.error("删除失败: " + res.message);
              }
          }
      });
  };

  const handleRenameView = async () => {
      if (!renameViewTarget) return;
      try {
          const values = await renameViewForm.validateFields();
          const conn = renameViewTarget.dataRef;
          const oldViewName = String(conn.viewName || '').trim();
          const newViewName = String(values.newName || '').trim();
          if (!oldViewName || !newViewName) {
              message.error("视图名称不能为空");
              return;
          }
          if (extractObjectName(oldViewName) === newViewName || oldViewName === newViewName) {
              message.warning("新旧视图名相同，无需修改");
              return;
          }
          const config = buildRuntimeConfig(conn, conn.dbName);
          const res = await RenameView(buildRpcConnectionConfig(config) as any, conn.dbName, oldViewName, newViewName);
          if (res.success) {
              message.success("视图重命名成功");
              await loadTables(getDatabaseNodeRef(conn, conn.dbName));
              setIsRenameViewModalOpen(false);
              setRenameViewTarget(null);
              renameViewForm.resetFields();
          } else {
              message.error("重命名失败: " + res.message);
          }
      } catch (e) {
          // Validate failed
      }
  };

  const openRenameSavedQueryModal = (query: SavedQuery) => {
      setRenameSavedQueryTarget(query);
      renameSavedQueryForm.setFieldsValue({ name: query.name || t('query_editor.save_modal.unnamed') });
      setIsRenameSavedQueryModalOpen(true);
  };

  const resolveSavedQueryDisplayName = (name: string | null | undefined) => {
      const rawName = String(name || '').trim();
      return rawName || t('query_editor.save_modal.unnamed');
  };

  const handleRenameSavedQuery = async () => {
      if (!renameSavedQueryTarget) return;
      try {
          const values = await renameSavedQueryForm.validateFields();
          const nextName = String(values.name || '').trim();
          if (!nextName) {
              message.error(t('query_editor.save_modal.name_required'));
              return;
          }
          if (nextName === renameSavedQueryTarget.name) {
              message.warning(t('sidebar.message.saved_query_name_unchanged'));
              return;
          }

          const persisted = await saveQuery({
              ...renameSavedQueryTarget,
              name: nextName,
          });
          const updateSavedQueryNode = (list: TreeNode[]): TreeNode[] =>
              list.map(node => {
                  if (node.type === 'saved-query' && node.dataRef?.id === renameSavedQueryTarget.id) {
                      return {
                          ...node,
                          title: persisted.name,
                          dataRef: { ...(node.dataRef || renameSavedQueryTarget), ...persisted },
                      };
                  }
                  return node.children ? { ...node, children: updateSavedQueryNode(node.children) } : node;
              });
          const nextTreeData = updateSavedQueryNode(treeDataRef.current);
          treeDataRef.current = nextTreeData;
          setTreeData(nextTreeData);
          tabs
              .filter(tab => tab.type === 'query' && (tab.savedQueryId === renameSavedQueryTarget.id || tab.id === renameSavedQueryTarget.id))
              .forEach(tab => updateQueryTabDraft(tab.id, { title: persisted.name }));
          message.success(t('sidebar.message.saved_query_renamed'));
          setIsRenameSavedQueryModalOpen(false);
          setRenameSavedQueryTarget(null);
          renameSavedQueryForm.resetFields();
      } catch (e) {
          if (e instanceof Error) {
              message.error('重命名查询失败: ' + e.message);
          }
      }
  };

  const isSavedQueryUnmatched = useCallback((query: SavedQuery): boolean => {
      return query.bindingStatus === 'orphan' || !connectionIdSet.has(query.connectionId);
  }, [connectionIdSet]);

  const handleRebindSavedQuery = useCallback(async (query: SavedQuery, target: SavedConnection) => {
      if (!query?.id || !target?.id) return;
      try {
          const backendApp = (window as any).go?.app?.App;
          let persisted: SavedQuery;
          if (typeof backendApp?.RebindSavedQuery === 'function') {
              persisted = await backendApp.RebindSavedQuery(query.id, target.id);
              await saveQuery(persisted);
          } else {
              persisted = await saveQuery({
                  ...query,
                  connectionId: target.id,
                  originalConnectionId: query.originalConnectionId || query.connectionId,
                  bindingStatus: 'active',
              });
          }
          message.success(`查询已绑定到 ${target.name || target.id}`);
          tabs
              .filter(tab => tab.type === 'query' && (tab.savedQueryId === query.id || tab.id === query.id))
              .forEach(tab => updateQueryTabDraft(tab.id, {
                  title: persisted.name,
                  connectionId: persisted.connectionId,
                  dbName: persisted.dbName,
              }));
      } catch (error) {
          message.error('绑定查询失败: ' + (error instanceof Error ? error.message : String(error)));
      }
  }, [saveQuery, tabs, updateQueryTabDraft]);

  // --- 函数/存储过程操作 ---
  const openRoutineDefinition = (node: any) => {
      const { routineName, routineType, dbName, id } = node.dataRef;
      const typeLabel = t(routineType === 'PROCEDURE' ? 'sidebar.object.procedure' : 'sidebar.object.function');
      addTab({
          id: `routine-def-${id}-${dbName}-${routineName}`,
          title: t('sidebar.tab.routine_definition', { type: typeLabel, name: routineName }),
          type: 'routine-def',
          connectionId: id,
          dbName,
          routineName,
          routineType
      });
  };

  const openEventDefinition = (node: any) => {
      const { eventName, dbName, id } = node.dataRef;
      addTab({
          id: `event-def-${id}-${dbName}-${eventName}`,
          title: t('sidebar.tab.event', { name: eventName }),
          type: 'event-def',
          connectionId: id,
          dbName,
          eventName,
      });
  };

  const openEditRoutine = async (node: any) => {
      const conn = node.dataRef;
      const { routineName, routineType, dbName, id } = conn;
      const dialect = getMetadataDialect(conn as SavedConnection);
      const tabTypeKey = routineType === 'PROCEDURE' ? 'sidebar.object.procedure' : 'sidebar.object.function';
      const tabTypeLabel = t(tabTypeKey);
      const sqlTemplateHeader = `-- ${t('sidebar.sql_template.edit_routine', { type: tabTypeLabel, name: routineName })}`;
      let template = sqlTemplateHeader;

      try {
          const config = buildRuntimeConfig(conn, dbName);
          let query = '';
          const parsedRoutine = splitQualifiedName(routineName);
          const name = parsedRoutine.objectName || routineName;
          const schema = parsedRoutine.schemaName;

          switch (dialect) {
              case 'mysql':
              case 'starrocks':
                  query = `SHOW CREATE ${routineType} \`${name.replace(/`/g, '``')}\``;
                  break;
              case 'postgres': case 'kingbase': case 'highgo': case 'vastbase': case 'opengauss': case 'gaussdb': {
                  const schemaRef = schema || 'public';
                  query = `SELECT pg_get_functiondef(p.oid) AS routine_definition FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = '${escapeSQLLiteral(schemaRef)}' AND p.proname = '${escapeSQLLiteral(name)}' LIMIT 1`;
                  break;
              }
              case 'sqlserver':
                  query = '';
                  break;
              case 'oracle': case 'dm': {
                  const owner = schema ? escapeSQLLiteral(schema).toUpperCase() : '';
                  if (owner) {
                      query = `SELECT TEXT FROM ALL_SOURCE WHERE OWNER = '${owner}' AND NAME = '${escapeSQLLiteral(name).toUpperCase()}' AND TYPE = '${routineType}' ORDER BY LINE`;
                  } else {
                      query = `SELECT TEXT FROM USER_SOURCE WHERE NAME = '${escapeSQLLiteral(name).toUpperCase()}' AND TYPE = '${routineType}' ORDER BY LINE`;
                  }
                  break;
              }
              case 'duckdb': {
                  const schemaRef = schema || 'main';
                  query = `SELECT schema_name, function_name, parameters, macro_definition FROM duckdb_functions() WHERE internal = false AND lower(function_type) = 'macro' AND schema_name = '${escapeSQLLiteral(schemaRef)}' AND function_name = '${escapeSQLLiteral(name)}' LIMIT 1`;
                  break;
              }
          }
          const queries = dialect === 'sqlserver'
              ? buildSqlServerObjectDefinitionQueries('routine', routineName, dbName, 'routine_definition')
              : [query].filter(Boolean);
          for (const queryText of queries) {
              const result = await DBQuery(buildRpcConnectionConfig(config) as any, dbName, queryText);
              if (result.success && Array.isArray(result.data) && result.data.length > 0) {
                  if (dialect === 'oracle' || dialect === 'dm') {
                      const lines = result.data.map((row: any) => row.text || row.TEXT || Object.values(row)[0] || '').join('');
                      if (lines) {
                          template = `${sqlTemplateHeader}\nCREATE OR REPLACE ${lines}`;
                          break;
                      }
                  } else if (dialect === 'duckdb') {
                      const row = result.data[0] as Record<string, any>;
                      const ddl = buildDuckDBMacroDDL(
                          String(getCaseInsensitiveRawValue(row, ['schema_name']) || schema || '').trim(),
                          String(getCaseInsensitiveRawValue(row, ['function_name']) || name || '').trim(),
                          getCaseInsensitiveRawValue(row, ['parameters']),
                          getCaseInsensitiveRawValue(row, ['macro_definition'])
                      );
                      if (ddl) {
                          template = `${sqlTemplateHeader}\n${ddl}`;
                          break;
                      }
                  } else {
                      const row = result.data[0] as Record<string, any>;
                      const def = dialect === 'sqlserver'
                          ? extractSqlServerDefinitionRows(result.data, ['routine_definition', 'definition'])
                          : row.routine_definition || row.ROUTINE_DEFINITION || Object.values(row).find(v => typeof v === 'string' && String(v).length > 10) || '';
                      if (def) {
                          template = `${sqlTemplateHeader}\n${def}`;
                          break;
                      }
                  }
              }
          }
      } catch { /* 降级使用模板 */ }

      addTab({
          id: `query-edit-routine-${Date.now()}`,
          title: t('sidebar.tab.edit_routine', { type: tabTypeLabel, name: routineName }),
          type: 'query',
          connectionId: id,
          dbName,
          query: template
      });
  };

  const openCreateRoutine = (node: any, type: 'FUNCTION' | 'PROCEDURE') => {
      const conn = node.dataRef;
      const { dbName, id } = conn;
      const dialect = getMetadataDialect(conn as SavedConnection);
      const isProc = type === 'PROCEDURE';
      let template: string;

      switch (dialect) {
          case 'mysql':
          case 'starrocks':
              template = isProc
                  ? `DELIMITER $$\nCREATE PROCEDURE proc_name(IN param1 INT)\nBEGIN\n    SELECT * FROM table_name WHERE id = param1;\nEND$$\nDELIMITER ;`
                  : `DELIMITER $$\nCREATE FUNCTION func_name(param1 INT)\nRETURNS INT\nDETERMINISTIC\nBEGIN\n    RETURN param1 * 2;\nEND$$\nDELIMITER ;`;
              break;
          case 'postgres': case 'kingbase': case 'highgo': case 'vastbase': case 'opengauss': case 'gaussdb':
              template = isProc
                  ? `CREATE OR REPLACE PROCEDURE proc_name(param1 integer)\nLANGUAGE plpgsql\nAS $$\nBEGIN\n    -- procedure body\nEND;\n$$;`
                  : `CREATE OR REPLACE FUNCTION func_name(param1 integer)\nRETURNS integer\nLANGUAGE plpgsql\nAS $$\nBEGIN\n    RETURN param1 * 2;\nEND;\n$$;`;
              break;
          case 'sqlserver':
              template = isProc
                  ? `CREATE PROCEDURE dbo.proc_name\n    @param1 INT\nAS\nBEGIN\n    SELECT * FROM table_name WHERE id = @param1;\nEND;`
                  : `CREATE FUNCTION dbo.func_name(@param1 INT)\nRETURNS INT\nAS\nBEGIN\n    RETURN @param1 * 2;\nEND;`;
              break;
          case 'oracle': case 'dm':
              template = isProc
                  ? `CREATE OR REPLACE PROCEDURE proc_name(param1 IN NUMBER)\nIS\nBEGIN\n    -- procedure body\n    NULL;\nEND;`
                  : `CREATE OR REPLACE FUNCTION func_name(param1 IN NUMBER)\nRETURN NUMBER\nIS\nBEGIN\n    RETURN param1 * 2;\nEND;`;
              break;
          case 'duckdb':
              template = isProc
                  ? `-- ${t('sidebar.sql_template.duckdb_procedure_unsupported')}\n-- ${t('sidebar.sql_template.duckdb_macro_hint')}\nCREATE MACRO func_name(param1) AS (param1 * 2);`
                  : `CREATE MACRO func_name(param1) AS (param1 * 2);`;
              break;
          default:
              template = isProc
                  ? `CREATE PROCEDURE proc_name()\nBEGIN\n    -- procedure body\nEND;`
                  : `CREATE FUNCTION func_name()\nRETURNS INTEGER\nBEGIN\n    RETURN 0;\nEND;`;
      }

      addTab({
          id: `query-create-routine-${Date.now()}`,
          title: isProc ? t('sidebar.tab.create_procedure') : t('sidebar.tab.create_function'),
          type: 'query',
          connectionId: id,
          dbName,
          query: template
      });
  };

  const handleDropRoutine = (node: any) => {
      const conn = node.dataRef;
      const routineName = String(conn.routineName || '').trim();
      const routineType = String(conn.routineType || 'FUNCTION').trim();
      if (!routineName) return;
      const typeLabel = t(routineType === 'PROCEDURE' ? 'sidebar.object.procedure' : 'sidebar.object.function');
      Modal.confirm({
          title: t('sidebar.modal.confirm_delete_routine.title', { type: typeLabel }),
          content: t('sidebar.modal.confirm_delete_routine.content', { type: typeLabel, name: routineName }),
          okButtonProps: { danger: true },
          onOk: async () => {
              const config = buildRuntimeConfig(conn, conn.dbName);
              const res = await DropFunction(buildRpcConnectionConfig(config) as any, conn.dbName, routineName, routineType);
              if (res.success) {
                  message.success(t('sidebar.message.routine_deleted', { type: typeLabel }));
                  await loadTables(getDatabaseNodeRef(conn, conn.dbName));
              } else {
                  message.error(t('sidebar.message.delete_failed', { error: res.message }));
              }
          }
      });
  };

  const resolveMessagePublishTarget = (node: any): SidebarMessagePublishTarget | null => {
      const connectionId = String(node?.dataRef?.id || '').trim();
      const liveConnection = connections.find((item) => item.id === connectionId);
      const sourceConnection = (liveConnection || node?.dataRef) as SavedConnection | undefined;
      if (!sourceConnection?.config) return null;
      const capabilities = getDataSourceCapabilities(sourceConnection.config);
      if (!capabilities.supportsMessagePublish) return null;

      return {
          connection: sourceConnection,
          executionDbName: String(node?.dataRef?.dbName || ''),
          destination: String(node?.dataRef?.tableName || node?.title || '').trim(),
      };
  };

  const openMessagePublishModal = (node: any) => {
      const target = resolveMessagePublishTarget(node);
      if (!target) {
          message.warning('当前对象不支持测试发送消息');
          return;
      }
      setMessagePublishTarget(target);
  };

  const handleMessagePublishSuccess = (result: { destination: string; affectedRows: number }) => {
      const destination = String(result.destination || '').trim();
      const suffix = result.affectedRows > 0 ? `（已提交 ${result.affectedRows} 条）` : '';
      message.success(`测试消息已发送到 ${destination || '目标'}${suffix}`);
      setMessagePublishTarget(null);
  };

  const handleV2TableContextMenuAction = (node: any, action: V2TableContextMenuActionKey) => {
      switch (action) {
          case 'pin-table':
          case 'unpin-table': {
              toggleSidebarTablePinned(node, action === 'pin-table');
              return;
          }
          case 'open-data':
          case 'open-new-tab':
              onDoubleClick(null, node);
              return;
          case 'design-table':
              openDesign(node, 'columns', false);
              return;
          case 'new-query': {
              const tableName = String(node.dataRef?.tableName || '').trim();
              const queryTemplate = buildTableSelectQuery(getMetadataDialect(node.dataRef as SavedConnection), tableName);
              addTab({
                  id: `query-${Date.now()}`,
                  title: t('query.new'),
                  type: 'query',
                  connectionId: node.dataRef.id,
                  dbName: node.dataRef.dbName,
                  query: queryTemplate
              });
              return;
          }
          case 'publish-message':
              openMessagePublishModal(node);
              return;
          case 'view-ddl':
              openTableDdlInDesigner(node);
              return;
          case 'view-er':
              openTableInERView(node);
              return;
          case 'copy-table-name':
              void handleCopyTableName(node);
              return;
          case 'copy-structure':
              void handleCopyStructure(node);
              return;
          case 'copy-insert':
              void handleCopyTableAsInsert(node);
              return;
          case 'rename-table':
              setRenameTableTarget(node);
              renameTableForm.setFieldsValue({ newName: extractObjectName(node.dataRef?.tableName || node.title) });
              setIsRenameTableModalOpen(true);
              return;
          case 'new-rollup':
              openCreateStarRocksRollup(node);
              return;
          case 'backup-table':
              void handleExport(node, { format: 'sql' });
              return;
          case 'refresh-stats':
              refreshV2TableContextMenuStats(node);
              return;
          case 'export-data':
              void openExportDialog(node);
              return;
          case 'ai-explain':
              void injectTablePromptToAI(node, 'explain');
              return;
          case 'ai-generate-query':
              void injectTablePromptToAI(node, 'query');
              return;
          case 'truncate-table':
              void handleTableDataDangerAction(node, 'truncate');
              return;
          case 'drop-table':
              handleDeleteTable(node);
              return;
          default:
              return;
      }
  };

  const toggleSidebarTablePinned = (node: any, pinned?: boolean) => {
      const conn = node?.dataRef || {};
      const tableName = String(conn.tableName || node?.title || '').trim();
      const dbName = String(conn.dbName || '').trim();
      if (!conn.id || !dbName || !tableName) return;
      const currentlyPinned = isSidebarTablePinned(
          pinnedSidebarTables,
          String(conn.id || ''),
          dbName,
          tableName,
          String(conn.schemaName || ''),
      );
      const shouldPin = pinned ?? !currentlyPinned;
      setSidebarTablePinned(conn.id, dbName, tableName, conn.schemaName || '', shouldPin);
      void loadTables(getDatabaseNodeRef(conn, dbName));
      message.success(shouldPin ? t('sidebar.message.table_pinned') : t('sidebar.message.table_unpinned'));
  };

  const handleTableGroupSortAction = (node: any, sortBy: 'name' | 'frequency') => {
      const groupData = node.dataRef;
      setTableSortPreference(groupData.id, groupData.dbName, sortBy);
      const dbNode = {
          key: `${groupData.id}-${groupData.dbName}`,
          dataRef: groupData
      };
      loadTables(dbNode);
  };

  const handleV2TableGroupContextMenuAction = (node: any, action: V2TableGroupContextMenuActionKey) => {
      switch (action) {
          case 'new-table':
              openNewTableDesign(node);
              return;
          case 'sort-by-name':
              handleTableGroupSortAction(node, 'name');
              return;
          case 'sort-by-frequency':
              handleTableGroupSortAction(node, 'frequency');
              return;
          default:
              return;
      }
  };

  const closeDatabaseNode = (node: any) => {
      const dbConnId = String(node.dataRef?.id || '');
      const dbName = String(node.dataRef?.dbName || node.title || '').trim();
      loadingNodesRef.current.delete(`tables-${dbConnId}-${dbName}`);
      setConnectionStates(prev => {
          const next = { ...prev };
          delete next[node.key];
          return next;
      });
      setExpandedKeys(prev => prev.filter(k => k !== node.key && !k.toString().startsWith(`${node.key}-`)));
      setLoadedKeys(prev => prev.filter(k => k !== node.key && !k.toString().startsWith(`${node.key}-`)));
      replaceTreeNodeChildren(node.key, undefined);
      if (dbConnId && dbName) {
          closeTabsByDatabase(dbConnId, dbName);
      }
      message.success(t('sidebar.message.database_closed'));
  };

  const openDatabaseQuery = (node: any) => {
      addTab({
          id: `query-${Date.now()}`,
          title: t('sidebar.tab.new_query_database', { database: node.title }),
          type: 'query',
          connectionId: node.dataRef.id,
          dbName: node.title,
          query: ''
      });
  };

  const handleV2DatabaseContextMenuAction = (node: any, action: V2DatabaseContextMenuActionKey) => {
      switch (action) {
          case 'new-table':
              openNewTableDesign(node);
              return;
          case 'new-schema':
              openCreateSchemaModal(node);
              return;
          case 'new-materialized-view':
              openCreateStarRocksMaterializedView(node);
              return;
          case 'new-external-catalog':
              openCreateStarRocksExternalCatalog(node);
              return;
          case 'rename-db':
              setRenameDbTarget(node);
              renameDbForm.setFieldsValue({ newName: node.dataRef?.dbName || '' });
              setIsRenameDbModalOpen(true);
              return;
          case 'refresh':
              loadTables(node);
              return;
          case 'export-db-schema':
              void handleExportDatabaseSQL(node, false);
              return;
          case 'backup-db-sql':
              void handleExportDatabaseSQL(node, true);
              return;
          case 'disconnect-db':
              closeDatabaseNode(node);
              return;
          case 'new-query':
              openDatabaseQuery(node);
              return;
          case 'run-sql':
              handleRunSQLFile(node);
              return;
          case 'drop-db':
              handleDeleteDatabase(node);
              return;
          default:
              return;
      }
  };

  const refreshConnectionNode = (node: any) => {
      const connKey = String(node?.key || node?.dataRef?.id || '');
      if (!connKey) return;
      setExpandedKeys(prev => prev.filter(k => k !== connKey && !k.toString().startsWith(`${connKey}-`)));
      setLoadedKeys(prev => prev.filter(k => k !== connKey && !k.toString().startsWith(`${connKey}-`)));
      Array.from(loadingNodesRef.current).forEach((loadingKey) => {
          if (loadingKey === `dbs-${connKey}` || loadingKey.startsWith(`tables-${connKey}-`)) {
              loadingNodesRef.current.delete(loadingKey);
          }
      });
      loadDatabases(node);
  };

  const releaseConnectionResources = async (conn: SavedConnection | undefined) => {
      if (!conn?.config) return;
      const res = await DBReleaseConnection(buildRpcConnectionConfig(conn.config, { id: conn.id }) as any);
      if (res && res.success === false) {
          throw new Error(res.message || '释放连接失败');
      }
  };

  const disconnectConnectionNode = async (node: any) => {
      const connKey = String(node?.key || node?.dataRef?.id || '');
      if (!connKey) return;
      const conn = (connections.find((item) => item.id === connKey) || node?.dataRef) as SavedConnection | undefined;
      Array.from(loadingNodesRef.current).forEach((loadingKey) => {
          if (loadingKey === `dbs-${connKey}` || loadingKey.startsWith(`tables-${connKey}-`)) {
              loadingNodesRef.current.delete(loadingKey);
          }
      });
      setConnectionStates(prev => {
          const next = { ...prev };
          Object.keys(next).forEach(k => {
              if (k === connKey || k.startsWith(`${connKey}-`)) {
                  delete next[k];
              }
          });
          return next;
      });
      setExpandedKeys(prev => prev.filter(k => k !== connKey && !k.toString().startsWith(`${connKey}-`)));
      setLoadedKeys(prev => prev.filter(k => k !== connKey && !k.toString().startsWith(`${connKey}-`)));
      replaceTreeNodeChildren(connKey, undefined);
      closeTabsByConnection(connKey);
      try {
          await releaseConnectionResources(conn);
      } catch (error: any) {
          message.warning(error?.message || '连接已从侧边栏断开，但后端连接释放失败');
      }
      message.success(t('connection.sidebar.disconnect.success'));
  };

  const deleteConnectionNode = (node: any) => {
      Modal.confirm({
          title: t('connection.sidebar.delete.confirmTitle'),
          content: t('connection.sidebar.delete.confirmContent', { name: node.title }),
          onOk: async () => {
              const connId = String(node.key);
              const backendApp = (window as any).go?.app?.App;
              if (typeof backendApp?.DeleteConnection !== 'function') {
                  message.error(t('connection.sidebar.delete.backendUnavailable'));
                  throw new Error('DeleteConnection unavailable');
              }
              try {
                  await backendApp.DeleteConnection(connId);
                  closeTabsByConnection(connId);
                  removeConnection(connId);
                  message.success(t('connection.sidebar.delete.success'));
              } catch (error: any) {
                  message.error(error?.message || t('connection.sidebar.delete.failureFallback'));
                  throw error;
              }
          }
      });
  };

  const createConnectionTreeNode = (conn: SavedConnection): TreeNode => ({
      title: conn.name,
      key: conn.id,
      icon: getDbIcon(resolveConnectionIconType(conn), resolveConnectionAccentColor(conn), 22),
      type: 'connection',
      dataRef: conn,
      isLeaf: false,
  });

  const getConnectionNodeForAction = (conn: SavedConnection): TreeNode => {
      return findTreeNodeByKeyRef.current(treeDataRef.current, conn.id) || createConnectionTreeNode(conn);
  };

  const handleV2ConnectionContextMenuAction = (node: any, action: V2ConnectionContextMenuActionKey) => {
      const connId = String(node?.key || node?.dataRef?.id || '');
      if (!connId) return;
      switch (action) {
          case 'new-db':
              setTargetConnection(node);
              setIsCreateDbModalOpen(true);
              return;
          case 'refresh':
              refreshConnectionNode(node);
              return;
          case 'new-query':
              addTab({
                  id: `query-${Date.now()}`,
                  title: buildConnectionRootQueryTabTitle(),
                  type: 'query',
                  connectionId: connId,
                  dbName: undefined,
                  query: ''
              });
              return;
          case 'open-sql-file':
              handleRunSQLFile(node);
              return;
          case 'new-command':
              addTab({
                  id: `redis-cmd-${connId}-${Date.now()}`,
                  title: buildConnectionRootRedisCommandTabTitle(),
                  type: 'redis-command',
                  connectionId: connId,
                  redisDB: 0
              });
              return;
          case 'open-monitor':
              addTab({
                  id: `redis-monitor-${connId}-${Date.now()}`,
                  title: buildConnectionRootRedisMonitorTabTitle(),
                  type: 'redis-monitor',
                  connectionId: connId,
                  redisDB: 0
              });
              return;
          case 'edit':
              if (onEditConnection) onEditConnection(node.dataRef);
              return;
          case 'copy-connection':
              void handleDuplicateConnection(node.dataRef as SavedConnection);
              return;
          case 'disconnect':
              void disconnectConnectionNode(node);
              return;
          case 'delete':
              deleteConnectionNode(node);
              return;
          case 'move-to-ungrouped':
              moveConnectionToTag(connId, null);
              return;
          default:
              if (action.startsWith('move-to-tag:')) {
                  moveConnectionToTag(connId, action.slice('move-to-tag:'.length));
              }
      }
  };

  const handleV2ConnectionGroupContextMenuAction = (group: V2RailConnectionGroup, action: V2ConnectionGroupContextMenuActionKey) => {
      const tag = connectionTags.find((item) => item.id === group.id);
      if (!tag) return;
      if (action === 'edit-group') {
          createTagForm.setFieldsValue({ name: tag.name, connectionIds: tag.connectionIds });
          setRenameViewTarget({
              title: tag.name,
              key: `tag-${tag.id}`,
              type: 'tag',
              dataRef: tag,
          });
          setIsCreateTagModalOpen(true);
          return;
      }
      if (action === 'delete-group') {
          Modal.confirm({
              title: t('connection.sidebar.group.deleteConfirmTitle'),
              content: t('connection.sidebar.group.deleteConfirmContent', { name: tag.name }),
              onOk: () => {
                  removeConnectionTag(tag.id);
              },
          });
      }
  };

  const onSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setSearchValue(value);
  };

  const toggleSearchScope = (scope: SearchScope) => {
      setSearchScopes((prev) => {
          if (scope === 'smart') {
              return ['smart'];
          }
          const withoutSmart = prev.filter((item) => item !== 'smart');
          if (withoutSmart.includes(scope)) {
              const next = withoutSmart.filter((item) => item !== scope);
              return next.length > 0 ? next : ['smart'];
          }
          return [...withoutSmart, scope];
      });
  };

  const setSearchScopeChecked = (scope: SearchScope, checked: boolean) => {
      if (scope === 'smart') {
          if (checked) {
              setSearchScopes(['smart']);
          } else if (searchScopes.length === 1 && searchScopes[0] === 'smart') {
              setSearchScopes(['smart']);
          } else {
              setSearchScopes((prev) => {
                  const next = prev.filter((item) => item !== 'smart');
                  return next.length > 0 ? next : ['smart'];
              });
          }
          return;
      }

      if (checked) {
          setSearchScopes((prev) => {
              const withoutSmart = prev.filter((item) => item !== 'smart');
              if (withoutSmart.includes(scope)) {
                  return withoutSmart;
              }
              return [...withoutSmart, scope];
          });
      } else {
          setSearchScopes((prev) => {
              const next = prev.filter((item) => item !== scope && item !== 'smart');
              return next.length > 0 ? next : ['smart'];
          });
      }
  };

  const currentLanguage = getCurrentLanguage();

  const searchScopeSummary = useMemo(() => {
      if (searchScopes.includes('smart')) {
          return t('sidebar.command_search.scope.summary_smart');
      }
      return searchScopes.map((scope) => t(SEARCH_SCOPE_LABEL_KEY_MAP[scope])).join(' + ');
  }, [searchScopes, currentLanguage]);

  const searchScopePopoverContent = useMemo(() => {
      const smartSelected = searchScopes.includes('smart');
      const scopedOptions = SEARCH_SCOPE_OPTIONS.filter((option) => option.value !== 'smart');
      const borderColor = overlayTheme.sectionBorder.replace('1px solid ', '');
      const mutedTextColor = overlayTheme.mutedText;
      const titleColor = overlayTheme.titleText;
      const panelBg = overlayTheme.shellBg;
      const smartBg = smartSelected
          ? (darkMode ? 'linear-gradient(135deg, rgba(255,214,102,0.22) 0%, rgba(255,179,71,0.16) 100%)' : 'linear-gradient(135deg, rgba(255,214,102,0.26) 0%, rgba(255,244,204,0.92) 100%)')
          : (darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.72)');
      const smartBorder = smartSelected
          ? (darkMode ? 'rgba(255,214,102,0.42)' : 'rgba(245,176,65,0.34)')
          : borderColor;
      const getOptionCardStyle = (checked: boolean) => ({
          display: 'flex',
          alignItems: 'center' as const,
          justifyContent: 'space-between' as const,
          gap: 12,
          padding: '10px 12px',
          borderRadius: 12,
          border: `1px solid ${checked ? (darkMode ? 'rgba(118,169,250,0.44)' : 'rgba(24,144,255,0.32)') : borderColor}`,
          background: checked
              ? (darkMode ? 'rgba(64,124,255,0.18)' : 'rgba(24,144,255,0.08)')
              : (darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.76)'),
          transition: 'all 120ms ease',
      });
      return (
          <div style={{ minWidth: 280, display: 'flex', flexDirection: 'column', background: panelBg, padding: 14, gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, color: mutedTextColor, textTransform: 'uppercase' }}>{t('sidebar.command_search.scope.title')}</div>
                      <div style={{ marginTop: 4, fontSize: 13, lineHeight: 1.5, color: mutedTextColor }}>{t('sidebar.command_search.scope.description')}</div>
                  </div>
                  <div style={{ width: 32, height: 32, borderRadius: 10, display: 'grid', placeItems: 'center', background: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(17,24,39,0.06)', color: darkMode ? '#ffd666' : '#1677ff', flexShrink: 0 }}>
                      <FilterOutlined />
                  </div>
              </div>

              <label style={{ display: 'block', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, border: `1px solid ${smartBorder}`, background: smartBg, boxShadow: smartSelected ? (darkMode ? '0 10px 24px rgba(0,0,0,0.24)' : '0 10px 24px rgba(245,176,65,0.14)') : 'none' }}>
                      <Checkbox
                          checked={smartSelected}
                          onChange={(e) => setSearchScopeChecked('smart', e.target.checked)}
                      />
                      <div style={{ width: 30, height: 30, borderRadius: 10, display: 'grid', placeItems: 'center', background: darkMode ? 'rgba(255,214,102,0.16)' : 'rgba(255,214,102,0.3)', color: darkMode ? '#ffd666' : '#ad6800', flexShrink: 0 }}>
                          {SEARCH_SCOPE_ICON_MAP.smart}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 14, fontWeight: 700, color: titleColor }}>{t('sidebar.command_search.scope.smart')}</span>
                              <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: darkMode ? '#ffe58f' : '#ad6800', background: darkMode ? 'rgba(255,214,102,0.16)' : 'rgba(255,214,102,0.35)' }}>{t('sidebar.command_search.scope.recommended')}</span>
                          </div>
                          <div style={{ marginTop: 3, fontSize: 12, lineHeight: 1.5, color: mutedTextColor }}>{t('sidebar.command_search.scope.smart_help')}</div>
                      </div>
                  </div>
              </label>

              <div style={{ height: 1, background: overlayTheme.divider, opacity: 0.9 }} />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: mutedTextColor, textTransform: 'uppercase' }}>{t('sidebar.command_search.scope.manual_title')}</div>
                  <div style={{ fontSize: 12, color: mutedTextColor }}>{t('sidebar.command_search.scope.multi_select')}</div>
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                  {scopedOptions.map((option) => {
                      const checked = searchScopes.includes(option.value);
                      return (
                          <label key={option.value} style={{ display: 'block', cursor: 'pointer' }}>
                              <div style={getOptionCardStyle(checked)}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                                      <Checkbox
                                          checked={checked}
                                          onChange={(e) => setSearchScopeChecked(option.value, e.target.checked)}
                                      />
                                      <div style={{ width: 28, height: 28, borderRadius: 9, display: 'grid', placeItems: 'center', background: checked ? (darkMode ? 'rgba(118,169,250,0.2)' : 'rgba(24,144,255,0.12)') : (darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(17,24,39,0.06)'), color: checked ? (darkMode ? '#91caff' : '#1677ff') : mutedTextColor, flexShrink: 0 }}>
                                          {SEARCH_SCOPE_ICON_MAP[option.value]}
                                      </div>
                                      <span style={{ fontSize: 14, fontWeight: 600, color: titleColor, whiteSpace: 'nowrap' }}>{t(option.labelKey)}</span>
                                  </div>
                                  <div style={{ width: 18, display: 'flex', justifyContent: 'center', color: checked ? (darkMode ? '#91caff' : '#1677ff') : 'transparent', flexShrink: 0 }}>
                                      <CheckOutlined />
                                  </div>
                              </div>
                          </label>
                      );
                  })}
              </div>

              <div style={{ padding: '10px 12px', borderRadius: 12, background: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(17,24,39,0.04)', color: mutedTextColor, fontSize: 12, lineHeight: 1.6 }}>
                  {t('sidebar.command_search.scope.manual_help')}
              </div>
          </div>
      );
  }, [darkMode, overlayTheme, searchScopes, currentLanguage]);

  const getConnectionHostSearchText = (node: TreeNode): string => {
      if (node.type !== 'connection') return '';
      const config = node.dataRef?.config || {};
      return resolveConnectionHostTokens(config).join(' ');
  };

  const getConnectionNameSearchText = (node: TreeNode): string => {
      if (node.type !== 'connection') return '';
      const name = node.dataRef?.name ?? node.title;
      return String(name || '').toLowerCase();
  };

  const matchByScopes = (node: TreeNode, keyword: string, scopes: SearchScope[]): boolean => {
      const title = String(node.title || '').toLowerCase();
      if (scopes.includes('database') && node.type === 'database' && title.includes(keyword)) {
          return true;
      }
      if (scopes.includes('tag') && node.type === 'tag' && title.includes(keyword)) {
          return true;
      }
      if (scopes.includes('host') && node.type === 'connection' && getConnectionHostSearchText(node).includes(keyword)) {
          return true;
      }
      if (scopes.includes('object') && (isV2SidebarObjectNode(node) || node.type === 'object-group') && title.includes(keyword)) {
          return true;
      }
      if (node.type === 'external-sql-root' || node.type === 'external-sql-directory' || node.type === 'external-sql-folder' || node.type === 'external-sql-file') {
          const pathText = String(node?.dataRef?.path || '').toLowerCase();
          return title.includes(keyword) || pathText.includes(keyword);
      }
      return false;
  };

  const loop = (data: TreeNode[], keyword: string): TreeNode[] => {
      const isSmartMode = searchScopes.includes('smart');
      const result: TreeNode[] = [];
      data.forEach((item) => {
          const titleMatch = String(item.title || '').toLowerCase().includes(keyword);
          const smartMatch = item.type === 'connection'
              ? getConnectionNameSearchText(item).includes(keyword) || getConnectionHostSearchText(item).includes(keyword)
              : titleMatch;
          const scopedMatch = matchByScopes(item, keyword, searchScopes);
          const selfMatch = isSmartMode ? smartMatch : scopedMatch;
          const filteredChildren = item.children ? loop(item.children, keyword) : [];

          if (selfMatch) {
              const shouldKeepFullSubtree = isSmartMode
                  || item.type === 'connection'
                  || item.type === 'database'
                  || item.type === 'tag'
                  || item.type === 'external-sql-root'
                  || item.type === 'external-sql-directory'
                  || item.type === 'external-sql-folder';
              if (item.children && shouldKeepFullSubtree) {
                  result.push(item);
              } else if (item.children && filteredChildren.length > 0) {
                  result.push({ ...item, children: filteredChildren });
              } else {
                  result.push(item);
              }
              return;
          }

          if (filteredChildren.length > 0) {
              result.push({ ...item, children: filteredChildren });
          }
      });
      return result;
  };

  const displayTreeData = useMemo(() => {
      const keyword = deferredSearchValue.trim().toLowerCase();
      if (!keyword) return treeData;
      return loop(treeData, keyword);
  }, [deferredSearchValue, searchScopes, treeData]);

  const commandSearchTreeItems = useMemo(() => {
      const result: V2CommandSearchItem[] = [];
      const visit = (nodes: TreeNode[]) => {
          nodes.forEach((node) => {
              const dataRef = node.dataRef || {};
              if (node.type === 'connection') {
                  const conn = dataRef as SavedConnection;
                  result.push({
                      key: `node-${node.key}`,
                      kind: 'node',
                      title: String(node.title || conn.name || t('connection.unnamed')),
                      meta: resolveConnectionHostSummary(conn.config) || conn.config?.type || t('connection.sidebar.menu.section'),
                      icon: getDbIcon(resolveConnectionIconType(conn), resolveConnectionAccentColor(conn), 16),
                      node,
                  });
              } else if (node.type === 'database') {
                  const conn = connections.find((item) => item.id === dataRef.id);
                  result.push({
                      key: `node-${node.key}`,
                      kind: 'node',
                      title: String(node.title || dataRef.dbName || t('database.unnamed')),
                      meta: conn?.name || dataRef.id || t('database.label'),
                      icon: <DatabaseOutlined />,
                      node,
                  });
              } else if (
                  node.type === 'table'
                  || node.type === 'view'
                  || node.type === 'materialized-view'
                  || node.type === 'db-trigger'
                  || node.type === 'db-event'
                  || node.type === 'routine'
              ) {
                  const conn = connections.find((item) => item.id === dataRef.id);
                  const objectName = String(dataRef.tableName || dataRef.viewName || dataRef.triggerName || dataRef.eventName || dataRef.routineName || node.title || '').trim();
                  const displayName = String(node.title || extractObjectName(objectName) || objectName).trim();
                  result.push({
                      key: `node-${node.key}`,
                      kind: 'node',
                      title: displayName,
                      meta: [conn?.name || dataRef.id, dataRef.dbName].filter(Boolean).join(' · '),
                      icon: node.type === 'table'
                          ? <TableOutlined />
                          : (node.type === 'db-event' ? <ClockCircleOutlined /> : (node.type === 'routine' ? <CodeOutlined /> : <EyeOutlined />)),
                      node,
                  });
              }
              if (node.children) visit(node.children);
          });
      };

      visit(treeData);
      return result;
  }, [connections, treeData]);

  const commandSearchRecentItems = useMemo<V2CommandSearchItem[]>(() => {
      return sqlLogs.slice(0, 5).map((log) => ({
          key: `recent-${log.id}`,
          kind: 'recent',
          title: log.sql.replace(/\s+/g, ' ').trim() || 'SQL 记录',
          meta: `${new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${log.duration}ms${log.dbName ? ` · ${log.dbName}` : ''}`,
          icon: <ClockCircleOutlined />,
          sql: log.sql,
          dbName: log.dbName,
      }));
  }, [sqlLogs]);

	  const commandSearchActionItems = useMemo<V2CommandSearchItem[]>(() => [
      {
          key: 'action-new-query',
	          kind: 'action',
	          title: t('query.new'),
	          meta: '打开一个新的 SQL 编辑页',
	          shortcut: resolveShortcutDisplay(shortcutOptions, 'newQueryTab', activeShortcutPlatform),
	          icon: <PlusOutlined />,
	          onRun: () => window.dispatchEvent(new CustomEvent('gonavi:create-query-tab')),
	      },
      {
          key: 'action-new-connection',
	          kind: 'action',
	          title: '新建数据源',
	          meta: '创建数据库、运行时或其他数据源连接',
	          shortcut: resolveShortcutDisplay(shortcutOptions, 'newConnection', activeShortcutPlatform),
	          icon: <ThunderboltOutlined />,
	          onRun: () => onCreateConnection?.(),
	      },
      {
          key: 'action-open-ai',
	          kind: 'action',
	          title: '打开 AI 数据洞察',
	          meta: '让 AI 分析当前数据库上下文',
	          shortcut: resolveShortcutDisplay(shortcutOptions, 'toggleAIPanel', activeShortcutPlatform),
	          icon: <RobotOutlined />,
	          onRun: () => onToggleAI?.(),
	      },
      {
          key: 'action-open-sql-log',
	          kind: 'action',
	          title: '查看 SQL 执行日志',
	          meta: '打开最近执行记录面板',
	          shortcut: resolveShortcutDisplay(shortcutOptions, 'toggleLogPanel', activeShortcutPlatform),
	          icon: <BarsOutlined />,
	          onRun: () => onToggleLogPanel?.(),
	      },
		  ], [activeShortcutPlatform, onCreateConnection, onToggleAI, onToggleLogPanel, shortcutOptions]);

	  const v2CommandSearchQuery = useMemo(
	      () => parseV2CommandSearchQuery(deferredV2CommandSearchValue),
	      [deferredV2CommandSearchValue],
	  );
	  const normalizedV2CommandSearchValue = v2CommandSearchQuery.normalizedKeyword;
	  const v2CommandSearchObjectMode = v2CommandSearchQuery.mode === 'object';
	  const v2CommandSearchAiMode = v2CommandSearchQuery.mode === 'ai';
	  const filteredCommandSearchTreeItems = useMemo(() => {
	      return filterV2CommandSearchTreeItems(commandSearchTreeItems, v2CommandSearchQuery);
	  }, [commandSearchTreeItems, v2CommandSearchQuery]);

	  const filteredCommandSearchActionItems = useMemo(() => {
	      if (v2CommandSearchObjectMode || v2CommandSearchAiMode) return [];
	      if (!normalizedV2CommandSearchValue) return commandSearchActionItems;
	      return commandSearchActionItems.filter((item) => {
	          const haystack = `${item.title} ${item.meta}`.toLowerCase();
	          return haystack.includes(normalizedV2CommandSearchValue);
	      });
	  }, [commandSearchActionItems, normalizedV2CommandSearchValue, v2CommandSearchAiMode, v2CommandSearchObjectMode]);

	  const filteredCommandSearchRecentItems = useMemo(() => {
	      if (v2CommandSearchObjectMode || v2CommandSearchAiMode) return [];
	      if (!normalizedV2CommandSearchValue) return commandSearchRecentItems;
	      return commandSearchRecentItems.filter((item) => {
	          const haystack = `${item.title} ${item.meta}`.toLowerCase();
	          return haystack.includes(normalizedV2CommandSearchValue);
	      });
	  }, [commandSearchRecentItems, normalizedV2CommandSearchValue, v2CommandSearchAiMode, v2CommandSearchObjectMode]);

	  const commandSearchAiItem = useMemo<V2CommandSearchItem[]>(() => {
	      if (!v2CommandSearchAiMode || !v2CommandSearchQuery.aiPrompt) return [];
	      return [{
	          key: 'action-ask-ai',
	          kind: 'action',
	          title: '让 AI 回答',
	          meta: v2CommandSearchQuery.aiPrompt,
	          shortcut: '↵',
	          icon: <RobotOutlined />,
	          onRun: () => {
	              const wasClosed = !useStore.getState().aiPanelVisible;
	              if (wasClosed) setAIPanelVisible(true);
	              window.setTimeout(() => {
	                  window.dispatchEvent(new CustomEvent('gonavi:ai:inject-prompt', {
	                      detail: { prompt: v2CommandSearchQuery.aiPrompt },
	                  }));
	              }, wasClosed ? 350 : 0);
	          },
	      }];
	  }, [setAIPanelVisible, v2CommandSearchAiMode, v2CommandSearchQuery.aiPrompt]);

	  const commandSearchFlatItems = useMemo(
	      () => [
	          ...commandSearchAiItem,
	          ...filteredCommandSearchTreeItems,
	          ...filteredCommandSearchActionItems,
	          ...filteredCommandSearchRecentItems,
	      ],
	      [commandSearchAiItem, filteredCommandSearchActionItems, filteredCommandSearchRecentItems, filteredCommandSearchTreeItems],
	  );

  useEffect(() => {
      setV2CommandActiveIndex(0);
  }, [v2CommandSearchValue, commandSearchFlatItems.length]);

  const flattenConnectionNodes = useCallback((nodes: TreeNode[]): TreeNode[] => {
      const result: TreeNode[] = [];
      nodes.forEach((node) => {
          if (node.type === 'connection') {
              result.push(node);
          }
          if (node.children) {
              result.push(...flattenConnectionNodes(node.children));
          }
      });
      return result;
  }, []);

  const activeConnectionId = resolveV2ActiveConnectionId({
      activeContextConnectionId: activeContext?.connectionId,
      activeTabConnectionId: activeTab?.connectionId,
      selectedKeys,
      connectionIds,
      fallbackConnectionId: selectedNodesRef.current
          .map((node) => resolveSidebarNodeConnectionId(node, connectionIds))
          .find(Boolean),
  });
  const activeConnection = connections.find((conn) => conn.id === activeConnectionId) || null;
  const activeConnectionDisplayName = String(activeConnection?.name || '').trim() || t('sidebar.active_connection.no_host_selected');
  const activeDatabaseDisplayName = useMemo(() => {
      if (activeContext && typeof activeContext === 'object' && 'dbName' in activeContext) {
          return String(activeContext.dbName || '').trim();
      }
      return String(activeTab?.dbName || '').trim();
  }, [activeContext, activeTab?.dbName]);
  const activeConnectionTreeData = useMemo(() => {
      const externalSQLNodes = displayTreeData.filter((node) => node.type === 'external-sql-root');
      if (!activeConnection) return displayTreeData;
      const activeConnectionNode = displayTreeData.find((node) => node.type === 'connection' && node.key === activeConnection.id);
      if (activeConnectionNode) {
          return [
              ...(activeConnectionNode.children && activeConnectionNode.children.length > 0 ? activeConnectionNode.children : []),
              ...externalSQLNodes,
          ];
      }
      const filterTree = (nodes: TreeNode[]): TreeNode[] => nodes.flatMap((node) => {
          if (node.type === 'tag') {
              return filterTree(node.children || []);
          }
          if (node.type === 'connection') {
              if (node.key !== activeConnection.id) return [];
              return node.children && node.children.length > 0 ? filterTree(node.children) : [];
          }
          return [{ ...node, children: node.children ? filterTree(node.children) : undefined }];
      });

      const filtered = filterTree(displayTreeData);
      return [...filtered, ...externalSQLNodes];
  }, [activeConnection, displayTreeData]);
  const v2VisibleTreeData = useMemo(() => {
      if (v2ExplorerFilter === 'all') {
          return displayTreeData;
      }
      return filterV2ExplorerTreeByKind(activeConnectionTreeData, v2ExplorerFilter);
  }, [activeConnectionTreeData, displayTreeData, v2ExplorerFilter]);
  const v2TreeHorizontalScrollWidth = useMemo(
      () => estimateV2TreeHorizontalScrollWidth(v2VisibleTreeData, treeViewportWidth),
      [treeViewportWidth, v2VisibleTreeData],
  );
  const effectiveTreeHeight = isV2Ui && v2TreeHorizontalScrollWidth
      ? Math.max(1, treeHeight - V2_TREE_HORIZONTAL_SCROLL_BOTTOM_RESERVE)
      : treeHeight;
  const v2TreeMetrics = useMemo(() => {
      const databaseTableCounts = new Map<React.Key, number>();
      const objectGroupCounts = new Map<React.Key, number>();
      let activeObjectCount = 0;

      const visitAndCount = (node: TreeNode): number => {
          const childCount = (node.children || []).reduce((total, child) => total + visitAndCount(child), 0);
          const totalCount = (isV2SidebarObjectNode(node) ? 1 : 0) + childCount;
          if (node.type === 'database') {
              const tableCount = (node.children || []).reduce((total, child) => {
                  if (child.type === 'object-group' && child?.dataRef?.groupKey === 'tables') {
                      return total + (Array.isArray(child.children) ? child.children.filter((item) => item.type === 'table').length : 0);
                  }
                  if (child?.dataRef?.groupKey === 'schema' && Array.isArray(child.children)) {
                      return total + child.children.reduce((schemaTotal, schemaChild) => {
                          if (schemaChild.type === 'object-group' && schemaChild?.dataRef?.groupKey === 'tables') {
                              return schemaTotal + (Array.isArray(schemaChild.children) ? schemaChild.children.filter((item) => item.type === 'table').length : 0);
                          }
                          return schemaTotal;
                      }, 0);
                  }
                  return total;
              }, 0);
              databaseTableCounts.set(node.key, tableCount);
          } else if (node.type === 'object-group') {
              objectGroupCounts.set(node.key, childCount);
          }
          return totalCount;
      };

      activeObjectCount = v2VisibleTreeData.reduce((total, node) => total + visitAndCount(node), 0);

      return {
          activeObjectCount,
          databaseTableCounts,
          objectGroupCounts,
      };
  }, [v2VisibleTreeData]);
  const activeConnectionObjectCount = v2TreeMetrics.activeObjectCount;
  const legacyToolbarButtonColor = darkMode ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)';
  const legacyToolbarStyle: React.CSSProperties = {
      padding: '6px 16px',
      display: 'grid',
      gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
      gap: 8,
      alignItems: 'center',
      justifyItems: 'center',
      borderTop: `1px solid ${darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}`,
      borderBottom: `1px solid ${darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}`,
      background: darkMode ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.015)',
  };
  const legacyToolbarItemStyle: React.CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 0,
  };
  const legacyToolbarDisabledWrapStyle: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
  };

  const connectionStatusMap = useMemo(() => {
      const statusMap = new Map<string, 'live' | 'error' | 'idle'>();
      const sortedConnectionIds = connections
          .map((conn) => conn.id)
          .sort((a, b) => b.length - a.length);
      connections.forEach((conn) => {
          statusMap.set(conn.id, 'idle');
      });
      Object.entries(connectionStates).forEach(([key, value]) => {
          const ownState = statusMap.get(key);
          if (ownState !== undefined) {
              statusMap.set(key, value === 'success' ? 'live' : 'error');
              return;
          }
          if (value !== 'success') return;
          const ownerId = sortedConnectionIds.find((id) => key.startsWith(`${id}-`));
          if (ownerId && statusMap.get(ownerId) === 'idle') {
              statusMap.set(ownerId, 'live');
          }
      });
      return statusMap;
  }, [connectionStates, connections]);

  const buildRailConnectionStatus = useCallback((connectionId: string): 'live' | 'error' | 'idle' => {
      return connectionStatusMap.get(connectionId) || 'idle';
  }, [connectionStatusMap]);

  const toggleV2RailConnectionGroup = useCallback((groupId: string) => {
      setCollapsedV2RailGroupIds((prev) => (
          prev.includes(groupId)
              ? prev.filter((id) => id !== groupId)
              : [...prev, groupId]
      ));
  }, []);

  const handleV2RailRootDrop = useCallback((
      sourceToken: string,
      targetToken: string,
      insertBefore: boolean,
  ) => {
      if (!sourceToken || !targetToken || sourceToken === targetToken) {
          return;
      }
      reorderSidebarRoot(sourceToken, targetToken, insertBefore);
  }, [reorderSidebarRoot]);

  const getRailConnectionTypeLabel = (conn: SavedConnection): string => {
      const iconType = resolveConnectionIconType(conn);
      if (iconType === 'mysql' || iconType === 'mariadb' || iconType === 'oceanbase') return 'MY';
      if (iconType === 'postgres') return 'PG';
      if (iconType === 'gaussdb') return 'GS';
      if (iconType === 'redis') return 'R';
      if (iconType === 'mongodb') return 'MO';
      if (iconType === 'oracle') return 'OR';
      if (iconType === 'sqlserver') return 'SS';
      if (iconType === 'starrocks') return 'SR';
      if (iconType === 'sqlite') return 'SQ';
      if (iconType === 'jvm') return 'JV';
      return iconType.slice(0, 2).toUpperCase() || 'DB';
  };

  const getRailConnectionHostLabel = (conn: SavedConnection): string => {
      const hostTokens = resolveConnectionHostTokens(conn.config);
      const primaryHost = String(hostTokens[0] || '').trim().replace(/^\[|\]$/g, '');
      if (primaryHost) {
          if (/^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0)$/i.test(primaryHost)) {
              return 'LO';
          }
          if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(primaryHost)) {
              const lastSegment = primaryHost.split('.').pop() || '';
              return lastSegment.slice(-3).toUpperCase() || 'IP';
          }
          if (primaryHost.includes(':') && /^[a-f0-9:]+$/i.test(primaryHost)) {
              const lastSegment = primaryHost.split(':').filter(Boolean).pop() || '';
              return lastSegment.slice(-3).toUpperCase() || 'IP';
          }

          const hostFragments = primaryHost
              .split(/[^a-z0-9\u4e00-\u9fa5]+/i)
              .map((entry) => entry.trim())
              .filter(Boolean);
          if (hostFragments.length >= 2) {
              return `${hostFragments[0][0] || ''}${hostFragments[1][0] || ''}`.toUpperCase();
          }
          const hostToken = hostFragments[0] || primaryHost.split('.')[0] || '';
          if (hostToken) {
              return hostToken.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '').slice(0, 3).toUpperCase() || 'DB';
          }
      }

      return getRailConnectionTypeLabel(conn);
  };

  const getRailConnectionBadgeLabel = (conn: SavedConnection): string => {
      const connectionName = String(conn.name || '').trim();
      const cjkParts = connectionName.match(/[\u4e00-\u9fa5]/g);
      if (cjkParts && cjkParts.length > 0) {
          return cjkParts.slice(0, 2).join('');
      }

      const latinTokens = connectionName.match(/[a-z0-9]+/gi) || [];
      if (latinTokens.length >= 2) {
          const firstToken = latinTokens[0] || '';
          const secondToken = latinTokens[1] || '';
          return `${firstToken[0] || ''}${secondToken[0] || ''}`.toUpperCase();
      }
      if (latinTokens.length === 1) {
          const token = latinTokens[0];
          const alphaPrefix = token.match(/^[a-z]+/i)?.[0] || '';
          if (alphaPrefix) {
              return alphaPrefix.slice(0, 3).toUpperCase();
          }
          const trailingDigits = token.match(/(\d{2,})$/)?.[1];
          if (trailingDigits) {
              return trailingDigits.slice(-3).toUpperCase();
          }
          return token.slice(0, 3).toUpperCase();
      }

      return getRailConnectionTypeLabel(conn);
  };

  const openV2ConnectionContextMenu = (
      event: React.MouseEvent,
      connOrNode: SavedConnection | TreeNode,
  ) => {
      event.preventDefault();
      event.stopPropagation();
      const node = (connOrNode as TreeNode).type === 'connection'
          ? connOrNode as TreeNode
          : getConnectionNodeForAction(connOrNode as SavedConnection);
      if (!node?.key || !node?.dataRef) return;
      const position = resolveSidebarContextMenuPosition(event.clientX, event.clientY);
      setContextMenu({
          x: position.x,
          y: position.y,
          sourceX: event.clientX,
          sourceY: event.clientY,
          items: [],
          kind: 'v2-connection',
          node,
          rootClassName: 'gn-v2-table-context-menu-popup',
          overlayStyle: { width: 264, maxWidth: 'calc(100vw - 24px)' },
          maxHeight: position.maxHeight,
      });
  };

  const getV2TreeMetaText = (node: any): string => {
      if (node.type === 'tag') {
          const count = flattenConnectionNodes(node.children || []).length;
          return count > 0 ? count.toLocaleString() : '';
      }
      if (node.type === 'database') {
          const count = v2TreeMetrics.databaseTableCounts.get(node.key) || 0;
          return count > 0 ? count.toLocaleString() : '';
      }
      if (node.type === 'object-group') {
          const count = v2TreeMetrics.objectGroupCounts.get(node.key) || 0;
          return count > 0 ? count.toLocaleString() : '';
      }
      if (node.type === 'redis-db') {
          const match = String(node.title || '').match(/\((\d+)\)/);
          return match?.[1] || '';
      }
      if (node.type === 'table') {
          const rowCount = Number(node?.dataRef?.rowCount);
          return Number.isFinite(rowCount) && rowCount >= 0 ? formatSidebarRowCount(rowCount) : '';
      }
      return '';
  };

  const getV2TableContextMenuStatsKey = (node: any): string => {
      const id = String(node?.dataRef?.id || '');
      const dbName = String(node?.dataRef?.dbName || '');
      const tableName = String(node?.dataRef?.tableName || node?.title || '');
      return `${id}::${dbName}::${tableName}`;
  };

  const readNumericMetadataValue = (row: Record<string, any>, keys: string[]): number | undefined => {
      const value = getCaseInsensitiveRawValue(row, keys);
      if (value === undefined || value === null || value === '') return undefined;
      const normalized = Number(String(value).replace(/,/g, ''));
      return Number.isFinite(normalized) ? normalized : undefined;
  };

  const buildV2TableStatusSQL = (node: any): string => {
      const conn = node.dataRef as SavedConnection & { dbName?: string; tableName?: string; schemaName?: string };
      const dialect = getMetadataDialect(conn);
      const dbName = String(conn?.dbName || '').trim();
      const tableName = String(conn?.tableName || node?.title || '').trim();
      const objectName = extractObjectName(tableName);
      const schemaName = String(conn?.schemaName || splitQualifiedName(tableName).schemaName || '').trim();
      switch (dialect) {
          case 'mysql':
          case 'starrocks':
              return [
                  'SELECT TABLE_ROWS AS table_rows, DATA_LENGTH AS data_length, INDEX_LENGTH AS index_length, ENGINE AS engine',
                  'FROM information_schema.tables',
                  `WHERE table_schema = '${escapeSQLLiteral(dbName)}'`,
                  `AND table_name = '${escapeSQLLiteral(objectName)}'`,
                  'LIMIT 1',
              ].join('\n');
          case 'postgres':
          case 'kingbase':
          case 'vastbase':
          case 'highgo':
          case 'opengauss':
          case 'gaussdb': {
              const schema = schemaName || 'public';
              return [
                  "SELECT c.reltuples::bigint AS table_rows, pg_total_relation_size(c.oid) AS data_length, pg_indexes_size(c.oid) AS index_length, 'heap' AS engine",
                  'FROM pg_class c',
                  'JOIN pg_namespace n ON n.oid = c.relnamespace',
                  "WHERE c.relkind = 'r'",
                  `AND n.nspname = '${escapeSQLLiteral(schema)}'`,
                  `AND c.relname = '${escapeSQLLiteral(objectName)}'`,
                  'LIMIT 1',
              ].join('\n');
          }
          case 'sqlserver': {
              const safeTable = tableName.replace(/'/g, "''");
              return [
                  'SELECT SUM(p.rows) AS table_rows, SUM(a.total_pages) * 8 * 1024 AS data_length, SUM(a.used_pages) * 8 * 1024 AS index_length, NULL AS engine',
                  'FROM sys.tables t',
                  'JOIN sys.indexes i ON t.object_id = i.object_id',
                  'JOIN sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id',
                  'JOIN sys.allocation_units a ON p.partition_id = a.container_id',
                  `WHERE t.object_id = OBJECT_ID('${safeTable}')`,
              ].join('\n');
          }
          case 'clickhouse':
              return [
                  'SELECT total_rows AS table_rows, total_bytes AS data_length, 0 AS index_length, engine AS engine',
                  'FROM system.tables',
                  `WHERE database = '${escapeSQLLiteral(dbName)}'`,
                  `AND name = '${escapeSQLLiteral(objectName)}'`,
                  'LIMIT 1',
              ].join('\n');
          case 'oracle':
          case 'dm': {
              const owner = (schemaName || dbName || '').toUpperCase();
              return [
                  'SELECT num_rows AS table_rows, 0 AS data_length, 0 AS index_length, NULL AS engine',
                  'FROM all_tables',
                  `WHERE owner = '${escapeSQLLiteral(owner)}'`,
                  `AND table_name = '${escapeSQLLiteral(objectName.toUpperCase())}'`,
                  'FETCH FIRST 1 ROWS ONLY',
              ].join('\n');
          }
          case 'sqlite':
          case 'duckdb':
              return `SELECT COUNT(*) AS table_rows, 0 AS data_length, 0 AS index_length, NULL AS engine FROM ${tableName}`;
          default:
              return '';
      }
  };

  const renderV2TableContextMenu = (node: any) => {
      const tableName = String(node?.dataRef?.tableName || node?.title || '').trim();
      const statsKey = getV2TableContextMenuStatsKey(node);
      const stats = v2TableContextMenuStats[statsKey];
      const isStarRocks = getMetadataDialect(node.dataRef as SavedConnection) === 'starrocks';
      const supportsMessagePublish = Boolean(resolveMessagePublishTarget(node));
      const isPinned = isSidebarTablePinned(
          pinnedSidebarTables,
          String(node?.dataRef?.id || ''),
          String(node?.dataRef?.dbName || ''),
          tableName,
          String(node?.dataRef?.schemaName || ''),
      );
      return (
          <V2TableContextMenuView
              tableName={tableName}
              shortcutPlatform={activeShortcutPlatform}
              stats={stats}
              isPinned={isPinned}
              supportsTruncate={supportsTableTruncateAction(node.dataRef?.config?.type, node.dataRef?.config?.driver)}
              supportsStarRocksRollup={isStarRocks}
              supportsMessagePublish={supportsMessagePublish}
              onAction={(action) => {
                  setContextMenu(null);
                  handleV2TableContextMenuAction(node, action);
              }}
          />
      );
  };

  const renderV2TableGroupContextMenu = (node: any) => {
      const groupData = node.dataRef || {};
      const sortPreferenceKey = `${groupData.id}-${groupData.dbName}`;
      const currentSort = tableSortPreference[sortPreferenceKey] || 'name';
      return (
          <V2TableGroupContextMenuView
              shortcutPlatform={activeShortcutPlatform}
              dbName={String(groupData.dbName || '')}
              count={Array.isArray(node.children) ? node.children.length : 0}
              currentSort={currentSort}
              onAction={(action) => {
                  setContextMenu(null);
                  handleV2TableGroupContextMenuAction(node, action);
              }}
          />
      );
  };

  const renderV2DatabaseContextMenu = (node: any) => {
      const dialect = getMetadataDialect(node.dataRef as SavedConnection);
      const capabilities = getDataSourceCapabilities((node.dataRef as SavedConnection)?.config);
      return (
          <V2DatabaseContextMenuView
              dbName={String(node.dataRef?.dbName || node.title || '')}
              shortcutPlatform={activeShortcutPlatform}
              dialect={dialect}
              supportsSchemaActions={isPostgresSchemaDialect(dialect)}
              supportsStarRocksActions={dialect === 'starrocks'}
              supportsRenameDatabase={capabilities.supportsRenameDatabase}
              supportsDropDatabase={capabilities.supportsDropDatabase}
              onAction={(action) => {
                  setContextMenu(null);
                  handleV2DatabaseContextMenuAction(node, action);
              }}
          />
      );
  };

  const handleV2SchemaContextMenuAction = (node: any, action: V2SchemaContextMenuActionKey) => {
      switch (action) {
          case 'rename-schema':
              openRenameSchemaModal(node);
              return;
          case 'refresh-schema':
              void loadTables(getDatabaseNodeRef(node?.dataRef, String(node?.dataRef?.dbName || '').trim()));
              return;
          case 'export-schema':
              void handleExportSchemaSQL(node, false);
              return;
          case 'backup-schema-sql':
              void handleExportSchemaSQL(node, true);
              return;
          case 'drop-schema':
              handleDeleteSchema(node);
              return;
          default:
              return;
      }
  };

  const renderV2SchemaContextMenu = (node: any) => (
      <V2SchemaContextMenuView
          dbName={String(node?.dataRef?.dbName || '')}
          schemaName={String(node?.dataRef?.schemaName || node?.title || '')}
          shortcutPlatform={activeShortcutPlatform}
          onAction={(action) => {
              setContextMenu(null);
              handleV2SchemaContextMenuAction(node, action);
          }}
      />
  );

  const renderV2ConnectionContextMenu = (node: any) => {
      const conn = node.dataRef as SavedConnection;
      const capabilities = getDataSourceCapabilities(conn?.config);
      const currentTagId = connectionTags.find((tag) => tag.connectionIds.includes(String(conn.id || node.key)))?.id || '';
      return (
          <V2ConnectionContextMenuView
              connectionName={String(conn?.name || node.title || t('connection.unnamed'))}
              shortcutPlatform={activeShortcutPlatform}
              hostSummary={resolveConnectionHostSummary(conn?.config)}
              driverLabel={resolveConnectionIconType(conn)}
              isRedis={conn?.config?.type === 'redis'}
              supportsCreateDatabase={capabilities.supportsCreateDatabase}
              tags={connectionTags.map((tag) => ({
                  id: tag.id,
                  name: tag.name,
                  selected: tag.id === currentTagId,
              }))}
              onAction={(action) => {
                  setContextMenu(null);
                  handleV2ConnectionContextMenuAction(node, action);
              }}
          />
      );
  };

  const renderV2ConnectionGroupContextMenu = (group: V2RailConnectionGroup) => (
      <V2ConnectionGroupContextMenuView
          groupName={group.name}
          count={group.connections.length}
          onAction={(action) => {
              setContextMenu(null);
              handleV2ConnectionGroupContextMenuAction(group, action);
          }}
      />
  );

  const renderV2SidebarContextMenuContent = (menu: SidebarContextMenuState) => {
      if (!menu.node) return null;
      if (menu.kind === 'v2-table') return renderV2TableContextMenu(menu.node);
      if (menu.kind === 'v2-database') return renderV2DatabaseContextMenu(menu.node);
      if (menu.kind === 'v2-schema') return renderV2SchemaContextMenu(menu.node);
      if (menu.kind === 'v2-table-group') return renderV2TableGroupContextMenu(menu.node);
      if (menu.kind === 'v2-connection') return renderV2ConnectionContextMenu(menu.node);
      if (menu.kind === 'v2-connection-group') return renderV2ConnectionGroupContextMenu(menu.node);
      return null;
  };

  useEffect(() => {
      if (!contextMenu?.kind) return;
      const onPointerDown = (event: MouseEvent) => {
          const target = event.target instanceof Node ? event.target : null;
          if (target && contextMenuPortalRef.current?.contains(target)) return;
          setContextMenu(null);
      };
      const onKeyDown = (event: KeyboardEvent) => {
          if (event.key === 'Escape') setContextMenu(null);
      };
      document.addEventListener('mousedown', onPointerDown);
      document.addEventListener('keydown', onKeyDown);
      return () => {
          document.removeEventListener('mousedown', onPointerDown);
          document.removeEventListener('keydown', onKeyDown);
      };
  }, [contextMenu?.kind]);

  useEffect(() => {
      if (!contextMenu?.kind) return;
      const frame = requestAnimationFrame(() => {
          const portal = contextMenuPortalRef.current;
          if (!portal) return;
          const rect = portal.getBoundingClientRect();
          const content = portal.querySelector('.gn-v2-table-context-menu') as HTMLElement | null;
          const measuredHeight = Math.max(rect.height, content?.scrollHeight || 0);
          const position = resolveSidebarContextMenuPosition(contextMenu.sourceX ?? contextMenu.x, contextMenu.sourceY ?? contextMenu.y, {
              width: rect.width || SIDEBAR_CONTEXT_MENU_FALLBACK_WIDTH,
              height: measuredHeight || SIDEBAR_CONTEXT_MENU_FALLBACK_HEIGHT,
          });
          setContextMenu(prev => {
              if (!prev?.kind) return prev;
              if (prev.x === position.x && prev.y === position.y && prev.maxHeight === position.maxHeight) return prev;
              return { ...prev, x: position.x, y: position.y, maxHeight: position.maxHeight };
          });
      });
      return () => cancelAnimationFrame(frame);
  }, [contextMenu?.kind, contextMenu?.x, contextMenu?.y]);

  const fetchV2TableContextMenuStats = async (node: any) => {
      const statsKey = getV2TableContextMenuStatsKey(node);
      if (!statsKey || v2TableContextMenuStats[statsKey]?.loading) return;
      const sql = buildV2TableStatusSQL(node);
      if (!sql) {
          setV2TableContextMenuStats(prev => ({ ...prev, [statsKey]: { unavailable: true } }));
          return;
      }

      setV2TableContextMenuStats(prev => ({ ...prev, [statsKey]: { ...prev[statsKey], loading: true } }));
      const startTime = Date.now();
      try {
          const conn = node.dataRef;
          const res = await DBQuery(buildRuntimeConfig(conn, conn.dbName) as any, conn.dbName || '', sql);
          if (!res.success || !Array.isArray(res.data) || res.data.length === 0) {
              setV2TableContextMenuStats(prev => ({ ...prev, [statsKey]: { unavailable: true } }));
              return;
          }
          const row = res.data[0] as Record<string, any>;
          setV2TableContextMenuStats(prev => ({
              ...prev,
              [statsKey]: {
                  rowCount: readNumericMetadataValue(row, ['table_rows', 'TABLE_ROWS', 'rows', 'num_rows', 'reltuples', 'total_rows']),
                  dataLength: readNumericMetadataValue(row, ['data_length', 'DATA_LENGTH', 'total_bytes']),
                  indexLength: readNumericMetadataValue(row, ['index_length', 'INDEX_LENGTH']),
                  engine: getCaseInsensitiveValue(row, ['engine', 'ENGINE']),
              },
          }));
          addSqlLog({
              id: `${Date.now()}-table-stats`,
              timestamp: Date.now(),
              sql,
              status: 'success',
              duration: Date.now() - startTime,
              dbName: conn.dbName,
          });
      } catch (error: any) {
          setV2TableContextMenuStats(prev => ({ ...prev, [statsKey]: { unavailable: true } }));
          addSqlLog({
              id: `${Date.now()}-table-stats-error`,
              timestamp: Date.now(),
              sql,
              status: 'error',
              duration: Date.now() - startTime,
              message: error?.message || String(error),
              dbName: node?.dataRef?.dbName,
          });
      }
  };

  const refreshV2TableContextMenuStats = (node: any) => {
      const statsKey = getV2TableContextMenuStatsKey(node);
      setV2TableContextMenuStats(prev => ({ ...prev, [statsKey]: { loading: true } }));
      void fetchV2TableContextMenuStats(node);
  };

  const renderV2TreeTitle = (node: any, hoverTitle: string, statusBadge: React.ReactNode) => {
      const rawTitle = String(node.title ?? '');
      const groupKey = String(node?.dataRef?.groupKey || '');
      const dragText = resolveSidebarObjectDragText(node);
      if (node.type === 'v2-table-section') {
          return (
              <span
                  className="gn-v2-tree-section-title"
                  data-section-kind={node?.dataRef?.sectionKind || undefined}
                  title={rawTitle}
              >
                  {rawTitle}
              </span>
          );
      }
      const displayTitle = (() => {
           if (node.type === 'queries-folder') return t('sidebar.tree.saved_queries');
           if (node.type === 'external-sql-root') return t('sidebar.external_sql.root');
           if (node.type === 'object-group') {
              const objectGroupTitle = resolveV2ObjectGroupTitle(node);
              if (objectGroupTitle) return objectGroupTitle;
           }
           return rawTitle;
       })();
      const metaText = getV2TreeMetaText(node);
      const isMono = node.type === 'table'
          || node.type === 'view'
          || node.type === 'materialized-view'
          || node.type === 'db-trigger'
          || node.type === 'db-event'
          || node.type === 'routine'
          || node.type === 'saved-query'
          || node.type === 'external-sql-file';
      const titleClassName = [
          'gn-v2-tree-title',
          isMono ? 'is-mono' : '',
          node.type === 'object-group' ? 'is-group' : '',
          node.type === 'table' && node?.dataRef?.pinnedSidebarTable ? 'is-pinned-table' : '',
      ].filter(Boolean).join(' ');
      const tablePinAction = node.type === 'table' ? (
          <button
              type="button"
              className={[
                  'gn-v2-table-pin-action',
                  node?.dataRef?.pinnedSidebarTable ? 'is-pinned' : '',
              ].filter(Boolean).join(' ')}
              title={node?.dataRef?.pinnedSidebarTable ? t('sidebar.action.unpin_table') : t('sidebar.action.pin_table')}
              aria-label={node?.dataRef?.pinnedSidebarTable ? t('sidebar.action.unpin_table') : t('sidebar.action.pin_table')}
              aria-pressed={node?.dataRef?.pinnedSidebarTable ? true : false}
              data-v2-sidebar-table-pin-action="true"
              onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
              }}
              onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  toggleSidebarTablePinned(node);
              }}
              onDoubleClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
              }}
          >
              {node?.dataRef?.pinnedSidebarTable ? <StarFilled /> : <StarOutlined />}
          </button>
      ) : null;
      if (node.type === 'connection') {
          return (
            <span
                className={`${titleClassName} is-connection`}
                title={hoverTitle}
                data-node-type={node.type}
                data-sidebar-node-key={String(node.key || '')}
                data-sidebar-node-type={String(node.type || '')}
            >
                {statusBadge}
                <span className="gn-v2-tree-connection-copy">
                    <span className="gn-v2-tree-label">{displayTitle}</span>
                </span>
            </span>
          );
      }
      return (
        <>
          <span
              className={titleClassName}
              title={hoverTitle}
              draggable={!!dragText}
              data-node-type={node.type}
              data-group-key={groupKey || undefined}
              data-sidebar-node-key={String(node.key || '')}
              data-sidebar-node-type={String(node.type || '')}
              onDragStart={dragText ? (event) => {
                  snapshotTreeSelectionBeforeDrag();
                  treeDragSelectSuppressUntilRef.current = Date.now() + 600;
                  setIsTreeDragging(true);
                  event.stopPropagation();
                  event.dataTransfer.effectAllowed = 'copy';
                  event.dataTransfer.setData('text/plain', dragText);
                  event.dataTransfer.setData(
                      SIDEBAR_SQL_EDITOR_DRAG_MIME,
                      encodeSidebarSqlEditorDragPayload({
                          text: dragText,
                          nodeType: node.type,
                          connectionId: String(node?.dataRef?.id || ''),
                          dbName: String(node?.dataRef?.dbName || ''),
                      }),
                  );
              } : undefined}
              onDragEnd={dragText ? () => {
                  restoreTreeSelectionAfterDrag();
                  setIsTreeDragging(false);
              } : undefined}
          >
              {statusBadge}
              <span className="gn-v2-tree-label">{displayTitle}</span>
              {metaText && <span className="gn-v2-tree-count">{metaText}</span>}
          </span>
          {tablePinAction}
        </>
      );
  };

  const selectConnectionFromRail = useCallback((conn: SavedConnection) => {
      const key = conn.id;
      const connectionNode = findTreeNodeByKeyRef.current(treeDataRef.current, key);
      setSelectedKeys([key]);
      selectedNodesRef.current = connectionNode ? [connectionNode] : [];
      setActiveContext({ connectionId: key, dbName: '' });
      mergeExpandedTreeKeys([key]);
      const targetNode = connectionNode || {
          key,
          dataRef: conn,
          type: 'connection',
      };
      void loadDatabases(targetNode);
  }, [setActiveContext]);

  const runCommandSearchItem = useCallback((item?: V2CommandSearchItem) => {
      if (!item) return;
      closeV2CommandSearch();
      if (item.kind === 'action') {
          item.onRun();
          return;
      }
      if (item.kind === 'recent') {
          addTab({
              id: `query-${Date.now()}`,
              title: '最近查询',
              type: 'query',
              connectionId: item.connectionId || activeContext?.connectionId || activeTab?.connectionId || '',
              dbName: item.dbName || activeContext?.dbName || activeTab?.dbName || '',
              query: item.sql,
          });
          return;
      }

      const node = item.node;
      const dataRef = node.dataRef || {};
      if (node.type === 'connection') {
          selectConnectionFromRail(dataRef as SavedConnection);
          return;
      }
	      if (node.type === 'database') {
	          setActiveContext({ connectionId: resolveSidebarNodeConnectionId(node, connectionIds) || dataRef.id, dbName: dataRef.dbName });
	          mergeExpandedTreeKeys([dataRef.id, node.key]);
	          setSelectedKeys([node.key]);
	          selectedNodesRef.current = [node];
          scrollSidebarTreeToKey(node.key);
          return;
      }
      if (node.type === 'table' || node.type === 'view' || node.type === 'materialized-view') {
          void locateObjectInSidebar({
              tabId: String(node.key || ''),
              connectionId: dataRef.id,
              dbName: dataRef.dbName,
              tableName: dataRef.tableName || dataRef.viewName,
              schemaName: dataRef.schemaName,
              objectGroup: node.type === 'table' ? 'tables' : (node.type === 'materialized-view' ? 'materializedViews' : 'views'),
          });
          onDoubleClick(null, node);
          return;
      }
      if (node.type === 'db-trigger' || node.type === 'db-event' || node.type === 'routine') {
          setActiveContext({ connectionId: dataRef.id, dbName: dataRef.dbName });
          setSelectedKeys([node.key]);
          selectedNodesRef.current = [node];
          scrollSidebarTreeToKey(node.key);
          onDoubleClick(null, node);
      }
  }, [activeContext, activeTab, addTab, closeV2CommandSearch, selectConnectionFromRail, setActiveContext]);

  const handleV2CommandSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowDown') {
          event.preventDefault();
          setV2CommandActiveIndex((prev) => {
              if (commandSearchFlatItems.length === 0) return 0;
              return Math.min(prev + 1, commandSearchFlatItems.length - 1);
          });
          return;
      }
      if (event.key === 'ArrowUp') {
          event.preventDefault();
          setV2CommandActiveIndex((prev) => Math.max(prev - 1, 0));
          return;
      }
      if (event.key === 'Enter') {
          if (!shouldRunV2CommandSearchEnter({
              key: event.key,
              isComposing: event.nativeEvent.isComposing,
              keyCode: event.nativeEvent.keyCode,
              activeItemCount: commandSearchFlatItems.length,
          })) {
              return;
          }
          event.preventDefault();
          runCommandSearchItem(commandSearchFlatItems[v2CommandActiveIndex]);
          return;
      }
      if (event.key === 'Escape') {
          event.preventDefault();
          closeV2CommandSearch();
      }
  };

  const renderV2CommandSearchRow = (item: V2CommandSearchItem, active: boolean) => (
      <button
          key={item.key}
          type="button"
          className={`gn-v2-command-row${active ? ' is-active' : ''}`}
          onMouseEnter={() => setV2CommandActiveIndex(commandSearchFlatItems.findIndex((entry) => entry.key === item.key))}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runCommandSearchItem(item)}
      >
          <span className={`gn-v2-command-row-icon is-${item.kind}`}>{item.icon}</span>
          <span className="gn-v2-command-row-main">
              <strong>{item.title}</strong>
              {item.meta ? <small>{item.meta}</small> : null}
          </span>
          {item.kind === 'action' && item.shortcut ? <kbd>{item.shortcut}</kbd> : null}
      </button>
  );

  const renderV2CommandSearchSection = (title: string, items: V2CommandSearchItem[]) => {
      if (items.length === 0) return null;
      return (
          <section className="gn-v2-command-section">
              <div className="gn-v2-command-section-title">{title}</div>
              {items.map((item) => renderV2CommandSearchRow(
                  item,
                  commandSearchFlatItems[v2CommandActiveIndex]?.key === item.key,
              ))}
          </section>
      );
  };

	  const renderV2CommandSearchOverlay = () => {
	      if (!isV2CommandSearchOpen) return null;
	      const emptyCopy = v2CommandSearchAiMode
	          ? '输入「?」后加问题，按 Enter 发送到 AI 面板。'
	          : (v2CommandSearchObjectMode
	              ? '未找到匹配的表、视图或物化视图。'
	              : '未找到匹配项。可输入 @表名 只搜表对象，或输入 ?问题 让 AI 回答。');
	      return (
	          <div className="gn-v2-command-backdrop" data-v2-command-search="true" onMouseDown={closeV2CommandSearch}>
              <div className="gn-v2-command-palette" role="dialog" aria-modal="true" aria-label={v2CommandSearchLabel} onMouseDown={(event) => event.stopPropagation()}>
                  <div className="gn-v2-command-searchbar">
                      <SearchOutlined />
                      <Input
                          {...noAutoCapInputProps}
                          ref={commandSearchInputRef}
                          variant="borderless"
                          value={v2CommandSearchValue}
                          onChange={(event) => handleV2CommandSearchValueChange(event.target.value)}
                          onKeyDown={handleV2CommandSearchKeyDown}
                          placeholder={v2CommandSearchPlaceholder}
                      />
                      <Tooltip title={t('sidebar.command_search.sync_to_filter_tooltip')}>
                          <span className="gn-v2-command-filter-switch" aria-label={t('sidebar.command_search.sync_to_filter_aria')}>
                              <Switch
                                  size="small"
                                  checked={v2CommandSearchPersistentFilterEnabled}
                                  onChange={toggleV2CommandSearchPersistentFilter}
                              />
                          </span>
                      </Tooltip>
                      <Tooltip title={v2PersistedSidebarFilter ? t('sidebar.command_search.reset_filter') : t('sidebar.command_search.no_synced_filter')}>
                          <Button
                              size="small"
                              type="text"
                              icon={<ReloadOutlined />}
                              aria-label={t('sidebar.command_search.reset_filter')}
                              disabled={!v2PersistedSidebarFilter}
                              onClick={resetV2SidebarFilter}
                          />
                      </Tooltip>
                      <kbd>esc</kbd>
                  </div>
                  <div className="gn-v2-command-list">
	                      {renderV2CommandSearchSection('跳转 · GO TO', filteredCommandSearchTreeItems)}
	                      {renderV2CommandSearchSection('AI · ASK', commandSearchAiItem)}
	                      {renderV2CommandSearchSection('动作 · ACTIONS', filteredCommandSearchActionItems)}
	                      {renderV2CommandSearchSection('近期查询 · RECENT', filteredCommandSearchRecentItems)}
	                      {commandSearchFlatItems.length === 0 ? (
	                          <div className="gn-v2-command-empty">
	                              {emptyCopy}
	                          </div>
	                      ) : null}
	                  </div>
	                  <div className="gn-v2-command-footer">
	                      <span><kbd>↑</kbd><kbd>↓</kbd>导航</span>
	                      <span><kbd>↵</kbd>选择</span>
	                      <span><TableOutlined /> <kbd>@</kbd>只搜表对象</span>
	                      <span><RobotOutlined /> <kbd>?</kbd>发送给 AI</span>
	                  </div>
	              </div>
	          </div>
      );
  };

  expandConnectionFromRailRef.current = (connectionId: string) => {
      const conn = connections.find((item) => item.id === connectionId);
      if (conn) {
          selectConnectionFromRail(conn);
      }
  };

  const getNodeMenuItems = (node: any): MenuProps['items'] => {
    const conn = node.dataRef as SavedConnection;
    const isRedis = conn?.config?.type === 'redis';

    if (node.type === 'object-group' && node.dataRef?.groupKey === 'schema') {
        const dialect = getMetadataDialect(node.dataRef as SavedConnection);
        const schemaName = String(node?.dataRef?.schemaName || '').trim();
        if (!isPostgresSchemaDialect(dialect) || !schemaName) {
            return [];
        }
        return [
            {
                key: 'rename-schema',
                label: '编辑模式',
                icon: <EditOutlined />,
                onClick: () => openRenameSchemaModal(node)
            },
            {
                key: 'refresh-schema',
                label: '刷新',
                icon: <ReloadOutlined />,
                onClick: () => void loadTables(getDatabaseNodeRef(node.dataRef, node.dataRef.dbName))
            },
            {
                key: 'export-schema',
                label: '导出当前模式表结构 (SQL)',
                icon: <ExportOutlined />,
                onClick: () => void handleExportSchemaSQL(node, false)
            },
            {
                key: 'backup-schema-sql',
                label: '备份当前模式全部表 (结构+数据 SQL)',
                icon: <SaveOutlined />,
                onClick: () => void handleExportSchemaSQL(node, true)
            },
            { type: 'divider' },
            {
                key: 'drop-schema',
                label: '删除模式',
                icon: <DeleteOutlined />,
                danger: true,
                onClick: () => handleDeleteSchema(node)
            },
        ];
    }

    // 表分组节点的右键菜单
    if (node.type === 'object-group' && node.dataRef?.groupKey === 'tables') {
        const groupData = node.dataRef; // { ...conn, dbName, groupKey }
        const sortPreferenceKey = `${groupData.id}-${groupData.dbName}`;
        const currentSort = tableSortPreference[sortPreferenceKey] || 'name';
        const canCreateTable = !isStructureOnlyDbType(String(groupData.id || ''));

        return [
            ...(canCreateTable ? [{
                key: 'new-table',
                label: '新建表',
                icon: <TableOutlined />,
                onClick: () => openNewTableDesign(node)
            }] : []),
            { type: 'divider' },
            {
                key: 'sort-by-name',
                label: '按名称排序',
                icon: currentSort === 'name' ? <CheckSquareOutlined /> : null,
                onClick: () => handleTableGroupSortAction(node, 'name')
            },
            {
                key: 'sort-by-frequency',
                label: '按使用频率排序',
                icon: currentSort === 'frequency' ? <CheckSquareOutlined /> : null,
                onClick: () => handleTableGroupSortAction(node, 'frequency')
            }
        ];
    }

    // 视图分组节点的右键菜单
    if (node.type === 'object-group' && node.dataRef?.groupKey === 'views') {
        return [
            {
                key: 'create-view',
                label: t('sidebar.menu.create_view'),
                icon: <PlusOutlined />,
                onClick: () => openCreateView(node)
            },
        ];
    }

    if (node.type === 'object-group' && node.dataRef?.groupKey === 'materializedViews') {
        return [
            {
                key: 'create-materialized-view',
                label: t('sidebar.v2_database_menu.new_materialized_view'),
                icon: <PlusOutlined />,
                onClick: () => openCreateStarRocksMaterializedView(node)
            },
        ];
    }

    // 函数分组节点的右键菜单
    if (node.type === 'object-group' && node.dataRef?.groupKey === 'routines') {
        const dialect = getMetadataDialect(node.dataRef as SavedConnection);
        const routineMenu: MenuProps['items'] = [
            {
                key: 'create-function',
                label: t('sidebar.tab.create_function'),
                icon: <PlusOutlined />,
                onClick: () => openCreateRoutine(node, 'FUNCTION')
            },
        ];
        if (dialect !== 'duckdb') {
            routineMenu.push({
                key: 'create-procedure',
                label: t('sidebar.tab.create_procedure'),
                icon: <PlusOutlined />,
                onClick: () => openCreateRoutine(node, 'PROCEDURE')
            });
        }
        return routineMenu;
    }

    if (node.type === 'object-group' && node.dataRef?.groupKey === 'events') {
        return [
            {
                key: 'create-event-query',
                label: '新建事件',
                icon: <PlusOutlined />,
                onClick: () => {
                    addTab({
                        id: `query-create-event-${Date.now()}`,
                        title: '新建事件',
                        type: 'query',
                        connectionId: node.dataRef.id,
                        dbName: node.dataRef.dbName,
                        query: `CREATE EVENT event_name\nON SCHEDULE EVERY 1 DAY\nDO\nBEGIN\n    -- event body\nEND;`
                    });
                }
            },
        ];
    }

    // Connection Tag Menu — must be BEFORE the connection check
    if (node.type === 'tag') {
        return [
            {
                key: 'edit-tag',
                label: '编辑标签',
                icon: <EditOutlined />,
                onClick: () => {
                    createTagForm.setFieldsValue({ name: node.title, connectionIds: node.dataRef.connectionIds });
                    setRenameViewTarget(node);
                    setIsCreateTagModalOpen(true);
                }
            },
            { type: 'divider' },
            {
                key: 'delete-tag',
                label: '删除标签',
                icon: <DeleteOutlined />,
                danger: true,
                onClick: () => {
                    Modal.confirm({
                        title: '确认删除',
                        content: `确定要删除标签 "${node.title}" 吗？这不会删除里面的连接。`,
                        onOk: () => {
                            removeConnectionTag(node.dataRef.id);
                        }
                    });
                }
            }
        ];
    }

    if (node.type === 'connection') {
        // Redis connection menu
        if (isRedis) {
            return [
                {
                    key: 'refresh',
                    label: t('sidebar.menu.refresh'),
                    icon: <ReloadOutlined />,
                    onClick: () => {
                        const connKey = String(node.key);
                        // 清除子节点的展开/已加载状态，确保刷新后重新展开时能触发 onLoadData
                        setExpandedKeys(prev => prev.filter(k => !k.toString().startsWith(`${connKey}-`)));
                        setLoadedKeys(prev => prev.filter(k => !k.toString().startsWith(`${connKey}-`)));
                        // 清除 loadingNodesRef 中残留的子节点加载标记
                        Array.from(loadingNodesRef.current).forEach(lk => {
                            if (lk.startsWith(`tables-${connKey}-`)) loadingNodesRef.current.delete(lk);
                        });
                        loadDatabases(node);
                    }
                },
                { type: 'divider' },
                {
                    key: 'new-command',
                    label: t('sidebar.menu.new_command_window'),
                    icon: <ConsoleSqlOutlined />,
                    onClick: () => {
                        addTab({
                            id: `redis-cmd-${node.key}-${Date.now()}`,
                            title: buildConnectionRootRedisCommandTabTitle(),
                            type: 'redis-command',
                            connectionId: node.key,
                            redisDB: 0
                        });
                    }
                },
                {
                    key: 'open-monitor',
                    label: t('redis_monitor.title.instance'),
                    icon: <DashboardOutlined />,
                    onClick: () => {
                        addTab({
                            id: `redis-monitor-${node.key}-${Date.now()}`,
                            title: buildConnectionRootRedisMonitorTabTitle(),
                            type: 'redis-monitor',
                            connectionId: node.key,
                            redisDB: 0
                        });
                    }
                },
                { type: 'divider' },
                {
                    key: 'edit',
                    label: t('sidebar.menu.edit_connection'),
                    icon: <EditOutlined />,
                    onClick: () => {
                        if (onEditConnection) onEditConnection(node.dataRef);
                    }
                },
                {
                    key: 'copy-connection',
                    label: t('connection.sidebar.menu.copy'),
                    icon: <CopyOutlined />,
                    onClick: () => handleDuplicateConnection(node.dataRef as SavedConnection)
                },
                {
                    key: 'disconnect',
                    label: t('connection.sidebar.menu.disconnect'),
                    icon: <DisconnectOutlined />,
                    onClick: () => void disconnectConnectionNode(node)
                },
                {
                    key: 'delete',
                    label: t('connection.sidebar.menu.delete'),
                    icon: <DeleteOutlined />,
                    danger: true,
                    onClick: () => deleteConnectionNode(node)
                }
            ];
        }

        // Tag submenu for connection
        const tagSubMenuItems: MenuProps['items'] = connectionTags.map(tag => ({
            key: `move-to-tag-${tag.id}`,
            label: tag.name,
            icon: <FolderOutlined />,
            onClick: () => moveConnectionToTag(node.key, tag.id)
        }));
        if (connectionTags.length > 0) {
            tagSubMenuItems.push({ type: 'divider' });
        }
        tagSubMenuItems.push({
            key: 'move-to-ungrouped',
            label: t('connection.sidebar.menu.moveOutTag'),
            onClick: () => moveConnectionToTag(node.key, null)
        });

        // Regular database connection menu
        const connectionCapabilities = getDataSourceCapabilities((node.dataRef as SavedConnection)?.config);
        return [
            ...(connectionCapabilities.supportsCreateDatabase ? [{
                key: 'new-db',
                label: t('connection.sidebar.menu.createDatabase'),
                icon: <DatabaseOutlined />,
                onClick: () => {
                    setTargetConnection(node);
                    setIsCreateDbModalOpen(true);
                }
            }] : []),
            {
                key: 'refresh',
                label: t('sidebar.menu.refresh'),
                icon: <ReloadOutlined />,
                onClick: () => {
                    const connKey = String(node.key);
                    // 清除子节点的展开/已加载状态，确保刷新后重新展开时能触发 onLoadData
                    setExpandedKeys(prev => prev.filter(k => !k.toString().startsWith(`${connKey}-`)));
                    setLoadedKeys(prev => prev.filter(k => !k.toString().startsWith(`${connKey}-`)));
                    // 清除 loadingNodesRef 中残留的子节点加载标记
                    Array.from(loadingNodesRef.current).forEach(lk => {
                        if (lk.startsWith(`tables-${connKey}-`)) loadingNodesRef.current.delete(lk);
                    });
                    loadDatabases(node);
                }
            },
            { type: 'divider' },
             {
               key: 'new-query',
               label: t('sidebar.menu.new_query'),
               icon: <ConsoleSqlOutlined />,
               onClick: () => {
                   addTab({
                       id: `query-${Date.now()}`,
                       title: buildConnectionRootQueryTabTitle(),
                       type: 'query',
                       connectionId: node.key,
                       dbName: undefined,
                       query: ''
                   });
               }
             },
             {
                 key: 'open-sql-file',
                 label: t('sidebar.sql_file_exec.title'),
                 icon: <FileAddOutlined />,
                 onClick: () => handleRunSQLFile(node)
             },
             { type: 'divider' },
             {
                 key: 'edit',
                 label: t('sidebar.menu.edit_connection'),
                 icon: <EditOutlined />,
                 onClick: () => {
                     if (onEditConnection) onEditConnection(node.dataRef);
                 }
             },
             {
                 key: 'copy-connection',
                 label: t('connection.sidebar.menu.copy'),
                 icon: <CopyOutlined />,
                 onClick: () => handleDuplicateConnection(node.dataRef as SavedConnection)
             },
             {
                 key: 'move-to-tag',
                 label: t('connection.sidebar.menu.moveToTag'),
                 icon: <FolderOpenOutlined />,
                 children: tagSubMenuItems
             },
             {
                 key: 'disconnect',
                 label: t('connection.sidebar.menu.disconnect'),
                 icon: <DisconnectOutlined />,
                 onClick: () => void disconnectConnectionNode(node)
             },
             {
                 key: 'delete',
                 label: t('connection.sidebar.menu.delete'),
                 icon: <DeleteOutlined />,
                 danger: true,
                 onClick: () => deleteConnectionNode(node)
             }
        ];
    } else if (node.type === 'redis-db') {
        // Redis database menu
        const { id, redisDB } = node.dataRef;
        return [
            {
                key: 'open-keys',
                label: t('redis_viewer.title.key_explorer'),
                icon: <KeyOutlined />,
                onClick: () => {
                    addTab({
                        id: `redis-keys-${id}-db${redisDB}`,
                        title: `db${redisDB}`,
                        type: 'redis-keys',
                        connectionId: id,
                        redisDB: redisDB
                    });
                }
            },
            {
                key: 'new-command',
                label: t('sidebar.menu.new_command_window'),
                icon: <ConsoleSqlOutlined />,
                onClick: () => {
                    addTab({
                        id: `redis-cmd-${id}-db${redisDB}-${Date.now()}`,
                        title: buildConnectionRootRedisCommandTabTitle(`db${redisDB}`),
                        type: 'redis-command',
                        connectionId: id,
                        redisDB: redisDB
                    });
                }
            },
            {
                key: 'open-monitor',
                label: t('redis_monitor.title.instance'),
                icon: <DashboardOutlined />,
                onClick: () => {
                    addTab({
                        id: `redis-monitor-${id}-db${redisDB}-${Date.now()}`,
                        title: buildConnectionRootRedisMonitorTabTitle(`db${redisDB}`),
                        type: 'redis-monitor',
                        connectionId: id,
                        redisDB: redisDB
                    });
                }
            }
        ];
    } else if (node.type === 'database') {
       const databaseConn = node.dataRef as SavedConnection;
       const dialect = getMetadataDialect(databaseConn);
       const capabilities = getDataSourceCapabilities(databaseConn?.config);
       const isStarRocks = dialect === 'starrocks';
       const supportsSchemaActions = isPostgresSchemaDialect(dialect);
       const canCreateTable = !isStructureOnlyDbType(String(databaseConn?.id || ''));
       return [
           ...(canCreateTable ? [{
                key: 'new-table',
                label: t('sidebar.menu.create_table'),
                icon: <TableOutlined />,
                onClick: () => openNewTableDesign(node)
            }] : []),
            ...(supportsSchemaActions ? [
                {
                    key: 'new-schema',
                    label: t('sidebar.v2_database_menu.new_schema'),
                    icon: <FolderAddOutlined />,
                    onClick: () => handleV2DatabaseContextMenuAction(node, 'new-schema')
                },
            ] : []),
            ...(isStarRocks ? [
                {
                    key: 'new-materialized-view',
                    label: t('sidebar.v2_database_menu.new_materialized_view'),
                    icon: <ThunderboltOutlined />,
                    onClick: () => openCreateStarRocksMaterializedView(node)
                },
                {
                    key: 'new-external-catalog',
                    label: t('sidebar.v2_database_menu.new_external_catalog'),
                    icon: <CloudOutlined />,
                    onClick: () => openCreateStarRocksExternalCatalog(node)
                },
            ] : []),
            ...(capabilities.supportsRenameDatabase ? [{
                key: 'rename-db',
                label: t('sidebar.menu.rename_database'),
                icon: <EditOutlined />,
                onClick: () => handleV2DatabaseContextMenuAction(node, 'rename-db')
            }] : []),
            ...(capabilities.supportsDropDatabase ? [{
                key: 'danger-zone',
                label: t('sidebar.menu.danger_operations'),
                icon: <WarningOutlined />,
                children: [
                    {
                        key: 'drop-db',
                        label: t('sidebar.v2_table_menu.item_with_suffix', { label: t('sidebar.menu.delete_database'), suffix: 'DROP' }),
                        icon: <DeleteOutlined />,
                        danger: true,
                        onClick: () => handleV2DatabaseContextMenuAction(node, 'drop-db')
                    }
                ]
            }] : []),
            {
                key: 'refresh',
                label: t('sidebar.v2_database_menu.refresh_object_tree'),
                icon: <ReloadOutlined />,
                onClick: () => handleV2DatabaseContextMenuAction(node, 'refresh')
            },
            {
                key: 'export-db-schema',
                label: t('sidebar.v2_database_menu.export_all_table_schema_sql'),
                icon: <ExportOutlined />,
                onClick: () => handleV2DatabaseContextMenuAction(node, 'export-db-schema')
            },
            {
                key: 'backup-db-sql',
                label: t('sidebar.v2_database_menu.backup_all_tables_sql'),
                icon: <SaveOutlined />,
                onClick: () => handleV2DatabaseContextMenuAction(node, 'backup-db-sql')
            },
            { type: 'divider' },
            {
                key: 'disconnect-db',
                label: t('sidebar.menu.close_database'),
                icon: <DisconnectOutlined />,
                onClick: () => handleV2DatabaseContextMenuAction(node, 'disconnect-db')
            },
             {
                 key: 'new-query',
                 label: t('sidebar.menu.new_query'),
                 icon: <ConsoleSqlOutlined />,
                 onClick: () => handleV2DatabaseContextMenuAction(node, 'new-query')
              },
             {
                  key: 'run-sql',
                  label: t('sidebar.sql_file_exec.title'),
                  icon: <FileAddOutlined />,
                  onClick: () => handleV2DatabaseContextMenuAction(node, 'run-sql')
              }
       ];
    } else if (node.type === 'view') {
        return [
            {
                key: 'open-view',
                label: t('sidebar.menu.browse_view_data'),
                icon: <EyeOutlined />,
                onClick: () => onDoubleClick(null, node)
            },
            {
                key: 'view-definition',
                label: t('sidebar.menu.view_definition'),
                icon: <CodeOutlined />,
                onClick: () => openViewDefinition(node)
            },
            {
                key: 'copy-view-name',
                label: '复制名称',
                icon: <CopyOutlined />,
                onClick: () => handleCopyTableName(node)
            },
            { type: 'divider' },
            {
                key: 'edit-view',
                label: t('sidebar.menu.edit_view'),
                icon: <EditOutlined />,
                onClick: () => openEditView(node)
            },
            {
                key: 'new-query',
                label: t('sidebar.menu.new_query'),
                icon: <ConsoleSqlOutlined />,
                onClick: () => {
                    addTab({
                        id: `query-${Date.now()}`,
                        title: t('query.new'),
                        type: 'query',
                        connectionId: node.dataRef.id,
                        dbName: node.dataRef.dbName,
                        query: ''
                    });
                }
            },
            { type: 'divider' },
            {
                key: 'rename-view',
                label: t('sidebar.menu.rename_view'),
                icon: <EditOutlined />,
                onClick: () => {
                    setRenameViewTarget(node);
                    renameViewForm.setFieldsValue({ newName: extractObjectName(node.dataRef?.viewName || node.title) });
                    setIsRenameViewModalOpen(true);
                }
            },
            {
                key: 'danger-zone',
                label: t('sidebar.menu.danger_operations'),
                icon: <WarningOutlined />,
                children: [
                    {
                        key: 'drop-view',
                        label: t('sidebar.menu.delete_view'),
                        icon: <DeleteOutlined />,
                        danger: true,
                        onClick: () => handleDropView(node)
                    }
                ]
            },
        ];
    } else if (node.type === 'materialized-view') {
        return [
            {
                key: 'open-materialized-view',
                label: t('sidebar.menu.browse_materialized_view_data'),
                icon: <EyeOutlined />,
                onClick: () => onDoubleClick(null, node)
            },
            {
                key: 'materialized-view-definition',
                label: t('sidebar.menu.materialized_view_definition'),
                icon: <CodeOutlined />,
                onClick: () => openViewDefinition(node)
            },
            {
                key: 'copy-materialized-view-name',
                label: '复制名称',
                icon: <CopyOutlined />,
                onClick: () => handleCopyTableName(node)
            },
            {
                key: 'new-query',
                label: t('sidebar.menu.new_query'),
                icon: <ConsoleSqlOutlined />,
                onClick: () => {
                    addTab({
                        id: `query-${Date.now()}`,
                        title: t('query.new'),
                        type: 'query',
                        connectionId: node.dataRef.id,
                        dbName: node.dataRef.dbName,
                        query: buildTableSelectQuery('starrocks', String(node.dataRef?.tableName || node.dataRef?.viewName || ''))
                    });
                }
            },
        ];
    } else if (node.type === 'routine') {
        const routineType = node.dataRef?.routineType || 'FUNCTION';
        const typeLabel = t(routineType === 'PROCEDURE' ? 'sidebar.object.procedure' : 'sidebar.object.function');
        return [
            {
                key: 'view-routine-def',
                label: t('sidebar.menu.view_object_definition'),
                icon: <CodeOutlined />,
                onClick: () => openRoutineDefinition(node)
            },
            {
                key: 'edit-routine',
                label: t('sidebar.menu.edit_definition'),
                icon: <EditOutlined />,
                onClick: () => openEditRoutine(node)
            },
            { type: 'divider' },
            {
                key: 'danger-zone',
                label: t('sidebar.menu.danger_operations'),
                icon: <WarningOutlined />,
                children: [
                    {
                        key: 'drop-routine',
                        label: t('sidebar.menu.delete_routine', { type: typeLabel }),
                        icon: <DeleteOutlined />,
                        danger: true,
                        onClick: () => handleDropRoutine(node)
                    }
                ]
            },
        ];
    } else if (node.type === 'db-event') {
        return [
            {
                key: 'view-event-def',
                label: t('sidebar.menu.view_object_definition'),
                icon: <CodeOutlined />,
                onClick: () => openEventDefinition(node)
            },
            {
                key: 'edit-event-query',
                label: t('sidebar.menu.edit_definition'),
                icon: <EditOutlined />,
                onClick: () => {
                    const { eventName, dbName, id } = node.dataRef;
                    addTab({
                        id: `query-edit-event-${Date.now()}`,
                        title: t('sidebar.tab.edit_event', { name: eventName }),
                        type: 'query',
                        connectionId: id,
                        dbName,
                        query: `SHOW CREATE EVENT \`${String(eventName || '').replace(/`/g, '``')}\`;`
                    });
                }
            },
        ];
    } else if (node.type === 'table') {
        const isStarRocks = getMetadataDialect(node.dataRef as SavedConnection) === 'starrocks';
        const messagePublishTarget = resolveMessagePublishTarget(node);
        return [
            {
                key: 'new-query',
                label: t('sidebar.menu.new_query'),
                icon: <ConsoleSqlOutlined />,
                onClick: () => {
                   const tableName = String(node.dataRef?.tableName || '').trim();
                   const queryTemplate = buildTableSelectQuery(getMetadataDialect(node.dataRef as SavedConnection), tableName);
                   addTab({
                       id: `query-${Date.now()}`,
                       title: t('query.new'),
                       type: 'query',
                       connectionId: node.dataRef.id,
                       dbName: node.dataRef.dbName,
                       query: queryTemplate
                   });
                }
            },
            ...(messagePublishTarget ? [{
                key: 'publish-message',
                label: '测试发送消息',
                icon: <SendOutlined />,
                onClick: () => openMessagePublishModal(node),
            }] : []),
            { type: 'divider' },
            {
                key: 'design-table',
                label: isStructureOnlyDbType(String(node.dataRef?.id || '')) ? '表结构' : '设计表',
                icon: <EditOutlined />,
                onClick: () => openDesign(node, 'columns', false)
            },
            ...(isStarRocks ? [{
                key: 'new-rollup',
                label: '新增 Rollup',
                icon: <ThunderboltOutlined />,
                onClick: () => openCreateStarRocksRollup(node)
            }] : []),
            {
                key: 'copy-table-name',
                label: '复制表名',
                icon: <CopyOutlined />,
                onClick: () => handleCopyTableName(node)
            },
            {
                key: 'copy-structure',
                label: '复制表结构',
                icon: <CopyOutlined />,
                onClick: () => handleCopyStructure(node)
            },
            {
                key: 'backup-table',
                label: '备份表 (SQL)',
                icon: <SaveOutlined />,
                onClick: () => handleExport(node, { format: 'sql' })
            },
            {
                key: 'rename-table',
                label: '重命名表',
                icon: <EditOutlined />,
                onClick: () => {
                    setRenameTableTarget(node);
                    renameTableForm.setFieldsValue({ newName: extractObjectName(node.dataRef?.tableName || node.title) });
                    setIsRenameTableModalOpen(true);
                }
            },
            {
                key: 'danger-zone',
                label: t('sidebar.menu.danger_operations'),
                icon: <WarningOutlined />,
                children: [
                    ...(supportsTableTruncateAction(node.dataRef?.config?.type, node.dataRef?.config?.driver) ? [{
                        key: 'truncate-table',
                        label: '截断表',
                        danger: true,
                        onClick: () => handleTableDataDangerAction(node, 'truncate')
                    }] : []),
                    {
                        key: 'clear-table',
                        label: '清空表',
                        danger: true,
                        onClick: () => handleTableDataDangerAction(node, 'clear')
                    },
                    {
                        key: 'drop-table',
                        label: '删除表',
                        icon: <DeleteOutlined />,
                        danger: true,
                        onClick: () => handleDeleteTable(node)
                    }
                ]
            },
            {
                type: 'divider'
            },
            {
                key: 'export',
                label: '导出表数据…',
                icon: <ExportOutlined />,
                onClick: () => openExportDialog(node),
            }
        ];
    }

    // 已存查询节点的右键菜单
    if (node.type === 'saved-query') {
        const q = node.dataRef as SavedQuery;
        const rebindMenuItems: MenuProps['items'] = isSavedQueryUnmatched(q)
            ? [
                {
                    key: 'rebind-query',
                    label: '绑定到连接',
                    icon: <LinkOutlined />,
                    disabled: connections.length === 0,
                    children: connections.length > 0
                        ? connections.map((conn) => ({
                            key: `rebind-query-${conn.id}`,
                            label: conn.name || conn.id,
                            onClick: () => void handleRebindSavedQuery(q, conn),
                        }))
                        : undefined,
                },
            ]
            : [];
        return [
            {
                key: 'open-query',
                label: t('sidebar.menu.open_query'),
                icon: <ConsoleSqlOutlined />,
                onClick: () => {
                    addTab({
                        id: q.id,
                        title: resolveSavedQueryDisplayName(q.name),
                        type: 'query',
                        connectionId: q.connectionId,
                        dbName: q.dbName,
                        query: q.sql,
                        savedQueryId: q.id,
                    });
                }
            },
            ...rebindMenuItems,
            { type: 'divider' },
            {
                key: 'rename-query',
                label: t('sidebar.menu.rename_query'),
                icon: <EditOutlined />,
                onClick: () => openRenameSavedQueryModal(q),
            },
            {
                key: 'delete-query',
                label: t('sidebar.menu.delete_query'),
                icon: <DeleteOutlined />,
                danger: true,
                onClick: () => {
                    Modal.confirm({
                        title: t('sidebar.modal.confirm_delete.title'),
                        content: t('sidebar.modal.confirm_delete_saved_query.content', { name: resolveSavedQueryDisplayName(q.name) }),
                        okButtonProps: { danger: true },
                        onOk: async () => {
                            try {
                                await deleteQuery(q.id);
                            } catch (e) {
                                message.error('删除查询失败: ' + (e instanceof Error ? e.message : String(e)));
                                throw e;
                            }
                            // 从树中移除节点
                            const removeNode = (list: TreeNode[]): TreeNode[] =>
                                list
                                    .filter(n => !(n.type === 'saved-query' && n.dataRef?.id === q.id))
                                    .map(n => n.children ? { ...n, children: removeNode(n.children) } : n);
                            const nextTreeData = removeNode(treeDataRef.current);
                            treeDataRef.current = nextTreeData;
                            setTreeData(nextTreeData);
                            message.success(t('sidebar.message.saved_query_deleted'));
                        }
                    });
                }
            }
        ];
    }

    if (node.type === 'external-sql-root') {
        return [
            {
                key: 'add-external-sql-directory',
                label: t('sidebar.menu.add_sql_directory'),
                icon: <PlusOutlined />,
                onClick: () => {
                    void handleAddExternalSQLDirectory(node);
                }
            }
        ];
    }

    if (node.type === 'external-sql-directory') {
        return [
            {
                key: 'new-external-sql-file',
                label: t('sidebar.menu.new_sql_file'),
                icon: <FileAddOutlined />,
                onClick: () => {
                    openCreateExternalSQLFileModal(node);
                }
            },
            {
                key: 'new-external-sql-directory',
                label: t('sidebar.menu.new_sql_directory'),
                icon: <FolderAddOutlined />,
                onClick: () => {
                    openCreateExternalSQLDirectoryModal(node);
                }
            },
            {
                key: 'rename-external-sql-directory',
                label: t('sidebar.menu.rename_sql_directory'),
                icon: <EditOutlined />,
                onClick: () => {
                    openRenameExternalSQLDirectoryModal(node);
                }
            },
            { type: 'divider' },
            {
                key: 'refresh-external-sql-directory',
                label: t('sidebar.menu.refresh_directory'),
                icon: <ReloadOutlined />,
                onClick: () => {
                    void handleRefreshExternalSQLDirectory(node);
                }
            },
            { type: 'divider' },
            {
                key: 'remove-external-sql-directory',
                label: t('sidebar.menu.remove_directory'),
                icon: <DeleteOutlined />,
                danger: true,
                onClick: () => {
                    void handleRemoveExternalSQLDirectory(node);
                }
            },
            {
                key: 'delete-external-sql-directory',
                label: t('sidebar.menu.delete_local_directory'),
                icon: <DeleteOutlined />,
                danger: true,
                onClick: () => {
                    handleDeleteExternalSQLDirectory(node);
                }
            }
        ];
    }

    if (node.type === 'external-sql-folder') {
        return [
            {
                key: 'new-external-sql-file',
                label: t('sidebar.menu.new_sql_file'),
                icon: <FileAddOutlined />,
                onClick: () => {
                    openCreateExternalSQLFileModal(node);
                }
            },
            {
                key: 'new-external-sql-directory',
                label: t('sidebar.menu.new_sql_directory'),
                icon: <FolderAddOutlined />,
                onClick: () => {
                    openCreateExternalSQLDirectoryModal(node);
                }
            },
            {
                key: 'rename-external-sql-directory',
                label: t('sidebar.menu.rename_sql_directory'),
                icon: <EditOutlined />,
                onClick: () => {
                    openRenameExternalSQLDirectoryModal(node);
                }
            },
            {
                key: 'refresh-external-sql-directory',
                label: t('sidebar.menu.refresh_directory'),
                icon: <ReloadOutlined />,
                onClick: () => {
                    void handleRefreshExternalSQLDirectory(node);
                }
            },
            { type: 'divider' },
            {
                key: 'delete-external-sql-directory',
                label: t('sidebar.menu.delete_sql_directory'),
                icon: <DeleteOutlined />,
                danger: true,
                onClick: () => {
                    handleDeleteExternalSQLDirectory(node);
                }
            }
        ];
    }

    if (node.type === 'external-sql-file') {
        return [
            {
                key: 'open-external-sql-file',
                label: t('sidebar.menu.open_sql_file'),
                icon: <ConsoleSqlOutlined />,
                onClick: () => {
                    void openExternalSQLFile(node);
                }
            },
            {
                key: 'rename-external-sql-file',
                label: t('sidebar.menu.rename_sql_file'),
                icon: <EditOutlined />,
                onClick: () => {
                    openRenameExternalSQLFileModal(node);
                }
            },
            {
                key: 'new-external-sql-file-sibling',
                label: t('sidebar.menu.new_sql_file_in_directory'),
                icon: <FileAddOutlined />,
                onClick: () => {
                    openCreateExternalSQLFileModal(node);
                }
            },
            {
                key: 'new-external-sql-directory-sibling',
                label: t('sidebar.menu.new_sql_directory_in_directory'),
                icon: <FolderAddOutlined />,
                onClick: () => {
                    openCreateExternalSQLDirectoryModal(node);
                }
            },
            { type: 'divider' },
            {
                key: 'delete-external-sql-file',
                label: t('sidebar.menu.delete_sql_file'),
                icon: <DeleteOutlined />,
                danger: true,
                onClick: () => {
                    handleDeleteExternalSQLFile(node);
                }
            }
        ];
    }

    return [];
  };

  const titleRender = (node: any) => {
    let status: 'success' | 'error' | 'default' = 'default';
    if (node.type === 'connection' || node.type === 'database') {
        if (connectionStates[node.key] === 'success') status = 'success';
        else if (connectionStates[node.key] === 'error') status = 'error';
    }

    const statusBadge = node.type === 'connection' || node.type === 'database' ? (
        isV2Ui
            ? <span className={`gn-v2-tree-status is-${status}`} aria-hidden="true" />
            : <Badge status={status} style={{ marginLeft: 4, marginRight: 8 }} />
    ) : null;

    const displayTitle = String(node.title ?? '');
    const dragText = resolveSidebarObjectDragText(node);
    let hoverTitle = displayTitle;
    if (node.type === 'table' || node.type === 'view' || node.type === 'materialized-view' || node.type === 'db-event') {
        const rawTableName = String(node?.dataRef?.tableName || node?.dataRef?.viewName || node?.dataRef?.eventName || '').trim();
        const conn = node?.dataRef as SavedConnection | undefined;
        if (rawTableName && shouldHideSchemaPrefix(conn)) {
            if (splitQualifiedName(rawTableName).schemaName) {
                hoverTitle = rawTableName;
            }
        }
    } else if (node.type === 'object-group') {
        const objectGroupTitle = resolveV2ObjectGroupTitle(node);
        if (objectGroupTitle) {
            hoverTitle = objectGroupTitle;
        }
    } else if (node.type === 'external-sql-directory' || node.type === 'external-sql-folder' || node.type === 'external-sql-file') {
        hoverTitle = String(node?.dataRef?.path || displayTitle);
    }

    if (node.type === 'jvm-mode') {
        return (
            <span
                title={hoverTitle}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}
            >
                <JVMModeBadge
                    mode={String(node?.dataRef?.providerMode || displayTitle)}
                    label={displayTitle}
                    reason={String(node?.dataRef?.reason || '').trim() || undefined}
                />
            </span>
        );
    }

    if (node.type === 'external-sql-root') {
        const externalSqlRootTitle = t('sidebar.external_sql.root');
        const addSqlDirectoryLabel = t('sidebar.menu.add_sql_directory');
        return (
            <span
                title={externalSqlRootTitle}
                className="gn-v2-tree-external-root"
            >
                <span
                    className="gn-v2-tree-title"
                    data-node-type={node.type}
                    data-sidebar-node-key={String(node.key || '')}
                    data-sidebar-node-type={String(node.type || '')}
                >
                    <span className="gn-v2-tree-label">
                        {statusBadge}
                        {externalSqlRootTitle}
                    </span>
                </span>
                <Button
                    size="small"
                    type="text"
                    icon={<PlusOutlined />}
                    title={addSqlDirectoryLabel}
                    aria-label={addSqlDirectoryLabel}
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void handleAddExternalSQLDirectory(node);
                    }}
                    className="gn-v2-tree-external-root-action"
                />
            </span>
        );
    }

    if (isV2Ui) {
        return renderV2TreeTitle(node, hoverTitle, statusBadge);
    }

    if (dragText) {
        return (
            <span
                title={hoverTitle}
                draggable
                onDragStart={(event) => {
                    snapshotTreeSelectionBeforeDrag();
                    treeDragSelectSuppressUntilRef.current = Date.now() + 600;
                    setIsTreeDragging(true);
                    event.stopPropagation();
                    event.dataTransfer.effectAllowed = 'copy';
                    event.dataTransfer.setData('text/plain', dragText);
                    event.dataTransfer.setData(
                        SIDEBAR_SQL_EDITOR_DRAG_MIME,
                        encodeSidebarSqlEditorDragPayload({
                            text: dragText,
                            nodeType: node.type,
                            connectionId: String(node?.dataRef?.id || ''),
                            dbName: String(node?.dataRef?.dbName || ''),
                        }),
                    );
                }}
                onDragEnd={() => {
                    restoreTreeSelectionAfterDrag();
                    setIsTreeDragging(false);
                }}
            >
                {statusBadge}{displayTitle}
            </span>
        );
    }

    return <span title={hoverTitle}>{statusBadge}{displayTitle}</span>;
  };

  const handleDrop = (info: any) => {
      setIsTreeDragging(false);
      const dropPosition = normalizeSidebarTreeRelativeDropPosition(
          Number(info.dropPosition || 0),
          info?.node?.pos,
      );
      const domDropNode = resolveSidebarDropNodeFromDomEvent(info?.event);
      const dropTargetMetrics = resolveSidebarDropTargetMetricsFromDomEvent(info?.event);
      const insertBefore = resolveSidebarDropInsertBefore(dropPosition, dropTargetMetrics ? {
          clientY: info?.event?.clientY,
          top: dropTargetMetrics.top,
          height: dropTargetMetrics.height,
      } : null);

      const dragNode = info.dragNode;
      const dropNode = domDropNode && domDropNode.key === String(info?.node?.key || '')
          ? info.node
          : (domDropNode
              ? findTreeNodeByKeyRef.current(treeDataRef.current, domDropNode.key) || info.node
              : info.node);

      const getDropRootToken = (node: any): string => {
          if (!node) return '';
          if (node.type === 'tag') {
              return buildSidebarRootTagToken(String(node?.dataRef?.id || ''));
          }
          if (node.type === 'connection') {
              const groupedTagId = connectionTags.find((tag) =>
                  tag.connectionIds.includes(String(node.key)),
              )?.id || '';
              return groupedTagId
                  ? buildSidebarRootTagToken(groupedTagId)
                  : buildSidebarRootConnectionToken(String(node.key));
          }
          return '';
      };

      // Root tag or ungrouped connection reordering
      if (dragNode.type === 'tag') {
          if (dropNode.type === 'tag' || dropNode.type === 'connection') {
              const currentTagOrder = connectionTags.map(t => t.id);
              const dragTagId = dragNode.dataRef.id;
              const dropTagId = dropNode.type === 'tag'
                  ? dropNode.dataRef.id
                  : (connectionTags.find(t => t.connectionIds.includes(String(dropNode.key)))?.id || '');
              const dragRootToken = buildSidebarRootTagToken(String(dragTagId));
              const dropRootToken = getDropRootToken(dropNode);

              if (dropRootToken && dropRootToken !== dragRootToken) {
                  if (dropTagId) {
                      const resolvedInsertBefore = resolveSidebarTagDropInsertBefore({
                          currentTagOrder,
                          dragTagId,
                          dropTagId,
                          relativeDropPosition: dropPosition,
                          fallbackInsertBefore: insertBefore,
                          metrics: dropTargetMetrics ? {
                              clientY: info?.event?.clientY,
                              top: dropTargetMetrics.top,
                              height: dropTargetMetrics.height,
                          } : null,
                      });
                      reorderSidebarRoot(dragRootToken, dropRootToken, resolvedInsertBefore);
                  } else {
                      reorderSidebarRoot(dragRootToken, dropRootToken, insertBefore);
                  }
                  return;
              }

              const newOrder = currentTagOrder.filter(id => id !== dragTagId);
              let insertIndex = newOrder.length;
              if (dropTagId) {
                  const dropIndex = newOrder.indexOf(dropTagId);
                  const resolvedInsertBefore = resolveSidebarTagDropInsertBefore({
                      currentTagOrder,
                      dragTagId,
                      dropTagId,
                      relativeDropPosition: dropPosition,
                      fallbackInsertBefore: insertBefore,
                      metrics: dropTargetMetrics ? {
                          clientY: info?.event?.clientY,
                          top: dropTargetMetrics.top,
                          height: dropTargetMetrics.height,
                      } : null,
                  });

                  if (resolvedInsertBefore) {
                      insertIndex = dropIndex;
                  } else {
                      insertIndex = dropIndex + 1;
                  }
              } else {
                  // Dropped onto an ungrouped root connection, usually meaning moving to the end of tags
                  // Since tags are always displayed before ungrouped connections, just put it at the end
                  insertIndex = newOrder.length;
              }

              newOrder.splice(insertIndex, 0, dragTagId);
              reorderTags(newOrder);
          }
          return;
      }

      if (dragNode.type === 'connection') {
          const dragTagId = connectionTags.find((tag) =>
              tag.connectionIds.includes(String(dragNode.key)),
          )?.id || '';
          const dragIsUngroupedRoot = !dragTagId;
          const dropRootToken = getDropRootToken(dropNode);
          if (dragIsUngroupedRoot && dropNode.type === 'connection' && dropRootToken) {
              reorderSidebarRoot(
                  buildSidebarRootConnectionToken(String(dragNode.key)),
                  dropRootToken,
                  insertBefore,
              );
              return;
          }
      }

      // Connection moving to tag (any drop position on a tag node counts as "into")
      if (dragNode.type === 'connection' && dropNode.type === 'tag') {
          moveConnectionToTag(dragNode.key, dropNode.dataRef.id);
          return;
      }

      // Connection reordering against another connection
      if (dragNode.type === 'connection' && dropNode.type === 'connection') {
          const targetTag = connectionTags.find(t => t.connectionIds.includes(dropNode.key));
          reorderConnections(
              String(dragNode.key),
              String(dropNode.key),
              targetTag?.id || null,
              insertBefore,
          );
          return;
      }
  };

  const onRightClick = ({ event, node }: any) => {
      if (isV2Ui && node?.type === 'v2-table-section') {
          event.preventDefault();
          event.stopPropagation();
          return;
      }
      if (isV2Ui && node?.type === 'connection') {
          openV2ConnectionContextMenu(event, node);
          return;
      }
      if (isV2Ui && node?.type === 'database') {
          const position = resolveSidebarContextMenuPosition(event.clientX, event.clientY);
          setContextMenu({
              x: position.x,
              y: position.y,
              sourceX: event.clientX,
              sourceY: event.clientY,
              items: [],
              kind: 'v2-database',
              node,
              rootClassName: 'gn-v2-table-context-menu-popup',
              overlayStyle: { width: 264, maxWidth: 'calc(100vw - 24px)' },
              maxHeight: position.maxHeight,
          });
          return;
      }
      if (
          isV2Ui
          && node?.type === 'object-group'
          && node?.dataRef?.groupKey === 'schema'
          && isPostgresSchemaDialect(getMetadataDialect(node.dataRef as SavedConnection))
          && String(node?.dataRef?.schemaName || '').trim()
      ) {
          const position = resolveSidebarContextMenuPosition(event.clientX, event.clientY);
          setContextMenu({
              x: position.x,
              y: position.y,
              sourceX: event.clientX,
              sourceY: event.clientY,
              items: [],
              kind: 'v2-schema',
              node,
              rootClassName: 'gn-v2-table-context-menu-popup',
              overlayStyle: { width: 264, maxWidth: 'calc(100vw - 24px)' },
              maxHeight: position.maxHeight,
          });
          return;
      }
      if (isV2Ui && node?.type === 'object-group' && node?.dataRef?.groupKey === 'tables') {
          const position = resolveSidebarContextMenuPosition(event.clientX, event.clientY);
          setContextMenu({
              x: position.x,
              y: position.y,
              sourceX: event.clientX,
              sourceY: event.clientY,
              items: [],
              kind: 'v2-table-group',
              node,
              rootClassName: 'gn-v2-table-context-menu-popup',
              overlayStyle: { width: 264, maxWidth: 'calc(100vw - 24px)' },
              maxHeight: position.maxHeight,
          });
          return;
      }
      if (isV2Ui && node?.type === 'table') {
          const position = resolveSidebarContextMenuPosition(event.clientX, event.clientY);
          setContextMenu({
              x: position.x,
              y: position.y,
              sourceX: event.clientX,
              sourceY: event.clientY,
              items: [],
              kind: 'v2-table',
              node,
              rootClassName: 'gn-v2-table-context-menu-popup',
              overlayStyle: { width: 264, maxWidth: 'calc(100vw - 24px)' },
              maxHeight: position.maxHeight,
          });
          return;
      }
      const items = getNodeMenuItems(node);
      if (items && items.length > 0) {
          setContextMenu({
              x: event.clientX,
              y: event.clientY,
              items
          });
      }
  };

  const renderV2RailConnectionButton = (conn: SavedConnection) => {
      const accent = resolveConnectionAccentColor(conn);
      const status = buildRailConnectionStatus(conn.id);
      const badgeLabel = getRailConnectionBadgeLabel(conn);
      const hostLabel = getRailConnectionHostLabel(conn);
      const title = `${conn.name} · ${resolveConnectionHostSummary(conn.config) || conn.config.type}`;
      const rootToken = buildSidebarRootConnectionToken(conn.id);

      return (
          <Tooltip key={conn.id} title={title} placement="right">
              <button
                  type="button"
                  className={`gn-v2-rail-item${conn.id === activeConnectionId ? ' is-active' : ''}`}
                  draggable
                  onDragStart={(event) => {
                      snapshotTreeSelectionBeforeDrag();
                      treeDragSelectSuppressUntilRef.current = Date.now() + 600;
                      setDraggingV2RailRootToken(rootToken);
                      setIsTreeDragging(true);
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', rootToken);
                  }}
                  onDragEnd={() => {
                      restoreTreeSelectionAfterDrag();
                      setDraggingV2RailRootToken('');
                      setIsTreeDragging(false);
                  }}
                  onDragOver={(event) => {
                      if (!draggingV2RailRootToken || draggingV2RailRootToken === rootToken) {
                          return;
                      }
                      event.preventDefault();
                      event.stopPropagation();
                      event.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(event) => {
                      if (!draggingV2RailRootToken || draggingV2RailRootToken === rootToken) {
                          return;
                      }
                      event.preventDefault();
                      event.stopPropagation();
                      const rect = event.currentTarget.getBoundingClientRect();
                      const insertBefore = event.clientY < rect.top + rect.height / 2;
                      handleV2RailRootDrop(draggingV2RailRootToken, rootToken, insertBefore);
                      restoreTreeSelectionAfterDrag();
                      setDraggingV2RailRootToken('');
                      setIsTreeDragging(false);
                  }}
                  onClick={() => selectConnectionFromRail(conn)}
                  onContextMenu={(event) => openV2ConnectionContextMenu(event, conn)}
                  aria-label={`切换到连接 ${conn.name}`}
                  title={title}
                  data-v2-rail-host-context-menu-trigger="true"
              >
                  <span className="gn-v2-rail-active-bar" />
                  <span className="gn-v2-rail-badge-wrap">
                      <span className="gn-v2-rail-badge" style={{ background: accent }}>
                          {badgeLabel}
                      </span>
                      <span className={`gn-v2-rail-status is-${status}`} />
                  </span>
                  <span className="gn-v2-rail-fallback">{hostLabel}</span>
              </button>
          </Tooltip>
      );
  };

  const renderV2RailConnectionGroup = (group: V2RailConnectionGroup) => {
      const collapsed = collapsedV2RailGroupIdSet.has(group.id);
      const groupTitle = group.name || t('connection.sidebar.group.untitled');
      const rootToken = group.rootToken;

      return (
          <div
              key={group.id}
              className={`gn-v2-rail-group${group.isUngrouped ? ' is-ungrouped' : ''}${collapsed ? ' is-collapsed' : ''}`}
              data-v2-rail-connection-group="true"
              draggable
              onDragStart={(event) => {
                  snapshotTreeSelectionBeforeDrag();
                  treeDragSelectSuppressUntilRef.current = Date.now() + 600;
                  setDraggingV2RailRootToken(rootToken);
                  setIsTreeDragging(true);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', rootToken);
              }}
              onDragEnd={() => {
                  restoreTreeSelectionAfterDrag();
                  setDraggingV2RailRootToken('');
                  setIsTreeDragging(false);
              }}
              onDragOver={(event) => {
                  if (!draggingV2RailRootToken || draggingV2RailRootToken === rootToken) {
                      return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  event.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(event) => {
                  if (!draggingV2RailRootToken || draggingV2RailRootToken === rootToken) {
                      return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  const rect = event.currentTarget.getBoundingClientRect();
                  const insertBefore = event.clientY < rect.top + rect.height / 2;
                  handleV2RailRootDrop(draggingV2RailRootToken, rootToken, insertBefore);
                  restoreTreeSelectionAfterDrag();
                  setDraggingV2RailRootToken('');
                  setIsTreeDragging(false);
              }}
          >
              {hasV2RailConnectionGroups && (
                  <Tooltip title={t('connection.sidebar.group.meta', { count: group.connections.length.toLocaleString() })} placement="right">
                      <button
                          type="button"
                          className={`gn-v2-rail-group-header${group.isUngrouped ? ' is-ungrouped' : ''}`}
                          onClick={() => toggleV2RailConnectionGroup(group.id)}
                          onContextMenu={(event) => {
                              if (group.isUngrouped) return;
                              event.preventDefault();
                              event.stopPropagation();
                              const position = resolveSidebarContextMenuPosition(event.clientX, event.clientY);
                              setContextMenu({
                                  x: position.x,
                                  y: position.y,
                                  sourceX: event.clientX,
                                  sourceY: event.clientY,
                                  items: [],
                                  kind: 'v2-connection-group',
                                  node: group,
                                  rootClassName: 'gn-v2-table-context-menu-popup',
                                  overlayStyle: { width: 264, maxWidth: 'calc(100vw - 24px)' },
                                  maxHeight: position.maxHeight,
                              });
                          }}
                          aria-label={t(collapsed ? 'connection.sidebar.group.expandAria' : 'connection.sidebar.group.collapseAria', { name: groupTitle })}
                          aria-expanded={!collapsed}
                          title={t('connection.sidebar.group.meta', { count: group.connections.length.toLocaleString() })}
                          data-v2-rail-connection-group-header="true"
                      >
                          <span className="gn-v2-rail-group-chevron">
                              <DownOutlined />
                          </span>
                          <span className="gn-v2-rail-group-title">{groupTitle}</span>
                          <span className="gn-v2-rail-group-count">{group.connections.length}</span>
                      </button>
                  </Tooltip>
              )}
              {!collapsed && (
                  <div className="gn-v2-rail-group-items">
                      {group.connections.map(renderV2RailConnectionButton)}
                  </div>
              )}
          </div>
      );
  };

  const v2RailObjectActionsLabel = t('sidebar.rail.object_actions');
  const v2RailSystemActionsLabel = t('sidebar.rail.system_actions');
  const v2NewGroupLabel = t('sidebar.action.new_group');
  const v2BatchTablesLabel = t('sidebar.action.batch_tables');
  const v2BatchDatabasesLabel = t('sidebar.action.batch_databases');
  const v2OpenExternalSqlFileLabel = t('sidebar.sql_file_exec.title');
  const v2LocateCurrentTableLabel = t('sidebar.action.locate_current_table');
  const v2LocateCurrentTableUnavailableLabel = t('sidebar.message.locate_current_table_unavailable');
  const v2AiAssistantLabel = t('app.sidebar.ai_assistant');
  const v2ToolsLabel = t('app.sidebar.tools');
  const v2SettingsLabel = t('app.sidebar.settings');
  const v2ActiveConnectionHeaderLabel = t('sidebar.active_connection.current_host_database');
  const v2NoDatabaseSelectedLabel = t('sidebar.active_connection.no_database_selected');
  const v2ConnectionActionsLabel = t('sidebar.active_connection.actions');
  const v2CommandSearchLabel = t('sidebar.command_search.label');
  const v2CommandSearchPlaceholder = t('sidebar.command_search.placeholder');

  const renderV2ConnectionRail = () => (
      <div className="gn-v2-connection-rail" aria-label={v2RailSystemActionsLabel}>
          <div className="gn-v2-rail-primary-actions" aria-label={v2RailObjectActionsLabel}>
              <Tooltip title={v2NewGroupLabel} placement="right">
                  <button
                      type="button"
                      className="gn-v2-rail-tool gn-v2-rail-action"
                      onClick={() => { setRenameViewTarget(null); createTagForm.resetFields(); setIsCreateTagModalOpen(true); }}
                      aria-label={v2NewGroupLabel}
                      data-sidebar-create-group-action="true"
                  >
                      <FolderOpenOutlined />
                  </button>
              </Tooltip>
              <Tooltip title={v2BatchTablesLabel} placement="right">
                  <button
                      type="button"
                      className="gn-v2-rail-tool gn-v2-rail-action"
                      onClick={() => openBatchTableExportWorkbench()}
                      aria-label={v2BatchTablesLabel}
                      data-sidebar-batch-table-action="true"
                  >
                      <TableOutlined />
                  </button>
              </Tooltip>
              <Tooltip title={v2BatchDatabasesLabel} placement="right">
                  <button
                      type="button"
                      className="gn-v2-rail-tool gn-v2-rail-action"
                      onClick={() => openBatchDatabaseExportWorkbench()}
                      aria-label={v2BatchDatabasesLabel}
                      data-sidebar-batch-database-action="true"
                  >
                      <DatabaseOutlined />
                  </button>
              </Tooltip>
              <Tooltip title={v2OpenExternalSqlFileLabel} placement="right">
                  <button
                      type="button"
                      className="gn-v2-rail-tool gn-v2-rail-action"
                      onClick={handleOpenSQLFileFromToolbar}
                      aria-label={v2OpenExternalSqlFileLabel}
                      data-sidebar-open-external-sql-file-action="true"
                  >
                      <FileAddOutlined />
                  </button>
              </Tooltip>
              <Tooltip title={canLocateActiveTab ? v2LocateCurrentTableLabel : v2LocateCurrentTableUnavailableLabel} placement="right">
                  <span className="gn-v2-rail-action-wrap">
                      <button
                           type="button"
                           className="gn-v2-rail-tool gn-v2-rail-action"
                           onClick={handleLocateActiveTabInSidebar}
                           aria-label={v2LocateCurrentTableLabel}
                           data-sidebar-locate-current-tab-action="true"
                           disabled={!canLocateActiveTab}
                       >
                          <AimOutlined />
                      </button>
                  </span>
              </Tooltip>
          </div>
          <div className="gn-v2-rail-secondary-actions" aria-label={v2RailSystemActionsLabel}>
              <Tooltip title={v2AiAssistantLabel} placement="right">
                  <button
                      type="button"
                      className="gn-v2-rail-tool"
                      onClick={onToggleAI}
                      aria-label={v2AiAssistantLabel}
                      data-gonavi-ai-entry-action="true"
                  >
                      <RobotOutlined />
                  </button>
              </Tooltip>
              <Tooltip title={v2ToolsLabel} placement="right">
                  <button
                      type="button"
                      className="gn-v2-rail-tool"
                      onClick={onOpenTools}
                      aria-label={v2ToolsLabel}
                      data-gonavi-open-tools-action="true"
                  >
                      <ToolOutlined />
                  </button>
              </Tooltip>
              <Tooltip title={v2SettingsLabel} placement="right">
                  <button type="button" className="gn-v2-rail-tool" onClick={onOpenSettings} aria-label={v2SettingsLabel}>
                      <SettingOutlined />
                  </button>
              </Tooltip>
          </div>
      </div>
  );

  return (
    <div className={isV2Ui ? 'gn-v2-sidebar-redesign' : undefined} style={{ display: 'flex', height: '100%', minHeight: 0 }}>
        {exportProgressModal}
        {isV2Ui && renderV2ConnectionRail()}
        <div className={isV2Ui ? 'gn-v2-object-explorer' : undefined} style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, flex: 1 }}>
        {isV2Ui && (
            <div className="gn-v2-active-connection-header" data-object-count={activeConnectionObjectCount}>
                <div className="gn-v2-active-connection-trigger" aria-label={v2ActiveConnectionHeaderLabel}>
                    <span className={`gn-v2-live-dot is-${activeConnection ? buildRailConnectionStatus(activeConnection.id) : 'idle'}`} />
                    <div className="gn-v2-active-connection-copy">
                        <strong>{activeConnectionDisplayName}</strong>
                        <span>{activeDatabaseDisplayName || v2NoDatabaseSelectedLabel}</span>
                    </div>
                </div>
                <div className="gn-v2-active-connection-actions">
                    {onCreateConnection && (
                        <Tooltip title={t('connection.new')}>
                            <Button
                                size="small"
                                type="text"
                                icon={<PlusOutlined />}
                                aria-label={t('connection.new')}
                                data-gonavi-create-connection-action="true"
                                onClick={onCreateConnection}
                            />
                        </Tooltip>
                    )}
                    <Tooltip title={v2ConnectionActionsLabel}>
                        <Button
                            size="small"
                            type="text"
                            icon={<MoreOutlined />}
                            aria-label={v2ConnectionActionsLabel}
                            disabled={!activeConnection}
                            onClick={(event) => {
                                if (activeConnection) {
                                    openV2ConnectionContextMenu(event, activeConnection);
                                }
                            }}
                        />
                    </Tooltip>
                </div>
            </div>
        )}
        <div className={isV2Ui ? 'gn-v2-explorer-search' : undefined} style={{ padding: '8px 14px', borderBottom: `1px solid ${darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}` }}>
            {isV2Ui && !v2UseLegacySidebarFilter ? (
                <div className="gn-v2-explorer-command-row" data-v2-sidebar-search-mode="command">
                    <button
                        type="button"
                        className="gn-v2-explorer-command-trigger"
                        onClick={() => {
                            openV2CommandSearch();
                            onFocusCommandSearch?.();
                        }}
                        aria-label={v2CommandSearchLabel}
                    >
                        <SearchOutlined />
                        <span>{v2PersistedSidebarFilter || v2CommandSearchPlaceholder}</span>
                        {focusSidebarSearchShortcutTokens.length > 0 ? (
                            <span className="gn-v2-search-shortcut" aria-hidden="true">
                                {focusSidebarSearchShortcutTokens.map((token, index) => (
                                    <kbd key={`${token}-${index}`}>{token}</kbd>
                                ))}
                            </span>
                        ) : null}
                    </button>
                    <Tooltip title={v2PersistedSidebarFilter ? t('sidebar.command_search.reset_filter') : t('sidebar.command_search.no_synced_filter')}>
                        <button
                            type="button"
                            className="gn-v2-explorer-filter-action"
                            aria-label={t('sidebar.command_search.reset_filter')}
                            disabled={!v2PersistedSidebarFilter}
                            onClick={resetV2SidebarFilter}
                        >
                            <ReloadOutlined />
                        </button>
                    </Tooltip>
                </div>
            ) : isV2Ui ? (
                <div className="gn-v2-explorer-legacy-filter-row" data-v2-sidebar-search-mode="filter">
                    <Input
                        {...noAutoCapInputProps}
                        ref={searchInputRef}
                        value={searchValue}
                        placeholder={t('sidebar.search.placeholder')}
                        onChange={onSearch}
                        size="small"
                        prefix={<SearchOutlined />}
                    />
                    <Tooltip title={searchValue ? t('sidebar.command_search.reset_filter') : t('sidebar.command_search.no_filter_content')}>
                        <button
                            type="button"
                            className="gn-v2-explorer-filter-action"
                            aria-label={t('sidebar.command_search.reset_filter')}
                            disabled={!searchValue}
                            onClick={resetV2SidebarFilter}
                        >
                            <ReloadOutlined />
                        </button>
                    </Tooltip>
                </div>
            ) : (
                <Input
                    {...noAutoCapInputProps}
                    ref={searchInputRef}
                    placeholder={t('sidebar.search.placeholder')}
                    onChange={onSearch}
                    size="small"
                    prefix={<SearchOutlined style={{ color: darkMode ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)' }} />}
                    style={{
                        borderRadius: 6,
                        border: 'none',
                        background: darkMode ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.03)',
                        boxShadow: 'none',
                        padding: '4px 8px',
                        color: darkMode ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.85)',
                    }}
                    suffix={(
                        <Popover
                            content={searchScopePopoverContent}
                            trigger="click"
                            placement="bottomRight"
                            open={isSearchScopePopoverOpen}
                            onOpenChange={setIsSearchScopePopoverOpen}
                            styles={{ body: { padding: 0, borderRadius: 16, overflow: 'hidden' } }}
                        >
                            <Tooltip title={t('sidebar.command_search.scope.tooltip', { scope: searchScopeSummary })}>
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        cursor: 'pointer',
                                        padding: '2px 6px',
                                        borderRadius: 4,
                                        background: isSearchScopePopoverOpen
                                            ? (darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)')
                                            : 'transparent',
                                        transition: 'background 0.2s',
                                        color: searchScopes.includes('smart')
                                            ? (darkMode ? '#ffd666' : '#1677ff')
                                            : (darkMode ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)'),
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!isSearchScopePopoverOpen) {
                                          e.currentTarget.style.background = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)';
                                          e.currentTarget.style.color = darkMode ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.65)';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!isSearchScopePopoverOpen) {
                                          e.currentTarget.style.background = 'transparent';
                                          e.currentTarget.style.color = searchScopes.includes('smart')
                                              ? (darkMode ? '#ffd666' : '#1677ff')
                                              : (darkMode ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)');
                                        }
                                    }}
                                >
                                    <FilterOutlined style={{ fontSize: 13 }} />
                                    <span style={{ fontSize: 12, fontWeight: 500 }}>
                                        {searchScopes.includes('smart') ? t('sidebar.command_search.scope.compact_smart') : searchScopes.length}
                                    </span>
                                </div>
                            </Tooltip>
                        </Popover>
                    )}
                />
            )}
        </div>

        {isV2Ui && (
            <div className="gn-v2-explorer-filter-tabs" aria-label={t('sidebar.command_search.object_kind.filter_aria')}>
                {V2_EXPLORER_FILTER_OPTIONS.map((item) => (
                    <button
                        key={item.key}
                        type="button"
                        className={v2ExplorerFilter === item.key ? 'is-active' : undefined}
                        aria-pressed={v2ExplorerFilter === item.key}
                        onClick={() => setV2ExplorerFilter(item.key)}
                    >
                        {t(item.labelKey)}
                    </button>
                ))}
            </div>
        )}

        {/* Toolbar */}
        {!isV2Ui && (
        <div data-sidebar-legacy-toolbar="true" style={legacyToolbarStyle}>
            <div data-sidebar-legacy-toolbar-item="true" style={legacyToolbarItemStyle}>
                <Tooltip title="新建组">
                    <Button
                        size="small"
                        type="text"
                        icon={<FolderOpenOutlined />}
                        aria-label="新建组"
                        data-sidebar-create-group-action="true"
                        onClick={() => { setRenameViewTarget(null); createTagForm.resetFields(); setIsCreateTagModalOpen(true); }}
                        style={{ color: legacyToolbarButtonColor }}
                    />
                </Tooltip>
            </div>
            <div data-sidebar-legacy-toolbar-item="true" style={legacyToolbarItemStyle}>
                <Tooltip title="批量操作表">
                    <Button
                        size="small"
                        type="text"
                        icon={<TableOutlined />}
                        aria-label="批量操作表"
                        data-sidebar-batch-table-action="true"
                        onClick={() => openBatchTableExportWorkbench()}
                        style={{ color: legacyToolbarButtonColor }}
                    />
                </Tooltip>
            </div>
            <div data-sidebar-legacy-toolbar-item="true" style={legacyToolbarItemStyle}>
                <Tooltip title="批量操作库">
                    <Button
                        size="small"
                        type="text"
                        icon={<DatabaseOutlined />}
                        aria-label="批量操作库"
                        data-sidebar-batch-database-action="true"
                        onClick={() => openBatchDatabaseExportWorkbench()}
                        style={{ color: legacyToolbarButtonColor }}
                    />
                </Tooltip>
            </div>
            <div data-sidebar-legacy-toolbar-item="true" style={legacyToolbarItemStyle}>
                <Tooltip title={v2OpenExternalSqlFileLabel}>
                    <Button
                        size="small"
                        type="text"
                        icon={<FileAddOutlined />}
                        aria-label={v2OpenExternalSqlFileLabel}
                        data-sidebar-open-external-sql-file-action="true"
                        onClick={handleOpenSQLFileFromToolbar}
                        style={{ color: legacyToolbarButtonColor }}
                    />
                </Tooltip>
            </div>
            <div data-sidebar-legacy-toolbar-item="true" style={legacyToolbarItemStyle}>
                <Tooltip title={canLocateActiveTab ? '定位当前标签页' : '当前标签页没有可定位的内容'}>
                    <span style={legacyToolbarDisabledWrapStyle}>
                        <Button
                            size="small"
                            type="text"
                            icon={<AimOutlined />}
                            aria-label="定位当前标签页"
                            data-sidebar-locate-current-tab-action="true"
                            disabled={!canLocateActiveTab}
                            onClick={handleLocateActiveTabInSidebar}
                            style={{ color: legacyToolbarButtonColor }}
                        />
                    </span>
                </Tooltip>
            </div>
        </div>
        )}

        <div
            ref={treeContainerRef}
            className={`sidebar-tree-scroll-shell${isV2Ui ? ' gn-v2-explorer-tree-shell' : ''}`}
            style={{
                flex: 1,
                overflow: 'hidden',
                minHeight: 0,
            }}
        >
            <div className="sidebar-tree-scroll-content">
                <Tree
                    ref={treeRef}
                    showIcon
                    draggable={{
                        icon: false,
                        nodeDraggable: (node: any) => node.type === 'connection' || node.type === 'tag'
                    }}
                    onDragStart={() => {
                        snapshotTreeSelectionBeforeDrag();
                        treeDragSelectSuppressUntilRef.current = Date.now() + 600;
                        setIsTreeDragging(true);
                    }}
                    onDragEnter={() => {
                        treeDragSelectSuppressUntilRef.current = Date.now() + 600;
                        setIsTreeDragging(true);
                    }}
                    onDragEnd={() => {
                        restoreTreeSelectionAfterDrag();
                        setIsTreeDragging(false);
                    }}
                    onDrop={handleDrop}
                    loadData={onLoadData}
                    treeData={isV2Ui ? v2VisibleTreeData : displayTreeData}
                    onDoubleClick={onDoubleClick}
                    onSelect={onSelect}
                    titleRender={titleRender}
                    expandedKeys={expandedKeys}
                    onExpand={onExpand}
                    loadedKeys={loadedKeys}
                    onLoad={setLoadedKeys}
                    autoExpandParent={autoExpandParent}
                    selectedKeys={selectedKeys}
                    blockNode
                    height={effectiveTreeHeight}
                    scrollWidth={isV2Ui ? v2TreeHorizontalScrollWidth : undefined}
                    onRightClick={onRightClick}
                />
            </div>
        </div>

        {isV2Ui && (
            <div className="gn-v2-sidebar-log-footer">
                <button type="button" className="gn-v2-sidebar-log-button" onClick={onToggleLogPanel}>
                    <BarsOutlined />
                    <span>SQL 执行日志</span>
                    <small>{sqlLogCount.toLocaleString()}</small>
                </button>
            </div>
        )}
        </div>
        {renderV2CommandSearchOverlay()}

        {contextMenu?.kind && typeof document !== 'undefined' && createPortal(
            <div
                ref={contextMenuPortalRef}
                className={`gn-v2-sidebar-context-menu-portal ${contextMenu.rootClassName || ''}`}
                style={{
                    position: 'fixed',
                    left: contextMenu.x,
                    top: contextMenu.y,
                    zIndex: 10000,
                    width: contextMenu.overlayStyle?.width ?? SIDEBAR_CONTEXT_MENU_FALLBACK_WIDTH,
                    maxWidth: contextMenu.overlayStyle?.maxWidth ?? 'calc(100vw - 24px)',
                    ['--gn-v2-context-menu-max-height' as any]: `${contextMenu.maxHeight ?? SIDEBAR_CONTEXT_MENU_FALLBACK_HEIGHT}px`,
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onContextMenu={(event) => event.preventDefault()}
            >
                {renderV2SidebarContextMenuContent(contextMenu)}
            </div>,
            document.body,
        )}

        {contextMenu && !contextMenu.kind && (
            <Dropdown
                menu={{ items: contextMenu.items }}
                open={true}
                onOpenChange={(open) => { if (!open) setContextMenu(null); }}
                trigger={['contextMenu']}
                rootClassName={contextMenu.rootClassName}
                overlayStyle={contextMenu.overlayStyle}
            >
                <div style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, width: 1, height: 1 }} />
            </Dropdown>
        )}

        <Modal
            title={renderSidebarModalTitle(
                <FolderOpenOutlined />,
                renameViewTarget?.type === 'tag' ? t('sidebar.modal.tag.edit_title') : t('sidebar.modal.tag.create_title'),
                renameViewTarget?.type === 'tag' ? t('sidebar.modal.tag.edit_description') : t('sidebar.modal.tag.create_description')
            )}
            open={isCreateTagModalOpen}
            centered
            styles={{ content: modalPanelStyle, header: { background: 'transparent', borderBottom: 'none', paddingBottom: 10 }, body: { paddingTop: 8 }, footer: { background: 'transparent', borderTop: 'none', paddingTop: 12 } }}
            onOk={() => {
                createTagForm.validateFields().then(values => {
                    if (renameViewTarget?.type === 'tag') {
                        // Rename
                        updateConnectionTag({
                            ...renameViewTarget.dataRef,
                            name: values.name,
                            connectionIds: values.connectionIds || []
                        });
                        // update cross-connections
                        const allOtherTagsIds = connectionTags.filter(t => t.id !== renameViewTarget.dataRef.id).flatMap(t => t.connectionIds);
                        (values.connectionIds || []).forEach((cid: string) => {
                           if (allOtherTagsIds.includes(cid)) {
                               moveConnectionToTag(cid, renameViewTarget.dataRef.id);
                           }
                        });
                    } else {
                        // Create
                        const tagId = Date.now().toString();
                        addConnectionTag({
                            id: tagId,
                            name: values.name,
                            connectionIds: values.connectionIds || []
                        });
                        (values.connectionIds || []).forEach((cid: string) => {
                            moveConnectionToTag(cid, tagId);
                        });
                    }
                    setIsCreateTagModalOpen(false);
                });
            }}
            onCancel={() => setIsCreateTagModalOpen(false)}
        >
            <Form form={createTagForm} layout="vertical">
                <div style={modalSectionStyle}>
                    <Form.Item name="name" label={t('sidebar.field.tag_name')} rules={[{ required: true, message: t('sidebar.validation.tag_name_required') }]}>
                        <Input placeholder={t('sidebar.placeholder.tag_name')} />
                    </Form.Item>
                    <Form.Item name="connectionIds" label={t('sidebar.field.select_connections')} style={{ marginBottom: 0 }}>
                        <Checkbox.Group style={{ width: '100%' }}>
                            <div style={modalScrollSectionStyle}>
                                <Space direction="vertical" style={{ width: '100%' }}>
                                    {connections.map(conn => (
                                        <Checkbox key={conn.id} value={conn.id}>
                                            {conn.name} {conn.config.host ? `(${conn.config.host})` : ''}
                                        </Checkbox>
                                    ))}
                                </Space>
                            </div>
                        </Checkbox.Group>
                    </Form.Item>
                </div>
            </Form>
        </Modal>

        <Modal
            title="新建数据库"
            open={isCreateDbModalOpen}
            onOk={handleCreateDatabase}
            onCancel={() => setIsCreateDbModalOpen(false)}
        >
            <Form form={createDbForm} layout="vertical">
                <Form.Item name="name" label="数据库名称" rules={[{ required: true, message: '请输入名称' }]}>
                    <Input {...noAutoCapInputProps} />
                </Form.Item>
                {/* Charset option could be added here */}
            </Form>
        </Modal>

        <Modal
            title={`${t('sidebar.v2_database_menu.new_schema')}${createSchemaTarget?.dataRef?.dbName ? ` (${createSchemaTarget.dataRef.dbName})` : ''}`}
            open={isCreateSchemaModalOpen}
            onOk={handleCreateSchema}
            onCancel={() => {
                setIsCreateSchemaModalOpen(false);
                setCreateSchemaTarget(null);
                createSchemaForm.resetFields();
            }}
        >
            <Form form={createSchemaForm} layout="vertical">
                <Form.Item name="name" label={t('sidebar.field.schema_name')} rules={[{ required: true, message: t('sidebar.validation.schema_name_required') }]}>
                    <Input {...noAutoCapInputProps} />
                </Form.Item>
            </Form>
        </Modal>

        <Modal
            title={`编辑模式${renameSchemaTarget?.dataRef?.dbName && renameSchemaTarget?.dataRef?.schemaName ? ` (${renameSchemaTarget.dataRef.dbName}.${renameSchemaTarget.dataRef.schemaName})` : ''}`}
            open={isRenameSchemaModalOpen}
            onOk={handleRenameSchema}
            onCancel={() => {
                setIsRenameSchemaModalOpen(false);
                setRenameSchemaTarget(null);
                renameSchemaForm.resetFields();
            }}
        >
            <Form form={renameSchemaForm} layout="vertical">
                <Form.Item name="newName" label="模式名称" rules={[{ required: true, message: '请输入模式名称' }]}>
                    <Input {...noAutoCapInputProps} />
                </Form.Item>
            </Form>
        </Modal>

        <Modal
            title={renameDbTarget?.dataRef?.dbName ? t('sidebar.modal.rename_database.title', { name: renameDbTarget.dataRef.dbName }) : t('sidebar.menu.rename_database')}
            open={isRenameDbModalOpen}
            onOk={handleRenameDatabase}
            onCancel={() => {
                setIsRenameDbModalOpen(false);
                setRenameDbTarget(null);
                renameDbForm.resetFields();
            }}
        >
            <Form form={renameDbForm} layout="vertical">
                <Form.Item name="newName" label={t('sidebar.field.new_database_name')} rules={[{ required: true, message: t('sidebar.validation.new_database_name_required') }]}>
                    <Input {...noAutoCapInputProps} />
                </Form.Item>
            </Form>
        </Modal>

        <Modal
            title={`重命名表${renameTableTarget?.dataRef?.tableName ? ` (${renameTableTarget.dataRef.tableName})` : ''}`}
            open={isRenameTableModalOpen}
            onOk={handleRenameTable}
            onCancel={() => {
                setIsRenameTableModalOpen(false);
                setRenameTableTarget(null);
                renameTableForm.resetFields();
            }}
        >
            <Form form={renameTableForm} layout="vertical">
                <Form.Item name="newName" label="新表名" rules={[{ required: true, message: '请输入新表名' }]}>
                    <Input {...noAutoCapInputProps} />
                </Form.Item>
            </Form>
        </Modal>

        <Modal
            title={`重命名视图${renameViewTarget?.dataRef?.viewName ? ` (${renameViewTarget.dataRef.viewName})` : ''}`}
            open={isRenameViewModalOpen}
            onOk={handleRenameView}
            onCancel={() => {
                setIsRenameViewModalOpen(false);
                setRenameViewTarget(null);
                renameViewForm.resetFields();
            }}
        >
            <Form form={renameViewForm} layout="vertical">
                <Form.Item name="newName" label="新视图名" rules={[{ required: true, message: '请输入新视图名' }]}>
                    <Input {...noAutoCapInputProps} />
                </Form.Item>
            </Form>
        </Modal>

        <Modal
            title={`${t('query_editor.save_modal.rename_title')}${renameSavedQueryTarget?.name ? ` (${renameSavedQueryTarget.name})` : ''}`}
            open={isRenameSavedQueryModalOpen}
            onOk={handleRenameSavedQuery}
            onCancel={() => {
                setIsRenameSavedQueryModalOpen(false);
                setRenameSavedQueryTarget(null);
                renameSavedQueryForm.resetFields();
            }}
            okText={t('query_editor.action.rename_query')}
            cancelText={t('common.cancel')}
        >
            <Form form={renameSavedQueryForm} layout="vertical">
                <Form.Item name="name" label={t('query_editor.save_modal.name_label')} rules={[{ required: true, message: t('query_editor.save_modal.name_required') }]}>
                    <Input {...noAutoCapInputProps} />
                </Form.Item>
            </Form>
        </Modal>

        <Modal
            title={
                externalSQLFileModalMode === 'create'
                    ? t('sidebar.external_sql_modal.title.create_file')
                    : externalSQLFileModalMode === 'rename'
                        ? t('sidebar.external_sql_modal.title.rename_file')
                        : externalSQLFileModalMode === 'create-directory'
                            ? t('sidebar.external_sql_modal.title.create_directory')
                            : t('sidebar.external_sql_modal.title.rename_directory')
            }
            open={isExternalSQLFileModalOpen}
            onOk={handleExternalSQLFileModalOk}
            onCancel={() => {
                setIsExternalSQLFileModalOpen(false);
                setExternalSQLFileTarget(null);
                externalSQLFileForm.resetFields();
            }}
            okText={t(externalSQLFileModalMode === 'create' || externalSQLFileModalMode === 'create-directory' ? 'sidebar.external_sql_modal.action.create' : 'sidebar.external_sql_modal.action.rename')}
            cancelText={t('common.cancel')}
        >
            <Form form={externalSQLFileForm} layout="vertical">
                <Form.Item
                    name="name"
                    label={isExternalSQLDirectoryModalMode(externalSQLFileModalMode) ? t('sidebar.external_sql_modal.field.directory_name') : t('sidebar.external_sql_modal.field.sql_file_name')}
                    rules={[
                        { required: true, message: isExternalSQLDirectoryModalMode(externalSQLFileModalMode) ? t('sidebar.external_sql_modal.validation.directory_name_required') : t('sidebar.external_sql_modal.validation.sql_file_name_required') },
                        {
                            validator: async (_, value) => {
                                const name = String(value || '').trim();
                                if (!name) return;
                                if (/[\\/]/.test(name) || name === '.' || name === '..') {
                                    throw new Error(isExternalSQLDirectoryModalMode(externalSQLFileModalMode) ? t('sidebar.external_sql_modal.validation.directory_name_no_separator') : t('sidebar.external_sql_modal.validation.sql_file_name_no_separator'));
                                }
                            },
                        },
                    ]}
                    extra={isExternalSQLDirectoryModalMode(externalSQLFileModalMode) ? t('sidebar.external_sql_modal.help.directory') : t('sidebar.external_sql_modal.help.sql_file')}
                >
                    <Input {...noAutoCapInputProps} placeholder={isExternalSQLDirectoryModalMode(externalSQLFileModalMode) ? t('sidebar.external_sql_modal.placeholder.directory_name') : t('sidebar.external_sql_modal.placeholder.sql_file_name')} />
                </Form.Item>
            </Form>
        </Modal>

        <Modal
            title={renderSidebarModalTitle(<TableOutlined />, "批量操作表", "按对象批量导出结构、数据或完整备份。")}
            open={isBatchModalOpen}
            onCancel={() => setIsBatchModalOpen(false)}
            width={720}
            centered
            styles={{ content: modalPanelStyle, header: { background: 'transparent', borderBottom: 'none', paddingBottom: 10 }, body: { paddingTop: 8 }, footer: { background: 'transparent', borderTop: 'none', paddingTop: 12 } }}
            footer={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Button key="cancel" onClick={() => setIsBatchModalOpen(false)}>
                        取消
                    </Button>
                    <Space size={8} wrap style={{ marginLeft: 'auto' }}>
                        <Button
                            key="clear"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => handleBatchClear()}
                            disabled={checkedTableKeys.length === 0}
                        >
                            清空表
                        </Button>
                        <Button
                            key="export-schema"
                            icon={<ExportOutlined />}
                            onClick={() => handleBatchExport('schema')}
                            disabled={checkedTableKeys.length === 0}
                        >
                            导出结构
                        </Button>
                        <Button
                            key="export-data-only"
                            icon={<SaveOutlined />}
                            onClick={() => handleBatchExport('dataOnly')}
                            disabled={checkedTableKeys.length === 0}
                        >
                            仅数据(INSERT)
                        </Button>
                        <Button
                            key="backup"
                            type="primary"
                            icon={<SaveOutlined />}
                            onClick={() => handleBatchExport('backup')}
                            disabled={checkedTableKeys.length === 0}
                        >
                            备份(结构+数据)
                        </Button>
                    </Space>
                </div>
            }
        >
            <div style={{ ...modalSectionStyle, marginBottom: 16 }}>
                <div style={{ marginBottom: 8 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>选择连接：</label>
                    <Select
                        value={selectedConnection}
                        onChange={handleConnectionChange}
                        style={{ width: '100%' }}
                        placeholder="请选择连接"
                    >
                        {connections.filter(c => c.config.type !== 'redis').map(conn => (
                            <Select.Option key={conn.id} value={conn.id}>
                                {conn.name}
                            </Select.Option>
                        ))}
                    </Select>
                </div>
                <div style={{ marginBottom: 8 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>选择数据库：</label>
                    <Select
                        value={selectedDatabase}
                        onChange={handleDatabaseChange}
                        style={{ width: '100%' }}
                        placeholder="请先选择连接"
                        disabled={!selectedConnection}
                    >
                        {availableDatabases.map(db => (
                            <Select.Option key={db.key} value={db.dbName}>
                                {db.title}
                            </Select.Option>
                        ))}
                    </Select>
                </div>
                <div style={modalHintTextStyle}>先选择连接与数据库，再决定导出范围和目标对象。</div>
            </div>

            {batchTables.length > 0 && (
                <div style={{ ...modalSectionStyle, marginBottom: 16 }}>
                    <Space wrap size={8} style={{ width: '100%' }}>
                        <Input
                            allowClear
                            value={batchFilterKeyword}
                            onChange={(e) => setBatchFilterKeyword(e.target.value)}
                            placeholder="筛选表/视图名称"
                            prefix={<SearchOutlined />}
                            style={{ width: 260 }}
                        />
                        <Select
                            value={batchFilterType}
                            onChange={(value) => setBatchFilterType(value as BatchObjectFilterType)}
                            style={{ width: 140 }}
                            options={[
                                { label: '全部对象', value: 'all' },
                                { label: '仅表', value: 'table' },
                                { label: '仅视图', value: 'view' },
                            ]}
                        />
                        <Select
                            value={batchSelectionScope}
                            onChange={(value) => setBatchSelectionScope(value as BatchSelectionScope)}
                            style={{ width: 220 }}
                            options={[
                                { label: '勾选作用于：当前筛选结果', value: 'filtered' },
                                { label: '勾选作用于：全部对象', value: 'all' },
                            ]}
                        />
                    </Space>
                    <div style={{ marginTop: 6, color: '#999', fontSize: 12 }}>
                        当前筛选命中 {filteredBatchObjects.length} / {batchTables.length} 个对象
                    </div>
                </div>
            )}

            {batchTables.length > 0 && (
                <>
                    <div style={{ ...modalSectionStyle, marginBottom: 16 }}>
                        <Space>
                            <Button
                                size="small"
                                onClick={() => handleCheckAll(true)}
                                disabled={selectionScopeTargetKeys.length === 0}
                            >
                                全选
                            </Button>
                            <Button
                                size="small"
                                onClick={() => handleCheckAll(false)}
                                disabled={selectionScopeTargetKeys.length === 0}
                            >
                                取消全选
                            </Button>
                            <Button
                                size="small"
                                onClick={handleInvertSelection}
                                disabled={selectionScopeTargetKeys.length === 0}
                            >
                                反选
                            </Button>
                            <span style={{ color: '#999' }}>
                                已选择 {checkedTableKeys.length} / {batchTables.length} 个对象
                            </span>
                        </Space>
                    </div>
                    <div style={modalScrollSectionStyle}>
                        <Checkbox.Group
                            value={checkedTableKeys}
                            onChange={(values) => setCheckedTableKeys(values as string[])}
                            style={{ width: '100%' }}
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {groupedBatchObjects.tables.length > 0 && (
                                    <div>
                                        <div style={{ marginBottom: 6, color: darkMode ? '#bfbfbf' : '#595959', fontSize: 12 }}>
                                            表 ({groupedBatchObjects.tables.length})
                                        </div>
                                        <Space direction="vertical" style={{ width: '100%' }}>
                                            {groupedBatchObjects.tables.map(table => (
                                                <Checkbox key={table.key} value={table.key}>
                                                    <TableOutlined style={{ marginRight: 8 }} />
                                                    {table.title}
                                                </Checkbox>
                                            ))}
                                        </Space>
                                    </div>
                                )}
                                {groupedBatchObjects.views.length > 0 && (
                                    <div>
                                        <div style={{ marginBottom: 6, color: darkMode ? '#bfbfbf' : '#595959', fontSize: 12 }}>
                                            视图 ({groupedBatchObjects.views.length})
                                        </div>
                                        <Space direction="vertical" style={{ width: '100%' }}>
                                            {groupedBatchObjects.views.map(view => (
                                                <Checkbox key={view.key} value={view.key}>
                                                    <EyeOutlined style={{ marginRight: 8 }} />
                                                    {view.title}
                                                </Checkbox>
                                            ))}
                                        </Space>
                                    </div>
                                )}
                                {groupedBatchObjects.tables.length === 0 && groupedBatchObjects.views.length === 0 && (
                                    <div style={{ color: '#999', padding: '8px 0' }}>
                                        无匹配对象
                                    </div>
                                )}
                            </div>
                        </Checkbox.Group>
                    </div>
                </>
            )}
        </Modal>

        <Modal
            title={renderSidebarModalTitle(<DatabaseOutlined />, "批量操作库", "按数据库批量导出结构，或生成结构加数据的备份。")}
            open={isBatchDbModalOpen}
            onCancel={() => setIsBatchDbModalOpen(false)}
            width={640}
            centered
            styles={{ content: modalPanelStyle, header: { background: 'transparent', borderBottom: 'none', paddingBottom: 10 }, body: { paddingTop: 8 }, footer: { background: 'transparent', borderTop: 'none', paddingTop: 12 } }}
            footer={[
                <Button key="cancel" onClick={() => setIsBatchDbModalOpen(false)}>
                    取消
                </Button>,
                <Button
                    key="export-schema"
                    icon={<ExportOutlined />}
                    onClick={() => handleBatchDbExport(false)}
                    disabled={checkedDbKeys.length === 0}
                >
                    导出库结构 ({checkedDbKeys.length})
                </Button>,
                <Button
                    key="backup"
                    type="primary"
                    icon={<SaveOutlined />}
                    onClick={() => handleBatchDbExport(true)}
                    disabled={checkedDbKeys.length === 0}
                >
                    备份库 ({checkedDbKeys.length})
                </Button>
            ]}
        >
            <div style={{ ...modalSectionStyle, marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, color: darkMode ? '#f5f7ff' : '#162033' }}>选择连接：</label>
                <Select
                    value={selectedDbConnection}
                    onChange={handleDbConnectionChange}
                    style={{ width: '100%' }}
                    placeholder="请选择连接"
                >
                    {connections.filter(c => c.config.type !== 'redis').map(conn => (
                        <Select.Option key={conn.id} value={conn.id}>
                            {conn.name}
                        </Select.Option>
                    ))}
                </Select>
                <div style={{ ...modalHintTextStyle, marginTop: 10 }}>连接选定后会加载当前连接下可批量导出的数据库列表。</div>
            </div>

            {batchDatabases.length > 0 && (
                <>
                    <div style={{ ...modalSectionStyle, marginBottom: 16 }}>
                        <Space>
                            <Button
                                size="small"
                                onClick={() => handleCheckAllDb(true)}
                            >
                                全选
                            </Button>
                            <Button
                                size="small"
                                onClick={() => handleCheckAllDb(false)}
                            >
                                取消全选
                            </Button>
                            <Button
                                size="small"
                                onClick={handleInvertSelectionDb}
                            >
                                反选
                            </Button>
                            <span style={{ color: '#999' }}>
                                已选择 {checkedDbKeys.length} / {batchDatabases.length} 个库
                            </span>
                        </Space>
                    </div>
                    <div style={modalScrollSectionStyle}>
                        <Checkbox.Group
                            value={checkedDbKeys}
                            onChange={(values) => setCheckedDbKeys(values as string[])}
                            style={{ width: '100%' }}
                        >
                            <Space direction="vertical" style={{ width: '100%' }}>
                                {batchDatabases.map(db => (
                                    <Checkbox key={db.key} value={db.key}>
                                        <DatabaseOutlined style={{ marginRight: 8 }} />
                                        {db.title}
                                    </Checkbox>
                                ))}
                            </Space>
                        </Checkbox.Group>
                    </div>
                </>
            )}
        </Modal>

        {/* SQL 文件流式执行进度 Modal */}
        <Modal
            title={v2OpenExternalSqlFileLabel}
            open={sqlFileExecState.open}
            centered
            closable={sqlFileExecState.status !== 'running'}
            maskClosable={false}
            footer={buildSQLFileExecutionFooter({
                status: sqlFileExecState.status,
                onCancelExecution: () => {
                    CancelSQLFileExecution(sqlFileExecState.jobId);
                    setSqlFileExecState(prev => ({ ...prev, status: 'cancelled' }));
                },
                onClose: () => setSqlFileExecState(prev => ({ ...prev, open: false })),
            })}
            onCancel={() => {
                if (sqlFileExecState.status !== 'running') {
                    setSqlFileExecState(prev => ({ ...prev, open: false }));
                }
            }}
            styles={{ content: modalPanelStyle, header: { background: 'transparent', borderBottom: 'none' }, body: { paddingTop: 8 }, footer: { background: 'transparent', borderTop: 'none' } }}
        >
            <SQLFileExecutionProgressContent
                fileSizeMB={sqlFileExecState.fileSizeMB}
                status={sqlFileExecState.status}
                executed={sqlFileExecState.executed}
                failed={sqlFileExecState.failed}
                percent={sqlFileExecState.percent}
                currentSQL={sqlFileExecState.currentSQL}
                resultMessage={sqlFileExecState.resultMessage}
            />
        </Modal>
        <FindInDatabaseModal
            open={findInDbContext.open}
            onClose={() => setFindInDbContext({ open: false, connectionId: '', dbName: '' })}
            connectionId={findInDbContext.connectionId}
            dbName={findInDbContext.dbName}
        />
        <MessagePublishModal
            open={Boolean(messagePublishTarget)}
            connection={messagePublishTarget?.connection || null}
            executionDbName={messagePublishTarget?.executionDbName || ''}
            defaultDestination={messagePublishTarget?.destination || ''}
            onCancel={() => setMessagePublishTarget(null)}
            onSuccess={handleMessagePublishSuccess}
        />
    </div>
  );
});

export default Sidebar;
