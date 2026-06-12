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

describe('aiLocalToolExecutor inspect_mcp_runtime_failures', () => {
  it('returns structured MCP runtime failure diagnostics from gonavi.log and configured servers', async () => {
    const readAppLogTail = vi.fn().mockResolvedValue({
      success: true,
      data: {
        logPath: 'C:/Users/demo/.GoNavi/Logs/gonavi.log',
        keyword: 'GitHub',
        requestedLineLimit: 160,
        lines: [
          '2026/06/11 10:00:00.000000 [WARN] 列出 MCP 工具失败(server=GitHub): exec: "uvx": executable file not found in %PATH%',
        ],
      },
    });
    const getMCPServers = vi.fn().mockResolvedValue([{
      id: 'github',
      name: 'GitHub',
      transport: 'stdio',
      command: 'uvx',
      args: ['mcp-server-github', '--stdio'],
      env: { GITHUB_TOKEN: 'secret-value' },
      enabled: true,
      timeoutSeconds: 20,
    }]);

    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_mcp_runtime_failures', {
        serverName: 'GitHub',
      }),
      connections: [],
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
        readAppLogTail,
        getMCPServers,
      },
    });

    expect(result.success).toBe(true);
    expect(readAppLogTail).toHaveBeenCalledWith(160, 'GitHub');
    expect(getMCPServers).toHaveBeenCalledTimes(1);
    expect(result.content).toContain('"failureEventCount":1');
    expect(result.content).toContain('"list_tools_failed":1');
    expect(result.content).toContain('"command_not_found":1');
    expect(result.content).toContain('"name":"GitHub"');
    expect(result.content).toContain('"envKeys":["GITHUB_TOKEN"]');
    expect(result.content).toContain('检查 command 是否只填可执行程序本身');
    expect(result.content).not.toContain('secret-value');
  });

  it('returns a clear failure when app logs cannot be read', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_mcp_runtime_failures', {}),
      connections: [],
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
        readAppLogTail: vi.fn().mockResolvedValue({
          success: false,
          message: 'log file missing',
        }),
      },
    });

    expect(result.success).toBe(false);
    expect(result.content).toContain('读取 MCP 运行期失败日志失败');
    expect(result.content).toContain('log file missing');
  });
});
