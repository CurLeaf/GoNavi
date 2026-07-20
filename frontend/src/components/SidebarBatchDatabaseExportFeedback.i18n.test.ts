import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./sidebar/useSidebarBatchExport.ts', import.meta.url), 'utf8');
const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'de-DE', 'ru-RU'] as const;
const requiredKeys = [
  'sidebar.message.load_database_list_failed',
  'sidebar.message.select_database_required',
  'sidebar.message.exporting_database_schema',
  'sidebar.message.exporting_database_backup',
  'sidebar.message.database_export_success',
  'sidebar.message.database_export_failed',
  'sidebar.modal.confirm_delete_selected_databases.title',
  'sidebar.modal.confirm_delete_selected_databases.content',
  'sidebar.message.deleting_selected_databases',
  'sidebar.message.delete_databases_success',
  'sidebar.message.delete_databases_failed',
] as const;

const extractBatchDatabaseExportBlock = (): string => {
  const start = source.indexOf('const loadDatabasesForDbBatch = async');
  const end = source.indexOf('const handleCheckAllDb = (checked: boolean)', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};

const extractHandleBatchDbDeleteBlock = (): string => {
  const start = source.indexOf('const handleBatchDbDelete = async');
  const end = source.indexOf('const handleCheckAllDb = (checked: boolean)', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};

const placeholders = (value: string): string[] => [...value.matchAll(/\{\{(\w+)\}\}/g)]
  .map((match) => match[1])
  .sort();

describe('Sidebar batch database export feedback i18n', () => {
  it('loads databases and routes the selected targets into the background workbench', () => {
    const block = extractBatchDatabaseExportBlock();

    expect(block).toContain("t('sidebar.message.load_database_list_failed'");
    expect(block).toContain("t('sidebar.message.select_database_required')");
    expect(block).toContain('addTab(buildBatchDatabaseExportWorkbenchTab({');
    expect(block).toContain('initialDatabaseNames: selectedDbs.map(db => db.dbName)');
    expect(block).toContain("contentMode: includeData ? 'backup' : 'schema'");
    expect(block).toContain('includeDropIfExists: exportOptions.includeDropIfExists');
    expect(block).toContain("requestKey: createTableExportRequestKey('batch-databases')");
    expect(block).not.toContain('ExportDatabaseSQLWithOptions(');
  });

  it('localizes handleBatchDbDelete confirmation, loading, success, and failure wrappers', () => {
    const block = extractHandleBatchDbDeleteBlock();

    expect(block).toContain('DropDatabase');
    expect(block).toContain("t('sidebar.message.select_database_required')");
    expect(block).toContain("t('sidebar.modal.confirm_delete_selected_databases.title')");
    expect(block).toContain("t('sidebar.modal.confirm_delete_selected_databases.content'");
    expect(block).toContain("t('sidebar.action.delete')");
    expect(block).toContain('okButtonProps: { danger: true }');
    expect(block).toContain("t('sidebar.action.cancel')");
    expect(block).toContain("t('sidebar.message.deleting_selected_databases'");
    expect(block).toContain("t('sidebar.message.delete_databases_success'");
    expect(block).toContain("t('sidebar.message.delete_databases_failed'");
    expect(block).toContain('connection: batchConnContext.name');
    expect(block).toContain('count: selectedDbs.length');
    expect(block).toContain('count: successKeys.length');
    expect(block).toContain('database: failed.database');
    expect(block).toContain('error: failed.error');
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
      expect(placeholders(catalog['sidebar.modal.confirm_delete_selected_databases.title'])).toEqual([]);
      expect(placeholders(catalog['sidebar.modal.confirm_delete_selected_databases.content'])).toEqual(['connection', 'count']);
      expect(placeholders(catalog['sidebar.message.deleting_selected_databases'])).toEqual(['count']);
      expect(placeholders(catalog['sidebar.message.delete_databases_success'])).toEqual(['count']);
      expect(placeholders(catalog['sidebar.message.delete_databases_failed'])).toEqual(['database', 'error']);
    });
  });
});
