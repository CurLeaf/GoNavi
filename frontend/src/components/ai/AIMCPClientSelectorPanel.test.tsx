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
        ]}
        selectedClient="openclaw"
        darkMode={false}
        overlayTheme={buildOverlayWorkbenchTheme(false)}
        cardBorder="rgba(0,0,0,0.08)"
        statusLoading={false}
        onSelectClient={() => {}}
      />,
    );

    expect(markup).toContain('接入外部客户端');
    expect(markup).toContain('选择目标客户端');
    expect(markup).toContain('写入或复制配置');
    expect(markup).toContain('重启或配置目标端');
    expect(markup).toContain('Codex');
    expect(markup).toContain('已接入');
    expect(markup).toContain('OpenClaw');
    expect(markup).toContain('远程桥接');
    expect(markup).toContain('当前已选中，将复制远程接入说明');
    expect(markup).toContain('云端 Agent');
  });
});
