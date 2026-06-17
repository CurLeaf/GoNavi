import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');

const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'de-DE', 'ru-RU'] as const;
const key = 'sidebar.tab.edit_event';

describe('Sidebar edit event tab title i18n', () => {
  it('localizes edit event query tab titles', () => {
    expect(source).not.toContain('title: `编辑事件: ${eventName}`');
    expect(source).toContain(`title: t('${key}', { name: eventName })`);
  });

  it('keeps the edit event tab key available in every locale', () => {
    locales.forEach((locale) => {
      const catalog = JSON.parse(readFileSync(new URL(`../../../shared/i18n/${locale}.json`, import.meta.url), 'utf8')) as Record<string, string>;
      expect(catalog[key], `${locale}:${key}`).toBeTruthy();
      expect(catalog[key], `${locale}:${key}`).toContain('{{name}}');
    });
  });
});
