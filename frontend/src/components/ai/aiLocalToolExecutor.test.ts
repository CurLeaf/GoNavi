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

  it('returns the current active tab snapshot so the model can inspect the editor draft directly', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_active_tab', {
        includeContent: true,
      }),
      connections: [buildConnection()],
      tabs: [{
        id: 'tab-query-1',
        title: '订单查询',
        type: 'query',
        connectionId: 'conn-1',
        dbName: 'crm',
        query: 'SELECT id, status FROM orders WHERE status = \'paid\'',
        filePath: 'D:/sql/orders.sql',
      }],
      activeTabId: 'tab-query-1',
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"hasActiveTab":true');
    expect(result.content).toContain('"type":"query"');
    expect(result.content).toContain('"connectionName":"主库"');
    expect(result.content).toContain('"contentKind":"sql"');
    expect(result.content).toContain('SELECT id, status FROM orders');
  });

  it('returns a workspace tab overview so the model can inspect which editors are currently open', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_workspace_tabs', {
        limit: 2,
        includeContent: true,
      }),
      connections: [buildConnection()],
      tabs: [
        {
          id: 'tab-query-1',
          title: '订单查询',
          type: 'query',
          connectionId: 'conn-1',
          dbName: 'crm',
          query: 'SELECT * FROM orders WHERE status = \'paid\'',
        },
        {
          id: 'tab-table-1',
          title: 'users',
          type: 'table',
          connectionId: 'conn-1',
          dbName: 'crm',
          tableName: 'users',
        },
        {
          id: 'tab-redis-1',
          title: '缓存命令',
          type: 'redis-command',
          connectionId: 'conn-1',
          query: 'GET order:1',
          redisDB: 2,
        },
      ],
      activeTabId: 'tab-query-1',
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"activeTabId":"tab-query-1"');
    expect(result.content).toContain('"totalTabs":3');
    expect(result.content).toContain('"returnedTabs":2');
    expect(result.content).toContain('"truncated":true');
    expect(result.content).toContain('"isActive":true');
    expect(result.content).toContain('"title":"订单查询"');
    expect(result.content).toContain('SELECT * FROM orders');
  });

  it('returns the current linked AI context so the model can inspect which table schemas are already mounted', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_ai_context', {
        includeDDL: true,
        ddlLimit: 80,
      }),
      connections: [buildConnection()],
      activeContext: {
        connectionId: 'conn-1',
        dbName: 'crm',
      },
      aiContexts: {
        'conn-1:crm': [
          {
            dbName: 'crm',
            tableName: 'orders',
            ddl: 'CREATE TABLE orders (id bigint primary key, status varchar(32), amount decimal(10,2));',
          },
        ],
      },
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"hasActiveContext":true');
    expect(result.content).toContain('"connectionName":"主库"');
    expect(result.content).toContain('"tableName":"orders"');
    expect(result.content).toContain('"includeDDL":true');
    expect(result.content).toContain('CREATE TABLE orders');
  });

  it('returns the current connection snapshot so the model can inspect host, db, and ssh state', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_current_connection', {}),
      connections: [{
        id: 'conn-1',
        name: '主库',
        config: {
          type: 'mysql',
          host: '10.188.101.184',
          port: 1523,
          user: 'glzc',
          database: 'crm',
          useSSH: true,
          ssh: {
            host: '192.168.66.28',
            port: 22,
            user: 'wyeye',
          },
        },
      }],
      activeContext: {
        connectionId: 'conn-1',
        dbName: 'crm',
      },
      tabs: [{
        id: 'tab-query-1',
        title: '订单分析',
        type: 'query',
        connectionId: 'conn-1',
        dbName: 'crm',
        query: 'select * from orders limit 20',
      }],
      activeTabId: 'tab-query-1',
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"hasActiveConnection":true');
    expect(result.content).toContain('"connectionName":"主库"');
    expect(result.content).toContain('"host":"10.188.101.184"');
    expect(result.content).toContain('"port":1523');
    expect(result.content).toContain('"activeDbName":"crm"');
    expect(result.content).toContain('"useSSH":true');
    expect(result.content).toContain('"sshHost":"192.168.66.28"');
    expect(result.content).toContain('"activeTabType":"query"');
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

  it('returns a cross-table column summary for get_all_columns', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('get_all_columns', {
        connectionId: 'conn-1',
        dbName: 'crm',
      }),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
        getAllColumns: vi.fn().mockResolvedValue({
          success: true,
          data: [
            { TableName: 'users', Name: 'email', Type: 'varchar(255)', Comment: '用户邮箱' },
            { TableName: 'orders', Name: 'user_id', Type: 'bigint', Comment: '关联用户' },
          ],
        }),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"tableCount":2');
    expect(result.content).toContain('"tableName":"users"');
    expect(result.content).toContain('"name":"email"');
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

  it('previews sample rows for a table without forcing the model to handwrite select limit sql', async () => {
    const query = vi.fn().mockResolvedValue({
      success: true,
      data: [
        { id: 1, status: 'paid', amount: 120.5 },
        { id: 2, status: 'pending', amount: null },
      ],
    });
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('preview_table_rows', {
        connectionId: 'conn-1',
        dbName: 'crm',
        tableName: 'orders',
        limit: 5,
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
      },
    });

    expect(result.success).toBe(true);
    expect(query).toHaveBeenCalledWith(expect.anything(), 'crm', 'SELECT * FROM `orders` LIMIT 5 OFFSET 0');
    expect(result.content).toContain('"tableName":"orders"');
    expect(result.content).toContain('"status":"paid"');
    expect(result.content).toContain('"rowCount":2');
  });

  it('returns a full table snapshot bundle with optional sample rows in one tool call', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_table_bundle', {
        connectionId: 'conn-1',
        dbName: 'crm',
        tableName: 'orders',
        includeSampleRows: true,
        sampleLimit: 2,
      }),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
        getColumns: vi.fn().mockResolvedValue({
          success: true,
          data: [{ Field: 'id', Type: 'bigint', Null: 'NO', Comment: '主键' }],
        }),
        getIndexes: vi.fn().mockResolvedValue({
          success: true,
          data: [{ keyName: 'PRIMARY', seqInIndex: 1 }],
        }),
        getForeignKeys: vi.fn().mockResolvedValue({
          success: true,
          data: [{ columnName: 'user_id', refTable: 'users' }],
        }),
        getTriggers: vi.fn().mockResolvedValue({
          success: true,
          data: [{ triggerName: 'orders_bi' }],
        }),
        showCreateTable: vi.fn().mockResolvedValue({
          success: true,
          data: [{ ddl: 'CREATE TABLE orders (...)' }],
        }),
        query: vi.fn().mockResolvedValue({
          success: true,
          data: [{ id: 1, status: 'paid' }, { id: 2, status: 'pending' }],
        }),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"tableName":"orders"');
    expect(result.content).toContain('"field":"id"');
    expect(result.content).toContain('"keyName":"PRIMARY"');
    expect(result.content).toContain('"triggerName":"orders_bi"');
    expect(result.content).toContain('"sampleRows"');
    expect(result.content).toContain('"status":"paid"');
  });

  it('returns recent sql logs and supports filtering only failed statements', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_recent_sql_logs', {
        limit: 2,
        status: 'error',
      }),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      sqlLogs: [
        {
          id: 'log-1',
          timestamp: 3,
          sql: 'DELETE FROM users WHERE id = 9',
          status: 'error',
          duration: 120,
          message: 'permission denied',
          dbName: 'crm',
        },
        {
          id: 'log-2',
          timestamp: 2,
          sql: 'SELECT * FROM users LIMIT 10',
          status: 'success',
          duration: 18,
          dbName: 'crm',
          affectedRows: 10,
        },
        {
          id: 'log-3',
          timestamp: 1,
          sql: 'UPDATE orders SET status = \'paid\' WHERE id = 1',
          status: 'error',
          duration: 95,
          message: 'row lock timeout',
          dbName: 'crm',
        },
      ],
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"status":"error"');
    expect(result.content).toContain('"totalMatched":2');
    expect(result.content).toContain('permission denied');
    expect(result.content).toContain('row lock timeout');
    expect(result.content).not.toContain('SELECT * FROM users LIMIT 10');
  });

  it('returns local saved queries so the model can reuse historical sql scripts', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_saved_queries', {
        keyword: '支付',
        connectionId: 'conn-1',
      }),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      savedQueries: [
        {
          id: 'saved-1',
          name: '支付订单核对',
          sql: 'SELECT * FROM orders WHERE status = \'paid\'',
          connectionId: 'conn-1',
          dbName: 'crm',
          createdAt: 2,
        },
        {
          id: 'saved-2',
          name: '用户列表',
          sql: 'SELECT * FROM users',
          connectionId: 'conn-1',
          dbName: 'crm',
          createdAt: 1,
        },
      ],
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"totalMatched":1');
    expect(result.content).toContain('支付订单核对');
    expect(result.content).toContain('"connectionName":"主库"');
    expect(result.content).toContain('status = \'paid\'');
  });

  it('returns sql snippets so the model can inspect local query templates', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_sql_snippets', {
        keyword: '支付',
      }),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      sqlSnippets: [
        {
          id: 'snippet-1',
          prefix: 'sel',
          name: 'SELECT 模板',
          body: 'SELECT * FROM ${1:table};',
          isBuiltin: true,
          createdAt: 1,
        },
        {
          id: 'snippet-2',
          prefix: 'pay',
          name: '支付模板',
          description: '支付对账',
          body: 'SELECT * FROM pay_orders WHERE created_at >= ${1:start};',
          isBuiltin: false,
          createdAt: 2,
        },
      ],
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"totalMatched":1');
    expect(result.content).toContain('"prefix":"pay"');
    expect(result.content).toContain('"customCount":1');
    expect(result.content).toContain('pay_orders');
  });

  it('returns a database overview bundle with per-table column previews in one tool call', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_database_bundle', {
        connectionId: 'conn-1',
        dbName: 'crm',
        tableLimit: 5,
        perTableColumnLimit: 1,
      }),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn().mockResolvedValue({
          success: true,
          data: [{ Table: 'users' }, { Table: 'orders' }],
        }),
        getAllColumns: vi.fn().mockResolvedValue({
          success: true,
          data: [
            { TableName: 'users', Name: 'id', Type: 'bigint', Comment: '主键' },
            { TableName: 'users', Name: 'email', Type: 'varchar(255)', Comment: '邮箱' },
            { TableName: 'orders', Name: 'id', Type: 'bigint', Comment: '主键' },
          ],
        }),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"dbName":"crm"');
    expect(result.content).toContain('"tableCount":2');
    expect(result.content).toContain('"tableName":"users"');
    expect(result.content).toContain('"columnCount":2');
    expect(result.content).toContain('"truncatedColumns":true');
  });
});
