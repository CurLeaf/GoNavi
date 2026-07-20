import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./sidebar/useSidebarBatchExport.ts', import.meta.url), 'utf8');
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
  it('validates the selection and routes selected tables into the background workbench', () => {
    const block = extractHandleExportTablesBlock();

    expect(block).toContain("t('sidebar.message.export_tables_same_database_required')");
    expect(block).toContain('showSQLExportOptionsDialog()');
    expect(block).toContain('addTab(buildBatchTableExportWorkbenchTab({');
    expect(block).toContain('initialObjectNames: tableNames');
    expect(block).toContain("contentMode: includeData ? 'backup' : 'schema'");
    expect(block).toContain('includeDropIfExists: exportOptions.includeDropIfExists');
    expect(block).toContain("requestKey: createTableExportRequestKey('tables')");
    expect(block).not.toContain('ExportTablesSQLWithOptions(');
    expect(block).not.toContain('message.loading(');
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
