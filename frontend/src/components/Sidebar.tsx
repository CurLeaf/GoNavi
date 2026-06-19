import Modal from './common/ResizableDraggableModal';
import SidebarConnectionRail from './sidebar/SidebarConnectionRail';
import SidebarSearchPanel, { type SidebarSearchPanelProps } from './sidebar/SidebarSearchPanel';
import { buildSidebarLegacyNodeMenuItems } from './sidebar/sidebarLegacyNodeMenu';
import {
  buildDuckDBMacroDDL,
  buildSidebarTableStatusSQL,
  escapeSQLLiteral,
  extractSqlServerDefinitionRows,
  getCaseInsensitiveRawValue,
  getCaseInsensitiveValue,
  getMetadataDialect,
  getSidebarTableDisplayName,
  shouldHideSchemaPrefix,
  splitQualifiedName,
} from './sidebar/sidebarMetadataLoaders';
import {
  useSidebarBatchExport,
} from './sidebar/useSidebarBatchExport';
import { SidebarBatchExportModals } from './sidebar/SidebarBatchExportModals';
import { SidebarEntityModals } from './sidebar/SidebarEntityModals';
import { renderSidebarV2TreeTitle } from './sidebar/SidebarTreeTitle';
import {
  normalizeDriverType,
  useSidebarTreeLoaders,
} from './sidebar/useSidebarTreeLoaders';
export { formatSidebarDriverAgentUpdateWarning } from './sidebar/useSidebarTreeLoaders';
import {
  ExternalSQLFileModal,
  SQLFileExecutionModal,
  useSidebarExternalSqlWorkflow,
} from './sidebar/SidebarExternalSqlWorkflow';
export {
  buildSQLFileExecutionFooter,
  SQLFileExecutionProgressContent,
} from './sidebar/SidebarExternalSqlWorkflow';
export type {
  SQLFileExecutionProgressState,
  SQLFileExecutionStatus,
} from './sidebar/SidebarExternalSqlWorkflow';
import {
  V2_RAIL_UNGROUPED_CONNECTION_GROUP_ID,
  formatSidebarRowCount,
  hasSidebarLazyChildren,
  shouldClearSidebarActiveContextOnEmptySelect,
  shouldLoadSidebarNodeOnExpand,
  getV2RailConnectionGroupBadgeText,
  isV2SidebarObjectNode,
  resolveV2ObjectGroupTitle,
  resolveSidebarTableNameForCopy,
  parseV2CommandSearchQuery,
  type V2ExplorerFilter,
  type V2CommandSearchMode,
  type V2CommandSearchQuery,
} from './sidebar/sidebarHelpers';
// 重新导出，保持外部测试文件的 `from './Sidebar'` 兼容
export {
  V2_RAIL_UNGROUPED_CONNECTION_GROUP_ID,
  formatSidebarRowCount,
  hasSidebarLazyChildren,
  shouldClearSidebarActiveContextOnEmptySelect,
  shouldLoadSidebarNodeOnExpand,
  getV2RailConnectionGroupBadgeText,
  isV2SidebarObjectNode,
  resolveV2ObjectGroupTitle,
  resolveSidebarTableNameForCopy,
  parseV2CommandSearchQuery,
} from './sidebar/sidebarHelpers';
import React, { useEffect, useState, useMemo, useRef, useCallback, useDeferredValue } from 'react';
import { createPortal } from 'react-dom';
import { Tree, message, Dropdown, MenuProps, Input, Button, Form, Badge, Checkbox, Space, Select, Popover, Tooltip, Switch } from 'antd';
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
  BarsOutlined
	} from '@ant-design/icons';
import {
    buildSidebarRootConnectionToken,
    buildSidebarRootTagToken,
    resolveSidebarRootOrderTokens,
    useStore,
} from '../store';
import { buildOverlayWorkbenchTheme } from '../utils/overlayWorkbenchTheme';
		import { SavedConnection, SavedQuery, ExternalSQLDirectory, ExternalSQLTreeEntry } from '../types';
import { getDbIcon } from './DatabaseIcons';
		import { DBQuery, DBShowCreateTable, DBReleaseConnection, ExportTableWithOptions, CreateDatabase, CreateSchema, RenameDatabase, DropDatabase, RenameTable, DropTable, DropView, DropFunction, RenameView, ListSQLDirectory } from '../../wailsjs/go/app/App';
