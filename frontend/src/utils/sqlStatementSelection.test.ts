import { describe, expect, it } from 'vitest';

import { findSqlStatementRanges, resolveCurrentSqlStatementRange, resolveExecutableSql } from './sqlStatementSelection';

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

  it('keeps Oracle anonymous PL/SQL blocks as one executable statement', () => {
    const plsql = [
      'BEGIN',
      "  INSERT INTO tmp_disable_trigger (table_name) VALUES ('t_memcard_reg');",
      "  UPDATE t_memcard_reg SET CARDLEVEL = 1 WHERE MEMCARDNO = '8032277312';",
      "  DELETE FROM tmp_disable_trigger WHERE table_name = 't_memcard_reg';",
      'END;',
      'SELECT 1 FROM dual;',
    ].join('\n');

    const ranges = findSqlStatementRanges(plsql).map((range) => range.text);

    expect(ranges).toEqual([
      [
        'BEGIN',
        "  INSERT INTO tmp_disable_trigger (table_name) VALUES ('t_memcard_reg');",
        "  UPDATE t_memcard_reg SET CARDLEVEL = 1 WHERE MEMCARDNO = '8032277312';",
        "  DELETE FROM tmp_disable_trigger WHERE table_name = 't_memcard_reg';",
        'END;',
      ].join('\n'),
      'SELECT 1 FROM dual',
    ]);
    expect(resolveExecutableSql(plsql, plsql.indexOf('UPDATE'))).toEqual({
      sql: ranges[0],
      source: 'statement',
    });
  });

  it('keeps Oracle DECLARE blocks as one executable statement', () => {
    const sql = [
      'DECLARE',
      '  v_count NUMBER;',
      'BEGIN',
      '  SELECT COUNT(*) INTO v_count FROM t_memcard_reg;',
      "  UPDATE t_memcard_reg SET CARDLEVEL = v_count WHERE MEMCARDNO = '8032277312';",
      'END;',
      'SELECT 1 FROM dual;',
    ].join('\n');

    const ranges = findSqlStatementRanges(sql).map((range) => range.text);

    expect(ranges).toEqual([
      [
        'DECLARE',
        '  v_count NUMBER;',
        'BEGIN',
        '  SELECT COUNT(*) INTO v_count FROM t_memcard_reg;',
        "  UPDATE t_memcard_reg SET CARDLEVEL = v_count WHERE MEMCARDNO = '8032277312';",
        'END;',
      ].join('\n'),
      'SELECT 1 FROM dual',
    ]);
    expect(resolveExecutableSql(sql, sql.indexOf('UPDATE'))).toEqual({
      sql: ranges[0],
      source: 'statement',
    });
  });

  it('still splits transaction BEGIN statements', () => {
    const sql = 'BEGIN; UPDATE accounts SET balance = balance - 1 WHERE id = 1; COMMIT;';

    expect(findSqlStatementRanges(sql).map((range) => range.text)).toEqual([
      'BEGIN',
      'UPDATE accounts SET balance = balance - 1 WHERE id = 1',
      'COMMIT',
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

  it('prefers a non-empty selection for executable SQL', () => {
    const sql = 'select 1;\nselect 2;';

    expect(resolveExecutableSql(sql, sql.indexOf('1'), '  select selected  ')?.sql).toBe('  select selected  ');
    expect(resolveExecutableSql(sql, sql.indexOf('1'), '  select selected  ')?.source).toBe('selection');
  });

  it('uses the statement containing the cursor for executable SQL', () => {
    const sql = 'select 1;\n\nselect 2 from users;\nselect 3';

    expect(resolveExecutableSql(sql, sql.indexOf('users'))).toEqual({
      sql: 'select 2 from users',
      source: 'statement',
    });
  });

  it('keeps execution on the statement when the cursor lands after its semicolon', () => {
    const sql = 'select 1 as a;\nselect 2 as b;\n\nselect 3 as c;';
    const afterSecondSemicolon = sql.indexOf('select 2 as b') + 'select 2 as b;'.length;

    expect(resolveExecutableSql(sql, afterSecondSemicolon)).toEqual({
      sql: 'select 2 as b',
      source: 'statement',
    });
  });

  it('falls back to the current line when the cursor is not inside a statement', () => {
    const sql = 'select 1;\n\n  select 2';

    expect(resolveExecutableSql(sql, sql.indexOf('\n\n') + 1)).toBeNull();
    expect(resolveExecutableSql(sql, sql.indexOf('  select 2'))).toEqual({
      sql: 'select 2',
      source: 'statement',
    });
  });

  it('does not jump to the next statement when executing from blank space', () => {
    const sql = 'select 1;\n\nselect 2;';

    expect(resolveExecutableSql(sql, sql.indexOf('\n\n') + 1)).toBeNull();
  });
});
