import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');
const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'de-DE', 'ru-RU'] as const;
const requiredKeys = [
  'sidebar.message.load_database_list_failed',
  'sidebar.message.load_table_list_failed',
] as const;

const extractBatchObjectLoadBlock = (): string => {
  const start = source.indexOf('const loadDatabasesForBatch = async');
  const end = source.indexOf('const handleConnectionChange = async', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};

const placeholders = (value: string): string[] => [...value.matchAll(/\{\{(\w+)\}\}/g)]
  .map((match) => match[1])
  .sort();

describe('Sidebar batch object load feedback i18n', () => {
  it('localizes batch database and object list loading failure wrappers', () => {
    const block = extractBatchObjectLoadBlock();

    expect(block).not.toContain("'获取数据库列表失败: ' + res.message");
    expect(block).not.toContain("'获取表列表失败: ' + res.message");
    expect(block).toContain("t('sidebar.message.load_database_list_failed'");
    expect(block).toContain("t('sidebar.message.load_table_list_failed'");
    expect(block).toContain('error: res.message');
  });

  it('keeps batch object load feedback keys available with stable placeholders', () => {
    locales.forEach((locale) => {
      const catalog = JSON.parse(readFileSync(new URL(`../../../shared/i18n/${locale}.json`, import.meta.url), 'utf8')) as Record<string, string>;
      requiredKeys.forEach((key) => {
        expect(catalog[key], `${locale}:${key}`).toBeTruthy();
        expect(placeholders(catalog[key])).toEqual(['error']);
      });
    });
  });
});
