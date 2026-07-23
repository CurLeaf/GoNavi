import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const appCssSource = readFileSync(new URL('./App.css', import.meta.url), 'utf8');
const sidebarSource = readFileSync(new URL('./components/Sidebar.tsx', import.meta.url), 'utf8');

describe('app sidebar tree panel collapse', () => {
  it('collapses the Sider independently while preserving the saved expanded width', () => {
    expect(appSource).toContain('const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);');
    expect(appSource).toContain('const renderedSidebarWidth = isSidebarCollapsed ? 0 : sidebarWidth;');
    expect(appSource).toContain('width={sidebarWidth}');
    expect(appSource).toContain('collapsed={isSidebarCollapsed}');
    expect(appSource).toContain('collapsedWidth={0}');
    expect(appSource).toContain('trigger={null}');
    expect(appSource).not.toContain('setSidebarWidth(0)');
  });

  it('keeps the tree mounted and places the v2 collapse control in the explorer header', () => {
    expect(appSource).toContain('id="gonavi-sidebar-tree-panel"');
    expect(appSource).toContain('aria-hidden={isSidebarCollapsed}');
    expect(appSource).toContain('data-sidebar-collapse-trigger="true"');
    expect(appSource).toContain('data-titlebar-brand-region="true"');
    expect(appSource).toContain('data-sidebar-toggle-placement="titlebar"');
    expect(appSource).toContain('data-no-titlebar-toggle="true"');
    expect(appSource).toContain('aria-controls="gonavi-sidebar-tree-panel"');
    expect(appSource).toContain('aria-expanded={!isSidebarCollapsed}');
    expect(appSource).toContain('<MenuFoldOutlined />');
    expect(appSource).toContain('<MenuUnfoldOutlined />');
    expect(appSource).toContain("'app.sidebar.collapse'");
    expect(appSource).toContain("'app.sidebar.expand'");
    expect(appSource).toContain("case 'focusSidebarSearch':");
    expect(appSource).toContain('handleFocusSidebarSearch();');
    expect(appSource).toContain('<TabManager onFocusSidebarSearch={handleFocusSidebarSearch} />');
    expect(appSource).toContain('{(!isV2Ui || isSidebarCollapsed) && (');
    expect(appSource).toContain('onCollapseSidebar={isV2Ui && !isSidebarCollapsed ? handleCollapseSidebarPanel : undefined}');
    expect(sidebarSource).toContain('data-sidebar-toggle-placement="explorer-header"');

    const titlebarToggleIndex = appSource.indexOf('data-sidebar-collapse-trigger="true"');
    const siderIndex = appSource.indexOf('<Sider');
    const siderEndIndex = appSource.indexOf('</Sider>', siderIndex);
    const triggerStartIndex = appSource.lastIndexOf('<Button', titlebarToggleIndex);
    const triggerEndIndex = appSource.indexOf('</Tooltip>', titlebarToggleIndex);
    const triggerSource = appSource.slice(triggerStartIndex, triggerEndIndex);
    const siderSource = appSource.slice(siderIndex, siderEndIndex);
    const explorerActionsIndex = sidebarSource.indexOf('<div className="gn-v2-active-connection-actions">');
    const connectionMenuIndex = sidebarSource.indexOf('<Tooltip title={v2ConnectionActionsLabel}>', explorerActionsIndex);
    const explorerToggleIndex = sidebarSource.indexOf('data-sidebar-toggle-placement="explorer-header"', explorerActionsIndex);
    const explorerToggleEndIndex = sidebarSource.indexOf('</Tooltip>', explorerToggleIndex);
    const explorerToggleSource = sidebarSource.slice(explorerToggleIndex, explorerToggleEndIndex);
    expect(titlebarToggleIndex).toBeGreaterThan(appSource.indexOf('data-titlebar-brand-region="true"'));
    expect(titlebarToggleIndex).toBeLessThan(siderIndex);
    expect(triggerSource).toContain('type="text"');
    expect(triggerSource).toContain("WebkitAppRegion: 'no-drag'");
    expect(triggerSource).toContain("'--wails-draggable': 'no-drag'");
    expect(siderSource).toContain('onCollapseSidebar={isV2Ui && !isSidebarCollapsed ? handleCollapseSidebarPanel : undefined}');
    expect(explorerToggleIndex).toBeGreaterThan(connectionMenuIndex);
    expect(explorerToggleSource).not.toContain('disabled=');
  });

  it('overrides normal resize bounds at zero width without an edge trigger', () => {
    expect(appCssSource).toMatch(
      /body\[data-ui-version\]\s+\.ant-layout-sider\[data-sidebar-collapsed='true'\]\s*\{[^}]*min-width:\s*0\s*!important;[^}]*max-width:\s*0\s*!important;[^}]*width:\s*0\s*!important;[^}]*flex:\s*0 0 0\s*!important;/s,
    );
    expect(appCssSource).toMatch(
      /body\[data-ui-version\]\s+\.gonavi-sidebar-collapse-trigger\.ant-btn\s*\{[^}]*width:\s*26px;[^}]*height:\s*26px(?:\s*!important)?;[^}]*border:\s*0\s*!important;/s,
    );
    expect(appCssSource).toMatch(
      /body\[data-ui-version='v2'\]\s+\.gonavi-sidebar-collapse-trigger\.ant-btn\[data-sidebar-toggle-placement='explorer-header'\]\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px(?:\s*!important)?;[^}]*border:\s*1px solid var\(--gn-br-2\)\s*!important;[^}]*border-radius:\s*7px\s*!important;/s,
    );
    expect(appCssSource).not.toContain(".ant-layout-sider[data-sidebar-panel='true']");
    expect(appCssSource).not.toMatch(/\.gonavi-sidebar-collapse-trigger[^}]*position:\s*absolute/s);
    expect(appCssSource).not.toMatch(/\.gonavi-sidebar-collapse-trigger[^}]*right:\s*-\d+px/s);
    expect(appCssSource).not.toMatch(/\.gonavi-sidebar-collapse-trigger[^}]*translateY/s);
  });
});
