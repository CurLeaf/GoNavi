import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./sidebar/useSidebarBatchExport.ts', import.meta.url), 'utf8');
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
  it('routes the selected objects and export mode into the background workbench', () => {
    const block = extractHandleBatchExportBlock();

    expect(block).toContain("t('sidebar.message.select_object_required')");
    expect(block).toContain("mode === 'dataOnly'");
    expect(block).toContain('addTab(buildBatchTableExportWorkbenchTab({');
    expect(block).toContain('initialObjectNames: objectNames');
    expect(block).toContain('contentMode: mode');
    expect(block).toContain('includeDropIfExists: exportOptions.includeDropIfExists');
    expect(block).toContain("requestKey: createTableExportRequestKey('batch-objects')");
    expect(block).not.toContain('ExportTablesSQLWithOptions(');
    expect(block).not.toContain('ExportTablesDataSQL(');
    expect(block).not.toContain('message.loading(');
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
