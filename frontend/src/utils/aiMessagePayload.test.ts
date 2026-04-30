import { describe, expect, it } from 'vitest';
import type { AIChatMessage, AIToolCall } from '../types';
import { toAIRequestMessage } from './aiMessagePayload';

const toolCall: AIToolCall = {
  id: 'call_schema',
  type: 'function',
  function: {
    name: 'inspect_table_schema',
    arguments: '{"table":"orders"}',
  },
};

const message = (overrides: Partial<AIChatMessage>): AIChatMessage => ({
  id: 'msg-1',
  role: 'assistant',
  content: '',
  timestamp: 1,
  ...overrides,
});

describe('toAIRequestMessage', () => {
  it('keeps reasoning_content on assistant tool-call messages', () => {
    const payload = toAIRequestMessage(message({
      tool_calls: [toolCall],
      reasoning_content: '需要先检查表结构',
    }));

    expect(payload).toMatchObject({
      role: 'assistant',
      tool_calls: [toolCall],
      reasoning_content: '需要先检查表结构',
    });
  });

  it('keeps reasoning_content on assistant messages without tool calls', () => {
    const payload = toAIRequestMessage(message({
      content: '最终分析',
      reasoning_content: '工具调用轮次的最终思考也需要保留',
    }));

    expect(payload).toMatchObject({
      role: 'assistant',
      content: '最终分析',
      reasoning_content: '工具调用轮次的最终思考也需要保留',
    });
  });

  it('omits reasoning_content from tool result messages while keeping tool_call_id', () => {
    const payload = toAIRequestMessage(message({
      role: 'tool',
      content: '{"ok":true}',
      tool_call_id: 'call_schema',
      reasoning_content: '不应回传',
    }));

    expect(payload).toMatchObject({
      role: 'tool',
      content: '{"ok":true}',
      tool_call_id: 'call_schema',
    });
    expect(payload).not.toHaveProperty('reasoning_content');
  });

  it('keeps user images without adding empty tool fields', () => {
    const payload = toAIRequestMessage(message({
      role: 'user',
      content: '看图',
      images: ['data:image/png;base64,abc'],
    }));

    expect(payload).toEqual({
      role: 'user',
      content: '看图',
      images: ['data:image/png;base64,abc'],
    });
  });
});
