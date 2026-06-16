import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { buildRemoteMCPClientQuickStart } from '../../utils/mcpClientInstallStatus';
import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import AIMCPRemoteQuickStartPanel from './AIMCPRemoteQuickStartPanel';

describe('AIMCPRemoteQuickStartPanel', () => {
  it('renders remote MCP bridge parameters and safe launch snippets for cloud agents', () => {
    const quickStart = buildRemoteMCPClientQuickStart({
      client: 'openclaw',
      displayName: 'OpenClaw',
    });

    const markup = renderToStaticMarkup(
      <AIMCPRemoteQuickStartPanel
        quickStart={quickStart}
        darkMode={false}
        overlayTheme={buildOverlayWorkbenchTheme(false)}
        cardBorder="rgba(0,0,0,0.08)"
      />,
    );

    expect(markup).toContain('OpenClaw 远程 MCP 快速配置');
    expect(markup).toContain('公网/隧道 URL');
    expect(markup).toContain('Bearer Token');
    expect(markup).toContain('配置到云端 Agent');
    expect(markup).toContain('无 GUI / CLI 生成配置');
    expect(markup).toContain('Windows 启动 GoNavi MCP HTTP');
    expect(markup).toContain('&quot;type&quot;: &quot;streamable-http&quot;');
    expect(markup).toContain('GoNavi.exe mcp-server remote-config --client openclaw');
    expect(markup).toContain('gonavi-mcp-server http --addr 127.0.0.1:8765');
    expect(markup).toContain('默认 --schema-only 不注册 execute_sql');
    expect(markup).not.toContain('password');
  });
});
