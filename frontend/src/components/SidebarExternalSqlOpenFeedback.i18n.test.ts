import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');

const externalSqlOpenBlock = source.slice(
  source.indexOf('const normalizeSQLFileDialogData ='),
  source.indexOf('const openCreateExternalSQLFileModal ='),
);

describe('Sidebar external SQL open feedback i18n', () => {
  it('localizes SQL file open fallbacks without translating raw file details', () => {
    [
      '运行外部SQL文件',
      'SQL 文件路径不完整，无法打开',
      '请先选择一个 Host 后再执行大 SQL 文件',
    ].forEach((snippet) => {
      expect(externalSqlOpenBlock).not.toContain(snippet);
    });

    expect(externalSqlOpenBlock).toContain("t('sidebar.sql_file_exec.title')");
    expect(externalSqlOpenBlock).toContain("t('sidebar.message.sql_file_path_incomplete')");
    expect(externalSqlOpenBlock).toContain("t('sidebar.message.select_host_before_large_sql_file')");
    expect(externalSqlOpenBlock).toContain("t('sidebar.message.read_sql_file_failed', { error: res.message })");
  });
});
