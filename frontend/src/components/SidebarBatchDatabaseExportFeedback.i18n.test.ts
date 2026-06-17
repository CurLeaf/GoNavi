import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');
const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'de-DE', 'ru-RU'] as const;
const requiredKeys = [
  'sidebar.message.load_database_list_failed',
  'sidebar.message.select_database_required',
  'sidebar.message.exporting_database_schema',
  'sidebar.message.exporting_database_backup',
  'sidebar.message.database_export_success',
  'sidebar.message.database_export_failed',
] as const;

const extractBatchDatabaseExportBlock = (): string => {
  const start = source.indexOf('const loadDatabasesForDbBatch = async');
  const end = source.indexOf('const handleCheckAllDb = (checked: boolean)', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};

const placeholders = (value: string): string[] => [...value.matchAll(/\{\{(\w+)\}\}/g)]
  .map((match) => match[1])
  .sort();

describe('Sidebar batch database export feedback i18n', () => {
  it('localizes batch database export list loading, selection, progress, success, and failure wrappers', () => {
    const block = extractBatchDatabaseExportBlock();

    expect(block).not.toContain("'获取数据库列表失败: ' + res.message");
    expect(block).not.toContain("message.warning('请至少选择一个数据库')");
    expect(block).not.toContain('`正在备份数据库 ${db.dbName} (结构+数据)...`');
    expect(block).not.toContain('`正在导出数据库 ${db.dbName} 表结构...`');
    expect(block).not.toContain('`${db.dbName} 导出成功`');
    expect(block).not.toContain('`${db.dbName} 导出失败: ` + res.message');
    expect(block).not.toContain('`${db.dbName} 导出失败: ` + (e?.message || String(e))');
    expect(block).toContain("t('sidebar.message.load_database_list_failed'");
    expect(block).toContain("t('sidebar.message.select_database_required')");
    expect(block).toContain("t('sidebar.message.exporting_database_backup'");
    expect(block).toContain("t('sidebar.message.exporting_database_schema'");
    expect(block).toContain("t('sidebar.message.database_export_success'");
    expect(block).toContain("t('sidebar.message.database_export_failed'");
    expect(block).toContain('database: db.dbName');
    expect(block).toContain('error: res.message');
    expect(block).toContain('error: e?.message || String(e)');
    expect(block).toContain("res.message !== '已取消'");
  });

  it('keeps batch database export feedback keys available with stable placeholders', () => {
    locales.forEach((locale) => {
      const catalog = JSON.parse(readFileSync(new URL(`../../../shared/i18n/${locale}.json`, import.meta.url), 'utf8')) as Record<string, string>;
      requiredKeys.forEach((key) => {
        expect(catalog[key], `${locale}:${key}`).toBeTruthy();
      });
      expect(placeholders(catalog['sidebar.message.load_database_list_failed'])).toEqual(['error']);
      expect(placeholders(catalog['sidebar.message.select_database_required'])).toEqual([]);
      expect(placeholders(catalog['sidebar.message.exporting_database_schema'])).toEqual(['database']);
      expect(placeholders(catalog['sidebar.message.exporting_database_backup'])).toEqual(['database']);
      expect(placeholders(catalog['sidebar.message.database_export_success'])).toEqual(['database']);
      expect(placeholders(catalog['sidebar.message.database_export_failed'])).toEqual(['database', 'error']);
    });
  });
});
