import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Sidebar, {
  buildSidebarTableChildrenForUi,
  buildV2SidebarTableSectionedChildren,
  buildV2RailConnectionGroups,
  estimateV2TreeHorizontalScrollWidth,
  filterV2CommandSearchTreeItems,
  filterV2ExplorerTreeByKind,
  getV2RailConnectionGroupBadgeText,
  hasSidebarLazyChildren,
  normalizeSidebarTreeRelativeDropPosition,
  parseV2CommandSearchQuery,
  resolveV2CommandSearchPersistentFilter,
  type V2CommandSearchItem,
  resolveSidebarDropNodeFromDomEvent,
  resolveSidebarTagDropInsertBefore,
  resolveSidebarDropTargetMetricsFromDomEvent,
  resolveSidebarDropInsertBefore,
  resolveSidebarNodeConnectionId,
  resolveV2ActiveConnectionId,
  isSidebarTablePinned,
  resolveSidebarTableNameForCopy,
  shouldClearSidebarActiveContextOnEmptySelect,
  shouldSkipSidebarLoadOnExpandWhileDragging,
  shouldSkipSidebarSelectWhileDragging,
  shouldLoadSidebarNodeOnExpand,
  shouldCloseV2CommandSearchOnGlobalKey,
  shouldRunV2CommandSearchEnter,
  sortSidebarTableEntries,
} from './Sidebar';
import {
  buildSidebarRootConnectionToken,
  buildSidebarRootTagToken,
  buildSidebarTablePinKey,
} from '../store';
import {
  DEFAULT_SHORTCUT_OPTIONS,
  cloneShortcutOptions,
} from '../utils/shortcuts';
import {
  V2ConnectionGroupContextMenuView,
  V2ConnectionContextMenuView,
  V2DatabaseContextMenuView,
  V2SchemaContextMenuView,
  V2TableContextMenuView,
  V2TableGroupContextMenuView,
  formatV2TableContextMenuRows,
  formatV2TableContextMenuSize,
} from './V2TableContextMenu';

const mocks = vi.hoisted(() => ({
  noop: vi.fn(),
  state: {
    connections: [] as any[],
    activeContext: null as any,
    activeTabId: 'conn-1-main-users',
    tabs: [{
      id: 'conn-1-main-users',
      title: 'users',
      type: 'table',
      connectionId: 'conn-1',
      dbName: 'main',
      tableName: 'users',
    }] as any[],
    connectionTags: [] as any[],
    appearance: {
      enabled: true,
      opacity: 1,
      blur: 0,
      uiVersion: 'legacy',
    } as any,
    shortcutOptions: null as any,
  },
}));

vi.mock('../store', () => ({
  buildSidebarRootConnectionToken: (connectionId: string) => `connection:${connectionId.trim()}`,
  buildSidebarRootTagToken: (tagId: string) => `tag:${tagId.trim()}`,
  resolveSidebarRootOrderTokens: (
    sidebarRootOrder: unknown,
    connectionTags: Array<{ id: string; connectionIds: string[] }>,
    connections: Array<{ id: string }>,
  ) => {
    const groupedConnectionIds = new Set<string>();
    connectionTags.forEach((tag) => tag.connectionIds.forEach((id) => groupedConnectionIds.add(id)));
    const fallback = [
      ...connectionTags.map((tag) => `tag:${tag.id}`),
      ...connections
        .filter((conn) => !groupedConnectionIds.has(conn.id))
        .map((conn) => `connection:${conn.id}`),
    ];
    const valid = new Set(fallback);
    const normalized = Array.isArray(sidebarRootOrder)
      ? sidebarRootOrder
        .map((item) => String(item ?? '').trim())
        .filter((item) => valid.has(item))
      : [];
    const seen = new Set<string>();
    const result: string[] = [];
    [...normalized, ...fallback].forEach((token) => {
      if (!token || seen.has(token)) return;
      seen.add(token);
      result.push(token);
    });
    return result;
  },
  buildSidebarTablePinKey: (
    connectionId: string,
    dbName: string,
    tableName: string,
    schemaName = '',
  ) => JSON.stringify([
    connectionId.trim(),
    dbName.trim(),
    schemaName.trim(),
    tableName.trim(),
  ]),
  useStore: (selector: (state: any) => any) => selector({
    connections: mocks.state.connections,
    savedQueries: [],
    externalSQLDirectories: [],
    saveQuery: mocks.noop,
    deleteQuery: mocks.noop,
    saveExternalSQLDirectory: mocks.noop,
    deleteExternalSQLDirectory: mocks.noop,
    addConnection: mocks.noop,
    addTab: mocks.noop,
    updateQueryTabDraft: mocks.noop,
    tabs: mocks.state.tabs,
    activeTabId: mocks.state.activeTabId,
    setActiveContext: mocks.noop,
    removeConnection: mocks.noop,
    connectionTags: mocks.state.connectionTags,
    sidebarRootOrder: [],
    addConnectionTag: mocks.noop,
    updateConnectionTag: mocks.noop,
    removeConnectionTag: mocks.noop,
    moveConnectionToTag: mocks.noop,
    reorderConnections: mocks.noop,
    reorderTags: mocks.noop,
    reorderSidebarRoot: mocks.noop,
    closeTabsByConnection: mocks.noop,
    closeTabsByDatabase: mocks.noop,
    theme: 'light',
    appearance: mocks.state.appearance,
    activeContext: mocks.state.activeContext,
    tableAccessCount: {},
    tableSortPreference: {},
    pinnedSidebarTables: [],
    recordTableAccess: mocks.noop,
    setTableSortPreference: mocks.noop,
    setSidebarTablePinned: mocks.noop,
    addSqlLog: mocks.noop,
    sqlLogs: [],
    shortcutOptions: mocks.state.shortcutOptions ?? cloneShortcutOptions(DEFAULT_SHORTCUT_OPTIONS),
    setAIPanelVisible: mocks.noop,
    addAIContext: mocks.noop,
  }),
}));

vi.mock('../../wailsjs/go/app/App', () => ({
  DBGetDatabases: mocks.noop,
  DBGetTables: mocks.noop,
  DBQuery: mocks.noop,
  DBShowCreateTable: mocks.noop,
  DBReleaseConnection: mocks.noop,
  ExportTable: mocks.noop,
  OpenSQLFile: mocks.noop,
  ExecuteSQLFile: mocks.noop,
  CancelSQLFileExecution: mocks.noop,
  CreateDatabase: mocks.noop,
  CreateSchema: mocks.noop,
  RenameDatabase: mocks.noop,
  DropDatabase: mocks.noop,
  RenameTable: mocks.noop,
  DropTable: mocks.noop,
  DropView: mocks.noop,
  DropFunction: mocks.noop,
  RenameView: mocks.noop,
  SelectSQLDirectory: mocks.noop,
  ListSQLDirectory: mocks.noop,
  ReadSQLFile: mocks.noop,
  CreateSQLFile: mocks.noop,
  CreateSQLDirectory: mocks.noop,
  DeleteSQLFile: mocks.noop,
  DeleteSQLDirectory: mocks.noop,
  RenameSQLFile: mocks.noop,
  RenameSQLDirectory: mocks.noop,
  JVMProbeCapabilities: mocks.noop,
  GetDriverStatusList: mocks.noop,
}));

vi.mock('../../wailsjs/runtime/runtime', () => ({
  EventsOn: mocks.noop,
}));

vi.mock('../utils/appearance', async () => {
  const actual = await vi.importActual<typeof import('../utils/appearance')>('../utils/appearance');
  return {
    ...actual,
    isMacLikePlatform: () => true,
  };
});

