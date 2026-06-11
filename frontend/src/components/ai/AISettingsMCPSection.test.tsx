import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import AISettingsMCPSection from './AISettingsMCPSection';
import type { AISettingsMCPSectionProps } from './AISettingsMCPSection';
import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

const findElement = (node: any, predicate: (element: any) => boolean): any => {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return null;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const match = findElement(item, predicate);
      if (match) {
        return match;
      }
    }
    return null;
  }
  if (predicate(node)) {
    return node;
  }
  return findElement(node.props?.children, predicate);
};

const buildMCPSectionProps = (patch: Partial<AISettingsMCPSectionProps> = {}): AISettingsMCPSectionProps => ({
  mcpClientStatuses: [
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
      installed: false,
      matchesCurrent: false,
      clientDetected: true,
      clientCommand: 'codex',
      clientPath: 'C:/Users/mock/AppData/Roaming/npm/codex.cmd',
      message: '未检测到 Codex 用户级 GoNavi MCP 配置',
    },
  ],
  selectedMCPClient: 'claude-code',
  selectedMCPClientStatus: {
    client: 'claude-code',
    displayName: 'Claude Code',
    installed: false,
    matchesCurrent: false,
    clientDetected: false,
    clientCommand: 'claude',
    message: '未检测到 Claude Code 用户级 GoNavi MCP 配置',
  },
  selectedMCPClientCommandText: '',
  mcpHTTPServerStatus: {
    running: false,
    addr: '127.0.0.1:8765',
    path: '/mcp',
    url: 'http://127.0.0.1:8765/mcp',
    schemaOnly: true,
    message: 'GoNavi MCP HTTP 服务未启动',
  },
  mcpServers: [],
  mcpTools: [],
  darkMode: false,
  overlayTheme: buildOverlayWorkbenchTheme(false),
  cardBg: '#fff',
  cardBorder: 'rgba(0,0,0,0.08)',
  inputBg: '#fff',
  loading: false,
  mcpClientStatusLoading: false,
  mcpHTTPServerLoading: false,
  onToggleHTTPServer: () => {},
  onCopyHTTPServerURL: () => {},
  onCopyHTTPServerAuthorization: () => {},
  onSelectClient: () => {},
  onRefreshStatus: () => {},
  onCopyConfigPath: () => {},
  onCopyLaunchCommand: () => {},
  onInstallSelectedClient: () => {},
  onAddServer: () => {},
  onUpdateServerDraft: () => {},
  onTestServer: () => {},
  onSaveServer: () => {},
  onDeleteServer: () => {},
  ...patch,
});

describe('AISettingsMCPSection', () => {
  it('renders the extracted MCP client installer and server management entry point', () => {
    const markup = renderToStaticMarkup(
      <AISettingsMCPSection {...buildMCPSectionProps()} />,
    );

    expect(markup).toContain('GoNavi MCP HTTP 服务');
    expect(markup).toContain('不用再手动执行 GoNavi.exe mcp-server http 命令');
    expect(markup).toContain('http://127.0.0.1:8765/mcp');
    expect(markup).toContain('复制 Authorization');
    expect(markup).toContain('接入外部客户端');
    expect(markup).toContain('尚未把当前 GoNavi MCP 接入到这里');
    expect(markup).toContain('一行命令快速新增');
    expect(markup).toContain('先选最接近的模板');
    expect(markup).toContain('解析并新增草稿');
    expect(markup).toContain('新增 MCP 参数速查');
    expect(markup).toContain('command');
    expect(markup).toContain('args');
    expect(markup).toContain('env');
    expect(markup).toContain('timeout');
    expect(markup).toContain('只填程序名或启动器本身');
    expect(markup).toContain('应填：');
    expect(markup).toContain('填 npx、node、uvx、python、docker，或某个 exe 的绝对路径');
    expect(markup).toContain('不要填整行命令，例如不要填 npx -y pkg --stdio');
    expect(markup).toContain('把脚本名、模块名、开关参数拆开逐项填写');
    expect(markup).toContain('不要再填 npx/node/uvx/python/docker');
    expect(markup).toContain('给 MCP Server 传入 KEY=VALUE 形式的配置');
    expect(markup).toContain('不要写 export、set 或 $env: 前缀');
    expect(markup).toContain('单次工具发现或调用最多等待多久');
    expect(markup).toContain('常见启动方式模板');
    expect(markup).toContain('npx 包');
    expect(markup).toContain('npx -y @modelcontextprotocol/server-filesystem --stdio');
    expect(markup).toContain('Node 脚本');
    expect(markup).toContain('Docker 镜像');
    expect(markup).toContain('docker run -i --rm image');
    expect(markup).toContain('新增 MCP 服务');
    expect(markup).toContain('还没有 MCP 服务');
    expect(markup).toContain('npx -y package --stdio');
  });

  it('renders troubleshooting hints when a server draft exists', () => {
    const markup = renderToStaticMarkup(
      <AISettingsMCPSection
        {...buildMCPSectionProps({
          mcpServers: [{
            id: 'mcp-local',
            name: 'Local MCP',
            transport: 'stdio',
            command: 'node',
            args: ['server.js', '--stdio'],
            env: {},
            enabled: true,
            timeoutSeconds: 20,
          }],
          mcpTools: [
            {
              alias: 'execute_sql',
              serverId: 'mcp-local',
              serverName: 'Local MCP',
              originalName: 'execute_sql',
              description: '执行 SQL',
              inputSchema: {
                type: 'object',
                required: ['connectionId', 'sql'],
                properties: {
                  connectionId: { type: 'string', description: '连接 ID' },
                  dbName: { type: 'string', description: '数据库名' },
                  sql: { type: 'string', description: 'SQL 文本' },
                  allowMutating: { type: 'boolean', description: '显式允许写操作' },
                },
              },
            },
            {
              alias: 'legacy_tool',
              serverId: 'mcp-local',
              serverName: 'Local MCP',
              originalName: 'legacy_tool',
            },
          ],
        })}
      />,
    );

    expect(markup).toContain('常见填错现象');
    expect(markup).toContain('测试提示找不到命令');
    expect(markup).toContain('认证失败、401 或 403');
    expect(markup).toContain('当前只支持 stdio');
    expect(markup).toContain('不要把密钥写进聊天内容');
    expect(markup).toContain('已发现工具和参数提示');
    expect(markup).toContain('execute_sql');
    expect(markup).toContain('参数 4 个，必填 2 个');
    expect(markup).toContain('最小 arguments 示例');
    expect(markup).toContain('&quot;connectionId&quot;:&quot;&lt;connectionId&gt;&quot;');
    expect(markup).toContain('&quot;sql&quot;:&quot;&lt;sql&gt;&quot;');
    expect(markup).toContain('connectionId*: string');
    expect(markup).toContain('sql*: string');
    expect(markup).toContain('allowMutating: boolean');
    expect(markup).toContain('legacy_tool');
    expect(markup).toContain('未声明 inputSchema');
  });

  it('toggles the in-app MCP HTTP service from the switch panel', () => {
    const onToggleHTTPServer = vi.fn();
    const tree = AISettingsMCPSection(buildMCPSectionProps({
      onToggleHTTPServer,
    }));

    const httpPanel = findElement(
      tree,
      (node) => node.props?.onToggle === onToggleHTTPServer,
    );
    expect(httpPanel).toBeTruthy();
    httpPanel.props.onToggle(true);

    expect(onToggleHTTPServer).toHaveBeenCalledWith(true);
  });
});
