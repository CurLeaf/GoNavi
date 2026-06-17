import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');
const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'de-DE', 'ru-RU'] as const;
const requiredKeys = [
  'sidebar.message.exporting_table_format',
  'sidebar.message.export_success',
  'sidebar.message.export_failed',
] as const;

const extractHandleExportBlock = (): string => {
  const start = source.indexOf('const handleExport = async');
  const end = source.indexOf('const handleCopyTableAsInsert', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};

const placeholders = (value: string): string[] => [...value.matchAll(/\{\{(\w+)\}\}/g)]
  .map((match) => match[1])
  .sort();

describe('Sidebar table export feedback i18n', () => {
  it('localizes handleExport loading, success, and failure wrappers', () => {
    const block = extractHandleExportBlock();

    expect(block).not.toContain('`正在导出 ${tableName} 为 ${format.toUpperCase()}...`');
    expect(block).not.toContain("message.success('导出成功')");
    expect(block).not.toContain("'导出失败: ' + res.message");
    expect(block).toContain("t('sidebar.message.exporting_table_format'");
    expect(block).toContain("t('sidebar.message.export_success')");
    expect(block).toContain("t('sidebar.message.export_failed'");
    expect(block).toContain('table: tableName');
    expect(block).toContain('format: format.toUpperCase()');
    expect(block).toContain('error: res.message');
  });

  it('keeps table export feedback keys available with stable placeholders', () => {
    locales.forEach((locale) => {
      const catalog = JSON.parse(readFileSync(new URL(`../../../shared/i18n/${locale}.json`, import.meta.url), 'utf8')) as Record<string, string>;
      requiredKeys.forEach((key) => {
        expect(catalog[key], `${locale}:${key}`).toBeTruthy();
      });
      expect(placeholders(catalog['sidebar.message.exporting_table_format'])).toEqual(['format', 'table']);
      expect(placeholders(catalog['sidebar.message.export_success'])).toEqual([]);
      expect(placeholders(catalog['sidebar.message.export_failed'])).toEqual(['error']);
    });
  });
});
