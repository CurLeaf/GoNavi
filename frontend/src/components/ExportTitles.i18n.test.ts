import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dataGridSource = readFileSync(new URL('./DataGrid.tsx', import.meta.url), 'utf8');
const tableOverviewSource = readFileSync(new URL('./TableOverview.tsx', import.meta.url), 'utf8');
const sidebarObjectActionsSource = readFileSync(new URL('./sidebar/useSidebarObjectActions.tsx', import.meta.url), 'utf8');

describe('export title i18n guards', () => {
  it('keeps export progress and export tab titles on translation keys instead of inline Chinese copy', () => {
    [
      "`导出 ${tableName || '数据'}`",
      "`导出 ${tableName}`",
    ].forEach((rawSnippet) => {
      expect(dataGridSource).not.toContain(rawSnippet);
      expect(tableOverviewSource).not.toContain(rawSnippet);
      expect(sidebarObjectActionsSource).not.toContain(rawSnippet);
    });

    expect(dataGridSource).toContain("translateDataGrid('file.backend.dialog.export_data')");
    expect(dataGridSource).toContain("translateDataGrid('file.backend.dialog.export_table'");
    expect(tableOverviewSource).toContain("t('file.backend.dialog.export_table'");
    expect(sidebarObjectActionsSource).toContain("t('file.backend.dialog.export_table'");
  });
});
