import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./sidebar/useSidebarBatchExport.ts', import.meta.url), 'utf8');
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
  it('validates the target and routes schema SQL export into the background workbench', () => {
    const block = extractHandleExportSchemaBlock();

    expect(block).toContain("t('sidebar.message.schema_export_target_missing')");
    expect(block).toContain('showSQLExportOptionsDialog()');
    expect(block).toContain('addTab(buildSchemaExportWorkbenchTab({');
    expect(block).toContain('schemaName,');
    expect(block).toContain("contentMode: includeData ? 'backup' : 'schema'");
    expect(block).toContain('includeDropIfExists: exportOptions.includeDropIfExists');
    expect(block).toContain("requestKey: createTableExportRequestKey('schema')");
    expect(block).not.toContain('ExportSchemaSQLWithOptions(');
    expect(block).not.toContain('message.loading(');
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
