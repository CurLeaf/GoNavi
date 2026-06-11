import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const appSource = readFileSync(
  fileURLToPath(new globalThis.URL('./App.tsx', import.meta.url)),
  'utf8',
);

const getGlobalShortcutCaseBlock = (action: string) => {
  const caseToken = `case '${action}':`;
  const start = appSource.indexOf(caseToken);
  expect(start).toBeGreaterThan(-1);

  const afterCase = appSource.slice(start + caseToken.length);
  const nextCaseIndex = afterCase.search(/\n\s+case '[^']+':/);
  const switchEndIndex = afterCase.indexOf("window.addEventListener('keydown', handleGlobalShortcut, true);");
  const endIndex = nextCaseIndex >= 0 ? nextCaseIndex : switchEndIndex;

  expect(endIndex).toBeGreaterThan(-1);
  return afterCase.slice(0, endIndex);
};

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

  it('does not start sidebar resize from right-clicking the resize handle', () => {
    expect(appSource).toContain('if (e.button !== 0)');
    expect(appSource).toContain('onContextMenu={(event) => {');
    expect(appSource).toContain('event.preventDefault();');
    expect(appSource).toContain('event.stopPropagation();');

    const guardIndex = appSource.indexOf('if (e.button !== 0)');
    const ghostDisplayIndex = appSource.indexOf("ghostRef.current.style.display = 'block'", guardIndex);
    const dragStartIndex = appSource.indexOf('sidebarDragRef.current = {', guardIndex);

    expect(guardIndex).toBeGreaterThan(-1);
    expect(ghostDisplayIndex).toBeGreaterThan(guardIndex);
    expect(dragStartIndex).toBeGreaterThan(guardIndex);
  });

  it('positions sidebar resize guide from the rendered sider edge', () => {
    expect(appSource).toContain('const siderRef = React.useRef<HTMLDivElement | null>(null);');
    expect(appSource).toContain('ref={siderRef}');
    expect(appSource).toContain('const siderRect = siderRef.current?.getBoundingClientRect();');
    expect(appSource).toContain('const startGuideLeft = siderRect?.right ?? sidebarWidth;');
    expect(appSource).toContain('const startWidth = siderRect?.width ?? sidebarWidth;');
    expect(appSource).toContain('resolveSidebarResizeBounds(siderRef.current)');
    expect(appSource).toContain('ghostRef.current.style.left = `${startGuideLeft}px`;');
    expect(appSource).toContain('ghostRef.current.style.left = `${startGuideLeft + (newWidth - startWidth)}px`;');
  });

  it('keeps connection modal warm-mounted while leaving the other heavyweight modals conditional', () => {
    expect(appSource).toContain('const [isConnectionModalMounted, setIsConnectionModalMounted] = useState(false);');
    expect(appSource).toContain('{isConnectionModalMounted && (');
    expect(appSource).toContain('{isToolsModalOpen && (');
    expect(appSource).toContain('{isSettingsModalOpen && (');
    expect(appSource).toContain('{isThemeModalOpen && (');
    expect(appSource).toContain('{isShortcutModalOpen && (');
    expect(appSource).toContain('{isAISettingsOpen && (');
    expect(appSource).toContain('{isDriverModalOpen && (');
    expect(appSource).toContain('{isSyncModalOpen && (');
  });

  it('loads editable connection details before opening the edit modal so stored secrets can be shown', () => {
    expect(appSource).toContain("typeof backendApp?.GetEditableSavedConnection === 'function'");
    expect(appSource).toContain('const editableConnection = await backendApp.GetEditableSavedConnection(conn.id);');
    expect(appSource).toContain('setEditingConnection(nextConnection);');
    expect(appSource).toContain('setIsModalOpen(true);');
  });

  it('loads editable AI provider details before opening the edit modal so stored api keys can be shown', () => {
    expect(appSource).toContain('<AISettingsModal');
    const modalSource = readFileSync(new URL('./components/AISettingsModal.tsx', import.meta.url), 'utf8');
    expect(modalSource).toContain("typeof Service?.AIGetEditableProvider === 'function'");
    expect(modalSource).toContain('await Service.AIGetEditableProvider(p.id)');
  });

  it('keeps edit-mode passwords masked by default instead of forcing the eye toggle open', () => {
    expect(appSource).not.toContain('setPrimaryPasswordVisible(String(config.password || "").trim() !== "")');
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

  it('executes every global shortcut action exposed in the shortcut manager', () => {
    const expectedHandlers = new Map([
      ['runQuery', 'gonavi:run-active-query'],
      ['focusSidebarSearch', 'gonavi:focus-sidebar-search'],
      ['newQueryTab', 'handleNewQuery();'],
      ['switchToNextTab', 'switchActiveTabByOffset(1);'],
      ['switchToPreviousTab', 'switchActiveTabByOffset(-1);'],
      ['newConnection', 'handleCreateConnection();'],
      ['toggleAIPanel', 'toggleAIPanel();'],
      ['toggleLogPanel', 'handleToggleLogPanel();'],
      ['toggleTheme', 'setTheme('],
      ['openShortcutManager', 'setIsShortcutModalOpen(true);'],
      ['toggleMacFullscreen', 'handleTitleBarWindowToggle({ allowMacNativeFullscreen: true });'],
      ['resetWindowZoom', 'handleManualResetWindowZoom();'],
    ]);

    for (const [action, handler] of expectedHandlers) {
      expect(getGlobalShortcutCaseBlock(action)).toContain(handler);
    }
    expect(appSource).toContain('const switchActiveTabByOffset = useCallback((offset: 1 | -1) => {');
    expect(appSource).toContain('const nextIndex = (baseIndex + offset + tabs.length) % tabs.length;');
    expect(appSource).toContain('setActiveTab(tabs[nextIndex].id);');
    expect(appSource).toContain('handleCreateConnection, handleManualResetWindowZoom');
    expect(appSource).toContain('switchActiveTabByOffset, themeMode');
  });

  it('automatically resets WebView2 zoom when a Windows taskbar restore returns focus', () => {
    expect(appSource).toContain('shouldResetWebViewZoomForScaleFix(reason, hasViewportScaleDrift)');
    expect(appSource).toContain('const shouldResetWebViewZoom = shouldResetWebViewZoomForScaleFix(reason, hasViewportScaleDrift);');
    expect(appSource).toContain('if (shouldResetWebViewZoom && !isMaximised)');
    expect(appSource).toContain('const res = await (window as any).go?.app?.App?.ResetWebViewZoom?.();');
    expect(appSource).toContain('该异常不一定表现为 viewport ratio drift');
  });

  it('captures window state on startup and lifecycle events instead of waiting only for the polling interval', () => {
    expect(appSource).toContain('const scheduleWindowStateSave = (delayMs = 120) => {');
    expect(appSource).toContain('if (hydrated) {');
    expect(appSource).toContain('scheduleWindowStateSave(320);');
    expect(appSource).toContain('const unsubscribeHydration = useStore.persist.onFinishHydration(() => {');
    expect(appSource).toContain("window.addEventListener('resize', handleWindowRuntimeChange);");
    expect(appSource).toContain("window.addEventListener('focus', handleWindowRuntimeChange);");
    expect(appSource).toContain("window.addEventListener('pageshow', handleWindowRuntimeChange);");
    expect(appSource).toContain("window.addEventListener('pagehide', handleWindowLifecycleFlush, { capture: true });");
    expect(appSource).toContain("window.addEventListener('beforeunload', handleWindowLifecycleFlush, { capture: true });");
  });

  it('keeps titlebar double-click on maximise while shortcuts may enter macOS fullscreen', () => {
    expect(appSource).toContain('const handleTitleBarWindowToggle = async (options?: { allowMacNativeFullscreen?: boolean }) => {');
    expect(appSource).toContain('const allowMacNativeFullscreen = options?.allowMacNativeFullscreen === true;');
    expect(appSource).toContain('if (allowMacNativeFullscreen && useNativeMacWindowControls && isMacRuntime) {');
    expect(appSource).toContain('void handleTitleBarWindowToggle({ allowMacNativeFullscreen: false });');
    expect(getGlobalShortcutCaseBlock('toggleMacFullscreen')).toContain('handleTitleBarWindowToggle({ allowMacNativeFullscreen: true });');
  });

  it('captures global shortcuts before Monaco/editor defaults consume them', () => {
    expect(appSource).toContain("window.addEventListener('keydown', handleGlobalShortcut, true);");
    expect(appSource).toContain("window.removeEventListener('keydown', handleGlobalShortcut, true);");
  });

  it('skips the native mac titlebar bridge when the current runtime does not expose it', () => {
    expect(appSource).toContain("const backendApp = (window as any).go?.app?.App;");
    expect(appSource).toContain("if (typeof backendApp?.SetMacNativeWindowControls !== 'function') {");
    expect(appSource).toContain('void safeWindowRuntimeCall(() => SetMacNativeWindowControls(useNativeMacWindowControls), undefined);');
  });

  it('listens for command search query-tab events and routes them through handleNewQuery', () => {
    expect(appSource).toContain("window.addEventListener('gonavi:create-query-tab', handleCreateQueryTabEvent as EventListener);");
    expect(appSource).toContain("window.removeEventListener('gonavi:create-query-tab', handleCreateQueryTabEvent as EventListener);");
    expect(appSource).toContain('const handleCreateQueryTabEvent = () => {');
    expect(appSource).toContain('handleNewQuery();');
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
    expect(appSource).toContain('fontFamily: resolvedUiFontFamily');
    expect(appSource).toContain('fontFamilyCode: resolvedMonoFontFamily');
    expect(appSource).toContain('数据表字体大小');
    expect(appSource).toContain('左侧库表字体大小');
    expect(appSource).toContain('buildFontFamilyOptions(runtimePlatform, \'ui\', installedFontFamilies)');
    expect(appSource).toContain('buildFontFamilyOptions(runtimePlatform, \'mono\', installedFontFamilies)');
    expect(appSource).toContain('ListInstalledFontFamilies()');
    expect(appSource).toContain('const [installedFontFamilies, setInstalledFontFamilies] = useState<InstalledFontFamily[]>(EMPTY_INSTALLED_FONT_FAMILIES);');
    expect(appSource).toContain('data-gonavi-linux-cjk-font-banner="true"');
    expect(appSource).toContain('Linux CJK fonts missing / Ubuntu 中文字体缺失');
    expect(appSource).toContain('setIsLinuxCJKFontBannerDismissed(true)');
    expect(appSource).toContain('matchFontFamilyOption');
    expect(appSource).toContain('showSearch');
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
