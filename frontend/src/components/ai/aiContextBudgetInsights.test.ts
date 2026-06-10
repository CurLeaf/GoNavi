import { describe, expect, it } from 'vitest';

import { buildAIContextBudgetSnapshot } from './aiContextBudgetInsights';

describe('aiContextBudgetInsights', () => {
  it('summarizes context budget sources and warns when schema/tool results are oversized', () => {
    const longToolResult = 'x'.repeat(22000);
    const longDDL = `CREATE TABLE big_table (${Array.from({ length: 300 }, (_, index) => `c${index} varchar(255)`).join(',')})`;
    const snapshot = buildAIContextBudgetSnapshot({
      activeSessionId: 'session-1',
      aiChatSessions: [{ id: 'session-1', title: '上下文体量排查', updatedAt: 1 }],
      aiChatHistory: {
        'session-1': [
          { id: 'msg-1', role: 'user', content: 'AI 变慢了', timestamp: 1 },
          {
            id: 'msg-2',
            role: 'assistant',
            content: '先看日志',
            timestamp: 2,
            tool_calls: [{ id: 'tool-1', type: 'function', function: { name: 'inspect_app_logs', arguments: '{}' } }],
          },
          { id: 'msg-3', role: 'tool', content: longToolResult, timestamp: 3, tool_call_id: 'tool-1' },
        ],
      },
      aiContexts: {
        'conn-1:crm': [
          { dbName: 'crm', tableName: 'big_table', ddl: longDDL },
        ],
      },
      mcpTools: [{
        alias: 'remote_probe',
        serverId: 'mcp-1',
        serverName: 'demo',
        originalName: 'probe',
        inputSchema: {
          type: 'object',
          properties: Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`field${index}`, { type: 'string' }])),
        },
      }],
      skills: [{
        id: 'skill-1',
        name: '结构审查',
        systemPrompt: '先看结构',
        enabled: true,
        scopes: ['database'],
      }],
      userPromptSettings: {
        global: '全局提示',
        database: '数据库提示',
        jvm: '',
        jvmDiagnostic: '',
      },
    });

    expect(snapshot.foundSession).toBe(true);
    expect(snapshot.title).toBe('上下文体量排查');
    expect(snapshot.messageWindow.toolResultChars).toBe(22000);
    expect(snapshot.messageWindow.unresolvedToolCallCount).toBe(0);
    expect(snapshot.schemaContext.tableCount).toBe(1);
    expect(snapshot.schemaContext.largestTables[0]).toMatchObject({ tableName: 'big_table' });
    expect(snapshot.toolCatalog.mcpToolCount).toBe(1);
    expect(snapshot.promptsAndSkills.enabledSkillNames).toContain('结构审查');
    expect(snapshot.warnings).toContain('最近工具结果较长，可能导致后续回答被日志或大结果集稀释');
    expect(snapshot.nextActions).toContain('降低 inspect_app_logs / inspect_recent_sql_logs / includeDDL / includeLogLines 的返回量');
  });

  it('reports missing sessions and unresolved tool calls', () => {
    const snapshot = buildAIContextBudgetSnapshot({
      activeSessionId: 'missing',
      aiChatSessions: [],
      aiChatHistory: {
        missing: [
          {
            id: 'msg-1',
            role: 'assistant',
            content: '调用工具',
            timestamp: 1,
            tool_calls: [{ id: 'tool-1', type: 'function', function: { name: 'inspect_ai_runtime', arguments: '{}' } }],
          },
        ],
      },
      includeDetails: false,
    });

    expect(snapshot.foundSession).toBe(false);
    expect(snapshot.messageWindow.unresolvedToolCallCount).toBe(1);
    expect(snapshot.warnings).toContain('未找到目标 AI 会话，消息体量统计只覆盖空窗口');
    expect(snapshot.warnings).toContain('最近消息窗口内有 1 个未闭环工具调用');
    expect(snapshot.nextActions).toContain('先调用 inspect_ai_message_flow 确认工具调用是否缺少 tool 结果消息');
  });
});
