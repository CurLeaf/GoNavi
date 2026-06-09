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

    expect(markup).toContain('这里是在把 GoNavi MCP 接入 Claude Code / Codex');
    expect(markup).toContain('接入外部客户端');
    expect(markup).toContain('目标客户端');
    expect(markup).toContain('选择目标客户端');
    expect(markup).toContain('写入接入配置');
    expect(markup).toContain('重启目标客户端');
    expect(markup).toContain('未接入');
    expect(markup).toContain('需更新');
    expect(markup).toContain('复制配置路径');
    expect(markup).toContain('复制启动命令');
    expect(markup).toContain('更新 Codex 接入配置');
    expect(markup).toContain('已选客户端状态');
    expect(markup).toContain('CLI 检测：已检测到 codex');
    expect(markup).toContain('当前已选中，将只对这个客户端执行写入或更新');
    expect(markup).toContain('当前目标客户端：Codex');
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

  it('makes repeated install avoidance explicit when the selected client already matches current GoNavi', () => {
    const markup = renderToStaticMarkup(
      <AIMCPClientInstallPanel
        statuses={[
          {
            client: 'claude-code',
            displayName: 'Claude Code',
            installed: true,
            matchesCurrent: true,
            clientDetected: true,
            clientCommand: 'claude',
            message: '已检测到 Claude Code 用户级 GoNavi MCP 配置，且与当前 GoNavi 安装路径一致',
          },
          {
            client: 'codex',
            displayName: 'Codex',
            installed: false,
            matchesCurrent: false,
            clientDetected: false,
            clientCommand: 'codex',
            message: '未检测到 Codex 用户级 GoNavi MCP 配置',
          },
        ]}
        selectedClient="claude-code"
        selectedStatus={{
          client: 'claude-code',
          displayName: 'Claude Code',
          installed: true,
          matchesCurrent: true,
          clientDetected: true,
          clientCommand: 'claude',
          message: '已检测到 Claude Code 用户级 GoNavi MCP 配置，且与当前 GoNavi 安装路径一致',
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

    expect(markup).toContain('当前状态：已接入当前 GoNavi，无需重复操作');
    expect(markup).toContain('Claude Code 已接入当前 GoNavi');
    expect(markup).toContain('下面的主按钮会自动禁用，避免重复操作');
  });

  it('prefers the client that already matches current GoNavi over another stale installed record', () => {
    const markup = renderToStaticMarkup(
      <AIMCPClientInstallPanel
        statuses={[
          {
            client: 'claude-code',
            displayName: 'Claude Code',
            installed: true,
            matchesCurrent: true,
            clientDetected: true,
            clientCommand: 'claude',
            message: '已检测到 Claude Code 用户级 GoNavi MCP 配置，且与当前 GoNavi 安装路径一致',
          },
          {
            client: 'codex',
            displayName: 'Codex',
            installed: true,
            matchesCurrent: false,
            clientDetected: true,
            clientCommand: 'codex',
            message: '已检测到 Codex 中的 GoNavi MCP 记录，但与当前 GoNavi 安装路径不一致，建议更新',
          },
        ]}
        selectedClient="claude-code"
        selectedStatus={{
          client: 'claude-code',
          displayName: 'Claude Code',
          installed: true,
          matchesCurrent: true,
          clientDetected: true,
          clientCommand: 'claude',
          message: '已检测到 Claude Code 用户级 GoNavi MCP 配置，且与当前 GoNavi 安装路径一致',
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

    expect(markup).toContain('已选客户端状态');
    expect(markup).toContain('当前状态：已接入当前 GoNavi，无需重复操作');
  });
});
