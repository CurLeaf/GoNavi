import { describe, expect, it, vi } from 'vitest';

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

describe('aiLocalToolExecutor inspect_ai_upstream_logs', () => {
  it('returns sanitized upstream request payloads and request lifecycle summaries from gonavi.log', async () => {
    const readAppLogTail = vi.fn().mockResolvedValue({
      success: true,
      data: {
        logPath: 'C:/Users/demo/.GoNavi/Logs/gonavi.log',
        keyword: 'openai',
        requestedLineLimit: 160,
        fileWindowTruncated: false,
        matchedLinesTruncated: false,
        lines: [
          '2026/06/11 11:20:00.000000 [INFO] AI 上游请求开始：requestId=openai-123 provider=openai method=POST endpoint=https://api.example.com/v1/chat/completions?key=[REDACTED] body={"model":"gpt-5.5","messages":[{"role":"user","content":"hello"}],"api_key":"[REDACTED]"}',
          '2026/06/11 11:20:01.000000 [INFO] AI 上游请求完成：requestId=openai-123 provider=openai endpoint=https://api.example.com/v1/chat/completions?key=[REDACTED] status=200 duration=981ms',
          '2026/06/11 11:20:02.000000 [WARN] AI 上游请求失败：requestId=gemini-456 provider=gemini endpoint=https://generativelanguage.googleapis.com duration=2s err=upstream Authorization Bearer abcdefghijklmnopqrstuvwxyz failed',
        ],
      },
    });

    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_ai_upstream_logs', {
        provider: 'openai',
        includeBody: true,
      }),
      connections: [],
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
        readAppLogTail,
      },
    });

    expect(result.success).toBe(true);
    expect(readAppLogTail).toHaveBeenCalledWith(160, 'openai');
    expect(result.content).toContain('"logPath":"C:/Users/demo/.GoNavi/Logs/gonavi.log"');
    expect(result.content).toContain('"upstreamEventCount":2');
    expect(result.content).toContain('"requestId":"openai-123"');
    expect(result.content).toContain('"provider":"openai"');
    expect(result.content).toContain('"state":"completed"');
    expect(result.content).toContain('"status":200');
    expect(result.content).toContain('"bodyPreview"');
    expect(result.content).toContain('gpt-5.5');
    expect(result.content).not.toContain('abcdefghijklmnopqrstuvwxyz');
  });

  it('returns an actionable empty-state message when no upstream request log is available', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_ai_upstream_logs', {
        requestId: 'openai-missing',
      }),
      connections: [],
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
        readAppLogTail: vi.fn().mockResolvedValue({
          success: true,
          data: {
            logPath: 'C:/Users/demo/.GoNavi/Logs/gonavi.log',
            keyword: 'openai-missing',
            requestedLineLimit: 160,
            lines: [],
          },
        }),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"upstreamEventCount":0');
    expect(result.content).toContain('请先发送一次 AI 消息');
    expect(result.content).toContain('扩大 lineLimit');
  });
});
