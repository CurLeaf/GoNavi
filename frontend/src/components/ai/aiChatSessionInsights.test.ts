import { describe, expect, it } from 'vitest';

import {
  buildAIChatSessionsSnapshot,
  buildAIMessageFlowSnapshot,
} from './aiChatSessionInsights';

describe('aiChatSessionInsights', () => {
  it('filters and summarizes ai sessions with previews from local history', () => {
    const snapshot = buildAIChatSessionsSnapshot({
      aiChatSessions: [
        { id: 'session-1', title: '支付异常排查', updatedAt: 200 },
        { id: 'session-2', title: '库存核对', updatedAt: 100 },
      ],
      aiChatHistory: {
        'session-1': [
          { id: 'msg-1', role: 'user', content: '帮我看支付超时', timestamp: 101 },
          { id: 'msg-2', role: 'assistant', content: '先检查支付回调日志', timestamp: 102 },
        ],
        'session-2': [
          { id: 'msg-3', role: 'user', content: '库存差异怎么查', timestamp: 103 },
        ],
      },
      activeSessionId: 'session-2',
      keyword: '支付',
      limit: 5,
    });

    expect(snapshot.totalSessions).toBe(2);
    expect(snapshot.totalMatched).toBe(1);
    expect(snapshot.sessions[0]).toMatchObject({
      id: 'session-1',
      title: '支付异常排查',
      isActive: false,
      messageCount: 2,
      firstUserPromptPreview: '帮我看支付超时',
      latestMessagePreview: '先检查支付回调日志',
    });
  });

  it('diagnoses active ai message flow anomalies', () => {
    const snapshot = buildAIMessageFlowSnapshot({
      aiChatSessions: [
        { id: 'session-1', title: '气泡异常排查', updatedAt: 300 },
      ],
      aiChatHistory: {
        'session-1': [
          { id: 'msg-1', role: 'user', content: '为什么回复变成多个气泡', timestamp: 101 },
          {
            id: 'msg-2',
            role: 'assistant',
            content: '我先检查消息流',
            timestamp: 102,
            tool_calls: [{ id: 'tool-1', type: 'function', function: { name: 'inspect_ai_runtime', arguments: '{}' } }],
          },
          { id: 'msg-3', role: 'assistant', content: '这里被拆成了第二个气泡', timestamp: 103 },
          { id: 'msg-4', role: 'assistant', content: '', timestamp: 104 },
        ],
      },
      activeSessionId: 'session-1',
      limit: 10,
    });

    expect(snapshot.found).toBe(true);
    expect(snapshot.title).toBe('气泡异常排查');
    expect(snapshot.totalMessages).toBe(4);
    expect(snapshot.unresolvedToolCallCount).toBe(1);
    expect(snapshot.consecutiveAssistantPairCount).toBe(2);
    expect(snapshot.emptyAssistantMessageCount).toBe(1);
    expect(snapshot.warnings).toContain('1 tool calls have no matching tool result messages.');
    expect(snapshot.nextActions).toContain('Check whether streaming append logic reuses the same assistantMsgId instead of creating a new assistant message for the same reply.');
    expect(snapshot.messages[1]).toMatchObject({
      id: 'msg-2',
      toolCallNames: ['inspect_ai_runtime'],
      toolCallIds: ['tool-1'],
    });
  });

  it('localizes diagnostic wrappers while keeping raw session and tool data', () => {
    const translate = (key: string, params?: Record<string, unknown>) => {
      const entries: Record<string, string> = {
        'ai_chat.inspection.ai_sessions.untitled': 'Untitled localized',
        'ai_chat.inspection.message_flow.warning.unresolved_tool_calls': `missing tool results: ${params?.count}`,
        'ai_chat.inspection.message_flow.warning.consecutive_assistant': `consecutive assistant: ${params?.count}`,
        'ai_chat.inspection.message_flow.warning.empty_assistant': `empty assistant: ${params?.count}`,
        'ai_chat.inspection.message_flow.warning.loading_message': 'loading message remains',
        'ai_chat.inspection.message_flow.next_action.check_tool_results': 'check tool result writes',
        'ai_chat.inspection.message_flow.next_action.check_stream_append': 'check assistant append id',
        'ai_chat.inspection.message_flow.next_action.check_empty_assistant': 'check empty assistant cleanup',
      };
      return entries[key] || key;
    };

    const sessionsSnapshot = buildAIChatSessionsSnapshot({
      aiChatSessions: [{ id: 'session-raw', title: '', updatedAt: 0 }],
      aiChatHistory: {
        'session-raw': [
          { id: 'msg-user', role: 'user', content: '保留原始用户输入', timestamp: 1 },
        ],
      },
      translate,
    });

    const flowSnapshot = buildAIMessageFlowSnapshot({
      aiChatSessions: [{ id: 'session-raw', title: '原始标题', updatedAt: 10 }],
      aiChatHistory: {
        'session-raw': [
          { id: 'msg-user', role: 'user', content: '保留原始消息', timestamp: 1 },
          {
            id: 'msg-assistant-1',
            role: 'assistant',
            content: '',
            timestamp: 2,
            tool_calls: [{ id: 'tool-raw-id', type: 'function', function: { name: 'inspect_app_logs', arguments: '{}' } }],
          },
          { id: 'msg-assistant-2', role: 'assistant', content: '', timestamp: 3 },
          { id: 'msg-assistant-3', role: 'assistant', content: '仍在生成', timestamp: 4, loading: true },
        ],
      },
      activeSessionId: 'session-raw',
      translate,
    });

    expect(sessionsSnapshot.sessions[0].title).toBe('Untitled localized');
    expect(sessionsSnapshot.sessions[0].firstUserPromptPreview).toBe('保留原始用户输入');
    expect(flowSnapshot.title).toBe('原始标题');
    expect(flowSnapshot.warnings).toEqual([
      'missing tool results: 1',
      'consecutive assistant: 2',
      'empty assistant: 1',
      'loading message remains',
    ]);
    expect(flowSnapshot.nextActions).toEqual([
      'check tool result writes',
      'check assistant append id',
      'check empty assistant cleanup',
    ]);
    expect(flowSnapshot.messages[1].toolCallNames).toEqual(['inspect_app_logs']);
  });
});