import { getTableDataDangerActionMeta, supportsTableTruncateAction, type TableDataDangerActionKind } from './tableDataDangerActions';
  import { EventsOn } from '../../wailsjs/runtime/runtime';
  import { isMacLikePlatform, normalizeOpacityForPlatform, resolveAppearanceValues } from '../utils/appearance';
import { useAutoFetchVisibility } from '../utils/autoFetchVisibility';
import FindInDatabaseModal from './FindInDatabaseModal';
import { buildRpcConnectionConfig } from '../utils/connectionRpcConfig';
import { getDataSourceCapabilities, resolveDataSourceType } from '../utils/dataSourceCapabilities';
import { noAutoCapInputProps } from '../utils/inputAutoCap';
import {
  resolveSidebarRuntimeDatabase,
  type SidebarViewMetadataEntry,
} from '../utils/sidebarMetadata';
import { buildStarRocksMaterializedViewPreviewSql } from './tableDesignerSchemaSql';
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
import { buildExternalSQLRootNode, type ExternalSQLTreeNode } from '../utils/externalSqlTree';
import { getCurrentLanguage, t } from '../i18n';
import { SIDEBAR_SQL_EDITOR_DRAG_MIME, encodeSidebarSqlEditorDragPayload } from '../utils/sidebarSqlDrag';
import { buildSqlServerObjectDefinitionQueries } from '../utils/sqlServerObjectDefinition';
import JVMModeBadge from './jvm/JVMModeBadge';
import MessagePublishModal from './MessagePublishModal';
import {
  SIDEBAR_CONTEXT_MENU_FALLBACK_HEIGHT,
  SIDEBAR_CONTEXT_MENU_FALLBACK_WIDTH,
  normalizeMySQLViewDDLForEditing,
  resolveSidebarContextMenuPosition,
  resolveSidebarObjectDragText,
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
  buildSidebarTableChildrenForUi,
  buildV2RailConnectionGroups,
  buildV2SidebarTableSectionedChildren,
  estimateV2TreeHorizontalScrollWidth,
  filterV2CommandSearchTreeItems,
  filterV2ExplorerTreeByKind,
  isSidebarTablePinned,
  normalizeSidebarTreeRelativeDropPosition,
  resolveSidebarConnectionIdFromKey,
  resolveSidebarDropInsertBefore,
  resolveSidebarDropNodeFromDomEvent,
  resolveSidebarDropTargetMetricsFromDomEvent,
  resolveSidebarNodeConnectionId,
  resolveSidebarTagDropInsertBefore,
  resolveV2ActiveConnectionId,
  resolveV2CommandSearchPersistentFilter,
  shouldSkipSidebarLoadOnExpandWhileDragging,
  shouldSkipSidebarSelectWhileDragging,
  shouldCloseV2CommandSearchOnGlobalKey,
  shouldRunV2CommandSearchEnter,
  sortSidebarTableEntries,
  type SidebarTreeNode as TreeNode,
  type V2CommandSearchItem,
  type V2RailConnectionGroup,
} from './sidebarV2Utils';

export {
  buildSidebarTableChildrenForUi,
  buildV2RailConnectionGroups,
  buildV2SidebarTableSectionedChildren,
  estimateV2TreeHorizontalScrollWidth,
  filterV2CommandSearchTreeItems,
  filterV2ExplorerTreeByKind,
  isSidebarTablePinned,
  normalizeSidebarTreeRelativeDropPosition,
  resolveSidebarConnectionIdFromKey,
  resolveSidebarDropInsertBefore,
  resolveSidebarDropNodeFromDomEvent,
  resolveSidebarDropTargetMetricsFromDomEvent,
  resolveSidebarNodeConnectionId,
  resolveSidebarTagDropInsertBefore,
  resolveV2ActiveConnectionId,
  resolveV2CommandSearchPersistentFilter,
  shouldSkipSidebarLoadOnExpandWhileDragging,
  shouldSkipSidebarSelectWhileDragging,
  shouldCloseV2CommandSearchOnGlobalKey,
  shouldRunV2CommandSearchEnter,
  sortSidebarTableEntries,
};
export type { V2CommandSearchItem, V2RailConnectionGroup } from './sidebarV2Utils';

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

