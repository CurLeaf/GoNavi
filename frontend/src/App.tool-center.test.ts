import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const appSource = readFileSync(
  fileURLToPath(new globalThis.URL('./App.tsx', import.meta.url)),
  'utf8',
);

describe('tool center menu entries', () => {
  it('exposes snippet management next to shortcut management', () => {
    expect(appSource).toContain("key: 'snippet-settings'");
    expect(appSource).toContain("title: '代码片段管理'");
    expect(appSource).toContain('setIsSnippetModalOpen(true)');

    const snippetIndex = appSource.indexOf("key: 'snippet-settings'");
    const shortcutIndex = appSource.indexOf("key: 'shortcut-settings'", snippetIndex);
    expect(snippetIndex).toBeGreaterThan(-1);
    expect(shortcutIndex).toBeGreaterThan(snippetIndex);
  });

  it('keeps the v2 AI entry in the sidebar and the legacy AI entry on the content edge', () => {
    expect(appSource).toContain('onToggleAI={toggleAIPanel}');
    expect(appSource).toContain('renderLegacyAIEdgeHandle');
    expect(appSource).toContain('resolveLegacyAIEdgeHandleDockStyle');
    expect(appSource).toContain('data-gonavi-legacy-ai-edge-action="true"');
    expect(appSource).toContain('{!isV2Ui && !aiPanelVisible && (');
    expect(appSource).toContain('{!isV2Ui && (');
    expect(appSource).not.toContain('data-gonavi-ai-entry-action="true"');
  });

  it('keeps sidebar utility handlers stable so v2 button clicks do not repaint the workspace', () => {
    expect(appSource).toContain('const handleOpenToolsModal = useCallback(');
    expect(appSource).toContain('const handleOpenSettingsModal = useCallback(');
    expect(appSource).toContain('const handleToggleLogPanel = useCallback(');
    expect(appSource).toContain('const handleFocusSidebarSearch = useCallback(');
    expect(appSource).toContain('const antdTheme = useMemo(() => ({');
    expect(appSource).toContain('theme={antdTheme}');
    expect(appSource).toContain('const sqlLogCount = useStore(state => state.sqlLogs.length);');
    expect(appSource).toContain('onOpenTools={handleOpenToolsModal}');
    expect(appSource).toContain('onOpenSettings={handleOpenSettingsModal}');
    expect(appSource).toContain('onToggleLogPanel={handleToggleLogPanel}');
    expect(appSource).toContain('onFocusCommandSearch={handleFocusSidebarSearch}');
    expect(appSource).toContain('sqlLogCount={sqlLogCount}');
    expect(appSource).not.toContain('onOpenTools={() => setIsToolsModalOpen(true)}');
    expect(appSource).not.toContain('onOpenSettings={() => setIsSettingsModalOpen(true)}');
    expect(appSource).not.toContain('onToggleLogPanel={() => setIsLogPanelOpen((prev) => !prev)}');
    expect(appSource).not.toContain('theme={{');
    expect(appSource).not.toContain('const sqlLogs = useStore(state => state.sqlLogs);');
  });

  it('lets the v2 Sidebar own the entire left layout instead of stacking legacy controls above it', () => {
    const siderIndex = appSource.indexOf("className={isV2Ui ? 'gn-v2-app-sider' : undefined}");
    const legacyGuardIndex = appSource.indexOf('{!isV2Ui && (', siderIndex);
    const legacyCreateIndex = appSource.indexOf('新建连接', legacyGuardIndex);
    const sidebarIndex = appSource.indexOf('<Sidebar', legacyGuardIndex);
    const floatingLogIndex = appSource.indexOf('Floating SQL Log Toggle', sidebarIndex);
    const floatingLogGuardIndex = appSource.indexOf('{!isV2Ui && (', floatingLogIndex);

    expect(siderIndex).toBeGreaterThan(-1);
    expect(legacyGuardIndex).toBeGreaterThan(siderIndex);
    expect(legacyCreateIndex).toBeGreaterThan(legacyGuardIndex);
    expect(legacyCreateIndex).toBeLessThan(sidebarIndex);
    expect(appSource).toContain('paddingBottom: isV2Ui ? 0 : 58');
    expect(floatingLogIndex).toBeGreaterThan(sidebarIndex);
    expect(floatingLogGuardIndex).toBeGreaterThan(floatingLogIndex);
  });

  it('uses the v2 green accent for sidebar and log resize guide lines', () => {
    expect(appSource).toContain('const resizeGuideColor = isV2Ui');
    expect(appSource).toContain("'var(--gn-accent, #16a34a)'");
    expect(appSource).toContain("darkMode ? 'rgba(246, 196, 83, 0.55)' : 'rgba(24, 144, 255, 0.5)'");
  });

  it('mounts heavyweight modals only while they are open', () => {
    expect(appSource).toContain('{isModalOpen && (');
    expect(appSource).toContain('{isToolsModalOpen && (');
    expect(appSource).toContain('{isSettingsModalOpen && (');
    expect(appSource).toContain('{isThemeModalOpen && (');
    expect(appSource).toContain('{isShortcutModalOpen && (');
    expect(appSource).toContain('{isAISettingsOpen && (');
    expect(appSource).toContain('{isDriverModalOpen && (');
    expect(appSource).toContain('{isSyncModalOpen && (');
  });

  it('keeps shortcut manager scrolling inside the modal body', () => {
    expect(appSource).toContain('centered');
    expect(appSource).toContain("height: 'min(760px, calc(100vh - 80px))'");
    expect(appSource).toContain("maxHeight: 'calc(100vh - 80px)'");
    expect(appSource).toContain("body: { paddingTop: 8, overflow: 'hidden', flex: 1, minHeight: 0 }");
    expect(appSource).toContain('data-gonavi-shortcut-modal-scroll="true"');
    expect(appSource).toContain("height: '100%'");
    expect(appSource).toContain("overflowY: 'auto'");
  });

  it('renders recorded shortcuts with platform-specific display labels', () => {
    expect(appSource).toContain('getShortcutDisplayLabel');
    expect(appSource).toContain('getShortcutDisplayLabel(binding.combo, activeShortcutPlatform)');
  });
});

