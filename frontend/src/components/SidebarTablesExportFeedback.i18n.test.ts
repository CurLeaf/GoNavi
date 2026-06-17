import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');
const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'de-DE', 'ru-RU'] as const;
const requiredKeys = [
  'sidebar.message.export_tables_same_database_required',
  'sidebar.message.backing_up_selected_tables',
  'sidebar.message.exporting_selected_table_schema',
  'sidebar.message.export_success',
  'sidebar.message.export_failed',
] as const;

const extractHandleExportTablesBlock = (): string => {
  const start = source.indexOf('const handleExportTablesSQL = async');
  const end = source.indexOf('const openBatchOperationModal = async', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};

const placeholders = (value: string): string[] => [...value.matchAll(/\{\{(\w+)\}\}/g)]
  .map((match) => match[1])
  .sort();

describe('Sidebar tables export feedback i18n', () => {
  it('localizes handleExportTablesSQL validation, loading, success, and failure wrappers', () => {
    const block = extractHandleExportTablesBlock();

    expect(block).not.toContain("message.error('请在同一连接、同一数据库下选择多张表进行导出')");
    expect(block).not.toContain('`正在备份选中表 (${tableNames.length})...`');
    expect(block).not.toContain('`正在导出选中表结构 (${tableNames.length})...`');
    expect(block).not.toContain("message.success('导出成功')");
    expect(block).not.toContain("'导出失败: ' + res.message");
    expect(block).not.toContain("'导出失败: ' + (e?.message || String(e))");
    expect(block).toContain("t('sidebar.message.export_tables_same_database_required')");
    expect(block).toContain("t('sidebar.message.backing_up_selected_tables'");
    expect(block).toContain("t('sidebar.message.exporting_selected_table_schema'");
    expect(block).toContain("t('sidebar.message.export_success')");
    expect(block).toContain("t('sidebar.message.export_failed'");
    expect(block).toContain('count: tableNames.length');
    expect(block).toContain('error: res.message');
    expect(block).toContain('error: e?.message || String(e)');
  });

  it('keeps tables export feedback keys available with stable placeholders', () => {
    locales.forEach((locale) => {
      const catalog = JSON.parse(readFileSync(new URL(`../../../shared/i18n/${locale}.json`, import.meta.url), 'utf8')) as Record<string, string>;
      requiredKeys.forEach((key) => {
        expect(catalog[key], `${locale}:${key}`).toBeTruthy();
      });
      expect(placeholders(catalog['sidebar.message.export_tables_same_database_required'])).toEqual([]);
      expect(placeholders(catalog['sidebar.message.backing_up_selected_tables'])).toEqual(['count']);
      expect(placeholders(catalog['sidebar.message.exporting_selected_table_schema'])).toEqual(['count']);
      expect(placeholders(catalog['sidebar.message.export_success'])).toEqual([]);
      expect(placeholders(catalog['sidebar.message.export_failed'])).toEqual(['error']);
    });
  });
});
