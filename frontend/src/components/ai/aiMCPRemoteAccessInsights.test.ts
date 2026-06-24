import { describe, expect, it } from 'vitest';

import { buildMCPRemoteAccessSnapshot } from './aiMCPRemoteAccessInsights';

describe('aiMCPRemoteAccessInsights', () => {
  it('uses the provided translator for remote access guidance copy while preserving raw endpoints', () => {
    const translate = (key: string, params?: Record<string, unknown>) => {
      const values: Record<string, string> = {
        'ai_chat.inspection.mcp_remote.strategy.cloudflare_tunnel.title': 'Cloudflare tunnel translated',
        'ai_chat.inspection.mcp_remote.strategy.cloudflare_tunnel.detail': 'Translated tunnel detail',
        'ai_chat.inspection.mcp_remote.strategy.cloudflare_tunnel.risk': 'Translated tunnel risk',
        'ai_chat.inspection.mcp_remote.message.with_public_url': `Translated access message ${params?.publicUrl}`,
        'ai_chat.inspection.mcp_remote.next_action.configure_agent': 'Translated configure agent action',
        'ai_chat.inspection.mcp_remote.security.recommended_bind_address': '127.0.0.1 translated recommendation',
        'ai_settings.mcp_server.remote_quick_start.guide.title': `Translated guide - ${params?.displayName}`,
        'ai_settings.mcp_server.remote_quick_start.guide.goal_heading': 'Translated goal heading:',
        'ai_settings.mcp_server.remote_quick_start.guide.goal.credentials_stay_local': 'Translated credentials stay local.',
        'ai_settings.mcp_server.remote_quick_start.guide.goal.tools_only': 'Translated tools-only boundary.',
        'ai_settings.mcp_server.remote_quick_start.guide.goal.schema_only': 'Translated schema-only boundary.',
        'ai_settings.mcp_server.remote_quick_start.guide.boundary_heading': 'Translated boundary heading:',
        'ai_settings.mcp_server.remote_quick_start.guide.boundary.local_stdio': 'Translated local stdio boundary.',
        'ai_settings.mcp_server.remote_quick_start.guide.boundary.remote_cloud': 'Translated remote cloud boundary.',
        'ai_settings.mcp_server.remote_quick_start.guide.access_heading': 'Translated access heading:',
        'ai_settings.mcp_server.remote_quick_start.guide.step.keep_windows_accessible': 'Translated keep Windows accessible.',
        'ai_settings.mcp_server.remote_quick_start.guide.step.run_command': `Translated run ${params?.launchCommand}.`,
        'ai_settings.mcp_server.remote_quick_start.guide.step.configure_remote_server': `Translated configure ${params?.displayName}.`,
        'ai_settings.mcp_server.remote_quick_start.guide.step.inspect_schema': 'Translated inspect schema.',
        'ai_settings.mcp_server.remote_quick_start.guide.config_heading': 'Translated config heading:',
        'ai_settings.mcp_server.remote_quick_start.guide.config_command_heading': 'Translated config command heading:',
        'ai_settings.mcp_server.remote_quick_start.guide.launch_command_heading': 'Translated launch command heading:',
        'ai_settings.mcp_server.remote_quick_start.guide.env_fallback': `Translated env fallback ${params?.standaloneCommand}`,
        'ai_settings.mcp_server.remote_quick_start.guide.execute_sql_note': 'Translated execute_sql note.',
        'ai_settings.mcp_server.remote_quick_start.guide.current_hint': `Translated current hint ${params?.message}`,
      };
      return values[key] || key;
    };

    const snapshot = buildMCPRemoteAccessSnapshot({
      publicUrl: 'https://mcp.example.com/gonavi',
      exposeStrategy: 'cloudflare_tunnel',
      tokenConfigured: true,
      translate,
      mcpClientStatuses: [
        {
          client: 'openclaw',
          displayName: 'OpenClaw',
          installMode: 'remote',
          installed: false,
          matchesCurrent: false,
          clientDetected: false,
          clientCommand: 'openclaw',
          message: 'OpenClaw raw status',
        },
      ],
    });

    expect(snapshot.message).toBe('Translated access message https://mcp.example.com/gonavi/mcp');
    expect(snapshot.selectedStrategy.title).toBe('Cloudflare tunnel translated');
    expect(snapshot.selectedStrategy.detail).toBe('Translated tunnel detail');
    expect(snapshot.selectedStrategy.risk).toBe('Translated tunnel risk');
    expect(snapshot.nextActions).toContain('Translated configure agent action');
    expect(snapshot.securityBoundary.recommendedBindAddress).toBe('127.0.0.1 translated recommendation');
    expect(snapshot.endpoint.publicUrl).toBe('https://mcp.example.com/gonavi/mcp');
    expect(snapshot.endpoint.authHeader).toBe('Authorization: Bearer <random-token>');
    expect(snapshot.launchCommands.appBinary).toContain('--token <random-token>');
    expect(snapshot.remoteClients.find((client) => client.client === 'openclaw')?.guide).toContain('Translated guide - OpenClaw');
    expect(snapshot.remoteClients.find((client) => client.client === 'openclaw')?.guide).toContain('Translated current hint OpenClaw raw status');
  });

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
    expect(snapshot.endpoint.authHeader).toBe('Authorization: Bearer <random-token>');
    expect(snapshot.launchCommands.appBinary).toContain('GoNavi.exe mcp-server http');
    expect(snapshot.selectedStrategy.key).toBe('cloudflare_tunnel');
    expect(snapshot.remoteClients.some((client) => client.client === 'openclaw')).toBe(true);
    expect(snapshot.remoteClients.find((client) => client.client === 'openclaw')?.guide).toContain('Database connections, accounts, and passwords stay in Windows GoNavi');
    expect(snapshot.securityBoundary.databaseSecretsStayLocal).toBe(true);
    expect(snapshot.securityBoundary.cloudAgentNeedsDatabasePassword).toBe(false);
    expect(snapshot.securityBoundary.mutatingSqlStillRequiresAllowMutating).toBe(true);
    expect(snapshot.warnings).toHaveLength(0);
    expect(snapshot.nextActions.join('\n')).toContain('do not copy database passwords to the cloud Agent');
  });

  it('warns when public url or bearer token readiness is missing', () => {
    const snapshot = buildMCPRemoteAccessSnapshot({
      tokenConfigured: false,
      mcpClientStatuses: [],
    });

    expect(snapshot.endpoint.localUrl).toBe('http://127.0.0.1:8765/mcp');
    expect(snapshot.remoteClients.map((client) => client.client)).toEqual(['openclaw', 'hermans']);
    expect(snapshot.warnings).toContain('No MCP URL reachable by the cloud Agent was provided; a remote Agent cannot directly access Windows local 127.0.0.1.');
    expect(snapshot.warnings).toContain('Bearer Token readiness is not confirmed; HTTP MCP must use a random token and must not be exposed without authentication.');
  });
});
