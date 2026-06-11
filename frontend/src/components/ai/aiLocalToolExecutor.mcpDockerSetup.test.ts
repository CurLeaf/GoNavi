import { describe, expect, it, vi } from 'vitest';

import type { AIToolCall, SavedConnection } from '../../types';
import { executeLocalAIToolCall } from './aiLocalToolExecutor';

const buildConnection = (): SavedConnection => ({
  id: 'conn-1',
  name: '主库',
  config: {
    type: 'mysql',
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
  },
});

const buildToolCall = (name: string, args: Record<string, unknown>): AIToolCall => ({
  id: `call-${name}`,
  type: 'function',
  function: {
    name,
    arguments: JSON.stringify(args),
  },
});

describe('aiLocalToolExecutor inspect_mcp_docker_setup', () => {
  it('returns docker mcp configuration issues through the unified local tool executor', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_mcp_docker_setup', {}),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
        getMCPServers: vi.fn().mockResolvedValue([
          {
            id: 'docker-broken',
            name: 'Docker Broken',
            transport: 'stdio',
            command: 'docker',
            args: ['run', '--rm'],
            env: {},
            enabled: true,
            timeoutSeconds: 10,
          },
        ]),
      },
    });

    if (!result.success) {
      throw new Error(result.content);
    }
    expect(result.success).toBe(true);
    expect(result.toolName).toBe('inspect_mcp_docker_setup');
    expect(result.content).toContain('"dockerServerCount":1');
    expect(result.content).toContain('"docker-interactive-missing"');
    expect(result.content).toContain('Docker 首次拉起可能较慢');
  });
});
