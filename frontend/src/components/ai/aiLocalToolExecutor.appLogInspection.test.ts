import { describe, expect, it, vi } from 'vitest';

import type { AIToolCall } from '../../types';
import { executeLocalAIToolCall } from './aiLocalToolExecutor';

const buildToolCall = (
  name: string,
  args: Record<string, unknown>,
): AIToolCall => ({
  id: `call-${name}`,
  type: 'function',
  function: {
    name,
    arguments: JSON.stringify(args),
  },
});

describe('aiLocalToolExecutor inspect_app_logs', () => {
  it('returns the recent app-log snapshot so the model can diagnose startup and connection failures from real logs', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_app_logs', {
        keyword: 'mysql',
        lineLimit: 20,
      }),
      connections: [],
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
        readAppLogTail: vi.fn().mockResolvedValue({
          success: true,
          data: {
            logPath: 'C:/Users/demo/.GoNavi/Logs/gonavi.log',
            keyword: 'mysql',
            requestedLineLimit: 20,
            fileWindowTruncated: false,
            matchedLinesTruncated: false,
            lines: [
              '2026/06/09 10:00:02.000000 [ERROR] mysql dial failed: connect timeout',
            ],
          },
        }),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"logPath":"C:/Users/demo/.GoNavi/Logs/gonavi.log"');
    expect(result.content).toContain('"keyword":"mysql"');
    expect(result.content).toContain('"ERROR":1');
    expect(result.content).toContain('connect timeout');
  });
});
