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

const translateAttachmentPrompt = (
  key: string,
  params?: Record<string, string | number | boolean | null | undefined>,
): string => ({
  'ai_chat.input.attachment.kind.markdown': 'Markdown',
  'ai_chat.input.attachment.prompt.heading': `### Attachment ${params?.index}: ${params?.name}`,
  'ai_chat.input.attachment.prompt.kind': `- Type: ${params?.kind}`,
  'ai_chat.input.attachment.prompt.mime': `- MIME: ${params?.mimeType}`,
  'ai_chat.input.attachment.prompt.size': `- Size: ${params?.size}`,
  'ai_chat.input.attachment.prompt.no_text': 'No readable attachment body was extracted.',
  'ai_chat.input.attachment.prompt.default_user_content': 'Continue based on the following attachment content.',
  'ai_chat.input.attachment.prompt.wrapper_start': '<User Uploaded Attachments>',
  'ai_chat.input.attachment.prompt.wrapper_end': '</User Uploaded Attachments>',
}[key] || key);

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

  it('appends extracted file attachment content to the user request payload', () => {
    const payload = toAIRequestMessage(message({
      role: 'user',
      content: '帮我看附件',
      attachments: [{
        id: 'att-1',
        name: 'report.md',
        mimeType: 'text/markdown',
        size: 24,
        kind: 'markdown',
        text: '# 周报\n收入下降',
      }],
    }), translateAttachmentPrompt as any);

    expect(payload.content).toContain('帮我看附件');
    expect(payload.content).toContain('<User Uploaded Attachments>');
    expect(payload.content).toContain('### Attachment 1: report.md');
    expect(payload.content).toContain('report.md');
    expect(payload.content).toContain('收入下降');
    expect(payload.content).not.toContain('<用户上传附件>');
  });
});
