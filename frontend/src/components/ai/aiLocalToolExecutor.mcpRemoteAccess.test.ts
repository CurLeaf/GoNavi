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

describe('aiLocalToolExecutor inspect_mcp_remote_access', () => {
  it('returns remote mcp access guidance through the unified local tool executor', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_mcp_remote_access', {
        publicUrl: 'https://mcp.example.com/gonavi',
        exposeStrategy: 'tailscale',
        tokenConfigured: true,
      }),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
        getMCPClientInstallStatuses: vi.fn().mockResolvedValue([
          {
            client: 'hermans',
            displayName: 'Hermans',
            installMode: 'remote',
            installed: false,
            matchesCurrent: false,
            clientDetected: false,
            clientCommand: 'hermans',
            message: 'Hermans 通过远程 MCP 桥接接入',
          },
        ]),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"mode":"streamable-http"');
    expect(result.content).toContain('"publicUrl":"https://mcp.example.com/gonavi/mcp"');
    expect(result.content).toContain('Authorization: Bearer <随机token>');
    expect(result.content).toContain('"displayName":"Hermans"');
    expect(result.content).toContain('"cloudAgentNeedsDatabasePassword":false');
  });
});
