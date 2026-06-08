import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import AISettingsSidebar from './AISettingsSidebar';
import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

describe('AISettingsSidebar', () => {
  it('renders the ai settings navigation with the active section highlighted', () => {
    const markup = renderToStaticMarkup(
      <AISettingsSidebar
        activeSection="mcp"
        darkMode={false}
        overlayTheme={buildOverlayWorkbenchTheme(false)}
        onSelectSection={() => {}}
      />,
    );

    expect(markup).toContain('设置导航');
    expect(markup).toContain('MCP 服务');
    expect(markup).toContain('内置工具');
    expect(markup).toContain('aria-pressed="true"');
  });
});
