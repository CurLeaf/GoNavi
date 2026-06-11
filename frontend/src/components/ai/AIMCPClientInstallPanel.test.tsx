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

    expect(markup).toContain('这里是在把 GoNavi MCP 接入 Claude Code / Codex / OpenClaw / Hermans');
    expect(markup).toContain('给外部工具调用');
    expect(markup).toContain('OpenClaw、Hermans 这类云端 Agent 会提供远程接入说明');
    expect(markup).toContain('接入外部客户端');
    expect(markup).toContain('选择外部客户端');
    expect(markup).toContain('选择目标客户端');
    expect(markup).toContain('写入或复制配置');
    expect(markup).toContain('重启或配置目标端');
    expect(markup).toContain('未接入');
    expect(markup).toContain('需更新');
    expect(markup).toContain('外部工具接入状态：已存在旧配置，需更新');
    expect(markup).toContain('外部工具接入状态：未接入');
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

    expect(markup).toContain('安装到 Claude Code（外部工具）');
    expect(markup).toContain('CLI 检测：未检测到 claude');
    expect(markup).toContain('未检测到本机 claude 命令');
    expect(markup).toContain('已接入');
  });

  it('renders remote Agent clients as bridge guidance instead of local installs', () => {
    const markup = renderToStaticMarkup(
      <AIMCPClientInstallPanel
        statuses={[
          {
            client: 'openclaw',
            displayName: 'OpenClaw',
            installMode: 'remote',
            installed: false,
            matchesCurrent: false,
            clientDetected: false,
            clientCommand: 'openclaw',
            message: 'OpenClaw 通常部署在云端 Linux；请通过远程 MCP 桥接接入 Windows GoNavi，不要复制数据库密码。',
          },
          {
            client: 'hermans',
            displayName: 'Hermans',
            installMode: 'remote',
            installed: false,
            matchesCurrent: false,
            clientDetected: false,
            clientCommand: 'hermans',
            message: 'Hermans 这类远程 Agent 请通过远程 MCP 桥接接入 Windows GoNavi，不要复制数据库密码。',
          },
        ]}
        selectedClient="openclaw"
        selectedStatus={{
          client: 'openclaw',
          displayName: 'OpenClaw',
          installMode: 'remote',
          installed: false,
          matchesCurrent: false,
          clientDetected: false,
          clientCommand: 'openclaw',
          message: 'OpenClaw 通常部署在云端 Linux；请通过远程 MCP 桥接接入 Windows GoNavi，不要复制数据库密码。',
        }}
        selectedCommandText=""
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

    expect(markup).toContain('远程桥接');
    expect(markup).toContain('当前已选中，将复制远程接入说明');
    expect(markup).toContain('远程接入边界');
    expect(markup).toContain('云端 Agent 默认通过 schema-only MCP 工具读取连接摘要、库表和 DDL');
    expect(markup).toContain('不注册 execute_sql');
    expect(markup).toContain('OpenClaw 远程 MCP 快速配置');
    expect(markup).toContain('公网/隧道 URL');
    expect(markup).toContain('云端 Agent 能访问到的 Streamable HTTP MCP 地址');
    expect(markup).toContain('不要填 Windows 本机的 127.0.0.1');
    expect(markup).toContain('Bearer Token');
    expect(markup).toContain('Windows 启动命令和云端 Agent 配置必须一致');
    expect(markup).toContain('不要把数据库密码当 token 填进去');
    expect(markup).toContain('本机监听地址');
    expect(markup).toContain('MCP 路径');
    expect(markup).toContain('配置到云端 Agent');
    expect(markup).toContain('无 GUI / CLI 生成配置');
    expect(markup).toContain('&quot;type&quot;: &quot;streamable-http&quot;');
    expect(markup).toContain('&quot;url&quot;: &quot;https://&lt;你的域名或隧道地址&gt;/mcp&quot;');
    expect(markup).toContain('&quot;Authorization&quot;: &quot;Bearer &lt;随机token&gt;&quot;');
    expect(markup).toContain('GoNavi.exe mcp-server remote-config --client openclaw --url https://&lt;你的域名或隧道地址&gt;/mcp --token &lt;随机token&gt; --schema-only');
    expect(markup).toContain('Windows 启动 GoNavi MCP HTTP');
    expect(markup).toContain('GoNavi.exe mcp-server http --addr 127.0.0.1:8765 --path /mcp --token &lt;随机token&gt; --schema-only');
    expect(markup).toContain('独立二进制：gonavi-mcp-server http --addr 127.0.0.1:8765 --path /mcp --token &lt;随机token&gt; --schema-only');
    expect(markup).toContain('验证顺序');
    expect(markup).toContain('安全边界');
    expect(markup).toContain('数据库账号和密码仍保存在 Windows GoNavi');
    expect(markup).toContain('默认 --schema-only 不注册 execute_sql');
    expect(markup).toContain('CLI 检测：远程 Agent 不需要检测本机 openclaw 命令');
    expect(markup).toContain('复制 OpenClaw 远程接入说明');
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
    expect(markup).toContain('Claude Code 已接入，无需重复安装');
    expect(markup).toContain('下面的主按钮会自动禁用，避免重复写入');
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
