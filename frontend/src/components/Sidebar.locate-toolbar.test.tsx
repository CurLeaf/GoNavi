import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Sidebar, {
  buildV2RailConnectionGroups,
  filterV2ExplorerTreeByKind,
  getV2RailConnectionGroupBadgeText,
  hasSidebarLazyChildren,
  parseV2CommandSearchQuery,
  resolveSidebarNodeConnectionId,
  resolveV2ActiveConnectionId,
  isSidebarTablePinned,
  resolveSidebarTableNameForCopy,
  shouldClearSidebarActiveContextOnEmptySelect,
  shouldLoadSidebarNodeOnExpand,
  sortSidebarTableEntries,
} from './Sidebar';
import { buildSidebarTablePinKey } from '../store';
import {
  DEFAULT_SHORTCUT_OPTIONS,
  cloneShortcutOptions,
} from '../utils/shortcuts';
import {
  V2ConnectionGroupContextMenuView,
  V2ConnectionContextMenuView,
  V2DatabaseContextMenuView,
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
  },
}));

vi.mock('../store', () => ({
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
    deleteQuery: mocks.noop,
    saveExternalSQLDirectory: mocks.noop,
    deleteExternalSQLDirectory: mocks.noop,
    addConnection: mocks.noop,
    addTab: mocks.noop,
    tabs: mocks.state.tabs,
    activeTabId: mocks.state.activeTabId,
    setActiveContext: mocks.noop,
    removeConnection: mocks.noop,
    connectionTags: mocks.state.connectionTags,
    addConnectionTag: mocks.noop,
    updateConnectionTag: mocks.noop,
    removeConnectionTag: mocks.noop,
    moveConnectionToTag: mocks.noop,
    reorderTags: mocks.noop,
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
    shortcutOptions: cloneShortcutOptions(DEFAULT_SHORTCUT_OPTIONS),
    setAIPanelVisible: mocks.noop,
  }),
}));

vi.mock('../../wailsjs/go/app/App', () => ({
  DBGetDatabases: mocks.noop,
  DBGetTables: mocks.noop,
  DBQuery: mocks.noop,
  DBShowCreateTable: mocks.noop,
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
  JVMProbeCapabilities: mocks.noop,
  GetDriverStatusList: mocks.noop,
}));

