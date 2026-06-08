import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import AIMCPClientInstallPanel from './AIMCPClientInstallPanel';
import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

describe('AIMCPClientInstallPanel', () => {
  it('renders a clearer external-client selection flow with one selected target and one action button', () => {
    const markup = renderToStaticMarkup(
      <AIMCPClientInstallPanel
        statuses={[
          {
            client: 'claude-code',
            displayName: 'Claude Code',
            installed: false,
            matchesCurrent: false,
            clientDetected: false,
            clientCommand: 'claude',
            message: '未检测到 Claude Code 用户级 GoNavi MCP 配置',
          },
          {
            client: 'codex',
            displayName: 'Codex',
            installed: true,
            matchesCurrent: false,
            clientDetected: true,
            clientCommand: 'codex',
            clientPath: 'C:/Users/mock/AppData/Roaming/npm/codex.cmd',
            message: '已检测到 Codex 中的 GoNavi MCP 记录，但与当前 GoNavi 安装路径不一致，建议更新',
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
          clientDetected: true,
          clientCommand: 'codex',
          clientPath: 'C:/Users/mock/AppData/Roaming/npm/codex.cmd',
          message: '已检测到 Codex 中的 GoNavi MCP 记录，但与当前 GoNavi 安装路径不一致，建议更新',
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

    expect(markup).toContain('接入外部客户端');
    expect(markup).toContain('不是给 GoNavi 自己安装 MCP');
    expect(markup).toContain('选择接入目标客户端');
    expect(markup).toContain('目标客户端');
    expect(markup).toContain('只会修改你选中的客户端用户级 MCP 配置');
    expect(markup).toContain('未接入');
    expect(markup).toContain('需更新');
    expect(markup).toContain('复制配置路径');
    expect(markup).toContain('复制启动命令');
    expect(markup).toContain('更新 Codex 配置');
    expect(markup).toContain('Codex 状态');
    expect(markup).toContain('CLI 检测：已检测到 codex');
    expect(markup).toContain('点击后切换到这个客户端');
  });

  it('shows an already-connected label and supports prewriting config when the client command is not detected locally', () => {
    const markup = renderToStaticMarkup(
      <AIMCPClientInstallPanel
        statuses={[
          {
            client: 'claude-code',
            displayName: 'Claude Code',
            installed: false,
            matchesCurrent: false,
            clientDetected: false,
            clientCommand: 'claude',
            message: '未检测到 Claude Code 用户级 GoNavi MCP 配置',
          },
          {
            client: 'codex',
            displayName: 'Codex',
            installed: true,
            matchesCurrent: true,
            clientDetected: true,
            clientCommand: 'codex',
            message: '已检测到 Codex 用户级 GoNavi MCP 配置，且与当前 GoNavi 安装路径一致',
          },
        ]}
        selectedClient="claude-code"
        selectedStatus={{
          client: 'claude-code',
          displayName: 'Claude Code',
          installed: false,
          matchesCurrent: false,
          clientDetected: false,
          clientCommand: 'claude',
          message: '未检测到 Claude Code 用户级 GoNavi MCP 配置',
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

    expect(markup).toContain('接入到 Claude Code');
    expect(markup).toContain('CLI 检测：未检测到 claude');
    expect(markup).toContain('未检测到本机 claude 命令');
    expect(markup).toContain('已接入');
  });
});