describe('global appearance tokens', () => {
  it('publishes v2 font and scale variables for non-AntD chrome', () => {
    expect(appSource).toContain("setProperty('--gonavi-font-size'");
    expect(appSource).toContain("setProperty('--gn-ui-scale'");
    expect(appSource).toContain("setProperty('--gn-font-size'");
    expect(appSource).toContain("setProperty('--gn-font-size-sm'");
    expect(appSource).toContain("setProperty('--gn-font-size-xs'");
    expect(appSource).toContain("setProperty('--gn-font-size-mono'");
    expect(appSource).toContain("setProperty('--gn-data-table-font-size'");
    expect(appSource).toContain("setProperty('--gn-sidebar-tree-font-size'");
    expect(appSource).toContain("setProperty('--gn-control-height'");
    expect(appSource).toContain("setProperty('--gn-control-height-sm'");
    expect(appSource).toContain('数据表字体大小');
    expect(appSource).toContain('左侧库表字体大小');
    expect(appSource).toContain('const dataTableFontSizeFollowsGlobal = appearance.dataTableFontSizeFollowGlobal !== false;');
    expect(appSource).toContain('const sidebarTreeFontSizeFollowsGlobal = appearance.sidebarTreeFontSizeFollowGlobal !== false;');
    expect(appSource).toContain('disabled={dataTableFontSizeFollowsGlobal}');
    expect(appSource).toContain('disabled={sidebarTreeFontSizeFollowsGlobal}');
    expect(appSource).toContain("type={dataTableFontSizeFollowsGlobal ? 'primary' : 'default'}");
    expect(appSource).toContain("type={sidebarTreeFontSizeFollowsGlobal ? 'primary' : 'default'}");
    expect(appSource).toContain('dataTableFontSizeFollowGlobal: !dataTableFontSizeFollowsGlobal');
    expect(appSource).toContain('sidebarTreeFontSizeFollowGlobal: !sidebarTreeFontSizeFollowsGlobal');
    expect(appSource).toContain('dataTableFontSize: dataTableFontSizeFollowsGlobal');
    expect(appSource).toContain('sidebarTreeFontSize: sidebarTreeFontSizeFollowsGlobal');
  });
});
