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
    expect(result.content).toContain('Check that command contains only the executable name');
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
    expect(result.content).toContain('Failed to read MCP runtime failure logs');
    expect(result.content).toContain('log file missing');
  });

  it('uses translator for MCP runtime failure diagnostics without translating raw fields', async () => {
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
    const translate = (key: string, params?: Record<string, unknown>) => ({
      'ai_chat.inspection.mcp_runtime.next_action.command_not_found': 'T_ACTION_COMMAND',
      'ai_chat.inspection.mcp_runtime.next_action.enabled_without_tools': 'T_ACTION_DISCOVERY',
      'ai_chat.inspection.mcp_runtime.next_action.fix_discovery_first': 'T_ACTION_FIX_DISCOVERY',
      'ai_chat.inspection.mcp_runtime.warning.failure_events': `T_WARNING_FAILURES_${params?.count}`,
      'ai_chat.inspection.mcp_runtime.warning.enabled_without_tools': `T_WARNING_WITHOUT_TOOLS_${params?.count}`,
      'ai_chat.inspection.mcp_runtime.message.failure_events': `T_MESSAGE_FAILURES_${params?.count}`,
    }[key] || key);

    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_mcp_runtime_failures', {
        serverName: 'GitHub',
      }),
      connections: [],
      mcpTools: [],
      toolContextMap: new Map(),
      translate,
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
        readAppLogTail,
        getMCPServers,
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('T_ACTION_COMMAND');
    expect(result.content).toContain('T_WARNING_FAILURES_1');
    expect(result.content).toContain('T_MESSAGE_FAILURES_1');
    expect(result.content).toContain('"name":"GitHub"');
    expect(result.content).toContain('"envKeys":["GITHUB_TOKEN"]');
    expect(result.content).toContain('exec: \\"uvx\\": executable file not found in %PATH%');
    expect(result.content).not.toContain('secret-value');
  });

  it('uses translator for MCP runtime log read failures while preserving raw detail', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_mcp_runtime_failures', {}),
      connections: [],
      mcpTools: [],
      toolContextMap: new Map(),
      translate: (key, params) => (
        key === 'ai_chat.inspection.mcp_runtime.error.read_logs_failed'
          ? `READ_FAILED::${params?.detail}`
          : key
      ),
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
    expect(result.content).toBe('READ_FAILED::log file missing');
  });
});
