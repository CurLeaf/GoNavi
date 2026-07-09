import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const appSource = readFileSync(
  fileURLToPath(new globalThis.URL('./App.tsx', import.meta.url)),
  'utf8',
);

const aiSettingsModalSource = readFileSync(
  fileURLToPath(new globalThis.URL('./components/AISettingsModal.tsx', import.meta.url)),
  'utf8',
);

describe('settings center layout', () => {
  it('uses the same split navigation shell as the tool center', () => {
    expect(appSource).toContain("type SettingsCenterGroupKey = 'preferences' | 'services' | 'about';");
    expect(appSource).toContain("type SettingsCenterPaneKey = 'language' | 'theme' | 'sidebar-metadata' | 'proxy' | 'web-auth' | 'ai' | 'about-go-navi';");
    expect(appSource).toContain("const [activeSettingsCenterGroupKey, setActiveSettingsCenterGroupKey] = useState<SettingsCenterGroupKey>('preferences');");
    expect(appSource).toContain("const [activeSettingsCenterPane, setActiveSettingsCenterPane] = useState<SettingsCenterPaneState | null>(null);");
    expect(appSource).toContain('style={toolCenterModalWorkspaceStyle}');
    expect(appSource).toContain('style={toolCenterModalSplitStyle}');
    expect(appSource).toContain('style={toolCenterNavPanelStyle}');
    expect(appSource).toContain('style={toolCenterNavScrollStyle}');
    expect(appSource).toContain('style={toolCenterContentPanelStyle}');
    expect(appSource).toContain('style={toolCenterDetailPanelStyle}');
    expect(appSource).toContain('style={toolCenterDetailBodyStyle}');
    expect(appSource).toContain('style={toolCenterScrollableListStyle}');
    expect(appSource).toContain("title: t('app.settings.group.preferences.title')");
    expect(appSource).toContain("title: t('app.settings.group.services.title')");
    expect(appSource).toContain("title: t('app.settings.group.about.title')");
  });

  it('moves sidebar table metadata configuration into the settings center', () => {
    expect(appSource).toContain("key: 'sidebar-metadata'");
    expect(appSource).toContain("title: t('app.settings.sidebar_metadata.title')");
    expect(appSource).toContain("description: t('app.settings.sidebar_metadata.description')");
    expect(appSource).toContain("handleOpenSettingsCenterPane('preferences', 'sidebar-metadata')");
    expect(appSource).toContain("setSidebarTableMetadataFieldSelected(");
    expect(appSource).toContain('DndContext');
    expect(appSource).toContain('SortableContext');
    expect(appSource).toContain('handleSidebarMetadataDragEnd');
    expect(appSource).toContain('sidebarTableMetadataFieldOrder');
    expect(appSource).toContain('data-sidebar-metadata-field={field}');
    expect(appSource).toContain("sidebarTableMetadataFields: DEFAULT_SIDEBAR_TABLE_METADATA_FIELDS");
    expect(appSource).toContain("t('sidebar.v2_table_group_menu.display_table_rows')");
    expect(appSource).not.toContain("setIsLanguageModalOpen(true)");
  });

  it('adds browser auth management into the services settings group', () => {
    expect(appSource).toContain("key: 'web-auth' as const");
    expect(appSource).toContain("title: t('app.settings.entry.web_auth.title')");
    expect(appSource).toContain("description: t('app.settings.entry.web_auth.description')");
    expect(appSource).toContain("handleOpenSettingsCenterPane('services', 'web-auth')");
    expect(appSource).toContain("<WebAuthSettingsPanel");
  });

  it('adds global proxy connection testing controls', () => {
    expect(appSource).toContain("const DEFAULT_GLOBAL_PROXY_TEST_URL = 'https://api.github.com/';");
    expect(appSource).toContain('const [proxyTestUrl, setProxyTestUrl]');
    expect(appSource).toContain('const [proxyTesting, setProxyTesting]');
    expect(appSource).toContain('const [proxyTestResult, setProxyTestResult]');
    expect(appSource).toContain('handleTestGlobalProxyDraft');
    expect(appSource).toContain('TestGlobalProxyConnection');
    expect(appSource).toContain('https://github.com/Syngnat/GoNavi/releases/latest');
    expect(appSource).toContain("t('app.proxy.test.action')");
    expect(appSource).toContain("t('app.proxy.test.target_placeholder')");
  });

  it('adds cancel and back actions to settings center detail panes', () => {
    expect(appSource).toContain('const handleBackFromSettingsCenterPane = useCallback(() => {');
    expect(appSource).toContain('const handleCancelSettingsCenterPane = useCallback(() => {');
    expect(appSource).toContain('onClick={handleCancelSettingsCenterPane}');
    expect(appSource).toContain("t('common.cancel')");
    expect(appSource).toContain('onClick={handleBackFromSettingsCenterPane}');
    expect(appSource).toContain("t('common.back_to_previous')");
  });

  it('uses instant-apply footer actions only on v2 theme settings pane', () => {
    expect(appSource).toContain("isV2Ui && activeSettingsCenterPane.key === 'theme' ? (");
    expect(appSource).toContain("t('common.close')");
    expect(appSource).toContain("t('app.theme.instant_apply_hint')");
  });

  it('gates the new theme layout to v2 and keeps legacy side nav for old UI', () => {
    expect(appSource).toContain('renderThemeSettingsContentV2');
    expect(appSource).toContain('renderThemeSettingsContentLegacy');
    expect(appSource).toContain('isV2Ui ? renderThemeSettingsContentV2() : renderThemeSettingsContentLegacy()');
    expect(appSource).toContain("gridTemplateColumns: '180px minmax(0, 1fr)', gap: 16, padding: '12px 0'");
    expect(appSource).toContain('className="gonavi-theme-settings"');
    expect(appSource).toContain('ThemeSettingsSlider');
    expect(appSource).toContain("value: 'workspace'");
    expect(appSource).toContain('gonavi-settings-tabs');
    expect(appSource).toContain('setThemeModalSection(item.value)');
  });

  it('opens theme, AI, and about entries inside settings center detail panes', () => {
    expect(appSource).toContain("handleOpenSettingsCenterPane('preferences', 'theme')");
    expect(appSource).toContain("handleOpenSettingsCenterPane('services', 'ai')");
    expect(appSource).toContain("handleOpenSettingsCenterPane('about', 'about-go-navi')");
    expect(appSource).toContain("if (activeSettingsCenterPane.key === 'theme')");
    expect(appSource).toContain("if (activeSettingsCenterPane.key === 'ai')");
    expect(appSource).toContain('<AISettingsContent');
    expect(appSource).toContain("if (activeSettingsCenterPane.key === 'about-go-navi')");
    expect(appSource).toContain('renderSettingsCenterAboutPane()');
  });

  it('opens the about group directly instead of showing a one-item list', () => {
    expect(appSource).toContain('const resolveSettingsCenterGroupInitialPane = (group: SettingsCenterGroupKey): SettingsCenterPaneState | null => (');
    expect(appSource).toContain("group === 'about' ? { key: 'about-go-navi', group: 'about' } : null");
    expect(appSource).toContain('setActiveSettingsCenterPane(resolveSettingsCenterGroupInitialPane(group));');
    expect(appSource).toContain('setActiveSettingsCenterPane(resolveSettingsCenterGroupInitialPane(group.key));');
  });

  it('routes silent update discovery to the settings center about pane via bridge', () => {
    expect(appSource).toContain('const updateCenterBridgeRef = useRef<{');
    expect(appSource).toContain('updateCenterBridgeRef,');
    expect(appSource).toContain('updateCenterBridgeRef.current = {');
    expect(appSource).toContain("handleOpenSettingsCenterPane('about', 'about-go-navi')");
    expect(appSource).toContain('prepareAboutSurface');
    expect(appSource).toContain('isSettingsAboutPaneOpen');
  });

  it('renders the settings center about page with the reference card layout', () => {
    expect(appSource).toContain('const renderSettingsCenterAboutPane = () => {');
    expect(appSource).toContain('const renderSettingsCenterAboutProjectEntry = ({');
    expect(appSource).toContain("padding: '18px 22px'");
    expect(appSource).toContain('width: 64');
    expect(appSource).toContain('height: 64');
    expect(appSource).toContain('minWidth: 260');
    expect(appSource).toContain('const releaseTimeText = formatAboutReleaseTime(lastUpdateInfo?.releasePublishedAt);');
    expect(appSource).toContain("[t('app.about.version.release_time'), releaseTimeText]");
    expect(appSource).toContain("gridTemplateColumns: 'minmax(0, 1fr) minmax(220px, 260px)'");
    expect(appSource).toContain('className="gonavi-about-update-channel"');
    expect(appSource).toContain('<Segmented');
    expect(appSource).toContain('maxWidth: 360');
    expect(appSource).toContain("alignItems: 'start'");
    expect(appSource).toContain("overflowWrap: 'anywhere'");
    expect(appSource).toContain("t('app.about.version_update.title')");
    expect(appSource).toContain("t('app.about.project.github.title')");
    expect(appSource).toContain("t('app.about.project.issues.title')");
    expect(appSource).toContain("t('app.about.project.releases.title')");
    expect(appSource).toContain('const renderSettingsCenterAboutFooter = () => (');
    expect(appSource).toContain("t('app.about.last_checked_at', { time: aboutLastCheckedAt })");
    expect(appSource).toContain('renderAboutUpdateActions()');
  });

  it('keeps embedded split-pane settings stable at scroll boundaries', () => {
    expect(appSource).toContain('const isSettingsCenterContainedScrollPane =');
    expect(appSource).toContain("activeSettingsCenterPane?.key === 'theme' || activeSettingsCenterPane?.key === 'ai'");
    expect(appSource).toContain('const settingsCenterDetailBodyStyle: React.CSSProperties = isSettingsCenterContainedScrollPane');
    expect(appSource).toContain("overflowY: 'hidden'");
    expect(appSource).toContain('style={settingsCenterDetailBodyStyle}');
    expect(appSource).toContain("boxSizing: 'border-box'");
    expect(appSource).toContain("overscrollBehavior: 'contain'");
    expect(aiSettingsModalSource).toContain("boxSizing: 'border-box'");
    expect(aiSettingsModalSource).toContain("overscrollBehavior: 'contain'");
  });
});
