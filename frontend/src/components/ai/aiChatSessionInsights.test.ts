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
    expect(snapshot.warnings).toContain('有 1 个工具调用没有匹配到 tool 结果消息');
    expect(snapshot.nextActions).toContain('检查流式追加逻辑是否复用了同一个 assistantMsgId，而不是为同一轮回复新建 assistant 消息');
    expect(snapshot.messages[1]).toMatchObject({
      id: 'msg-2',
      toolCallNames: ['inspect_ai_runtime'],
      toolCallIds: ['tool-1'],
    });
  });
});
