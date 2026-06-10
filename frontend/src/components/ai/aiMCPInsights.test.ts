import { describe, expect, it } from 'vitest';

import { buildMCPSetupSnapshot } from './aiMCPInsights';

describe('aiMCPInsights', () => {
  it('builds a combined snapshot for local mcp servers, tools, and external client install state', () => {
    const snapshot = buildMCPSetupSnapshot({
      mcpServers: [
        {
          id: 'server-1',
          name: 'Browser',
          transport: 'stdio',
          command: 'uvx',
          args: ['mcp-server-browser'],
          env: {
            OPENAI_API_KEY: '***',
            BASE_URL: 'http://127.0.0.1',
          },
          enabled: true,
          timeoutSeconds: 20,
        },
      ],
      mcpClientStatuses: [
        {
          client: 'claude-code',
          displayName: 'Claude Code',
          installed: true,
          matchesCurrent: true,
          clientDetected: true,
          clientCommand: 'claude',
          clientPath: 'C:/Tools/claude.exe',
          configPath: 'C:/Users/demo/.claude/mcp.json',
          command: 'gonavi-mcp-server',
          args: ['stdio'],
          message: '已写入当前 GoNavi 路径',
        },
      ],
      mcpTools: [
        {
          alias: 'browser_open',
          originalName: 'browser_open',
          serverId: 'server-1',
          serverName: 'Browser',
          title: '打开页面',
        },
      ],
    });

    expect(snapshot.serverCount).toBe(1);
    expect(snapshot.enabledServerCount).toBe(1);
    expect(snapshot.discoveredMCPToolCount).toBe(1);
    expect(snapshot.serverConfigurationIssueCount).toBe(0);
    expect(snapshot.servers[0].launchCommandPreview).toBe('uvx mcp-server-browser');
    expect(snapshot.servers[0].configurationIssueCount).toBe(0);
    expect(snapshot.servers[0].envVarCount).toBe(2);
    expect(snapshot.servers[0].discoveredToolCount).toBe(1);
    expect(snapshot.clients[0].displayName).toBe('Claude Code');
    expect(snapshot.clients[0].launchCommandPreview).toBe('gonavi-mcp-server stdio');
    expect(snapshot.currentClientCount).toBe(1);
  });

  it('surfaces saved mcp server launch validation issues for ai diagnostics', () => {
    const snapshot = buildMCPSetupSnapshot({
      mcpServers: [
        {
          id: 'server-1',
          name: 'Broken',
          transport: 'stdio',
          command: '',
          args: [],
          env: {},
          enabled: true,
          timeoutSeconds: 1,
        },
      ],
      mcpClientStatuses: [],
      mcpTools: [],
    });

    expect(snapshot.serverConfigurationIssueCount).toBe(2);
    expect(snapshot.serversWithConfigurationErrors).toBe(1);
    expect(snapshot.enabledServersWithConfigurationIssues).toBe(1);
    expect(snapshot.servers[0].configurationErrorCount).toBe(1);
    expect(snapshot.servers[0].configurationWarningCount).toBe(1);
    expect(snapshot.servers[0].configurationCanTest).toBe(false);
    expect(snapshot.servers[0].configurationIssues.map((issue) => issue.key)).toEqual([
      'command-missing',
      'timeout-out-of-range',
    ]);
    expect(snapshot.warnings).toContain('有 1 个 MCP 服务存在启动配置错误，测试和工具发现可能失败');
    expect(snapshot.nextActions).toContain('先修复 MCP 服务配置检查里的错误项，再重新测试服务');
    expect(snapshot.message).toContain('2 个配置检查项需要确认');
  });
});
