import { describe, expect, it } from 'vitest';

import { hasEmbeddedWriteStatement } from './sqlEmbeddedWrite';

describe('sqlEmbeddedWrite', () => {
  // issue #1308: no semicolon between ORDER BY and DELETE, so the splitter
  // cannot emit a statement boundary.
  it('detects a semicolon-less write across dialects', () => {
    const cases: Array<[string, string]> = [
      ['mysql', 'SELECT * FROM t ORDER BY id DESC\nDELETE FROM t WHERE id = 1'],
      ['mysql', 'SELECT * FROM t\nUPDATE t SET a = 1'],
      ['mysql', 'SELECT * FROM t\nINSERT INTO t VALUES (1)'],
      ['mysql', 'SELECT * FROM t\nDROP TABLE t'],
      ['mysql', 'SELECT * FROM t\nTRUNCATE TABLE t'],
      ['mysql', 'SELECT * FROM t\nALTER TABLE t ADD COLUMN c INT'],
      ['sqlserver', 'SELECT * FROM t\nRENAME COLUMN a TO b'],
      ['postgres', 'SELECT * FROM t\nGRANT SELECT ON t TO demo'],
      ['oracle', 'SELECT * FROM t\nREVOKE SELECT ON t FROM demo'],
      ['mysql', 'SELECT * FROM t FOR UPDATE DELETE FROM t'],
      ['postgres', 'EXPLAIN ANALYZE DELETE FROM t'],
      ['postgres', 'WITH x AS (SELECT 1) INSERT INTO t VALUES (1)'],
      ['mysql', 'WITH x AS (SELECT 1) SELECT * FROM x DELETE FROM t'],
    ];

    for (const [dbType, sql] of cases) {
      expect(hasEmbeddedWriteStatement(sql, dbType), `${dbType}: ${sql}`).toBe(true);
    }
  });

  it('ignores write keywords hidden in literals, identifiers and comments', () => {
    const cases: Array<[string, string]> = [
      ['mysql', 'SELECT * FROM delete_log'],
      ['mysql', 'SELECT drop_count FROM t'],
      ['mysql', "SELECT 'DELETE FROM t' AS note"],
      ['mysql', 'SELECT 1 -- DELETE FROM t'],
      ['mysql', 'SELECT 1 # DELETE FROM t'],
      ['mysql', 'SELECT 1 /* DELETE FROM t */'],
      ['mysql', 'SELECT `delete` FROM t'],
      ['postgres', 'SELECT "delete" FROM t'],
      ['postgres', 'SELECT $$ DELETE FROM t $$'],
      ['postgres', 'SELECT $tag$ DELETE FROM t $tag$'],
      ['sqlserver', 'SELECT [delete] FROM t'],
      ['mysql', 'SELECT setting FROM t'],
      ['mysql', 'SELECT REPLACE(a, b, c) FROM t'],
      ['postgres', 'WITH x AS (SELECT 1) SELECT * FROM x'],
      ['mysql', 'SELECT id, name FROM users WHERE status = 1'],
      ['mysql', 'SELECT * FROM t WHERE id = 1 FOR UPDATE'],
      ['postgres', 'SELECT * FROM t WHERE id = 1 FOR UPDATE OF t NOWAIT'],
    ];

    for (const [dbType, sql] of cases) {
      expect(hasEmbeddedWriteStatement(sql, dbType), `${dbType}: ${sql}`).toBe(false);
    }
  });

  it('exempts SHOW CREATE and plain EXPLAIN read-only contexts', () => {
    const cases: Array<[string, string]> = [
      ['mysql', 'SHOW CREATE TABLE users'],
      ['mysql', 'SHOW CREATE VIEW v_users'],
      ['mysql', 'EXPLAIN SELECT * FROM t'],
      ['mysql', 'EXPLAIN DELETE FROM t'],
    ];

    for (const [dbType, sql] of cases) {
      expect(hasEmbeddedWriteStatement(sql, dbType), `${dbType}: ${sql}`).toBe(false);
    }
  });

  it('does not treat ORDER BY ... DESC as a DESCRIBE prefix', () => {
    expect(hasEmbeddedWriteStatement(
      'SELECT * FROM t ORDER BY id DESC DELETE FROM t',
      'mysql',
    )).toBe(true);
    expect(hasEmbeddedWriteStatement('SELECT * FROM t ORDER BY id DESC', 'mysql')).toBe(false);
    expect(hasEmbeddedWriteStatement('DESC users', 'mysql')).toBe(false);
  });

  it('treats write keywords after EXPLAIN-looking text as executable', () => {
    expect(hasEmbeddedWriteStatement(
      'EXPLAIN SELECT 1 DELETE FROM t',
      'mysql',
    )).toBe(true);
  });
});