vi.mock('../../wailsjs/runtime/runtime', () => ({
  EventsOn: mocks.noop,
}));

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
  });

  it('resolves the table name used by the sidebar copy action', () => {
    expect(resolveSidebarTableNameForCopy({
      title: 'users',
      dataRef: { tableName: 'public.users' },
    })).toBe('public.users');
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
    expect(source).toContain('if (info?.expanded && shouldLoadSidebarNodeOnExpand(info.node))');
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

    const groups = buildV2RailConnectionGroups(connections, [{
      id: 'prod',
      name: '生产环境',
      connectionIds: ['dev241', 'missing', 'dev240'],
    }]);

    expect(groups.map((group) => ({
      id: group.id,
      name: group.name,
      isUngrouped: group.isUngrouped,
      connectionIds: group.connections.map((conn) => conn.id),
    }))).toEqual([
      { id: 'prod', name: '生产环境', isUngrouped: undefined, connectionIds: ['dev241', 'dev240'] },
      { id: '__gonavi-v2-ungrouped-connections__', name: '未分组', isUngrouped: true, connectionIds: ['local'] },
    ]);
    expect(getV2RailConnectionGroupBadgeText('Production')).toBe('PR');
    expect(getV2RailConnectionGroupBadgeText('生产环境')).toBe('生');
  });

  it('keeps the sidebar memoized so parent-only button state does not repaint the tree', () => {
    const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');

    expect(source).toContain('}> = React.memo(({');
  });

  it('renders the current table locate action in the sidebar toolbar', () => {
    const markup = renderToStaticMarkup(<Sidebar />);
    const externalSqlActionIndex = markup.indexOf('data-sidebar-open-external-sql-file-action="true"');
    const locateActionIndex = markup.indexOf('data-sidebar-locate-current-tab-action="true"');

    expect(markup).toContain('data-sidebar-locate-current-tab-action="true"');
    expect(markup).toContain('aria-label="定位当前打开表"');
    expect(locateActionIndex).toBeGreaterThan(externalSqlActionIndex);
  });

  it('renders the v2 sidebar rail, command search hint, filter tabs and log footer', () => {
    const markup = renderToStaticMarkup(<Sidebar uiVersion="v2" sqlLogCount={2341} />);
    const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');

    expect(markup).toContain('gn-v2-sidebar-redesign');
    expect(markup).toContain('gn-v2-connection-rail');
    expect(markup).toContain('gn-v2-object-explorer');
    expect(markup).toContain('gn-v2-active-connection-header');
    expect(markup).toContain('gn-v2-explorer-search');
    expect(markup).toContain('gn-v2-explorer-command-trigger');
    expect(markup).toContain('搜索表、连接、动作... 或问 AI');
    expect(markup).toContain('gn-v2-search-shortcut');
    expect(markup).toContain('<kbd>⌘</kbd>');
    expect(markup).toContain('<kbd>K</kbd>');
    expect(markup).toContain('gn-v2-explorer-filter-tabs');
    expect(markup).toContain('全部');
    expect(markup).toContain('视图');
    expect(markup).toContain('函数');
    expect(markup).toContain('aria-pressed="true"');
    expect(source).toContain("const [v2ExplorerFilter, setV2ExplorerFilter] = useState<V2ExplorerFilter>('all');");
    expect(source).toContain('onClick={() => setV2ExplorerFilter(item.key)}');
    expect(source).toContain('treeData={isV2Ui ? v2VisibleTreeData : displayTreeData}');
    expect(markup).toContain('gn-v2-sidebar-log-footer');
    expect(markup).toContain('SQL 执行日志');
    expect(markup).toContain('2,341');
    expect(markup).toContain('gn-v2-rail-action-group');
    expect(markup).toContain('data-sidebar-create-group-action="true"');
    expect(markup).toContain('data-sidebar-batch-table-action="true"');
    expect(markup).toContain('data-sidebar-batch-database-action="true"');
    expect(markup).toContain('data-sidebar-open-external-sql-file-action="true"');
    expect(markup).toContain('data-sidebar-locate-current-tab-action="true"');
    expect(markup).toContain('aria-label="AI 助手"');
    expect(markup).toContain('data-gonavi-ai-entry-action="true"');
    expect(markup).toContain('aria-label="工具"');
    expect(markup).toContain('data-gonavi-open-tools-action="true"');
    expect(markup).toContain('aria-label="设置"');
    expect(source).toContain('buildV2RailConnectionGroups(connections, connectionTags)');
    expect(source).toContain('data-v2-rail-connection-group="true"');
    expect(source).toContain('data-v2-rail-connection-group-header="true"');
    expect(source).toContain("kind: 'v2-connection-group'");
    expect(source).toContain('data-v2-rail-host-context-menu-trigger="true"');
    expect(source).toContain('onContextMenu={(event) => openV2ConnectionContextMenu(event, conn)}');
    expect(source).toContain("kind: 'v2-connection'");
    expect(source).toContain("if (contextMenu.kind === 'v2-connection') return () => renderV2ConnectionContextMenu(contextMenu.node);");
    const contextMenuFunction = source.slice(
      source.indexOf('const openV2ConnectionContextMenu = ('),
      source.indexOf('const getV2TreeMetaText = (node: any): string => {'),
    );
    expect(contextMenuFunction).not.toContain('setSelectedKeys');
    expect(contextMenuFunction).not.toContain('selectedNodesRef.current');
    expect(contextMenuFunction).not.toContain('setActiveContext');
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
    expect(css).toMatch(/\.gn-v2-rail-action-group \{[^}]*border-bottom: 0\.5px solid var\(--gn-br-1\);/s);
    expect(css).toMatch(/\.gn-v2-explorer-toolbar\s*\{[^}]*display:\s*none\s*!important/s);
    expect(css).toMatch(/\.ant-tree \{[^}]*font-size: var\(--gn-sidebar-tree-font-size, var\(--gn-font-size-sm, 12px\)\);/s);
    expect(css).toMatch(/\.gn-v2-explorer-tree-shell \.ant-tree \{[^}]*font-size: var\(--gn-sidebar-tree-font-size, var\(--gn-font-size-sm, 12px\)\);/s);
    expect(css).toMatch(/\.gn-v2-tree-title \{[^}]*font-size: var\(--gn-sidebar-tree-font-size, var\(--gn-font-size-sm, 12px\)\);/s);
    expect(css).toMatch(/\.gn-v2-tree-title\.is-mono \.gn-v2-tree-label \{[^}]*font-size: clamp\(9px, calc\(var\(--gn-sidebar-tree-font-size, var\(--gn-font-size-sm, 12px\)\) - 1px\), 17px\);/s);
    expect(css).toMatch(/\.gn-v2-tree-count \{[^}]*font-size: clamp\(9px, calc\(var\(--gn-sidebar-tree-font-size, var\(--gn-font-size-sm, 12px\)\) - 2px\), 16px\);/s);
    expect(css).toMatch(/\.gn-v2-connection-rail \{[^}]*width: calc\(54px \* var\(--gn-ui-scale, 1\)\);[^}]*flex: 0 0 calc\(54px \* var\(--gn-ui-scale, 1\)\);/s);
    expect(css).toMatch(/\.gn-v2-rail-items \{[^}]*padding-top: calc\(4px \* var\(--gn-ui-scale, 1\)\);/s);
    expect(css).toMatch(/\.gn-v2-rail-group-header \{[^}]*overflow: visible;/s);
    expect(css).toMatch(/\.gn-v2-rail-group-chevron \{[^}]*font-size: 10px;/s);
    expect(css).toMatch(/\.gn-v2-rail-group-count \{[^}]*top: -1px;[^}]*right: -1px;[^}]*min-width: 16px;[^}]*height: 16px;[^}]*font-size: 9px;/s);
    expect(css).toMatch(/\.gn-v2-rail-item,[^}]*\.gn-v2-rail-tool \{[^}]*width: calc\(38px \* var\(--gn-ui-scale, 1\)\);[^}]*height: calc\(38px \* var\(--gn-ui-scale, 1\)\);[^}]*font-size: var\(--gn-font-size-sm, 12px\);/s);
    expect(css).toMatch(/\.gn-v2-rail-tool \{[^}]*height: calc\(32px \* var\(--gn-ui-scale, 1\)\);/s);
  });

  it('keeps v2 tree status dots circular while truncating only the label text', () => {
    const css = readFileSync(new URL('../v2-theme.css', import.meta.url), 'utf8');
    const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');

    expect(source).toContain('gn-v2-tree-status is-${status}');
    expect(css).toMatch(/\.gn-v2-explorer-tree-shell \.ant-tree-title \{[^}]*overflow: visible;/s);
    expect(css).toMatch(/\.gn-v2-explorer-tree-shell \.ant-tree-title > \.gn-v2-tree-title \{[^}]*overflow: visible;/s);
    expect(css).toMatch(/\.gn-v2-tree-status \{[^}]*width: 14px;[^}]*height: 14px;[^}]*flex: 0 0 14px;[^}]*overflow: visible;/s);
    expect(css).toMatch(/\.gn-v2-tree-status::before \{[^}]*width: 7px;[^}]*height: 7px;[^}]*border-radius: 50%;/s);
    expect(css).toMatch(/\.gn-v2-tree-status\.is-success::before \{[^}]*background: #22c55e;[^}]*box-shadow: 0 0 0 4px rgba\(34, 197, 94, 0\.18\);/s);
    expect(css).toMatch(/\.gn-v2-tree-label \{[^}]*overflow: hidden;[^}]*text-overflow: ellipsis;/s);
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
    mocks.state.activeContext = { connectionId: 'conn-local', dbName: '' };
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
    expect(markup).toContain('<span>localhost</span>');
    expect(markup).not.toContain('gn-v2-db-icon-label');
  });

  it('renders existing connection tags as collapsible groups in the v2 rail', () => {
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

    expect(markup).toContain('data-v2-rail-connection-group="true"');
    expect(markup).toContain('data-v2-rail-connection-group-header="true"');
    expect(markup).toContain('title="生产环境 · 1 个连接"');
    expect(markup).toContain('title="未分组 · 1 个连接"');
    expect(markup).toContain('aria-label="折叠连接分组 生产环境"');
    expect(markup).toContain('aria-label="切换到连接 dev240"');
    expect(markup).toContain('aria-label="切换到连接 本地"');
    expect(markup).toContain('data-v2-rail-host-context-menu-trigger="true"');
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
      ],
    }];

    expect(filterV2ExplorerTreeByKind(tree, 'all')[0].children?.map((node) => node.key)).toEqual([
      'conn-main-queries',
      'conn-main-tables',
      'conn-main-views',
      'conn-main-routines',
    ]);
    expect(filterV2ExplorerTreeByKind(tree, 'tables')[0].children?.map((node) => node.key)).toEqual(['conn-main-tables']);
    expect(filterV2ExplorerTreeByKind(tree, 'views')[0].children?.map((node) => node.key)).toEqual(['conn-main-views']);
    expect(filterV2ExplorerTreeByKind(tree, 'routines')[0].children?.map((node) => node.key)).toEqual(['conn-main-routines']);
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
    expect(markup).toContain('⌘↵');
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
});
