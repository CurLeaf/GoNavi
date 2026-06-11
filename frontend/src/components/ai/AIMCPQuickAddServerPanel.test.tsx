import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import AIMCPQuickAddServerPanel from './AIMCPQuickAddServerPanel';

describe('AIMCPQuickAddServerPanel', () => {
  it('renders a top-level full-command entry for creating MCP drafts', () => {
    const markup = renderToStaticMarkup(
      <AIMCPQuickAddServerPanel
        cardBg="#fff"
        cardBorder="rgba(0,0,0,0.08)"
        inputBg="#fff"
        darkMode={false}
        overlayTheme={buildOverlayWorkbenchTheme(false)}
        onAddServer={() => {}}
      />,
    );

    expect(markup).toContain('一行命令快速新增');
    expect(markup).toContain('README 里通常只给一整行启动命令');
    expect(markup).toContain('command、args 和 env');
    expect(markup).toContain('粘贴完整命令');
    expect(markup).toContain('$env:GITHUB_TOKEN=...; uvx mcp-server-github --stdio');
    expect(markup).toContain('解析并新增草稿');
  });
});
