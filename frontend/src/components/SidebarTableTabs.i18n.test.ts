import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');

const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'de-DE', 'ru-RU'] as const;
const requiredKeys = [
  'sidebar.tab.table_structure',
  'sidebar.tab.design_table',
  'sidebar.tab.new_table',
  'sidebar.tab.table_overview',
];

describe('Sidebar table tab title i18n', () => {
  it('localizes table design and overview tab titles', () => {
    [
      "title: `${forceReadOnly ? '表结构' : '设计表'} (${tableName})`",
      'title: `新建表 - ${dbName}`',
      'title: `表概览 - ${gDbName}${schemaName ? ` (${schemaName})` : \'\'}',
    ].forEach((snippet) => {
      expect(source).not.toContain(snippet);
    });

    requiredKeys.forEach((key) => {
      expect(source).toContain(`t('${key}'`);
    });
  });

  it('keeps table tab title keys available in every locale', () => {
    locales.forEach((locale) => {
      const catalog = JSON.parse(readFileSync(new URL(`../../../shared/i18n/${locale}.json`, import.meta.url), 'utf8')) as Record<string, string>;
      requiredKeys.forEach((key) => {
        expect(catalog[key], `${locale}:${key}`).toBeTruthy();
      });
    });
  });
});
