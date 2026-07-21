import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import AIMCPClientSelectorPanel from './AIMCPClientSelectorPanel';

describe('AIMCPClientSelectorPanel', () => {
  it('renders local install and remote bridge choices with clear state labels', () => {
    const markup = renderToStaticMarkup(
      <AIMCPClientSelectorPanel
        statuses={[
          {
            client: 'codex',
            displayName: 'Codex',
            installed: true,
            matchesCurrent: true,
            clientDetected: true,
            clientCommand: 'codex',
            message: '已检测到 Codex 用户级 GoNavi MCP 配置，且与当前 GoNavi 安装路径一致',
          },
          {
            client: 'openclaw',
            displayName: 'OpenClaw',
            installMode: 'remote',
            installed: false,
            matchesCurrent: false,
            clientDetected: false,
            clientCommand: 'openclaw',
            message: 'OpenClaw 通常部署在云端 Linux；请通过远程 MCP 桥接接入 Windows GoNavi。',
          },
          {
            client: 'opencode',
            displayName: 'OpenCode',
            installMode: 'auto',
            installed: false,
            matchesCurrent: false,
            clientDetected: false,
            clientCommand: 'opencode',
            message: '未检测到 OpenCode 用户级 GoNavi MCP 配置',
          },
        ]}
        selectedClient="openclaw"
        darkMode={false}
        overlayTheme={buildOverlayWorkbenchTheme(false)}
        cardBorder="rgba(0,0,0,0.08)"
        statusLoading={false}
        onSelectClient={() => {}}
      />,
    );

    expect(markup).toContain('Connect external client');
    expect(markup).toContain('Choose target client');
    expect(markup).toContain('Write or copy config');
    expect(markup).toContain('Restart or configure target');
    expect(markup).toContain('Codex');
    expect(markup).toContain('Connected');
    expect(markup).toContain('OpenClaw');
    expect(markup).toContain('Remote bridge');
    expect(markup).toContain('OpenCode');
    expect(markup).toContain('Selected. The remote connection guide will be copied');
    expect(markup).toContain('cloud Agents');
  });
});