describe('Sidebar locate toolbar', () => {
  beforeEach(() => {
    mocks.state.connections = [];
    mocks.state.activeContext = null;
    mocks.state.activeTabId = 'conn-1-main-users';
    mocks.state.tabs = [{
      id: 'conn-1-main-users',
      title: 'users',
      type: 'table',
      connectionId: 'conn-1',
      dbName: 'main',
      tableName: 'users',
    }];
    mocks.state.connectionTags = [];
    mocks.state.appearance = {
      enabled: true,
      opacity: 1,
      blur: 0,
      uiVersion: 'legacy',
    };
    mocks.state.shortcutOptions = cloneShortcutOptions(DEFAULT_SHORTCUT_OPTIONS);
  });

  it('resolves the table name used by the sidebar copy action', () => {
    expect(resolveSidebarTableNameForCopy({
      title: 'users',
      dataRef: { tableName: 'public.users' },
    })).toBe('public.users');
    expect(resolveSidebarTableNameForCopy({
      title: 'v_users',
      dataRef: { viewName: 'reporting.v_users' },
    })).toBe('reporting.v_users');
    expect(resolveSidebarTableNameForCopy({
      title: 'users',
      dataRef: {},
    })).toBe('users');
  });

  it('treats empty lazy children as unloaded for sidebar expansion', () => {
    expect(hasSidebarLazyChildren(undefined)).toBe(false);
    expect(hasSidebarLazyChildren([])).toBe(false);
    expect(hasSidebarLazyChildren([{ key: 'child', title: 'child' }])).toBe(true);
    expect(shouldLoadSidebarNodeOnExpand({ type: 'database', children: [] })).toBe(true);
    expect(shouldLoadSidebarNodeOnExpand({ type: 'database', children: [{ key: 'tables', title: '表' }] })).toBe(false);
    expect(shouldLoadSidebarNodeOnExpand({ type: 'object-group', children: [] })).toBe(false);
  });

  it('wires tree expand and double-click expansion to lazy loading', () => {
    const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');

    expect(source).toContain('if (hasSidebarLazyChildren(children)) return;');
    expect(source).toContain('if (!shouldSkipSidebarLoadOnExpandWhileDragging(isTreeDragging, info))');
    expect(source).toContain('if (shouldLoadSidebarNodeOnExpand(node))');
  });

  it('parses v2 command search prefixes into real search modes', () => {
    expect(parseV2CommandSearchQuery('@ payment_order')).toMatchObject({
      mode: 'object',
      keyword: 'payment_order',
      normalizedKeyword: 'payment_order',
      aiPrompt: '',
    });
    expect(parseV2CommandSearchQuery('＠fs_mkefu_server_info')).toMatchObject({
      mode: 'object',
      keyword: 'fs_mkefu_server_info',
    });
    expect(parseV2CommandSearchQuery('? 帮我分析订单表')).toMatchObject({
      mode: 'ai',
      keyword: '帮我分析订单表',
      normalizedKeyword: '帮我分析订单表',
      aiPrompt: '帮我分析订单表',
    });
    expect(parseV2CommandSearchQuery('payment')).toMatchObject({
      mode: 'default',
      keyword: 'payment',
      normalizedKeyword: 'payment',
    });
  });

  it('only runs v2 command search enter for a real selected result outside IME composition', () => {
    expect(shouldRunV2CommandSearchEnter({
      key: 'Enter',
      activeItemCount: 1,
    })).toBe(true);
    expect(shouldRunV2CommandSearchEnter({
      key: 'Enter',
      isComposing: true,
      activeItemCount: 1,
    })).toBe(false);
    expect(shouldRunV2CommandSearchEnter({
      key: 'Enter',
      keyCode: 229,
      activeItemCount: 1,
    })).toBe(false);
    expect(shouldRunV2CommandSearchEnter({
      key: 'Enter',
      activeItemCount: 0,
    })).toBe(false);
    expect(shouldRunV2CommandSearchEnter({
      key: 'Escape',
      activeItemCount: 1,
    })).toBe(false);
  });

  it('keeps v2 command search persisted filter after closing the palette', () => {
    expect(resolveV2CommandSearchPersistentFilter({
      commandSearchValue: '  org  ',
      persistedFilter: '',
      enabled: true,
      isOpen: true,
    })).toBe('org');

    expect(resolveV2CommandSearchPersistentFilter({
      commandSearchValue: '',
      persistedFilter: 'org',
      enabled: true,
      isOpen: false,
    })).toBe('org');

    expect(resolveV2CommandSearchPersistentFilter({
      commandSearchValue: 'org',
      persistedFilter: 'org',
      enabled: false,
      isOpen: true,
    })).toBe('');
  });

  it('closes v2 command search on global escape only while the palette is open', () => {
    expect(shouldCloseV2CommandSearchOnGlobalKey({
      key: 'Escape',
      isOpen: true,
    })).toBe(true);

    expect(shouldCloseV2CommandSearchOnGlobalKey({
      key: 'Esc',
      isOpen: true,
    })).toBe(true);

    expect(shouldCloseV2CommandSearchOnGlobalKey({
      key: 'Escape',
      isOpen: false,
    })).toBe(false);

    expect(shouldCloseV2CommandSearchOnGlobalKey({
      key: 'Enter',
      isOpen: true,
    })).toBe(false);
  });

  it('keeps all loaded v2 command table matches once a keyword is entered', () => {
    const items: V2CommandSearchItem[] = Array.from({ length: 40 }, (_, index) => ({
      key: `node-table-${index}`,
      kind: 'node' as const,
      title: `fs_order_${index}`,
      meta: '开发240 · front_end_sys',
      icon: null,
      node: {
        type: 'table',
        key: `table-${index}`,
        title: `fs_order_${index}`,
        dataRef: {
          tableName: `fs_order_${index}`,
          dbName: 'front_end_sys',
        },
      },
    }));

    expect(filterV2CommandSearchTreeItems(
      items,
      parseV2CommandSearchQuery('fs_order'),
    )).toHaveLength(40);
    expect(filterV2CommandSearchTreeItems(
      items,
      parseV2CommandSearchQuery(''),
    )).toHaveLength(24);
    expect(filterV2CommandSearchTreeItems(
      [
        ...items,
        {
          key: 'node-db',
          kind: 'node' as const,
          title: 'front_end_sys',
          meta: '开发240',
          icon: null,
          node: {
            type: 'database',
            key: 'db-front-end-sys',
            title: 'front_end_sys',
            dataRef: {
              dbName: 'front_end_sys',
            },
          },
        },
      ],
      parseV2CommandSearchQuery('@fs_order'),
    )).toHaveLength(40);
  });

  it('keeps the v2 active host on the selected database connection', () => {
    const connectionIds = ['local', 'dev240', 'dev241'];
    const databaseNode = {
      key: 'dev240-manage_admin',
      dataRef: {
        id: 'dev240',
        dbName: 'manage_admin',
      },
    };

    expect(resolveSidebarNodeConnectionId(databaseNode, connectionIds)).toBe('dev240');
    expect(resolveV2ActiveConnectionId({
      activeContextConnectionId: '',
      activeTabConnectionId: 'local',
      selectedKeys: [databaseNode.key],
      connectionIds,
    })).toBe('dev240');
  });

  it('keeps the v2 active host on the pinned rail connection after tree deselect', () => {
    expect(resolveV2ActiveConnectionId({
      activeContextConnectionId: '',
      activeTabConnectionId: 'local',
      selectedKeys: [],
      connectionIds: ['local', 'dev240', 'dev241'],
      fallbackConnectionId: 'dev240',
    })).toBe('dev240');
  });

  it('keeps the v2 active host empty when nothing is selected', () => {
    expect(resolveV2ActiveConnectionId({
      activeContextConnectionId: '',
      activeTabConnectionId: '',
      selectedKeys: [],
      connectionIds: ['local', 'dev240', 'dev241'],
    })).toBe('');
  });

  it('does not clear v2 active context when rc-tree emits an empty deselect', () => {
    expect(shouldClearSidebarActiveContextOnEmptySelect(true)).toBe(false);
    expect(shouldClearSidebarActiveContextOnEmptySelect(false)).toBe(true);
  });

  it('builds v2 rail groups from existing connection tags while preserving ungrouped hosts', () => {
    const connections = [
      { id: 'dev240', name: 'dev240', config: { type: 'mysql', host: '10.0.0.240' } },
      { id: 'dev241', name: 'dev241', config: { type: 'postgres', host: '10.0.0.241' } },
      { id: 'local', name: 'local', config: { type: 'mysql', host: 'localhost' } },
    ] as any[];

    const groups = buildV2RailConnectionGroups(
      connections,
      [{
        id: 'prod',
        name: '生产环境',
        connectionIds: ['dev241', 'missing', 'dev240'],
      }],
      [
        buildSidebarRootConnectionToken('local'),
        buildSidebarRootTagToken('prod'),
      ],
    );

    expect(groups.map((group) => ({
      id: group.id,
      name: group.name,
      isUngrouped: group.isUngrouped,
      rootToken: group.rootToken,
      connectionIds: group.connections.map((conn) => conn.id),
    }))).toEqual([
      {
        id: 'local',
        name: 'local',
        isUngrouped: true,
        rootToken: buildSidebarRootConnectionToken('local'),
        connectionIds: ['local'],
      },
      {
        id: 'prod',
        name: '生产环境',
        isUngrouped: undefined,
        rootToken: buildSidebarRootTagToken('prod'),
        connectionIds: ['dev241', 'dev240'],
      },
    ]);
    expect(getV2RailConnectionGroupBadgeText('Production')).toBe('PR');
    expect(getV2RailConnectionGroupBadgeText('生产环境')).toBe('生');
  });

  it('keeps the sidebar memoized so parent-only button state does not repaint the tree', () => {
    const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');

    expect(source).toContain('}> = React.memo(({');
  });

  it('releases backend database connections when disconnecting a sidebar connection', () => {
    const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');
    const disconnectSource = source.slice(
      source.indexOf('const releaseConnectionResources = async'),
      source.indexOf('const deleteConnectionNode ='),
    );

    expect(source).toContain('DBReleaseConnection');
    expect(disconnectSource).toContain('await releaseConnectionResources(conn);');
    expect(source.match(/onClick: \(\) => void disconnectConnectionNode\(node\)/g)).toHaveLength(2);
  });

  it('renders the current table locate action in the sidebar toolbar', () => {
    const markup = renderToStaticMarkup(<Sidebar />);
    const externalSqlActionIndex = markup.indexOf('data-sidebar-open-external-sql-file-action="true"');
    const locateActionIndex = markup.indexOf('data-sidebar-locate-current-tab-action="true"');

    expect(markup).toContain('data-sidebar-locate-current-tab-action="true"');
    expect(markup).toContain('aria-label="定位当前标签页"');
    expect(locateActionIndex).toBeGreaterThan(externalSqlActionIndex);
  });

  it('passes the exact tree key when locating a command-search object node', () => {
    const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');
    const commandSearchRunSource = source.slice(
      source.indexOf("if (node.type === 'table' || node.type === 'view' || node.type === 'materialized-view')"),
      source.indexOf("if (node.type === 'db-trigger' || node.type === 'db-event' || node.type === 'routine')"),
    );

    expect(commandSearchRunSource).toContain("tabId: String(node.key || '')");
  });

  it('wires external SQL directory file actions to dedicated Wails APIs', () => {
    const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');
    const loadTablesSource = source.slice(
      source.indexOf('const loadTables = async'),
      source.indexOf('const locateObjectInSidebarRef'),
    );

    expect(source).toContain('CreateSQLFile(directoryPath, name)');
    expect(source).toContain('RenameSQLFile(filePath, name)');
    expect(source).toContain('DeleteSQLFile(filePath)');
    expect(source).toContain('CreateSQLDirectory(directoryPath, name)');
    expect(source).toContain('RenameSQLDirectory(directoryPath, name)');
    expect(source).toContain('DeleteSQLDirectory(directoryPath)');
    expect(source).toContain('refreshGlobalExternalSQLRootNode(false)');
    expect(source).toContain("request.objectGroup === 'externalSqlFiles'");
    expect(source).toContain('SQL 文件未在外部 SQL 目录中找到');
    expect(source).toContain('filePath: data.filePath || undefined');
    expect(source).toContain("key: 'add-external-sql-directory'");
    expect(source).toContain("key: 'new-external-sql-file'");
    expect(source).toContain("key: 'rename-external-sql-file'");
    expect(source).toContain("key: 'delete-external-sql-file'");
    expect(source).toContain("key: 'new-external-sql-directory'");
    expect(source).toContain("key: 'rename-external-sql-directory'");
    expect(source).toContain("key: 'delete-external-sql-directory'");
    expect(source).toContain('新建 SQL 文件');
    expect(source).toContain('重命名 SQL 文件');
    expect(source).toContain('确认删除 SQL 文件');
    expect(source).toContain('新建目录');
    expect(source).toContain('重命名目录');
    expect(source).toContain('确认删除目录');
    expect(source).toContain('仅支持删除空目录');
    expect(source).toContain('文件名不能包含路径分隔符');
    expect(source).toContain('目录名不能包含路径分隔符');
    expect(loadTablesSource).not.toContain('externalSQLRootNode');
    expect(loadTablesSource).not.toContain('dbExternalSQLDirectories');
  });

  it('keeps the legacy sidebar toolbar on a stable five-column grid layout', () => {
    const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');
    const markup = renderToStaticMarkup(<Sidebar />);

    expect(markup).toContain('data-sidebar-legacy-toolbar="true"');
    expect(markup).toContain('data-sidebar-legacy-toolbar-item="true"');
    expect(source).toContain("const legacyToolbarStyle: React.CSSProperties = {");
    expect(source).toContain("gridTemplateColumns: 'repeat(5, minmax(0, 1fr))'");
    expect(source).toContain("justifyItems: 'center'");
    expect(source).toContain("const legacyToolbarItemStyle: React.CSSProperties = {");
    expect(source).toContain("const legacyToolbarDisabledWrapStyle: React.CSSProperties = {");
    expect(source).not.toContain("justifyContent: 'space-between', borderTop: `1px solid ${darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}`, borderBottom: `1px solid ${darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}`, background: darkMode ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.015)' }}>");
  });

  it('renders the v2 sidebar rail, command search hint, filter tabs and log footer', () => {
    const markup = renderToStaticMarkup(<Sidebar uiVersion="v2" sqlLogCount={2341} onCreateConnection={mocks.noop} />);
    const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');

    expect(markup).toContain('gn-v2-sidebar-redesign');
    expect(markup).toContain('gn-v2-connection-rail');
    expect(markup).toContain('gn-v2-object-explorer');
    expect(markup).toContain('gn-v2-active-connection-header');
    expect(markup).toContain('gn-v2-explorer-search');
    expect(markup).toContain('data-v2-sidebar-search-mode="command"');
    expect(markup).toContain('gn-v2-explorer-command-trigger');
    expect(markup).toContain('gn-v2-explorer-filter-action');
    expect(markup).toContain('重置侧栏筛选');
    expect(markup).toContain('搜索表、连接、动作... 或问 AI');
    expect(markup).toContain('gn-v2-search-shortcut');
    expect(markup).toContain('<kbd>⌘</kbd>');
    expect(markup).toContain('<kbd>K</kbd>');
    expect(source).toContain("const focusSidebarSearchShortcut = resolveShortcutDisplay(shortcutOptions, 'focusSidebarSearch', activeShortcutPlatform);");
    expect(source).not.toContain('<kbd>⌘</kbd>');
    expect(source).not.toContain('<kbd>K</kbd>');
    expect(markup).toContain('gn-v2-explorer-filter-tabs');
    expect(markup).toContain('全部');
    expect(markup).toContain('视图');
    expect(markup).toContain('函数');
    expect(markup).toContain('aria-pressed="true"');
    expect(source).toContain("const [v2ExplorerFilter, setV2ExplorerFilter] = useState<V2ExplorerFilter>('all');");
    expect(source).toContain("const v2SidebarSearchMode = appearance.v2SidebarSearchMode ?? 'command';");
    expect(source).toContain('const v2CommandSearchPersistentFilterEnabled = appearance.v2CommandSearchPersistentFilterEnabled === true;');
    expect(source).toContain('handleV2CommandSearchValueChange(event.target.value)');
    expect(source).toContain('toggleV2CommandSearchPersistentFilter');
    expect(source).toContain('gn-v2-command-filter-switch');
    expect(source).toContain("window.addEventListener('keydown', handleV2CommandSearchGlobalKeyDown, true)");
    expect(source).toContain("window.removeEventListener('keydown', handleV2CommandSearchGlobalKeyDown, true)");
    expect(source).toContain('onClick={() => setV2ExplorerFilter(item.key)}');
    expect(source).toContain('treeData={isV2Ui ? v2VisibleTreeData : displayTreeData}');
    expect(markup).toContain('gn-v2-sidebar-log-footer');
    expect(markup).toContain('SQL 执行日志');
    expect(markup).toContain('2,341');
    expect(markup).not.toContain('gn-v2-rail-action-group');
    expect(source).toContain('className="gn-v2-rail-primary-actions"');
    expect(markup).toContain('data-sidebar-create-group-action="true"');
    expect(markup).toContain('data-sidebar-batch-table-action="true"');
    expect(markup).toContain('data-sidebar-batch-database-action="true"');
    expect(markup).toContain('data-sidebar-open-external-sql-file-action="true"');
    expect(markup).toContain('data-sidebar-locate-current-tab-action="true"');
    expect(markup).toContain('data-gonavi-create-connection-action="true"');
    expect(markup).toContain('aria-label="AI 助手"');
    expect(markup).toContain('data-gonavi-ai-entry-action="true"');
    expect(markup).toContain('aria-label="工具"');
    expect(markup).toContain('data-gonavi-open-tools-action="true"');
    expect(markup).toContain('aria-label="设置"');
    expect(source).toContain('buildV2RailConnectionGroups(connections, connectionTags, sidebarRootOrder)');
    expect(source).toContain("kind: 'v2-connection-group'");
    expect(source).toContain('onContextMenu={(event) => openV2ConnectionContextMenu(event, conn)}');
    expect(source).toContain("kind: 'v2-connection'");
    expect(source).toContain('resolveSidebarContextMenuPosition(event.clientX, event.clientY)');
    expect(source).toContain('contextMenuPortalRef');
    expect(source).toContain('createPortal(');
    expect(source).toContain('gn-v2-sidebar-context-menu-portal');
    expect(source).toContain('getBoundingClientRect()');
    expect(source).toContain("querySelector('.gn-v2-table-context-menu')");
    expect(source).toContain('content?.scrollHeight');
    expect(source).toContain("if (menu.kind === 'v2-connection') return renderV2ConnectionContextMenu(menu.node);");
    expect(source).toContain('sourceX: event.clientX');
    expect(source).toContain("['--gn-v2-context-menu-max-height' as any]");
    expect(source).toContain('{contextMenu && !contextMenu.kind && (');
    expect(source).not.toContain("document.addEventListener('contextmenu', onPointerDown)");
    const contextMenuFunction = source.slice(
      source.indexOf('const openV2ConnectionContextMenu = ('),
      source.indexOf('const getV2TreeMetaText = (node: any): string => {'),
    );
    expect(contextMenuFunction).not.toContain('setSelectedKeys');
    expect(contextMenuFunction).not.toContain('selectedNodesRef.current');
    expect(contextMenuFunction).not.toContain('setActiveContext');
  });

  it('can render the v2 sidebar with legacy persistent filter input', () => {
    mocks.state.appearance.v2SidebarSearchMode = 'filter';
    mocks.state.appearance.v2SidebarPersistedFilter = 'fs_org';

    const markup = renderToStaticMarkup(<Sidebar uiVersion="v2" />);

    expect(markup).toContain('data-v2-sidebar-search-mode="filter"');
    expect(markup).toContain('筛选左侧表、连接、对象...');
    expect(markup).toContain('value="fs_org"');
    expect(markup).toContain('重置侧栏筛选');
  });

  it('renders the v2 search shortcut from the user shortcut settings', () => {
    mocks.state.shortcutOptions = cloneShortcutOptions(DEFAULT_SHORTCUT_OPTIONS);
    mocks.state.shortcutOptions.focusSidebarSearch.mac = { combo: 'Meta+F', enabled: true };

    const markup = renderToStaticMarkup(<Sidebar uiVersion="v2" />);

    expect(markup).toContain('gn-v2-search-shortcut');
    expect(markup).toContain('<kbd>⌘</kbd>');
    expect(markup).toContain('<kbd>F</kbd>');
    expect(markup).not.toContain('<kbd>K</kbd>');
  });

  it('keeps the v2 command search footer hints tied to real prefix actions', () => {
    const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');

    expect(source).toContain("const v2CommandSearchObjectMode = v2CommandSearchQuery.mode === 'object';");
    expect(source).toContain("const v2CommandSearchAiMode = v2CommandSearchQuery.mode === 'ai';");
    expect(source).toContain("key: 'action-ask-ai'");
    expect(source).toContain("window.dispatchEvent(new CustomEvent('gonavi:ai:inject-prompt'");
    expect(source).toContain('<TableOutlined /> <kbd>@</kbd>只搜表对象');
    expect(source).toContain('<RobotOutlined /> <kbd>?</kbd>发送给 AI');
    expect(source).not.toContain('提示 · 以「@」开头按表名搜索，以「?」开头让 AI 回答');
  });

  it('renders v2 command action shortcuts from the shared shortcut options', () => {
    const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');

    expect(source).toContain("shortcut: resolveShortcutDisplay(shortcutOptions, 'newQueryTab', activeShortcutPlatform)");
    expect(source).toContain("shortcut: resolveShortcutDisplay(shortcutOptions, 'newConnection', activeShortcutPlatform)");
    expect(source).toContain("shortcut: resolveShortcutDisplay(shortcutOptions, 'toggleAIPanel', activeShortcutPlatform)");
    expect(source).toContain("shortcut: resolveShortcutDisplay(shortcutOptions, 'toggleLogPanel', activeShortcutPlatform)");
    expect(source).not.toContain("shortcut: '⌘N'");
    expect(source).not.toContain("shortcut: '⌘⇧N'");
    expect(source).not.toContain("shortcut: '⌘J'");
    expect(source).not.toContain("shortcut: '⌘L'");
  });

  it('scales the v2 rail and footer tools from global appearance tokens', () => {
    const css = readFileSync(new URL('../v2-theme.css', import.meta.url), 'utf8');

    expect(css).toMatch(/\.gn-v2-rail-action-group,\s*body\[data-ui-version="v2"\] \.gn-v2-rail-system-actions \{[^}]*flex-direction: column;/s);
    expect(css).toMatch(/\.gn-v2-rail-action-group,\s*body\[data-ui-version="v2"\] \.gn-v2-rail-system-actions \{[^}]*flex-direction: column;/s);
    expect(css).toMatch(/\.gn-v2-rail-action-group \{[^}]*border-bottom: 0\.5px solid var\(--gn-br-1\);/s);
    expect(css).toMatch(/\.gn-v2-explorer-toolbar\s*\{[^}]*display:\s*none\s*!important/s);
    expect(css).toMatch(/\.ant-tree \{[^}]*font-size: var\(--gn-sidebar-tree-font-size, var\(--gn-font-size-sm, 12px\)\);/s);
    expect(css).toMatch(/\.gn-v2-explorer-tree-shell \.ant-tree \{[^}]*font-size: var\(--gn-sidebar-tree-font-size, var\(--gn-font-size-sm, 12px\)\);/s);
    expect(css).toMatch(/\.gn-v2-tree-title \{[^}]*font-size: var\(--gn-sidebar-tree-font-size, var\(--gn-font-size-sm, 12px\)\);/s);
    expect(css).toMatch(/\.gn-v2-tree-title\.is-mono \.gn-v2-tree-label \{[^}]*font-size: inherit;[^}]*font-weight: 400 !important;/s);
    expect(css).toMatch(/\.gn-v2-tree-count \{[^}]*font-size: clamp\(10px, calc\(var\(--gn-sidebar-tree-font-size, var\(--gn-font-size-sm, 12px\)\) - 1px\), 16px\);/s);
    expect(css).toMatch(/\.gn-v2-connection-rail \{[^}]*width: calc\(38px \* var\(--gn-ui-scale, 1\)\);[^}]*flex: 0 0 calc\(38px \* var\(--gn-ui-scale, 1\)\);/s);
    expect(css).toMatch(/\.gn-v2-rail-item,\s*body\[data-ui-version="v2"\] \.gn-v2-rail-tool \{[^}]*width: calc\(36px \* var\(--gn-ui-scale, 1\)\);[^}]*height: calc\(38px \* var\(--gn-ui-scale, 1\)\);[^}]*font-size: var\(--gn-font-size-sm, 12px\);/s);
    expect(css).toMatch(/\.gn-v2-rail-tool \{[^}]*height: calc\(32px \* var\(--gn-ui-scale, 1\)\);/s);
    expect(css).toMatch(/\.gn-v2-rail-tool \{[^}]*width: calc\(24px \* var\(--gn-ui-scale, 1\)\);/s);
    expect(css).toMatch(/\.gn-v2-active-connection-trigger \{[^}]*height: 34px;[^}]*border: 0;[^}]*background: transparent;/s);
    expect(css).not.toContain('.gn-v2-active-connection-trigger:hover');
  });

  it('keeps v2 tree status dots circular while using virtual horizontal scroll for long labels', () => {
    const css = readFileSync(new URL('../v2-theme.css', import.meta.url), 'utf8');
    const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');
    const utilsSource = readFileSync(new URL('./sidebarV2Utils.ts', import.meta.url), 'utf8');

    expect(source).toContain('gn-v2-tree-status is-${status}');
    expect(source).toContain('data-sidebar-tree-folder-icon="true"');
    expect(source).toContain("overflow: 'hidden'");
    expect(source).not.toContain("overflowX: isV2Ui ? 'auto' : 'hidden'");
    expect(source).toContain('scrollWidth={isV2Ui ? v2TreeHorizontalScrollWidth : undefined}');
    expect(utilsSource).toContain('export const V2_TREE_HORIZONTAL_SCROLL_BOTTOM_RESERVE = 32;');
    expect(source).toContain('const effectiveTreeHeight = isV2Ui && v2TreeHorizontalScrollWidth');
    expect(source).toContain('treeHeight - V2_TREE_HORIZONTAL_SCROLL_BOTTOM_RESERVE');
    expect(source).toContain('height={effectiveTreeHeight}');
    expect(source).toContain('treeData={isV2Ui ? v2VisibleTreeData : displayTreeData}');
    expect(source).not.toContain('__v2-tree-horizontal-scroll-spacer__');
    expect(source).not.toContain('v2TreeDataWithScrollSpacer');
    expect(css).toMatch(/\.gn-v2-explorer-tree-shell \{[^}]*--gn-v2-tree-horizontal-scroll-reserve: 32px;[^}]*overflow: hidden !important;/s);
    expect(css).toMatch(/\.gn-v2-explorer-tree-shell \.sidebar-tree-scroll-content \{[^}]*display: flex;[^}]*height: 100%;[^}]*padding: 4px 0 0;/s);
    expect(css).toMatch(/\.gn-v2-explorer-tree-shell \.ant-tree \{[^}]*flex: 1 1 auto;[^}]*width: 100%;[^}]*min-width: 0;[^}]*height: 100%;/s);
    expect(css).toMatch(/\.gn-v2-explorer-tree-shell \.ant-tree-list \{[^}]*height: calc\(100% - var\(--gn-v2-tree-horizontal-scroll-reserve\)\);[^}]*min-height: 0;[^}]*box-sizing: border-box;/s);
    expect(css).not.toMatch(/\.gn-v2-explorer-tree-shell \.ant-tree-list \{[^}]*height: 100%;/s);
    expect(css).toMatch(/\.gn-v2-explorer-tree-shell \.ant-tree-list-holder-inner \{[^}]*width: 100%;[^}]*min-width: 100%;/s);
    expect(css).not.toMatch(/\.gn-v2-explorer-tree-shell \.ant-tree-list-holder-inner \{[^}]*width: max-content;/s);
    expect(css).not.toMatch(/\.gn-v2-explorer-tree-shell \.ant-tree-list \{[^}]*position: static !important;/s);
    expect(css).not.toMatch(/\.gn-v2-explorer-tree-shell \.ant-tree-list-holder \{[^}]*calc\(100% - var\(--gn-v2-tree-horizontal-scroll-reserve\)\)/s);
    expect(css).not.toMatch(/\.gn-v2-explorer-tree-shell \.ant-tree-list-holder \{[^}]*overflow-x: auto !important;/s);
    expect(css).toMatch(/\.gn-v2-explorer-tree-shell \.ant-tree-list-scrollbar-horizontal \{[^}]*height: 12px !important;[^}]*bottom: calc\(\(var\(--gn-v2-tree-horizontal-scroll-reserve\) - 12px\) \* -1\) !important;/s);
    expect(css).not.toContain('.gn-v2-tree-horizontal-scroll-spacer');
    expect(css).toMatch(/\.gn-v2-explorer-tree-shell \.ant-tree-list-scrollbar-horizontal \.ant-tree-list-scrollbar-thumb \{[^}]*height: 8px !important;/s);
    expect(css).toMatch(/\.gn-v2-explorer-tree-shell \.ant-tree-node-content-wrapper \{[^}]*display: flex !important;/s);
    expect(css).toMatch(/\.gn-v2-tree-title\.is-connection \{[^}]*align-items:\s*center;/s);
    expect(css).toMatch(/\.gn-v2-explorer-tree-shell \.ant-tree-title \{[^}]*flex: 1 1 auto;[^}]*overflow: visible;/s);
    expect(css).toMatch(/\.gn-v2-explorer-tree-shell \.ant-tree-title > \.gn-v2-tree-title \{[^}]*overflow: visible;/s);
    expect(css).toMatch(/\.gn-v2-tree-status \{[^}]*width: 14px;[^}]*height: 14px;[^}]*flex: 0 0 14px;[^}]*overflow: visible;/s);
    expect(css).toMatch(/\.gn-v2-tree-status::before \{[^}]*width: 7px;[^}]*height: 7px;[^}]*border-radius: 50%;/s);
    expect(css).toMatch(/\.gn-v2-tree-status\.is-success::before \{[^}]*background: #22c55e;[^}]*box-shadow: 0 0 0 4px rgba\(34, 197, 94, 0\.18\);/s);
    expect(css).toMatch(/\.gn-v2-tree-label \{[^}]*overflow: hidden;[^}]*text-overflow: ellipsis;/s);
    expect(css).toMatch(/\.gn-v2-tree-folder-icon \{[^}]*width: 22px;[^}]*height: 22px;[^}]*flex: 0 0 22px;/s);
    expect(css).not.toContain('.gn-v2-tree-connection-meta');
  });

  it('estimates a v2 tree scroll width only when content is wider than the viewport', () => {
    const narrowWidth = estimateV2TreeHorizontalScrollWidth([
      {
        title: 'front_end_sys',
        key: 'db-front-end',
        type: 'database',
        children: [{
          title: 'com_vod_error_file_tmp_with_a_very_long_table_name',
          key: 'table-long',
          type: 'table',
        }],
      },
    ] as any, 260);
    const wideWidth = estimateV2TreeHorizontalScrollWidth([
      {
        title: 'users',
        key: 'table-users',
        type: 'table',
      },
    ] as any, 900);

    expect(narrowWidth).toBeGreaterThan(260);
    expect(narrowWidth).toBeLessThanOrEqual(960);
    expect(wideWidth).toBeUndefined();
  });

  it('does not repeat the active connection as an object-tree root in v2', () => {
    mocks.state.connections = [{
      id: 'conn-local',
      name: '本地',
      config: {
        type: 'mysql',
        host: 'localhost',
        port: 3306,
      },
    }];
    mocks.state.activeContext = { connectionId: 'conn-local', dbName: 'app_db' };
    mocks.state.activeTabId = '';
    mocks.state.tabs = [];
    mocks.state.appearance = {
      enabled: true,
      opacity: 1,
      blur: 0,
      uiVersion: 'v2',
    };

    const markup = renderToStaticMarkup(<Sidebar uiVersion="v2" />);

    expect(markup).toContain('gn-v2-connection-rail');
    expect(markup).toContain('gn-v2-active-connection-copy');
    expect(markup).toContain('<strong>本地</strong>');
    expect(markup).toContain('<span>app_db</span>');
    expect(markup).not.toContain('<span>localhost</span>');
    expect(markup).not.toContain('gn-v2-db-icon-label');
  });

  it('shows an empty v2 active host header when no host is selected', () => {
    mocks.state.connections = [{
      id: 'conn-local',
      name: '本地',
      config: {
        type: 'mysql',
        host: 'localhost',
        port: 3306,
      },
    }];
    mocks.state.activeContext = null;
    mocks.state.activeTabId = '';
    mocks.state.tabs = [];
    mocks.state.appearance = {
      enabled: true,
      opacity: 1,
      blur: 0,
      uiVersion: 'v2',
    };

    const markup = renderToStaticMarkup(<Sidebar uiVersion="v2" />);

    expect(markup).toContain('<strong>未选择 Host</strong>');
    expect(markup).toContain('<span>未选择数据库</span>');
    expect(markup).not.toContain('<strong>本地</strong>');
  });

  it('keeps all filter backed by the full tree so hosts remain visible in v2', () => {
    mocks.state.connections = [
      {
        id: 'dev240',
        name: 'dev240',
        config: {
          type: 'mysql',
          host: '10.0.0.240',
          port: 3306,
        },
      },
      {
        id: 'local',
        name: '本地',
        config: {
          type: 'postgres',
          host: 'localhost',
          port: 5432,
        },
      },
    ];
    mocks.state.connectionTags = [{
      id: 'prod',
      name: '生产环境',
      connectionIds: ['dev240'],
    }];
    mocks.state.activeContext = { connectionId: 'dev240', dbName: '' };
    mocks.state.activeTabId = '';
    mocks.state.tabs = [];
    mocks.state.appearance = {
      enabled: true,
      opacity: 1,
      blur: 0,
      uiVersion: 'v2',
    };

    const markup = renderToStaticMarkup(<Sidebar uiVersion="v2" />);
    const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');

    expect(source).toContain("if (v2ExplorerFilter === 'all') {");
    expect(source).toContain('gn-v2-tree-connection-copy');
    expect(source).not.toContain('gn-v2-tree-connection-meta');
  });

  it('reorders dragged connections instead of only moving them between groups', () => {
    const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');
    const utilsSource = readFileSync(new URL('./sidebarV2Utils.ts', import.meta.url), 'utf8');

    expect(source).toContain('const reorderConnections = useStore(state => state.reorderConnections);');
    expect(source).toContain('reorderConnections(');
    expect(source).toContain('const insertBefore = resolveSidebarDropInsertBefore(');
    expect(source).toContain('const domDropNode = resolveSidebarDropNodeFromDomEvent(info?.event);');
    expect(source).toContain('const dropTargetMetrics = resolveSidebarDropTargetMetricsFromDomEvent(info?.event);');
    expect(source).toContain("findTreeNodeByKeyRef.current(treeDataRef.current, domDropNode.key)");
    expect(utilsSource).toContain("const treeNode = baseElement.closest('.ant-tree-treenode') as HTMLElement | null;");
    expect(source).toContain('insertBefore,');
  });

  it('reorders dragged tags relative to grouped connections instead of always appending them', () => {
    const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');

    expect(source).toContain("connectionTags.find(t => t.connectionIds.includes(String(dropNode.key)))?.id || ''");
    expect(source).toContain('const dropTagId = dropNode.type === \'tag\'');
    expect(source).toContain('if (dropTagId) {');
  });

  it('wires v2 rail root dragging through the shared sidebar root order action', () => {
    const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');

    expect(source).toContain('const reorderSidebarRoot = useStore(state => state.reorderSidebarRoot);');
    expect(source).toContain('const [draggingV2RailRootToken, setDraggingV2RailRootToken] = useState(\'\');');
    expect(source).toContain('const treeDragSelectSuppressUntilRef = useRef(0);');
    expect(source).toContain('const treeDragSelectionSnapshotRef = useRef<');
    expect(source).toContain('snapshotTreeSelectionBeforeDrag();');
    expect(source).toContain('restoreTreeSelectionAfterDrag();');
    expect(source).toContain('if (Date.now() < treeDragSelectSuppressUntilRef.current) {');
    expect(source).toContain('handleV2RailRootDrop(');
    expect(source).toContain('draggable');
    expect(source).toContain('setDraggingV2RailRootToken(rootToken);');
    expect(source).toContain('reorderSidebarRoot(sourceToken, targetToken, insertBefore);');
  });

  it('normalizes rc-tree absolute drop positions back to relative positions', () => {
    expect(normalizeSidebarTreeRelativeDropPosition(4, '0-0-4')).toBe(0);
    expect(normalizeSidebarTreeRelativeDropPosition(3, '0-0-4')).toBe(-1);
    expect(normalizeSidebarTreeRelativeDropPosition(5, '0-0-4')).toBe(1);
  });

  it('resolves insert-before from either relative drop position or pointer position', () => {
    expect(resolveSidebarDropInsertBefore(-1, null)).toBe(true);
    expect(resolveSidebarDropInsertBefore(1, null)).toBe(false);
    expect(resolveSidebarDropInsertBefore(0, {
      clientY: 102,
      top: 100,
      height: 20,
    })).toBe(true);
    expect(resolveSidebarDropInsertBefore(0, {
      clientY: 118,
      top: 100,
      height: 20,
    })).toBe(false);
  });

  it('resolves sidebar drop node metadata from DOM markers', () => {
    vi.stubGlobal('document', {
      elementFromPoint: () => null,
    });
    const marker = {
      getAttribute: (name: string) => {
        if (name === 'data-sidebar-node-key') return 'conn-a';
        if (name === 'data-sidebar-node-type') return 'connection';
        return null;
      },
    };
    const target = {
      closest: (selector: string) => selector === '[data-sidebar-node-key]' ? marker : null,
    };

    expect(resolveSidebarDropNodeFromDomEvent({
      target: target as unknown as EventTarget,
    })).toEqual({
      key: 'conn-a',
      type: 'connection',
    });
    vi.unstubAllGlobals();
  });

  it('resolves sidebar drop target metrics from the full tree row instead of nested children', () => {
    vi.stubGlobal('document', {
      elementFromPoint: () => null,
    });
    const treeNode = {
      getBoundingClientRect: () => ({
        top: 128,
        height: 26,
      }),
    };
    const target = {
      closest: (selector: string) => {
        if (selector === '.ant-tree-treenode') return treeNode;
        return null;
      },
    };

    expect(resolveSidebarDropTargetMetricsFromDomEvent({
      target: target as unknown as EventTarget,
    })).toEqual({
      top: 128,
      height: 26,
    });
    vi.unstubAllGlobals();
  });

  it('treats centered tag drops as directional reordering instead of no-op', () => {
    expect(resolveSidebarTagDropInsertBefore({
      currentTagOrder: ['tag-dev', 'tag-test', 'tag-prod'],
      dragTagId: 'tag-prod',
      dropTagId: 'tag-dev',
      relativeDropPosition: 0,
      fallbackInsertBefore: false,
      metrics: {
        clientY: 113,
        top: 100,
        height: 26,
      },
    })).toBe(true);

    expect(resolveSidebarTagDropInsertBefore({
      currentTagOrder: ['tag-dev', 'tag-test', 'tag-prod'],
      dragTagId: 'tag-dev',
      dropTagId: 'tag-prod',
      relativeDropPosition: 0,
      fallbackInsertBefore: true,
      metrics: {
        clientY: 113,
        top: 100,
        height: 26,
      },
    })).toBe(false);
  });

  it('skips sidebar select side effects while tree dragging is active', () => {
    expect(shouldSkipSidebarSelectWhileDragging(true, { selected: true })).toBe(true);
    expect(shouldSkipSidebarSelectWhileDragging(false, { selected: false })).toBe(true);
    expect(shouldSkipSidebarSelectWhileDragging(false, { selected: true })).toBe(false);
  });

  it('skips sidebar lazy load on expand while tree dragging is active', () => {
    expect(shouldSkipSidebarLoadOnExpandWhileDragging(true, {
      expanded: true,
      node: { type: 'connection', children: undefined, isLeaf: false } as any,
    })).toBe(true);
    expect(shouldSkipSidebarLoadOnExpandWhileDragging(false, {
      expanded: false,
      node: { type: 'connection', children: undefined, isLeaf: false } as any,
    })).toBe(true);
    expect(shouldSkipSidebarLoadOnExpandWhileDragging(false, {
      expanded: true,
      node: { type: 'connection', children: undefined, isLeaf: false } as any,
    })).toBe(false);
  });

  it('renders the v2 connection group context menu for rail group management', () => {
    const markup = renderToStaticMarkup(
      <V2ConnectionGroupContextMenuView
        groupName="生产环境"
        count={2}
      />,
    );

    expect(markup).toContain('data-v2-connection-group-context-menu="true"');
    expect(markup).toContain('生产环境');
    expect(markup).toContain('2 个连接 · 连接分组');
    expect(markup).toContain('GROUP');
    expect(markup).toContain('编辑分组');
    expect(markup).toContain('删除分组');
  });

  it('filters the v2 explorer tree by object kind tabs', () => {
    const tree = [{
      title: 'front_end_sys',
      key: 'conn-main',
      type: 'database' as const,
      children: [
        {
          title: '已存查询 · saved',
          key: 'conn-main-queries',
          type: 'queries-folder' as const,
          children: [{ title: '日常查询', key: 'query-1', type: 'saved-query' as const }],
        },
        {
          title: '表',
          key: 'conn-main-tables',
          type: 'object-group' as const,
          dataRef: { groupKey: 'tables' },
          children: [{ title: 'users', key: 'users', type: 'table' as const }],
        },
        {
          title: '视图',
          key: 'conn-main-views',
          type: 'object-group' as const,
          dataRef: { groupKey: 'views' },
          children: [{ title: 'v_users', key: 'v_users', type: 'view' as const }],
        },
        {
          title: '函数',
          key: 'conn-main-routines',
          type: 'object-group' as const,
          dataRef: { groupKey: 'routines' },
          children: [{ title: 'calc_total', key: 'calc_total', type: 'routine' as const }],
        },
        {
          title: '事件',
          key: 'conn-main-events',
          type: 'object-group' as const,
          dataRef: { groupKey: 'events' },
          children: [{ title: 'daily_cleanup', key: 'daily_cleanup', type: 'db-event' as const }],
        },
      ],
    }];

    expect(filterV2ExplorerTreeByKind(tree, 'all')[0].children?.map((node) => node.key)).toEqual([
      'conn-main-queries',
      'conn-main-tables',
      'conn-main-views',
      'conn-main-routines',
      'conn-main-events',
    ]);
    expect(filterV2ExplorerTreeByKind(tree, 'tables')[0].children?.map((node) => node.key)).toEqual(['conn-main-tables']);
    expect(filterV2ExplorerTreeByKind(tree, 'views')[0].children?.map((node) => node.key)).toEqual(['conn-main-views']);
    expect(filterV2ExplorerTreeByKind(tree, 'routines')[0].children?.map((node) => node.key)).toEqual(['conn-main-routines']);
    expect(filterV2ExplorerTreeByKind(tree, 'events')[0].children?.map((node) => node.key)).toEqual(['conn-main-events']);
  });

  it('hides external SQL roots from v2 object kind filters', () => {
    const tree = [
      {
        title: 'front_end_sys',
        key: 'conn-main',
        type: 'database' as const,
        children: [
          {
            title: '表',
            key: 'conn-main-tables',
            type: 'object-group' as const,
            dataRef: { groupKey: 'tables' },
            children: [{ title: 'users', key: 'users', type: 'table' as const }],
          },
        ],
      },
      {
        title: '外部 SQL 目录',
        key: 'external-sql-root',
        type: 'external-sql-root' as const,
        children: [
          {
            title: 'scripts',
            key: 'external-sql-folder:scripts',
            type: 'external-sql-folder' as const,
          },
        ],
      },
    ];

    expect(filterV2ExplorerTreeByKind(tree, 'all').map((node) => node.key)).toEqual([
      'conn-main',
      'external-sql-root',
    ]);
    expect(filterV2ExplorerTreeByKind(tree, 'tables').map((node) => node.key)).toEqual(['conn-main']);
  });

  it('adds rename to the saved query context menu', () => {
    const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');

    expect(source).toContain('const openRenameSavedQueryModal = (query: SavedQuery) =>');
    expect(source).toContain("key: 'rename-query'");
    expect(source).toContain("label: '重命名查询'");
    expect(source).toContain('onClick: () => openRenameSavedQueryModal(q)');
    expect(source).toContain('const handleRenameSavedQuery = async () =>');
  });

  it('renders the v2 table context menu with the redesigned table layout', () => {
    const markup = renderToStaticMarkup(
      <V2TableContextMenuView
        tableName="fs_mkefu_server_info"
        stats={{
          rowCount: 2,
          dataLength: 16 * 1024,
          indexLength: 16 * 1024,
          engine: 'InnoDB',
        }}
        supportsTruncate
      />,
    );

    expect(markup).toContain('data-v2-table-context-menu="true"');
    expect(markup).toContain('fs_mkefu_server_info');
    expect(markup).toContain('InnoDB');
    expect(markup).toContain('2 行 · 16 KB 数据 · 16 KB 索引');
    expect(markup).toContain('查看数据');
    expect(markup).toContain('↵');
    expect(markup).toContain('置顶表');
    expect(markup).toContain('字段 / 索引 / 外键');
    expect(markup).toContain('在新标签打开');
    expect(markup).toContain('Ctrl+Enter');
    expect(markup).toContain('元信息');
    expect(markup).toContain('查看 DDL · CREATE TABLE');
    expect(markup).toContain('在 ER 图中查看');
    expect(markup).toContain('复制');
    expect(markup).toContain('复制表名');
    expect(markup).toContain('复制表结构 · DDL');
    expect(markup).toContain('复制全表为 INSERT');
    expect(markup).toContain('维护');
    expect(markup).toContain('重命名…');
    expect(markup).toContain('备份 · SQL Dump');
    expect(markup).toContain('刷新统计信息');
    expect(markup).toContain('导出表数据');
    expect(markup).toContain('Excel · .xlsx');
    expect(markup).toContain('CSV · .csv');
    expect(markup).toContain('JSON · .json');
    expect(markup).not.toContain('Markdown · .md');
    expect(markup).not.toContain('HTML · .html');
    expect(markup).toContain('用 AI 解释这张表');
    expect(markup).toContain('用 AI 生成查询');
    expect(markup).toContain('截断表 · TRUNCATE');
    expect(markup).toContain('删除表 · DROP');
    expect(markup).not.toContain('清空表');
  });

  it('renders the v2 table context menu pinned state', () => {
    const markup = renderToStaticMarkup(
      <V2TableContextMenuView
        tableName="fs_mkefu_server_info"
        isPinned
      />,
    );

    expect(markup).toContain('取消置顶');
    expect(markup).toContain('已置顶');
    expect(markup).not.toContain('置顶表');
  });

  it('sorts pinned sidebar tables before the active sort mode', () => {
    const pinnedSidebarTables = [
      buildSidebarTablePinKey('conn-1', 'main', 'orders', 'public'),
    ];
    const entries = [
      { tableName: 'users', schemaName: 'public', displayName: 'users' },
      { tableName: 'orders', schemaName: 'public', displayName: 'orders' },
      { tableName: 'audit', schemaName: 'public', displayName: 'audit' },
    ];

    expect(isSidebarTablePinned(pinnedSidebarTables, 'conn-1', 'main', 'orders', 'public')).toBe(true);
    expect(sortSidebarTableEntries(entries, {
      connectionId: 'conn-1',
      dbName: 'main',
      sortBy: 'frequency',
      tableAccessCount: {
        'conn-1-main-users': 10,
        'conn-1-main-orders': 1,
        'conn-1-main-audit': 3,
      },
      pinnedSidebarTables,
    }).map((entry) => entry.tableName)).toEqual(['orders', 'users', 'audit']);
  });

  it('keeps the v2 table pin action on sidebar table rows', () => {
    const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../v2-theme.css', import.meta.url), 'utf8');

    expect(source).toContain('data-v2-sidebar-table-pin-action="true"');
    expect(source).toContain('node?.dataRef?.pinnedSidebarTable ? <StarFilled /> : <StarOutlined />');
    expect(source).toContain('toggleSidebarTablePinned(node);');
    expect(source).toContain("message.success(shouldPin ? '已置顶表' : '已取消置顶');");
    expect(css).toMatch(/\.gn-v2-table-pin-action \{[^}]*opacity: 0;/s);
    expect(css).toMatch(/\.gn-v2-table-pin-action\.is-pinned \{[^}]*color: #f59e0b;[^}]*opacity: 1;/s);
    expect(css).toMatch(/\.ant-tree-node-content-wrapper:hover \.gn-v2-table-pin-action,/s);
  });

  it('splits v2 sidebar pinned tables into a dedicated table section', () => {
    const children = buildV2SidebarTableSectionedChildren('conn-main-tables', [
      { title: 'orders', key: 'orders', type: 'table', dataRef: { pinnedSidebarTable: true } },
      { title: 'users', key: 'users', type: 'table', dataRef: { pinnedSidebarTable: false } },
      { title: 'audit', key: 'audit', type: 'table', dataRef: {} },
    ]);

    expect(children.map((node) => node.title)).toEqual(['置顶', 'orders', '全部', 'users', 'audit']);
    expect(children.map((node) => node.type)).toEqual(['v2-table-section', 'table', 'v2-table-section', 'table', 'table']);
    expect(children[0]).toMatchObject({
      key: 'conn-main-tables-v2-pinned-tables-section',
      isLeaf: true,
      selectable: false,
      dataRef: { sectionKind: 'pinned' },
    });
    expect(children[2]).toMatchObject({
      key: 'conn-main-tables-v2-all-tables-section',
      isLeaf: true,
      selectable: false,
      dataRef: { sectionKind: 'all' },
    });
  });

  it('keeps legacy sidebar table groups flat and ignores v2 pin sections', () => {
    const tableNodes = [
      { title: 'orders', key: 'orders', type: 'table' as const, dataRef: { pinnedSidebarTable: true } },
      { title: 'users', key: 'users', type: 'table' as const, dataRef: { pinnedSidebarTable: false } },
    ];
    const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');

    expect(buildSidebarTableChildrenForUi('conn-main-tables', tableNodes, false)).toBe(tableNodes);
    expect(buildSidebarTableChildrenForUi('conn-main-tables', tableNodes, true).map((node) => node.title)).toEqual([
      '置顶',
      'orders',
      '全部',
      'users',
    ]);
    expect(source).toContain('pinnedSidebarTables: isV2Ui ? currentPinnedSidebarTables : []');
    expect(source).toContain('buildSidebarTableChildrenForUi(groupNodeKey, children, isV2Ui)');
  });

  it('keeps v2 table sections out of regular table lists when nothing is pinned', () => {
    const tableNodes = [
      { title: 'users', key: 'users', type: 'table' as const, dataRef: { pinnedSidebarTable: false } },
    ];

    expect(buildV2SidebarTableSectionedChildren('conn-main-tables', tableNodes)).toBe(tableNodes);
  });

  it('renders v2 table section labels as tree children instead of group header badges', () => {
    const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../v2-theme.css', import.meta.url), 'utf8');

    expect(source).toContain("node.type === 'v2-table-section'");
    expect(source).toContain('className="gn-v2-tree-section-title"');
    expect(source).not.toContain('gn-v2-tree-section-label');
    expect(source).toContain("if (isV2Ui && node?.type === 'v2-table-section')");
    expect(source).toContain("if (isV2Ui && info?.node?.type === 'v2-table-section')");
    expect(css).toContain('.gn-v2-tree-section-title');
    expect(css).toContain('.ant-tree-treenode:has(.gn-v2-tree-section-title)');
  });

  it('formats v2 table context menu stats like the prototype header', () => {
    expect(formatV2TableContextMenuRows(2)).toBe('2 行');
    expect(formatV2TableContextMenuSize(16 * 1024)).toBe('16 KB');
  });

  it('renders the v2 database context menu with the redesigned grouped layout', () => {
    const markup = renderToStaticMarkup(
      <V2DatabaseContextMenuView
        dbName="mkefu_ai_dev"
        dialect="starrocks"
        supportsStarRocksActions
      />,
    );

    expect(markup).toContain('data-v2-database-context-menu="true"');
    expect(markup).toContain('mkefu_ai_dev');
    expect(markup).toContain('DB');
    expect(markup).toContain('新建表');
    expect(markup).toContain('新建查询');
    expect(markup).toContain('运行外部 SQL 文件');
    expect(markup).toContain('StarRocks');
    expect(markup).toContain('新建物化视图');
    expect(markup).toContain('新建外部 Catalog');
    expect(markup).toContain('维护');
    expect(markup).toContain('重命名数据库');
    expect(markup).toContain('刷新对象树');
    expect(markup).toContain('关闭数据库');
    expect(markup).toContain('导出与备份');
    expect(markup).toContain('导出全部表结构 · SQL');
    expect(markup).toContain('备份全部表 · 结构 + 数据');
    expect(markup).toContain('删除数据库 · DROP');
  });

  it('renders the v2 database schema action for PostgreSQL-compatible databases', () => {
    const markup = renderToStaticMarkup(
      <V2DatabaseContextMenuView
        dbName="app_db"
        dialect="postgres"
        supportsSchemaActions
      />,
    );

    expect(markup).toContain('新建模式');
  });

  it('renders the v2 schema context menu with rename and schema-level export actions', () => {
    const markup = renderToStaticMarkup(
      <V2SchemaContextMenuView
        dbName="app_db"
        schemaName="sales"
      />,
    );

    expect(markup).toContain('data-v2-schema-context-menu="true"');
    expect(markup).toContain('sales');
    expect(markup).toContain('SCHEMA');
    expect(markup).toContain('编辑模式');
    expect(markup).toContain('刷新对象树');
    expect(markup).toContain('导出当前模式表结构 · SQL');
    expect(markup).toContain('备份当前模式全部表 · 结构 + 数据');
    expect(markup).toContain('删除模式 · DROP CASCADE');
  });

  it('renders the v2 connection context menu for host rail actions', () => {
    const markup = renderToStaticMarkup(
      <V2ConnectionContextMenuView
        connectionName="dev240"
        hostSummary="10.0.0.240:3306"
        driverLabel="mysql"
        tags={[
          { id: 'prod', name: '生产环境', selected: true },
          { id: 'debug', name: '临时调试' },
        ]}
      />,
    );

    expect(markup).toContain('data-v2-connection-context-menu="true"');
    expect(markup).toContain('dev240');
    expect(markup).toContain('mysql · 10.0.0.240:3306');
    expect(markup).toContain('HOST');
    expect(markup).toContain('新建数据库');
    expect(markup).toContain('刷新连接');
    expect(markup).toContain('新建查询');
    expect(markup).toContain('运行外部 SQL 文件');
    expect(markup).toContain('编辑连接');
    expect(markup).toContain('复制连接');
    expect(markup).toContain('断开连接');
    expect(markup).toContain('分组');
    expect(markup).toContain('生产环境');
    expect(markup).toContain('临时调试');
    expect(markup).toContain('移出分组');
    expect(markup).toContain('删除连接');
  });

  it('omits unsupported database management actions for Oracle-like connection and database menus', () => {
    const connectionMarkup = renderToStaticMarkup(
      <V2ConnectionContextMenuView
        connectionName="dm-prod"
        hostSummary="10.0.0.10:5236"
        driverLabel="dameng"
        supportsCreateDatabase={false}
      />,
    );
    const databaseMarkup = renderToStaticMarkup(
      <V2DatabaseContextMenuView
        dbName="SYSDBA"
        dialect="dm"
        supportsRenameDatabase={false}
        supportsDropDatabase={false}
      />,
    );

    expect(connectionMarkup).not.toContain('新建数据库');
    expect(databaseMarkup).not.toContain('重命名数据库');
    expect(databaseMarkup).not.toContain('删除数据库 · DROP');
    expect(databaseMarkup).toContain('刷新对象树');
    expect(databaseMarkup).toContain('关闭数据库');
  });

  it('renders the v2 table group menu with sort state', () => {
    const markup = renderToStaticMarkup(
      <V2TableGroupContextMenuView
        dbName="mkefu_ai_dev"
        count={15}
        currentSort="frequency"
      />,
    );

    expect(markup).toContain('data-v2-table-group-context-menu="true"');
    expect(markup).toContain('表 · tables');
    expect(markup).toContain('15 张表');
    expect(markup).toContain('当前按使用频率排序');
    expect(markup).toContain('新建表');
    expect(markup).toContain('排序');
    expect(markup).toContain('按名称排序');
    expect(markup).toContain('按使用频率排序');
    expect(markup).toContain('当前');
  });

  it('listens for table overview pin changes to refresh the matching sidebar database node', () => {
    const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');

    expect(source).toContain("window.addEventListener('gonavi:sidebar-table-pin-changed'");
    expect(source).toContain('findTreeNodeByKeyRef.current(treeDataRef.current, `${connectionId}-${dbName}`)');
    expect(source).toContain('void loadTables(dbNode);');
    expect(source).toContain("window.removeEventListener('gonavi:sidebar-table-pin-changed'");
  });

  it('waits long enough for slow object-tree loads before reporting locate misses', () => {
    const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');

    expect(source).toContain('const SIDEBAR_LOCATE_LOAD_WAIT_INTERVAL_MS = 50;');
    expect(source).toContain('const SIDEBAR_LOCATE_LOAD_WAIT_ATTEMPTS = 160;');
    expect(source).toContain('attempt < SIDEBAR_LOCATE_LOAD_WAIT_ATTEMPTS');
    expect(source).toContain('window.setTimeout(resolve, SIDEBAR_LOCATE_LOAD_WAIT_INTERVAL_MS)');
    expect(source).toContain('return !loadingNodesRef.current.has(loadKey);');
    expect(source).toContain('对象仍在加载中');
  });
});
