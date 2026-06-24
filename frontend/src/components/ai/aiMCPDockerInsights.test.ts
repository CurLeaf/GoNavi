import { describe, expect, it } from 'vitest';

import { buildMCPDockerSetupSnapshot } from './aiMCPDockerInsights';

describe('aiMCPDockerInsights', () => {
  it('summarizes docker mcp servers and flags missing stdio-critical args', () => {
    const snapshot = buildMCPDockerSetupSnapshot({
      mcpServers: [
        {
          id: 'docker-broken',
          name: 'Docker Broken',
          transport: 'stdio',
          command: 'docker',
          args: ['--rm'],
          env: {},
          enabled: true,
          timeoutSeconds: 10,
        },
        {
          id: 'node-ok',
          name: 'Node OK',
          transport: 'stdio',
          command: 'node',
          args: ['server.js'],
          env: {},
          enabled: true,
          timeoutSeconds: 20,
        },
      ],
      mcpTools: [],
    });

    expect(snapshot.dockerServerCount).toBe(1);
    expect(snapshot.incompleteServerCount).toBe(1);
    expect(snapshot.servers[0].docker.hasRun).toBe(false);
    expect(snapshot.servers[0].docker.hasInteractive).toBe(false);
    expect(snapshot.servers[0].docker.image).toBe('');
    expect(snapshot.servers[0].nextActions.join('\n')).toContain('run');
    expect(snapshot.servers[0].nextActions.join('\n')).toContain('-i');
    expect(snapshot.warnings).toContain('1 Docker MCP server is missing key arguments such as run, -i, or image name');
  });

  it('handles complete docker run options without treating option values as images', () => {
    const snapshot = buildMCPDockerSetupSnapshot({
      mcpServers: [
        {
          id: 'docker-ok',
          name: 'Docker OK',
          transport: 'stdio',
          command: 'C:\\Program Files\\Docker\\docker.exe',
          args: [
            'run',
            '--rm',
            '-i',
            '-p',
            '8080:8080',
            '-v',
            'C:\\workspace:/workspace',
            '-e',
            'API_KEY=***',
            'ghcr.io/acme/mcp-server:latest',
          ],
          env: { DOCKER_HOST: 'npipe:////./pipe/docker_engine' },
          enabled: true,
          timeoutSeconds: 45,
        },
      ],
      mcpTools: [
        {
          alias: 'docker_probe',
          originalName: 'probe',
          serverId: 'docker-ok',
          serverName: 'Docker OK',
        },
      ],
    });

    expect(snapshot.incompleteServerCount).toBe(0);
    expect(snapshot.servers[0].docker).toMatchObject({
      hasRun: true,
      hasInteractive: true,
      hasRm: true,
      image: 'ghcr.io/acme/mcp-server:latest',
    });
    expect(snapshot.servers[0].envKeys).toEqual(['DOCKER_HOST']);
    expect(snapshot.servers[0].discoveredToolCount).toBe(1);
    expect(snapshot.servers[0].nextActions).toEqual([]);
  });

  it('localizes docker mcp setup wrapper copy while preserving raw docker args and image names', () => {
    const translate = (key: string, params?: Record<string, unknown>) => ({
      'ai_chat.inspection.mcp_docker.next_action.add_run': 'T_ADD_RUN',
      'ai_chat.inspection.mcp_docker.next_action.add_interactive': 'T_ADD_INTERACTIVE',
      'ai_chat.inspection.mcp_docker.next_action.add_image': 'T_ADD_IMAGE',
      'ai_chat.inspection.mcp_docker.next_action.timeout': 'T_TIMEOUT',
      'ai_chat.inspection.mcp_docker.warning.incomplete': `T_INCOMPLETE_${params?.count}`,
      'ai_chat.inspection.mcp_docker.next_action.fix_key_args': 'T_FIX_KEY_ARGS',
      'ai_chat.inspection.mcp_docker.warning.no_tools': `T_NO_TOOLS_${params?.count}`,
      'ai_chat.inspection.mcp_docker.next_action.refresh_tools': 'T_REFRESH_TOOLS',
      'ai_chat.inspection.mcp_docker.message.with_incomplete': `T_MESSAGE_${params?.total}_${params?.count}`,
    }[key] || key);

    const snapshot = buildMCPDockerSetupSnapshot({
      mcpServers: [
        {
          id: 'docker-broken',
          name: 'Docker Broken',
          transport: 'stdio',
          command: 'docker',
          args: ['--rm'],
          env: {},
          enabled: true,
          timeoutSeconds: 10,
        },
      ],
      mcpTools: [],
      translate,
    } as Parameters<typeof buildMCPDockerSetupSnapshot>[0] & { translate: typeof translate });

    expect(snapshot.servers[0].nextActions).toEqual([
      'T_ADD_RUN',
      'T_ADD_INTERACTIVE',
      'T_ADD_IMAGE',
      'T_TIMEOUT',
    ]);
    expect(snapshot.warnings).toEqual(['T_INCOMPLETE_1', 'T_NO_TOOLS_1']);
    expect(snapshot.nextActions).toEqual(['T_FIX_KEY_ARGS', 'T_REFRESH_TOOLS']);
    expect(snapshot.message).toBe('T_MESSAGE_1_1');
    expect(snapshot.servers[0].command).toBe('docker');
    expect(snapshot.servers[0].args).toEqual(['--rm']);
  });
});
