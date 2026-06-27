import { describe, expect, it } from 'vitest';

import { buildAIContextBudgetSnapshot } from './aiContextBudgetInsights';

describe('aiContextBudgetInsights', () => {
  it('localizes controlled warnings and actions while preserving raw context identifiers', () => {
    const translate = (key: string, params?: Record<string, unknown>) => {
      const messages: Record<string, string> = {
        'ai_chat.inspection.context_budget.warning.high_risk': 'HIGH CONTEXT',
        'ai_chat.inspection.context_budget.warning.large_messages': 'LARGE MESSAGES',
        'ai_chat.inspection.context_budget.warning.unresolved_tool_calls': `OPEN TOOLS ${params?.count || ''}`,
        'ai_chat.inspection.context_budget.next_action.summarize_or_new_session': 'SUMMARIZE',
        'ai_chat.inspection.context_budget.next_action.inspect_message_flow': 'CHECK FLOW',
      };
      return messages[key] || key;
    };

    const snapshot = buildAIContextBudgetSnapshot({
      activeSessionId: 'session-1',
      aiChatSessions: [{ id: 'session-1', title: '上下文预算排查', updatedAt: 1 }],
      aiChatHistory: {
        'session-1': [
          {
            id: 'msg-1',
            role: 'assistant',
            content: 'x'.repeat(70000),
            timestamp: 1,
            tool_calls: [{ id: 'tool-1', type: 'function', function: { name: 'inspect_app_logs', arguments: '{}' } }],
          },
        ],
      },
      aiContexts: {
        'conn-1:crm': [
          { dbName: 'crm', tableName: 'orders', ddl: 'CREATE TABLE orders(id bigint);' },
        ],
      },
      skills: [{
        id: 'skill-1',
        name: 'SQL 审查',
        systemPrompt: '先检查风险',
        enabled: true,
        scopes: ['database'],
      }],
      translate,
    });

    expect(snapshot.title).toBe('上下文预算排查');
    expect(snapshot.schemaContext.largestTables[0]?.tableName).toBe('orders');
    expect(snapshot.promptsAndSkills.enabledSkillNames).toContain('SQL 审查');
    expect(snapshot.warnings).toContain('HIGH CONTEXT');
    expect(snapshot.warnings).toContain('LARGE MESSAGES');
    expect(snapshot.warnings).toContain('OPEN TOOLS 1');
    expect(snapshot.nextActions).toContain('SUMMARIZE');
    expect(snapshot.nextActions).toContain('CHECK FLOW');
  });

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
    expect(snapshot.warnings).toContain('Recent tool results are long and may dilute later answers with logs or large result sets');
    expect(snapshot.nextActions).toContain('Reduce the returned volume from inspect_app_logs / inspect_recent_sql_logs / includeDDL / includeLogLines');
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
    expect(snapshot.warnings).toContain('The target AI session was not found, so message volume statistics only cover an empty window');
    expect(snapshot.warnings).toContain('The recent message window contains 1 unclosed tool calls');
    expect(snapshot.nextActions).toContain('Call inspect_ai_message_flow first to confirm whether tool calls are missing tool result messages');
  });
});
