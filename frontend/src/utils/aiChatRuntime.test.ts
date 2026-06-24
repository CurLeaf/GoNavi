import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';

import { compressContextIfNeeded, getDynamicMaxContextChars, sanitizeErrorMsg } from './aiChatRuntime';
import { setCurrentLanguage } from '../i18n';

describe('aiChatRuntime', () => {
  afterEach(() => {
    setCurrentLanguage('zh-CN');
  });

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

  it('localizes runtime fallback errors while preserving raw details', () => {
    setCurrentLanguage('en-US');

    expect(sanitizeErrorMsg('')).toBe('Unknown error');
    expect(sanitizeErrorMsg('<html><body>HTTP 503</body></html>')).toBe('HTTP 503 server error');
    expect(sanitizeErrorMsg('<html><head><title>502 Bad Gateway</title></head></html>')).toBe('HTTP 502: 502 Bad Gateway');
    expect(sanitizeErrorMsg('<html><body>gateway timeout</body></html>')).toBe(
      'The server returned an abnormal HTML response, possibly a gateway timeout or unavailable service',
    );
    expect(sanitizeErrorMsg('x'.repeat(320))).toBe(`${'x'.repeat(280)}...(truncated)`);
    expect(sanitizeErrorMsg('permission denied')).toBe('permission denied');
  });

  it('keeps aiChatRuntime user-facing fallback copy behind i18n keys', () => {
    const source = readFileSync(new URL('./aiChatRuntime.ts', import.meta.url), 'utf8');

    expect(source).toContain("'ai_chat.panel.prompt.memory_summary'");
    expect(source).not.toContain('这是一段超长对话的历史记录');
    expect(source).not.toContain('注意：');
    expect(source).not.toContain('客观准确，不能遗漏关键业务逻辑或探索出的表名/字段');
    expect(source).not.toContain('⚙️ 对话已超载，正在启动记忆压缩...');
    expect(source).not.toContain('❌ 记忆压缩失败，将尝试原样接续...');
    expect(source).not.toContain("'未知错误'");
    expect(source).not.toContain('服务端返回了异常 HTML 响应');
    expect(source).not.toContain('服务端错误');
    expect(source).not.toContain('已截断');
  });

  it('skips compression when the payload is still within the configured limit', async () => {
    const result = await compressContextIfNeeded('session-1', [
      { role: 'user', content: 'short prompt' },
      { role: 'assistant', content: 'short answer' },
    ], 1000);

    expect(result).toBeNull();
  });
});
