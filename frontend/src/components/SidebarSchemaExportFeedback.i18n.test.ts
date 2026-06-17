import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');
const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'de-DE', 'ru-RU'] as const;
const requiredKeys = [
  'sidebar.message.schema_export_target_missing',
  'sidebar.message.exporting_schema_structure',
  'sidebar.message.exporting_schema_backup',
  'sidebar.message.export_success',
  'sidebar.message.export_failed',
] as const;

const extractHandleExportSchemaBlock = (): string => {
  const start = source.indexOf('const handleExportSchemaSQL = async');
  const end = source.indexOf('const handleExportTablesSQL = async', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};

const placeholders = (value: string): string[] => [...value.matchAll(/\{\{(\w+)\}\}/g)]
  .map((match) => match[1])
  .sort();

describe('Sidebar schema export feedback i18n', () => {
  it('localizes handleExportSchemaSQL target, loading, success, and failure wrappers', () => {
    const block = extractHandleExportSchemaBlock();

    expect(block).not.toContain("message.error('未找到目标模式，无法导出')");
    expect(block).not.toContain('`正在备份模式 ${schemaName} (结构+数据)...`');
    expect(block).not.toContain('`正在导出模式 ${schemaName} 表结构...`');
    expect(block).not.toContain("message.success('导出成功')");
    expect(block).not.toContain("'导出失败: ' + res.message");
    expect(block).not.toContain("'导出失败: ' + (e?.message || String(e))");
    expect(block).toContain("t('sidebar.message.schema_export_target_missing')");
    expect(block).toContain("t('sidebar.message.exporting_schema_backup'");
    expect(block).toContain("t('sidebar.message.exporting_schema_structure'");
    expect(block).toContain("t('sidebar.message.export_success')");
    expect(block).toContain("t('sidebar.message.export_failed'");
    expect(block).toContain('schema: schemaName');
    expect(block).toContain('error: res.message');
    expect(block).toContain('error: e?.message || String(e)');
  });

  it('keeps schema export feedback keys available with stable placeholders', () => {
    locales.forEach((locale) => {
      const catalog = JSON.parse(readFileSync(new URL(`../../../shared/i18n/${locale}.json`, import.meta.url), 'utf8')) as Record<string, string>;
      requiredKeys.forEach((key) => {
        expect(catalog[key], `${locale}:${key}`).toBeTruthy();
      });
      expect(placeholders(catalog['sidebar.message.schema_export_target_missing'])).toEqual([]);
      expect(placeholders(catalog['sidebar.message.exporting_schema_structure'])).toEqual(['schema']);
      expect(placeholders(catalog['sidebar.message.exporting_schema_backup'])).toEqual(['schema']);
      expect(placeholders(catalog['sidebar.message.export_success'])).toEqual([]);
      expect(placeholders(catalog['sidebar.message.export_failed'])).toEqual(['error']);
    });
  });
});
