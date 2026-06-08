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
    expect(snapshot.servers[0].launchCommandPreview).toBe('uvx mcp-server-browser');
    expect(snapshot.servers[0].envVarCount).toBe(2);
    expect(snapshot.servers[0].discoveredToolCount).toBe(1);
    expect(snapshot.clients[0].displayName).toBe('Claude Code');
    expect(snapshot.clients[0].launchCommandPreview).toBe('gonavi-mcp-server stdio');
    expect(snapshot.currentClientCount).toBe(1);
  });
});
