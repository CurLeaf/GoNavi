import { describe, expect, it } from 'vitest';

import { buildIndexCreateSqlPreview } from './tableDesignerIndexSql';
import { t as catalogTranslate } from '../i18n/catalog';

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
    expect(result.message).toContain(catalogTranslate('zh-CN', 'table_designer.message.index_name_required'));
  });

  it('uses the provided translator for user-visible validation messages', () => {
    const translate = (key: string, params?: Record<string, string | number | boolean | null | undefined>) =>
      catalogTranslate('en-US', key, params);

    expect(buildIndexCreateSqlPreview({
      dbType: 'postgres',
      tableRef: '"public"."users"',
      name: 'idx_users_name',
      columnNames: [],
      kind: 'NORMAL',
      translate,
    }).message).toBe('Select at least one column');

    expect(buildIndexCreateSqlPreview({
      dbType: 'mysql',
      tableRef: '`users`',
      name: '',
      columnNames: ['name'],
      kind: 'NORMAL',
      translate,
    }).message).toBe('Enter an index name');

    expect(buildIndexCreateSqlPreview({
      dbType: 'mysql',
      tableRef: '`users`',
      name: 'idx_users_name',
      columnNames: ['name'],
      kind: 'NORMAL',
      indexType: 'FULLTEXT',
      translate,
    }).message).toBe('Switch Index category to FULLTEXT index');

    expect(buildIndexCreateSqlPreview({
      dbType: 'postgres',
      tableRef: '"public"."users"',
      name: 'idx_users_name',
      columnNames: ['name'],
      kind: 'SPATIAL',
      translate,
    }).message).toBe('This database only supports maintaining normal and unique indexes');

    expect(buildIndexCreateSqlPreview({
      dbType: 'redis',
      tableRef: 'users',
      name: 'idx_users_name',
      columnNames: ['name'],
      kind: 'NORMAL',
      translate,
    }).message).toBe('This data source does not support relational index maintenance');
  });
});
