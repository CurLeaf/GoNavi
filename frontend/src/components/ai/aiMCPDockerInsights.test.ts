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
    expect(snapshot.warnings).toContain('有 1 个 Docker MCP 缺少 run、-i 或镜像名等关键参数');
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
});
