import { describe, expect, it } from 'vitest';

import { buildAIChatSessionsSnapshot } from './aiChatSessionInsights';

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
});
