import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./sidebar/useSidebarObjectActions.tsx', import.meta.url), 'utf8');
const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'de-DE', 'ru-RU'] as const;
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
  it('routes handleExport through the progress runner and option-based backend export', () => {
    const block = extractHandleExportBlock();

    expect(block).not.toContain('ExportTable(');
    expect(block).toContain('runExportWithProgress({');
    expect(block).toContain('ExportTableWithOptions(');
    expect(block).toContain('showSQLExportOptionsDialog()');
    expect(block).toContain('...resolvedOptions');
    expect(block).toContain('jobId');
    expect(block).toContain('totalRowsHint');
    expect(block).toContain('totalRowsKnown');
  });

  it('keeps the export workbench entry key available across locales', () => {
    locales.forEach((locale) => {
      const catalog = JSON.parse(readFileSync(new URL(`../../../shared/i18n/${locale}.json`, import.meta.url), 'utf8')) as Record<string, string>;
      expect(catalog['sidebar.v2_table_menu.open_export_workbench'], `${locale}:sidebar.v2_table_menu.open_export_workbench`).toBeTruthy();
      expect(placeholders(catalog['sidebar.v2_table_menu.open_export_workbench'])).toEqual([]);
    });
  });
});
