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

describe('aiLocalToolExecutor local asset inspection tools', () => {
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

  it('returns local ai chat sessions so the model can locate previous conversations by title or preview', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_ai_sessions', {
        keyword: '支付',
        limit: 5,
      }),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      aiChatSessions: [
        { id: 'session-1', title: '支付异常排查', updatedAt: 200 },
        { id: 'session-2', title: '用户列表', updatedAt: 100 },
      ],
      aiChatHistory: {
        'session-1': [
          { id: 'msg-1', role: 'user', content: '帮我排查支付超时', timestamp: 101 },
          { id: 'msg-2', role: 'assistant', content: '先看最近错误日志', timestamp: 102 },
        ],
        'session-2': [
          { id: 'msg-3', role: 'user', content: '列出最近注册用户', timestamp: 103 },
        ],
      },
      activeSessionId: 'session-2',
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"totalMatched":1');
    expect(result.content).toContain('支付异常排查');
    expect(result.content).toContain('帮我排查支付超时');
    expect(result.content).toContain('先看最近错误日志');
    expect(result.content).not.toContain('列出最近注册用户');
  });

  it('returns ai message flow diagnostics for the active session', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_ai_message_flow', {
        limit: 8,
      }),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      aiChatSessions: [
        { id: 'session-1', title: '消息流异常', updatedAt: 200 },
      ],
      aiChatHistory: {
        'session-1': [
          { id: 'msg-1', role: 'user', content: 'AI 回复拆成多个气泡', timestamp: 101 },
          {
            id: 'msg-2',
            role: 'assistant',
            content: '先调用探针',
            timestamp: 102,
            tool_calls: [{ id: 'tool-1', type: 'function', function: { name: 'inspect_ai_runtime', arguments: '{}' } }],
          },
          { id: 'msg-3', role: 'assistant', content: '继续回答', timestamp: 103 },
        ],
      },
      activeSessionId: 'session-1',
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"requestedSessionId":"session-1"');
    expect(result.content).toContain('"unresolvedToolCallCount":1');
    expect(result.content).toContain('"consecutiveAssistantPairCount":1');
    expect(result.content).toContain('回复拆成多个气泡');
  });

  it('returns ai context budget diagnostics for the active session', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_ai_context_budget', {
        messageLimit: 10,
      }),
      connections: [buildConnection()],
      mcpTools: [{
        alias: 'remote_probe',
        originalName: 'remote_probe',
        serverId: 'server-1',
        serverName: '远程工具',
        inputSchema: {
          type: 'object',
          properties: {
            keyword: { type: 'string' },
          },
        },
      }],
      toolContextMap: new Map(),
      aiChatSessions: [
        { id: 'session-1', title: '上下文预算排查', updatedAt: 200 },
      ],
      aiChatHistory: {
        'session-1': [
          { id: 'msg-1', role: 'user', content: 'AI 变慢是不是上下文太大', timestamp: 101 },
          { id: 'msg-2', role: 'tool', content: 'x'.repeat(21000), timestamp: 102, tool_call_id: 'tool-1' },
        ],
      },
      activeSessionId: 'session-1',
      aiContexts: {
        'conn-1:crm': [
          { dbName: 'crm', tableName: 'orders', ddl: 'CREATE TABLE orders(id bigint, amount decimal(10,2));' },
        ],
      },
      skills: [{
        id: 'skill-1',
        name: 'SQL 审查',
        systemPrompt: '先检查风险',
        enabled: true,
        scopes: ['database'],
      }],
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"title":"上下文预算排查"');
    expect(result.content).toContain('"toolResultChars":21000');
    expect(result.content).toContain('"tableName":"orders"');
    expect(result.content).toContain('"mcpToolCount":1');
    expect(result.content).toContain('最近工具结果较长');
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
});
