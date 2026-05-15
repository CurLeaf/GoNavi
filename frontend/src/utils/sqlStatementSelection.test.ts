import { describe, expect, it } from 'vitest';

import { findSqlStatementRanges, resolveCurrentSqlStatementRange } from './sqlStatementSelection';

describe('sqlStatementSelection', () => {
  it('resolves the statement containing the cursor', () => {
    const sql = 'select 1;\n\nselect 2 from users;\nselect 3';

    expect(resolveCurrentSqlStatementRange(sql, sql.indexOf('1'))?.text).toBe('select 1');
    expect(resolveCurrentSqlStatementRange(sql, sql.indexOf('users'))?.text).toBe('select 2 from users');
    expect(resolveCurrentSqlStatementRange(sql, sql.indexOf('3'))?.text).toBe('select 3');
  });

  it('ignores semicolons inside strings and comments', () => {
    const sql = [
      "select ';' as semi;",
      "-- comment ;",
      "select 'a; b' as text;",
      "select $$a; b$$ as body;",
    ].join('\n');

    const ranges = findSqlStatementRanges(sql).map((range) => range.text);

    expect(ranges).toEqual([
      "select ';' as semi",
      "-- comment ;\nselect 'a; b' as text",
      "select $$a; b$$ as body",
    ]);
  });

  it('selects the next statement when the cursor is on whitespace before it', () => {
    const sql = 'select 1;\n\n  select 2;';
    const range = resolveCurrentSqlStatementRange(sql, sql.indexOf('  select 2'));

    expect(range?.text).toBe('select 2');
  });

  it('returns null when there is no statement', () => {
    expect(resolveCurrentSqlStatementRange('  \n\t  ', 0)).toBeNull();
  });
});
