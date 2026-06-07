import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import AIMCPClientInstallPanel from './AIMCPClientInstallPanel';
import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

describe('AIMCPClientInstallPanel', () => {
  it('renders a clearer external-client selection flow instead of parallel install buttons', () => {
    const markup = renderToStaticMarkup(
      <AIMCPClientInstallPanel
        statuses={[
          {
            client: 'claude-code',
            displayName: 'Claude Code',
            installed: false,
            matchesCurrent: false,
            message: '未安装到 Claude Code 用户级配置',
          },
          {
            client: 'codex',
            displayName: 'Codex',
            installed: true,
            matchesCurrent: false,
            message: '检测到旧的 Codex 配置，建议更新',
            configPath: '~/.codex/config.toml',
            command: 'gonavi-mcp-server',
            args: ['stdio'],
          },
        ]}
        selectedClient="codex"
        selectedStatus={{
          client: 'codex',
          displayName: 'Codex',
          installed: true,
          matchesCurrent: false,
          message: '检测到旧的 Codex 配置，建议更新',
          configPath: '~/.codex/config.toml',
          command: 'gonavi-mcp-server',
          args: ['stdio'],
        }}
        selectedCommandText="gonavi-mcp-server stdio"
        darkMode={false}
        overlayTheme={buildOverlayWorkbenchTheme(false)}
        cardBg="#fff"
        cardBorder="rgba(0,0,0,0.08)"
        loading={false}
        statusLoading={false}
        onSelectClient={() => {}}
        onRefreshStatus={() => {}}
        onCopyConfigPath={() => {}}
        onCopyLaunchCommand={() => {}}
        onInstall={() => {}}
      />,
    );

    expect(markup).toContain('不是给 GoNavi 自己安装 MCP');
    expect(markup).toContain('接入外部客户端');
    expect(markup).toContain('目标客户端');
    expect(markup).toContain('未接入');
    expect(markup).toContain('需更新');
    expect(markup).toContain('复制配置路径');
    expect(markup).toContain('复制启动命令');
    expect(markup).toContain('更新 Codex 配置');
  });
});
