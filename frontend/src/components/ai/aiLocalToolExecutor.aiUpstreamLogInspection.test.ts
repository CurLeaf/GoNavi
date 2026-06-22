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
    expect(result.content).toContain('"bodySummary"');
    expect(result.content).toContain('"messageCount":1');
    expect(result.content).toContain('"toolCount":0');
    expect(result.content).not.toContain('abcdefghijklmnopqrstuvwxyz');
  });

  it('summarizes payload shape without exposing prompt content when body preview is disabled', async () => {
    const readAppLogTail = vi.fn().mockResolvedValue({
      success: true,
      data: {
        logPath: 'C:/Users/demo/.GoNavi/Logs/gonavi.log',
        keyword: 'requestId=',
        requestedLineLimit: 160,
        lines: [
          '2026/06/11 13:20:00.000000 [INFO] AI 上游请求开始：requestId=openai-tools-123 provider=openai method=POST endpoint=https://api.example.com/v1/chat/completions body={"model":"gpt-5.5","stream":true,"messages":[{"role":"system","content":"system secret password=abc123"},{"role":"user","content":"user private text"}],"tools":[{"type":"function","function":{"name":"inspect_app_health","description":"inspect app","parameters":{"type":"object","properties":{}}}}],"tool_choice":"auto","response_format":{"type":"json_object"},"api_key":"sk-should-not-leak"}',
          '2026/06/11 13:20:01.000000 [INFO] AI 上游请求完成：requestId=openai-tools-123 provider=openai endpoint=https://api.example.com/v1/chat/completions status=200 duration=981ms',
        ],
      },
    });

    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_ai_upstream_logs', {
        includeBody: false,
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
    expect(readAppLogTail).toHaveBeenCalledWith(160, 'requestId=');
    expect(result.content).toContain('"payloadSummaryEnabled":true');
    expect(result.content).toContain('"keyword":""');
    expect(result.content).not.toContain('"bodyPreview"');
    expect(result.content).not.toContain('password=abc123');
    expect(result.content).not.toContain('user private text');
    expect(result.content).not.toContain('sk-should-not-leak');
    expect(result.content).toContain('"bodySummary"');
    expect(result.content).toContain('"model":"gpt-5.5"');
    expect(result.content).toContain('"messageCount":2');
    expect(result.content).toContain('"system":1');
    expect(result.content).toContain('"user":1');
    expect(result.content).toContain('"toolCount":1');
    expect(result.content).toContain('"toolNames":["inspect_app_health"]');
    expect(result.content).toContain('"hasStream":true');
    expect(result.content).toContain('"hasToolChoice":true');
    expect(result.content).toContain('"hasResponseFormat":true');
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
      translate: (key) => ({
        'ai_chat.inspection.upstream_logs.message.empty': 'translated executor empty message',
        'ai_chat.inspection.upstream_logs.next_action.confirm_logging': 'translated executor confirm logging',
        'ai_chat.inspection.upstream_logs.next_action.send_message': 'translated executor send message',
        'ai_chat.inspection.upstream_logs.next_action.read_warn_error': 'translated executor read warn error',
      })[key] || key,
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"upstreamEventCount":0');
    expect(result.content).toContain('translated executor empty message');
    expect(result.content).toContain('translated executor send message');
  });

  it('summarizes CLI upstream requests that complete without an HTTP status code', async () => {
    const readAppLogTail = vi.fn().mockResolvedValue({
      success: true,
      data: {
        logPath: 'C:/Users/demo/.GoNavi/Logs/gonavi.log',
        keyword: 'ClaudeCLI',
        requestedLineLimit: 160,
        lines: [
          '2026/06/11 12:20:00.000000 [INFO] AI 上游请求开始：requestId=claudecli-123 provider=ClaudeCLI method=CLI endpoint=https://proxy.example.com/api/anthropic body={"command":"claude","args":["-p","[prompt logged separately]"],"prompt":"hello","has_api_key":true}',
          '2026/06/11 12:20:01.000000 [INFO] AI 上游请求完成：requestId=claudecli-123 provider=ClaudeCLI endpoint=https://proxy.example.com/api/anthropic duration=981ms',
        ],
      },
    });

    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_ai_upstream_logs', {
        provider: 'ClaudeCLI',
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
    expect(readAppLogTail).toHaveBeenCalledWith(160, 'ClaudeCLI');
    expect(result.content).toContain('"requestId":"claudecli-123"');
    expect(result.content).toContain('"provider":"ClaudeCLI"');
    expect(result.content).toContain('"method":"CLI"');
    expect(result.content).toContain('"state":"completed"');
    expect(result.content).toContain('"duration":"981ms"');
    expect(result.content).toContain('"hasBody":true');
    expect(result.content).not.toContain('"status":0');
  });
});
