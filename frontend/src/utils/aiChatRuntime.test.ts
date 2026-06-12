import { describe, expect, it } from 'vitest';

import { compressContextIfNeeded, getDynamicMaxContextChars, sanitizeErrorMsg } from './aiChatRuntime';

describe('aiChatRuntime', () => {
  it('maps modern model families to practical context windows', () => {
    expect(getDynamicMaxContextChars('gemini-2.5-pro')).toBe(5000000);
    expect(getDynamicMaxContextChars('gpt-5')).toBe(1000000);
    expect(getDynamicMaxContextChars('claude-4-sonnet')).toBe(1000000);
    expect(getDynamicMaxContextChars('gpt-4o')).toBe(128000);
    expect(getDynamicMaxContextChars()).toBe(258000);
  });

  it('sanitizes html gateway errors and truncates oversized plain text errors', () => {
    expect(sanitizeErrorMsg('<html><head><title>502 Bad Gateway</title></head></html>')).toBe('HTTP 502: 502 Bad Gateway');
    expect(sanitizeErrorMsg('x'.repeat(320))).toBe(`${'x'.repeat(280)}...(已截断)`);
    expect(sanitizeErrorMsg('permission denied')).toBe('permission denied');
  });

  it('skips compression when the payload is still within the configured limit', async () => {
    const result = await compressContextIfNeeded('session-1', [
      { role: 'user', content: 'short prompt' },
      { role: 'assistant', content: 'short answer' },
    ], 1000);

    expect(result).toBeNull();
  });
});
