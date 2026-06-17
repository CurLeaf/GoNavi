import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');
const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'de-DE', 'ru-RU'] as const;
const requiredKeys = [
  'sidebar.message.select_object_required',
  'sidebar.message.backing_up_selected_objects',
  'sidebar.message.exporting_selected_object_data',
  'sidebar.message.exporting_selected_object_schema',
  'sidebar.message.export_success',
  'sidebar.message.export_success_skipped_views',
  'sidebar.message.export_failed',
] as const;

const extractHandleBatchExportBlock = (): string => {
  const start = source.indexOf('const handleBatchExport = async');
  const end = source.indexOf('const handleBatchClear = async', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};

const placeholders = (value: string): string[] => [...value.matchAll(/\{\{(\w+)\}\}/g)]
  .map((match) => match[1])
  .sort();

describe('Sidebar batch object export feedback i18n', () => {
  it('localizes handleBatchExport validation, loading, success, and failure wrappers', () => {
    const block = extractHandleBatchExportBlock();

    expect(block).not.toContain("message.warning('请至少选择一个对象')");
    expect(block).not.toContain('`正在备份选中对象 (${objectNames.length})...`');
    expect(block).not.toContain('`正在导出选中对象数据 (INSERT) (${objectNames.length})...`');
    expect(block).not.toContain('`正在导出选中对象结构 (${objectNames.length})...`');
    expect(block).not.toContain('`导出成功（已自动跳过 ${selectedViewCount} 个视图的数据导出）`');
    expect(block).not.toContain("message.success('导出成功')");
    expect(block).not.toContain("'导出失败: ' + res.message");
    expect(block).not.toContain("'导出失败: ' + (e?.message || String(e))");
    expect(block).toContain("t('sidebar.message.select_object_required')");
    expect(block).toContain("t('sidebar.message.backing_up_selected_objects'");
    expect(block).toContain("t('sidebar.message.exporting_selected_object_data'");
    expect(block).toContain("t('sidebar.message.exporting_selected_object_schema'");
    expect(block).toContain("t('sidebar.message.export_success_skipped_views'");
    expect(block).toContain("t('sidebar.message.export_success')");
    expect(block).toContain("t('sidebar.message.export_failed'");
    expect(block).toContain('count: objectNames.length');
    expect(block).toContain("format: 'INSERT'");
    expect(block).toContain('count: selectedViewCount');
    expect(block).toContain('error: res.message');
    expect(block).toContain('error: e?.message || String(e)');
    expect(block).toContain("res.message !== '已取消'");
  });

  it('keeps batch object export feedback keys available with stable placeholders', () => {
    locales.forEach((locale) => {
      const catalog = JSON.parse(readFileSync(new URL(`../../../shared/i18n/${locale}.json`, import.meta.url), 'utf8')) as Record<string, string>;
      requiredKeys.forEach((key) => {
        expect(catalog[key], `${locale}:${key}`).toBeTruthy();
      });
      expect(placeholders(catalog['sidebar.message.select_object_required'])).toEqual([]);
      expect(placeholders(catalog['sidebar.message.backing_up_selected_objects'])).toEqual(['count']);
      expect(placeholders(catalog['sidebar.message.exporting_selected_object_data'])).toEqual(['count', 'format']);
      expect(placeholders(catalog['sidebar.message.exporting_selected_object_schema'])).toEqual(['count']);
      expect(placeholders(catalog['sidebar.message.export_success'])).toEqual([]);
      expect(placeholders(catalog['sidebar.message.export_success_skipped_views'])).toEqual(['count']);
      expect(placeholders(catalog['sidebar.message.export_failed'])).toEqual(['error']);
    });
  });
});
