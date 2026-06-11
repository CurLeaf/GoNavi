import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { parseMCPCommandDraft } from '../../utils/mcpCommandDraft';
import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import AIMCPQuickAddServerPanel, { buildMCPQuickAddServerSeed } from './AIMCPQuickAddServerPanel';

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

  it('builds an editable draft seed from a parsed uvx command with env vars', () => {
    const parsed = parseMCPCommandDraft('$env:GITHUB_TOKEN=***; uvx mcp-server-github --stdio');

    expect(parsed.ok).toBe(true);
    const seed = buildMCPQuickAddServerSeed(parsed.draft!);

    expect(seed).toMatchObject({
      name: 'mcp-server-github',
      transport: 'stdio',
      command: 'uvx',
      args: ['mcp-server-github', '--stdio'],
      env: { GITHUB_TOKEN: '***' },
      enabled: true,
      timeoutSeconds: 20,
    });
  });

  it('uses a wider default timeout and image-based name for docker drafts', () => {
    const parsed = parseMCPCommandDraft('docker run --rm -i -e API_KEY=*** mcp/server-fetch:latest');

    expect(parsed.ok).toBe(true);
    const seed = buildMCPQuickAddServerSeed(parsed.draft!);

    expect(seed).toMatchObject({
      name: 'server-fetch:latest',
      command: 'docker',
      args: ['run', '--rm', '-i', '-e', 'API_KEY=***', 'mcp/server-fetch:latest'],
      timeoutSeconds: 45,
    });
  });
});
