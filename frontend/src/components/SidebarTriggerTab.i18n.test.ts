import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');

const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'de-DE', 'ru-RU'] as const;
const key = 'sidebar.tab.trigger';

describe('Sidebar trigger tab title i18n', () => {
  it('localizes trigger tab titles', () => {
    expect(source).not.toContain('title: `触发器: ${triggerName}`');
    expect(source).toContain(`title: t('${key}', { name: triggerName })`);
  });

  it('keeps the trigger tab key available in every locale', () => {
    locales.forEach((locale) => {
      const catalog = JSON.parse(readFileSync(new URL(`../../../shared/i18n/${locale}.json`, import.meta.url), 'utf8')) as Record<string, string>;
      expect(catalog[key], `${locale}:${key}`).toBeTruthy();
      expect(catalog[key], `${locale}:${key}`).toContain('{{name}}');
    });
  });
});
