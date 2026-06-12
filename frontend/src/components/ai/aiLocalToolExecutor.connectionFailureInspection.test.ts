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

describe('aiLocalToolExecutor inspect_recent_connection_failures', () => {
  it('returns a structured snapshot for recent connection failures, cooldown hits, and compatibility errors', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_recent_connection_failures', {
        keyword: 'mysql',
        lineLimit: 120,
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
            requestedLineLimit: 120,
            lines: [
              '2026/06/07 15:50:35.000000 [ERROR] 建立数据库连接失败：类型=mysql 地址=127.0.0.1:48749 数据库=(default) 用户=root；错误链：连接建立后验证失败：127.0.0.1:48749 [默认兼容参数] 验证失败: Error 1064 (42000): You have an error in your SQL syntax near \'%2Cutf8\' at line 1',
              '2026/06/07 15:50:36.000000 [WARN] 命中数据库连接失败冷却：类型=mysql 地址=127.0.0.1:48749 数据库=(default) 用户=root 剩余=29s 原因=连接建立后验证失败：127.0.0.1:48749 [禁用 multiStatements 兼容重试] 验证失败: Error 1064 (42000): You have an error in your SQL syntax near \'%2Cutf8\' at line 1',
            ],
          },
        }),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"primaryCategory":"parameter_compatibility"');
    expect(result.content).toContain('"cooldownHitCount":1');
    expect(result.content).toContain('127.0.0.1:48749');
    expect(result.content).toContain('multiStatements');
  });
});
