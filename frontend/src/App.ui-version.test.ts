import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const appSource = readFileSync(
  fileURLToPath(new globalThis.URL('./App.tsx', import.meta.url)),
  'utf8',
);

describe('UI version switch placement', () => {
  it('loads the v2 theme stylesheet with the app shell', () => {
    expect(appSource).toContain("import './App.css';");
    expect(appSource).toContain("import './v2-theme.css';");
  });

  it('keeps the UI version switch in theme mode and outside macOS-only settings', () => {
    const themeBranchIndex = appSource.indexOf("{themeModalSection === 'theme' ? (");
    const uiVersionIndex = appSource.indexOf("t('app.theme.ui_version.title')", themeBranchIndex);
    const lightThemeIndex = appSource.indexOf("t('app.theme.mode.light.label')", themeBranchIndex);
    const appearanceBranchIndex = appSource.indexOf(') : (', themeBranchIndex);
    const macWindowIndex = appSource.indexOf("t('app.theme.mac_window.title')");

    expect(themeBranchIndex).toBeGreaterThan(-1);
    expect(uiVersionIndex).toBeGreaterThan(themeBranchIndex);
    expect(uiVersionIndex).toBeLessThan(lightThemeIndex);
    expect(uiVersionIndex).toBeLessThan(appearanceBranchIndex);
    expect(macWindowIndex).toBeGreaterThan(uiVersionIndex);
    expect(appSource).toContain("badge: t('app.theme.ui_version.legacy.badge')");
    expect(appSource).toContain("badge: t('app.theme.ui_version.v2.badge')");
    expect(appSource).toContain("onClick={() => setAppearance({ uiVersion: item.key as 'legacy' | 'v2' })}");
    expect(appSource).toContain("t('app.theme.ui_version.beta_warning')");
    expect(appSource).toContain("t('app.theme.ui_version.platform_hint')");
    expect(appSource).toContain("t('app.theme.ui_version.sidebar_search.title')");
    expect(appSource).toContain("value={appearance.v2SidebarSearchMode ?? 'command'}");
    expect(appSource).toContain("setAppearance({ v2SidebarSearchMode: value as 'command' | 'filter' })");
  });

  it('uses the card-style v2 switch from the redesign instead of the segmented pill', () => {
    const uiVersionIndex = appSource.indexOf("t('app.theme.ui_version.title')");
    const themeModeIndex = appSource.indexOf("t('app.theme.mode_title')", uiVersionIndex);
    const uiVersionBlock = appSource.slice(uiVersionIndex, themeModeIndex);

    expect(uiVersionBlock).toContain("t('app.theme.ui_version.badge.new')");
    expect(uiVersionBlock).toContain("gridTemplateColumns: 'repeat(2, minmax(0, 1fr))'");
    expect(uiVersionBlock).toContain("label: t('app.theme.ui_version.legacy.label')");
    expect(uiVersionBlock).toContain("label: t('app.theme.ui_version.v2.label')");
    expect(uiVersionBlock).toContain('CheckOutlined');
    expect(uiVersionBlock).toContain("t('app.theme.ui_version.sidebar_search.title')");
    expect(uiVersionBlock).toContain('<Segmented');
  });

  it('localizes the v2 sidebar search mode copy', () => {
    expect(appSource).toContain("t('app.theme.ui_version.sidebar_search.title')");
    expect(appSource).toContain("t('app.theme.ui_version.sidebar_search.command')");
    expect(appSource).toContain("t('app.theme.ui_version.sidebar_search.filter')");
    expect(appSource).toContain("t('app.theme.ui_version.sidebar_search.hint')");
    expect(appSource).not.toContain('新版左侧搜索模式');
    expect(appSource).not.toContain('新版命令搜索');
    expect(appSource).not.toContain('旧版侧栏筛选');
    expect(appSource).not.toContain('新版命令搜索适合跳转连接、表和动作');
  });
});
