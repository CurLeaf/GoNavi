import { describe, expect, it, vi } from 'vitest';

import type { AIMCPToolDescriptor, AIToolCall, SavedConnection } from '../../types';
import { buildToolResultMessage, executeLocalAIToolCall } from './aiLocalToolExecutor';

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

describe('aiLocalToolExecutor', () => {
  it('caches validated table context after get_tables succeeds', async () => {
    const toolContextMap = new Map();
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('get_tables', { connectionId: 'conn-1', dbName: 'crm' }),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap,
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn().mockResolvedValue({
          success: true,
          data: [{ Table: 'users' }, { Table: 'orders' }],
        }),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('users');
    expect(toolContextMap.get('conn-1:crm')).toEqual({
      connectionId: 'conn-1',
      dbName: 'crm',
      tables: ['users', 'orders'],
    });
  });

  it('blocks execute_sql when the AI safety check rejects the statement', async () => {
    const query = vi.fn();
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('execute_sql', {
        connectionId: 'conn-1',
        dbName: 'crm',
        sql: 'DELETE FROM users',
      }),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
        getColumns: vi.fn(),
        getIndexes: vi.fn(),
        getForeignKeys: vi.fn(),
        getTriggers: vi.fn(),
        showCreateTable: vi.fn(),
        query,
        checkSQL: vi.fn().mockResolvedValue({
          allowed: false,
          operationType: 'DELETE',
        }),
      },
    });

    expect(result.success).toBe(false);
    expect(result.content).toContain('安全策略拦截');
    expect(query).not.toHaveBeenCalled();
  });

  it('returns index definitions and resolves the tool label for MCP descriptors', async () => {
    const mcpTools: AIMCPToolDescriptor[] = [{
      alias: 'custom_tool',
      originalName: 'custom_tool',
      serverId: 'server-1',
      serverName: 'demo',
      title: '自定义探针',
      description: '',
    }];
    const indexResult = await executeLocalAIToolCall({
      toolCall: buildToolCall('get_indexes', {
        connectionId: 'conn-1',
        dbName: 'crm',
        tableName: 'users',
      }),
      connections: [buildConnection()],
      mcpTools,
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
        getColumns: vi.fn(),
        getIndexes: vi.fn().mockResolvedValue({
          success: true,
          data: [{ keyName: 'idx_users_email', nonUnique: 0 }],
        }),
        getForeignKeys: vi.fn(),
        getTriggers: vi.fn(),
        showCreateTable: vi.fn(),
        query: vi.fn(),
      },
    });
    const message = buildToolResultMessage({
      id: 'msg-1',
      timestamp: 1,
      toolCall: buildToolCall('custom_tool', {}),
      execution: {
        content: 'ok',
        success: true,
        toolName: '自定义探针',
      },
    });

    expect(indexResult.success).toBe(true);
    expect(indexResult.content).toContain('idx_users_email');
    expect(message.tool_name).toBe('自定义探针');
  });
});
