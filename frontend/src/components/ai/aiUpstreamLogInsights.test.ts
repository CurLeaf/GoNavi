import { describe, expect, it } from 'vitest';

import { buildAIUpstreamLogSnapshot } from './aiUpstreamLogInsights';

describe('aiUpstreamLogInsights', () => {
  it('uses the provided translator for user-facing warnings and guidance', () => {
    const snapshot = buildAIUpstreamLogSnapshot({
      readResult: {
        data: {
          lines: [
            '2026/06/11 11:20:00.000000 [INFO] AI 上游请求开始：requestId=openai-123 provider=openai method=POST endpoint=https://api.example.com/v1/chat/completions body={not-json',
          ],
        },
      },
      includePayloadSummary: true,
      translate: (key) => ({
        'ai_chat.inspection.upstream_logs.warning.invalid_json': 'translated invalid JSON warning',
        'ai_chat.inspection.upstream_logs.next_action.filter_request_body': 'translated filter request body',
        'ai_chat.inspection.upstream_logs.next_action.inspect_timeout': 'translated inspect timeout',
      })[key] || key,
    });

    expect(snapshot.requests[0]?.bodySummary?.warnings).toContain('translated invalid JSON warning');
    expect(snapshot.nextActions).toContain('translated filter request body');
    expect(snapshot.nextActions).toContain('translated inspect timeout');
  });

  it('uses the provided translator for the empty upstream-log state', () => {
    const snapshot = buildAIUpstreamLogSnapshot({
      readResult: {
        data: {
          lines: [],
        },
      },
      translate: (key) => ({
        'ai_chat.inspection.upstream_logs.message.empty': 'translated empty message',
        'ai_chat.inspection.upstream_logs.next_action.confirm_logging': 'translated confirm logging',
        'ai_chat.inspection.upstream_logs.next_action.send_message': 'translated send message',
        'ai_chat.inspection.upstream_logs.next_action.read_warn_error': 'translated read warn error',
      })[key] || key,
    });

    expect(snapshot.message).toBe('translated empty message');
    expect(snapshot.nextActions).toEqual([
      'translated confirm logging',
      'translated send message',
      'translated read warn error',
    ]);
  });
});
