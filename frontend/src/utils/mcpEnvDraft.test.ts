import { describe, expect, it } from 'vitest';

import { formatMCPEnvDraft, parseMCPEnvDraft } from './mcpEnvDraft';

describe('mcpEnvDraft helpers', () => {
  it('formats env objects into editable KEY=VALUE lines', () => {
    expect(formatMCPEnvDraft({
      OPENAI_API_KEY: 'abc',
      BASE_URL: 'https://example.com',
    })).toBe('OPENAI_API_KEY=abc\nBASE_URL=https://example.com');
  });

  it('parses valid env lines and preserves invalid ones for warning', () => {
    const result = parseMCPEnvDraft([
      'OPENAI_API_KEY=abc',
      'BAD LINE',
      'HAS SPACE =wrong',
      'EMPTY_VALUE=',
      'BASE_URL=https://example.com?a=1',
    ].join('\n'));

    expect(result.env).toEqual({
      OPENAI_API_KEY: 'abc',
      EMPTY_VALUE: '',
      BASE_URL: 'https://example.com?a=1',
    });
    expect(result.validLines).toBe(3);
    expect(result.invalidLines).toEqual(['BAD LINE', 'HAS SPACE =wrong']);
    expect(result.totalLines).toBe(5);
  });
});
