import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./sidebar/useSidebarBatchExport.ts', import.meta.url), 'utf8');
const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'de-DE', 'ru-RU'] as const;
const requiredKeys = [
  'sidebar.message.exporting_database_schema',
  'sidebar.message.exporting_database_backup',
  'sidebar.message.export_success',
  'sidebar.message.export_failed',
] as const;

const extractHandleExportDatabaseBlock = (): string => {
  const start = source.indexOf('const handleExportDatabaseSQL = async');
  const end = source.indexOf('const handleExportSchemaSQL = async', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};

const placeholders = (value: string): string[] => [...value.matchAll(/\{\{(\w+)\}\}/g)]
  .map((match) => match[1])
  .sort();

describe('Sidebar database export feedback i18n', () => {
  it('localizes handleExportDatabaseSQL loading, success, and failure wrappers', () => {
    const block = extractHandleExportDatabaseBlock();

    expect(block).not.toContain('`正在备份数据库 ${dbName} (结构+数据)...`');
    expect(block).not.toContain('`正在导出数据库 ${dbName} 表结构...`');
    expect(block).not.toContain("message.success('导出成功')");
    expect(block).not.toContain("'导出失败: ' + res.message");
    expect(block).not.toContain("'导出失败: ' + (e?.message || String(e))");
    expect(block).toContain("t('sidebar.message.exporting_database_backup'");
    expect(block).toContain("t('sidebar.message.exporting_database_schema'");
    expect(block).toContain("t('sidebar.message.export_success')");
    expect(block).toContain("t('sidebar.message.export_failed'");
    expect(block).toContain('database: dbName');
    expect(block).toContain('error: res.message');
    expect(block).toContain('error: e?.message || String(e)');
  });

  it('keeps database export feedback keys available with stable placeholders', () => {
    locales.forEach((locale) => {
      const catalog = JSON.parse(readFileSync(new URL(`../../../shared/i18n/${locale}.json`, import.meta.url), 'utf8')) as Record<string, string>;
      requiredKeys.forEach((key) => {
        expect(catalog[key], `${locale}:${key}`).toBeTruthy();
      });
      expect(placeholders(catalog['sidebar.message.exporting_database_schema'])).toEqual(['database']);
      expect(placeholders(catalog['sidebar.message.exporting_database_backup'])).toEqual(['database']);
      expect(placeholders(catalog['sidebar.message.export_success'])).toEqual([]);
      expect(placeholders(catalog['sidebar.message.export_failed'])).toEqual(['error']);
    });
  });
});
