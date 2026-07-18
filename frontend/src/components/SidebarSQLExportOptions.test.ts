import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const hookSource = readFileSync(new URL('./sidebar/useSidebarBatchExport.ts', import.meta.url), 'utf8');
const objectActionsSource = readFileSync(new URL('./sidebar/useSidebarObjectActions.tsx', import.meta.url), 'utf8');
const tableOverviewSource = readFileSync(new URL('./TableOverview.tsx', import.meta.url), 'utf8');
const bindingSource = readFileSync(new URL('../../wailsjs/go/app/App.d.ts', import.meta.url), 'utf8');
const modelSource = readFileSync(new URL('../../wailsjs/go/models.ts', import.meta.url), 'utf8');

describe('Sidebar SQL export options', () => {
  it('collects SQL options for database, schema, and table schema export entry points', () => {
    expect(hookSource).toContain('ExportDatabaseSQLWithOptions(');
    expect(hookSource).toContain('ExportSchemaSQLWithOptions(');
    expect(hookSource).toContain('ExportTablesSQLWithOptions(');
    expect(hookSource.match(/showSQLExportOptionsDialog\(\)/g)).toHaveLength(5);
    expect(hookSource).toContain("mode === 'dataOnly'");
    expect(hookSource).toContain('{ includeDropIfExists: false }');
    expect(objectActionsSource).toContain('await showSQLExportOptionsDialog()');
    expect(objectActionsSource).toContain('...resolvedOptions');
    expect(tableOverviewSource).toContain('await showSQLExportOptionsDialog()');
    expect(tableOverviewSource).toContain('...resolvedOptions');
  });

  it('keeps the Wails option and typed single-database/schema methods in sync', () => {
    expect(bindingSource).toContain('ExportDatabaseSQLWithOptions(');
    expect(bindingSource).toContain('ExportSchemaSQLWithOptions(');
    expect(modelSource).toContain('includeDropIfExists?: boolean;');
    expect(modelSource).toContain('this.includeDropIfExists = source["includeDropIfExists"]');
  });
});
