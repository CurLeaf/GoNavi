import { describe, expect, it } from 'vitest';

import { buildMCPRemoteAccessSnapshot } from './aiMCPRemoteAccessInsights';

describe('aiMCPRemoteAccessInsights', () => {
  it('builds a secure remote mcp access guide for cloud agents', () => {
    const snapshot = buildMCPRemoteAccessSnapshot({
      publicUrl: 'https://mcp.example.com/gonavi',
      exposeStrategy: 'cloudflare_tunnel',
      tokenConfigured: true,
      mcpClientStatuses: [
        {
          client: 'openclaw',
          displayName: 'OpenClaw',
          installMode: 'remote',
          installed: false,
          matchesCurrent: false,
          clientDetected: false,
          clientCommand: 'openclaw',
          message: 'OpenClaw 通常部署在云端 Linux',
        },
      ],
    });

    expect(snapshot.mode).toBe('streamable-http');
    expect(snapshot.endpoint.publicUrl).toBe('https://mcp.example.com/gonavi/mcp');
    expect(snapshot.endpoint.authHeader).toBe('Authorization: Bearer <随机token>');
    expect(snapshot.launchCommands.appBinary).toContain('GoNavi.exe mcp-server http');
    expect(snapshot.selectedStrategy.key).toBe('cloudflare_tunnel');
    expect(snapshot.remoteClients.some((client) => client.client === 'openclaw')).toBe(true);
    expect(snapshot.remoteClients.find((client) => client.client === 'openclaw')?.guide).toContain('数据库连接、账号和密码继续保存在 Windows');
    expect(snapshot.securityBoundary.databaseSecretsStayLocal).toBe(true);
    expect(snapshot.securityBoundary.cloudAgentNeedsDatabasePassword).toBe(false);
    expect(snapshot.securityBoundary.mutatingSqlStillRequiresAllowMutating).toBe(true);
    expect(snapshot.warnings).toHaveLength(0);
    expect(snapshot.nextActions.join('\n')).toContain('不要把数据库密码复制到云端 Agent');
  });

  it('warns when public url or bearer token readiness is missing', () => {
    const snapshot = buildMCPRemoteAccessSnapshot({
      tokenConfigured: false,
      mcpClientStatuses: [],
    });

    expect(snapshot.endpoint.localUrl).toBe('http://127.0.0.1:8765/mcp');
    expect(snapshot.remoteClients.map((client) => client.client)).toEqual(['openclaw', 'hermans']);
    expect(snapshot.warnings).toContain('尚未提供云端 Agent 可访问的 MCP URL；远程 Agent 不能直接访问 Windows 本机 127.0.0.1。');
    expect(snapshot.warnings).toContain('尚未确认 Bearer Token；HTTP MCP 必须配置随机 token，不能无鉴权暴露。');
  });
});
