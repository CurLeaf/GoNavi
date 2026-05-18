import { describe, expect, it } from 'vitest';

import { buildIndexCreateSqlPreview } from './tableDesignerIndexSql';

describe('tableDesignerIndexSql', () => {
  it('builds SQL Server nonclustered index create SQL', () => {
    const result = buildIndexCreateSqlPreview({
      dbType: 'sqlserver',
      tableRef: '[dbo].[Users]',
      name: 'IX_Users_DisplayName',
      columnNames: ['display_name'],
      kind: 'NORMAL',
      indexType: 'NONCLUSTERED',
    });

    expect(result.sql).toBe('CREATE NONCLUSTERED INDEX [IX_Users_DisplayName] ON [dbo].[Users] ([display_name]);');
  });

  it('builds SQL Server unique clustered index create SQL', () => {
    const result = buildIndexCreateSqlPreview({
      dbType: 'mssql',
      tableRef: '[dbo].[Users]',
      name: 'IX_Users_Email',
      columnNames: ['email'],
      kind: 'UNIQUE',
      indexType: 'CLUSTERED',
    });

    expect(result.sql).toBe('CREATE UNIQUE CLUSTERED INDEX [IX_Users_Email] ON [dbo].[Users] ([email]);');
  });

  it('returns a validation message before an index name is available', () => {
    const result = buildIndexCreateSqlPreview({
      dbType: 'sqlserver',
      tableRef: '[dbo].[Users]',
      name: '',
      columnNames: ['display_name'],
      kind: 'NORMAL',
      indexType: 'NONCLUSTERED',
    });

    expect(result.sql).toBeNull();
    expect(result.severity).toBe('error');
    expect(result.message).toContain('请输入索引名');
  });
});