// resolveV2ObjectGroupTitle 已迁移到 ./sidebar/sidebarHelpers

// shouldLoadSidebarNodeOnExpand 已迁移到 ./sidebar/sidebarHelpers

// resolveSidebarTableNameForCopy 已迁移到 ./sidebar/sidebarHelpers

const buildConnectionRootQueryTabTitle = () => t('query.new');

const buildConnectionRootRedisCommandTabTitle = (redisDbLabel = 'db0') =>
  t('sidebar.tab.redis_command', { database: redisDbLabel });

const buildConnectionRootRedisMonitorTabTitle = (redisDbLabel = 'db0') =>
  t('sidebar.tab.redis_monitor', { database: redisDbLabel });

const V2_EXPLORER_FILTER_OPTIONS: Array<{ key: V2ExplorerFilter; labelKey: string }> = [
  { key: 'all', labelKey: 'sidebar.command_search.object_kind.all' },
  { key: 'tables', labelKey: 'sidebar.command_search.object_kind.tables' },
  { key: 'views', labelKey: 'sidebar.command_search.object_kind.views' },
  { key: 'routines', labelKey: 'sidebar.command_search.object_kind.routines' },
  { key: 'events', labelKey: 'sidebar.command_search.object_kind.events' },
];

type SidebarMessagePublishTarget = {
  connection: SavedConnection;
  executionDbName: string;
  destination: string;
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
  // Connection Tag Modals
  const [isCreateTagModalOpen, setIsCreateTagModalOpen] = useState(false);
  const [createTagForm] = Form.useForm();

  const {
      isBatchModalOpen,
      setIsBatchModalOpen,
      batchTables,
      checkedTableKeys,
      setCheckedTableKeys,
      selectedConnection,
      selectedDatabase,
      availableDatabases,
      batchFilterKeyword,
      setBatchFilterKeyword,
      batchFilterType,
      setBatchFilterType,
      batchSelectionScope,
      setBatchSelectionScope,
      filteredBatchObjects,
      groupedBatchObjects,
      selectionScopeTargetKeys,
      isBatchDbModalOpen,
      setIsBatchDbModalOpen,
      batchDatabases,
      checkedDbKeys,
      setCheckedDbKeys,
      selectedDbConnection,
      handleExportDatabaseSQL,
      handleExportSchemaSQL,
      openBatchOperationModal,
      openBatchTableExportWorkbench,
      handleConnectionChange,
      handleDatabaseChange,
      handleBatchExport,
      handleBatchClear,
      handleCheckAll,
      handleInvertSelection,
      openBatchDatabaseModal,
      openBatchDatabaseExportWorkbench,
      handleDbConnectionChange,
      handleBatchDbExport,
      handleCheckAllDb,
      handleInvertSelectionDb,
  } = useSidebarBatchExport({
      connections,
      selectedNodesRef,
      addTab,
      addSqlLog,
  });
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

  const {
      handleRunSQLFile,
      handleOpenSQLFileFromToolbar,
      openExternalSQLFile,
      openCreateExternalSQLFileModal,
      openRenameExternalSQLFileModal,
      openCreateExternalSQLDirectoryModal,
      openRenameExternalSQLDirectoryModal,
      handleDeleteExternalSQLFile,
      handleDeleteExternalSQLDirectory,
      handleAddExternalSQLDirectory,
      handleRemoveExternalSQLDirectory,
      handleRefreshExternalSQLDirectory,
      externalSQLFileModalProps,
      sqlFileExecutionModalProps,
  } = useSidebarExternalSqlWorkflow({
      connections,
      externalSQLDirectories,
      activeTab,
      connectionIds,
      selectedNodesRef,
      addTab,
      saveExternalSQLDirectory,
      deleteExternalSQLDirectory,
      refreshGlobalExternalSQLRootNode,
      setExpandedKeys,
      setAutoExpandParent,
      getActiveContext: () => useStore.getState().activeContext,
  });

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

  const refreshDatabaseNode = async (dbNodeKey: string) => {
      if (!dbNodeKey) {
          return;
      }
      const dbNode = findTreeNodeByKey(treeData, dbNodeKey);
      if (dbNode && dbNode.type === 'database') {
          await loadTables(dbNode);
      }
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

  const {
      loadDatabases,
      loadJVMResources,
      loadTables,
  } = useSidebarTreeLoaders({
      savedQueries,
      externalSQLDirectories,
      tableSortPreference,
      tableAccessCount,
      pinnedSidebarTables,
      isV2Ui,
      loadingNodesRef,
      setConnectionStates,
      setLoadedKeys,
      replaceTreeNodeChildren,
      buildRuntimeConfig,
      buildJVMRuntimeConfig,
      buildJVMDiagnosticTreeNodes,
      resolveSavedQueryDisplayName,
      decorateExternalSQLTreeNode,
  });

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

  const renderV2TreeTitle = (node: any, hoverTitle: string, statusBadge: React.ReactNode) => renderSidebarV2TreeTitle({
      node,
      hoverTitle,
      statusBadge,
      getV2TreeMetaText,
      toggleSidebarTablePinned,
      snapshotTreeSelectionBeforeDrag,
      restoreTreeSelectionAfterDrag,
      treeDragSelectSuppressUntilRef,
      setIsTreeDragging,
  });

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

  expandConnectionFromRailRef.current = (connectionId: string) => {
      const conn = connections.find((item) => item.id === connectionId);
      if (conn) {
          selectConnectionFromRail(conn);
      }
  };

  const getNodeMenuItems = (node: any): MenuProps['items'] => buildSidebarLegacyNodeMenuItems(node, {
    addTab,
    getMetadataDialect,
    handleV2DatabaseContextMenuAction,
    isPostgresSchemaDialect,
    handleExportSchemaSQL,
    openRenameSchemaModal,
    loadTables,
    getDatabaseNodeRef,
    handleDeleteSchema,
    tableSortPreference,
    isStructureOnlyDbType,
    openNewTableDesign,
    handleTableGroupSortAction,
    openCreateView,
    openCreateStarRocksMaterializedView,
    openCreateRoutine,
    createTagForm,
    setRenameViewTarget,
    setIsCreateTagModalOpen,
    removeConnectionTag,
    setExpandedKeys,
    setLoadedKeys,
    loadingNodesRef,
    loadDatabases,
    buildConnectionRootRedisCommandTabTitle,
    buildConnectionRootRedisMonitorTabTitle,
    onEditConnection,
    handleDuplicateConnection,
    disconnectConnectionNode,
    deleteConnectionNode,
    connectionTags,
    moveConnectionToTag,
    setTargetConnection,
    setIsCreateDbModalOpen,
    buildConnectionRootQueryTabTitle,
    handleRunSQLFile,
    openCreateStarRocksExternalCatalog,
    openEditView,
    renameViewForm,
    setIsRenameViewModalOpen,
    handleDropView,
    onDoubleClick,
    openViewDefinition,
    openRoutineDefinition,
    openEditRoutine,
    handleDropRoutine,
    openEventDefinition,
    resolveMessagePublishTarget,
    openMessagePublishModal,
    openDesign,
    openCreateStarRocksRollup,
    handleCopyTableName,
    handleCopyStructure,
    handleExport,
    setRenameTableTarget,
    renameTableForm,
    setIsRenameTableModalOpen,
    handleTableDataDangerAction,
    handleDeleteTable,
    openExportDialog,
    isSavedQueryUnmatched,
    connections,
    handleRebindSavedQuery,
    openRenameSavedQueryModal,
    resolveSavedQueryDisplayName,
    deleteQuery,
    treeDataRef,
    setTreeData,
    handleAddExternalSQLDirectory,
    openCreateExternalSQLFileModal,
    openCreateExternalSQLDirectoryModal,
    openRenameExternalSQLDirectoryModal,
    handleRefreshExternalSQLDirectory,
    handleDeleteExternalSQLDirectory,
    handleRemoveExternalSQLDirectory,
    openExternalSQLFile,
    openRenameExternalSQLFileModal,
    handleDeleteExternalSQLFile,
    extractObjectName,
  });

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

  const v2CommandSearchPanelProps: SidebarSearchPanelProps<V2CommandSearchItem> = {
    isOpen: isV2CommandSearchOpen,
    searchValue: v2CommandSearchValue,
    activeIndex: v2CommandActiveIndex,
    label: v2CommandSearchLabel,
    placeholder: v2CommandSearchPlaceholder,
    persistedFilter: v2PersistedSidebarFilter,
    persistentFilterEnabled: v2CommandSearchPersistentFilterEnabled,
    aiMode: v2CommandSearchAiMode,
    objectMode: v2CommandSearchObjectMode,
    flatItems: commandSearchFlatItems,
    sections: {
      goTo: filteredCommandSearchTreeItems,
      ai: commandSearchAiItem,
      actions: filteredCommandSearchActionItems,
      recent: filteredCommandSearchRecentItems,
    },
    inputRef: commandSearchInputRef,
    handlers: {
      onSearchValueChange: handleV2CommandSearchValueChange,
      onKeyDown: handleV2CommandSearchKeyDown,
      onClose: closeV2CommandSearch,
      onItemSelect: (item: V2CommandSearchItem) => runCommandSearchItem(item),
      onItemHover: (key: string) => setV2CommandActiveIndex(commandSearchFlatItems.findIndex((entry) => entry.key === key)),
      onTogglePersistentFilter: toggleV2CommandSearchPersistentFilter,
      onResetFilter: resetV2SidebarFilter,
    },
  };

  // V2 Connection Rail 子组件 props（从原 renderV2ConnectionRail 抽出，保留所有原行为）
  const v2ConnectionRailProps = {
    labels: {
      railSystemActions: v2RailSystemActionsLabel,
      railObjectActions: v2RailObjectActionsLabel,
      newGroup: v2NewGroupLabel,
      batchTables: v2BatchTablesLabel,
      batchDatabases: v2BatchDatabasesLabel,
      openExternalSqlFile: v2OpenExternalSqlFileLabel,
      locateCurrentTable: v2LocateCurrentTableLabel,
      locateCurrentTableUnavailable: v2LocateCurrentTableUnavailableLabel,
      aiAssistant: v2AiAssistantLabel,
      tools: v2ToolsLabel,
      settings: v2SettingsLabel,
    },
    handlers: {
      openCreateTagModal: () => { setRenameViewTarget(null); createTagForm.resetFields(); setIsCreateTagModalOpen(true); },
      openBatchTableExport: () => openBatchTableExportWorkbench(),
      openBatchDatabaseExport: () => openBatchDatabaseExportWorkbench(),
      openExternalSqlFile: handleOpenSQLFileFromToolbar,
      locateActiveTab: handleLocateActiveTabInSidebar,
      toggleAI: onToggleAI ?? (() => {}),
      openTools: onOpenTools ?? (() => {}),
      openSettings: onOpenSettings ?? (() => {}),
    },
    canLocateActiveTab,
  };

  return (
    <div className={isV2Ui ? 'gn-v2-sidebar-redesign' : undefined} style={{ display: 'flex', height: '100%', minHeight: 0 }}>
        {exportProgressModal}
        {isV2Ui && <SidebarConnectionRail {...v2ConnectionRailProps} />}
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
        <SidebarSearchPanel {...v2CommandSearchPanelProps} />

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

        <SidebarEntityModals
            connections={connections}
            connectionTags={connectionTags}
            modalPanelStyle={modalPanelStyle}
            modalSectionStyle={modalSectionStyle}
            modalScrollSectionStyle={modalScrollSectionStyle}
            renderSidebarModalTitle={renderSidebarModalTitle}
            isCreateTagModalOpen={isCreateTagModalOpen}
            setIsCreateTagModalOpen={setIsCreateTagModalOpen}
            createTagForm={createTagForm}
            renameViewTarget={renameViewTarget}
            updateConnectionTag={updateConnectionTag}
            addConnectionTag={addConnectionTag}
            moveConnectionToTag={moveConnectionToTag}
            isCreateDbModalOpen={isCreateDbModalOpen}
            setIsCreateDbModalOpen={setIsCreateDbModalOpen}
            createDbForm={createDbForm}
            handleCreateDatabase={handleCreateDatabase}
            isCreateSchemaModalOpen={isCreateSchemaModalOpen}
            setIsCreateSchemaModalOpen={setIsCreateSchemaModalOpen}
            createSchemaForm={createSchemaForm}
            createSchemaTarget={createSchemaTarget}
            setCreateSchemaTarget={setCreateSchemaTarget}
            handleCreateSchema={handleCreateSchema}
            isRenameSchemaModalOpen={isRenameSchemaModalOpen}
            setIsRenameSchemaModalOpen={setIsRenameSchemaModalOpen}
            renameSchemaForm={renameSchemaForm}
            renameSchemaTarget={renameSchemaTarget}
            setRenameSchemaTarget={setRenameSchemaTarget}
            handleRenameSchema={handleRenameSchema}
            isRenameDbModalOpen={isRenameDbModalOpen}
            setIsRenameDbModalOpen={setIsRenameDbModalOpen}
            renameDbForm={renameDbForm}
            renameDbTarget={renameDbTarget}
            setRenameDbTarget={setRenameDbTarget}
            handleRenameDatabase={handleRenameDatabase}
            isRenameTableModalOpen={isRenameTableModalOpen}
            setIsRenameTableModalOpen={setIsRenameTableModalOpen}
            renameTableForm={renameTableForm}
            renameTableTarget={renameTableTarget}
            setRenameTableTarget={setRenameTableTarget}
            handleRenameTable={handleRenameTable}
            isRenameViewModalOpen={isRenameViewModalOpen}
            setIsRenameViewModalOpen={setIsRenameViewModalOpen}
            renameViewForm={renameViewForm}
            setRenameViewTarget={setRenameViewTarget}
            handleRenameView={handleRenameView}
            isRenameSavedQueryModalOpen={isRenameSavedQueryModalOpen}
            setIsRenameSavedQueryModalOpen={setIsRenameSavedQueryModalOpen}
            renameSavedQueryForm={renameSavedQueryForm}
            renameSavedQueryTarget={renameSavedQueryTarget}
            setRenameSavedQueryTarget={setRenameSavedQueryTarget}
            handleRenameSavedQuery={handleRenameSavedQuery}
        />

        <ExternalSQLFileModal {...externalSQLFileModalProps} />

        <SidebarBatchExportModals
            connections={connections}
            modalPanelStyle={modalPanelStyle}
            modalSectionStyle={modalSectionStyle}
            modalScrollSectionStyle={modalScrollSectionStyle}
            modalHintTextStyle={modalHintTextStyle}
            darkMode={darkMode}
            tableModalTitle={renderSidebarModalTitle(<TableOutlined />, "批量操作表", "按对象批量导出结构、数据或完整备份。")}
            databaseModalTitle={renderSidebarModalTitle(<DatabaseOutlined />, "批量操作库", "按数据库批量导出结构，或生成结构加数据的备份。")}
            isBatchModalOpen={isBatchModalOpen}
            setIsBatchModalOpen={setIsBatchModalOpen}
            selectedConnection={selectedConnection}
            selectedDatabase={selectedDatabase}
            availableDatabases={availableDatabases}
            batchTables={batchTables}
            checkedTableKeys={checkedTableKeys}
            setCheckedTableKeys={setCheckedTableKeys}
            batchFilterKeyword={batchFilterKeyword}
            setBatchFilterKeyword={setBatchFilterKeyword}
            batchFilterType={batchFilterType}
            setBatchFilterType={setBatchFilterType}
            batchSelectionScope={batchSelectionScope}
            setBatchSelectionScope={setBatchSelectionScope}
            filteredBatchObjects={filteredBatchObjects}
            groupedBatchObjects={groupedBatchObjects}
            selectionScopeTargetKeys={selectionScopeTargetKeys}
            handleConnectionChange={handleConnectionChange}
            handleDatabaseChange={handleDatabaseChange}
            handleBatchClear={handleBatchClear}
            handleBatchExport={handleBatchExport}
            handleCheckAll={handleCheckAll}
            handleInvertSelection={handleInvertSelection}
            isBatchDbModalOpen={isBatchDbModalOpen}
            setIsBatchDbModalOpen={setIsBatchDbModalOpen}
            selectedDbConnection={selectedDbConnection}
            batchDatabases={batchDatabases}
            checkedDbKeys={checkedDbKeys}
            setCheckedDbKeys={setCheckedDbKeys}
            handleDbConnectionChange={handleDbConnectionChange}
            handleBatchDbExport={handleBatchDbExport}
            handleCheckAllDb={handleCheckAllDb}
            handleInvertSelectionDb={handleInvertSelectionDb}
        />

        <SQLFileExecutionModal
            title={v2OpenExternalSqlFileLabel}
            modalPanelStyle={modalPanelStyle}
            {...sqlFileExecutionModalProps}
        />
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
