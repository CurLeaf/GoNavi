import { afterEach, describe, expect, it, vi } from 'vitest';

import { t as translateCatalog } from '../../i18n/catalog';
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

describe('aiLocalToolExecutor inspect_ai_last_render_error', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__gonaviLastAIMessageRenderError;
  });

  it('returns the last isolated ai message render error so the model can diagnose blank bubbles from real frontend evidence', async () => {
    (globalThis as Record<string, unknown>).__gonaviLastAIMessageRenderError = {
      messageId: 'msg-1',
      role: 'assistant',
      contentPreview: '这是一条触发渲染异常的 AI 回复预览',
      message: 'Cannot read properties of undefined',
      stack: 'TypeError: Cannot read properties of undefined\n    at Bubble.tsx:12:3',
      componentStack: '\n    at AIMessageBubble\n    at AIChatPanelConversationView',
      recordedAt: 1780700000000,
    };

    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_ai_last_render_error', {}),
      connections: [],
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"hasError":true');
    expect(result.content).toContain('"messageId":"msg-1"');
    expect(result.content).toContain('"role":"assistant"');
    expect(result.content).toContain('Cannot read properties of undefined');
    expect(result.content).toContain('AIMessageBubble');
  });

  it('returns an empty snapshot when no render failure has been recorded yet', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_ai_last_render_error', {}),
      connections: [],
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"hasError":false');
    expect(result.content).toContain('No AI message render errors have been recorded yet');
  });

  it('localizes the render error snapshot while preserving raw diagnostic fields', async () => {
    (globalThis as Record<string, unknown>).__gonaviLastAIMessageRenderError = {
      messageId: 'msg-raw-1',
      role: 'assistant',
      contentPreview: '原始 AI 回复预览 raw',
      message: 'Cannot read properties of undefined',
      stack: 'TypeError: Cannot read properties of undefined\n    at Bubble.tsx:12:3',
      componentStack: '\n    at AIMessageBubble',
      recordedAt: 1780700000000,
    };

    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_ai_last_render_error', {}),
      connections: [],
      mcpTools: [],
      toolContextMap: new Map(),
      translate: (key, params) => translateCatalog('en-US', key, params),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('A recent AI message render error was recorded');
    expect(result.content).toContain('Match messageId and contentPreview against the current conversation');
    expect(result.content).toContain('"messageId":"msg-raw-1"');
    expect(result.content).toContain('"contentPreview":"原始 AI 回复预览 raw"');
    expect(result.content).toContain('Cannot read properties of undefined');
    expect(result.content).toContain('AIMessageBubble');
  });
});
