import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');
const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'de-DE', 'ru-RU'] as const;

describe('Sidebar view definition tab i18n', () => {
  it('localizes view and materialized view definition tab titles', () => {
    expect(source).not.toContain("title: `${isMaterialized ? '物化视图' : '视图'}: ${viewName}`");
    expect(source).toContain("title: t(isMaterialized ? 'sidebar.tab.materialized_view_definition' : 'sidebar.tab.view_definition'");
  });

  it('keeps view definition tab placeholders aligned in every locale', () => {
    locales.forEach((locale) => {
      const catalog = JSON.parse(readFileSync(new URL(`../../../shared/i18n/${locale}.json`, import.meta.url), 'utf8')) as Record<string, string>;
      expect(catalog['sidebar.tab.view_definition'], `${locale}:view definition`).toContain('{{name}}');
      expect(catalog['sidebar.tab.materialized_view_definition'], `${locale}:materialized view definition`).toContain('{{name}}');
    });
  });
});
