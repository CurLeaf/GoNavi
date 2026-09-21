import { describe, expect, it } from 'vitest';

import {
  findConnectionMutatingStatements,
  findPotentiallyMutatingConnectionStatements,
  isSingleReadOnlyConnectionQuery,
} from './connectionReadOnly';

describe('connectionReadOnly embedded write', () => {
  // issue #1308: no semicolon between ORDER BY and DELETE, so the splitter
  // cannot emit a statement boundary and the whole script used to look read-only.
  it('treats a semicolon-less statement as mutating when it embeds a write (issue #1308)', () => {
    const config = {
      type: 'mysql',
      protection: { restrictScriptExecution: true, restrictDataEdit: true },
    };
    const incidentSql = [
      'SELECT',
      '    *',
      'FROM',
      '    t_bank_payment',
      'WHERE',
      "    f_bank_name = '安徽农商银行'",
      "    AND f_create_time >= '2026-09-20 00:00:00'",
      'ORDER BY',
      '    id DESC',
      'DELETE FROM t_bank_payment',
      'WHERE',
      "    f_bank_name = '安徽农商银行'",
      "    AND f_create_time >= '2026-09-20 00:00:00'",
    ].join('\n');

    expect(findPotentiallyMutatingConnectionStatements(config, incidentSql)).toEqual([
      incidentSql,
    ]);
    expect(findConnectionMutatingStatements(config, incidentSql)).toEqual([incidentSql]);
    expect(isSingleReadOnlyConnectionQuery(config, incidentSql)).toBe(false);
  });

  it('detects embedded writes without a semicolon across dialects', () => {
    const cases: Array<[string, string]> = [
      ['mysql', 'SELECT * FROM t ORDER BY id DESC\nDELETE FROM t WHERE id = 1'],
      ['mysql', 'SELECT * FROM t\nUPDATE t SET a = 1'],
      ['mysql', 'SELECT * FROM t\nINSERT INTO t VALUES (1)'],
      ['mysql', 'SELECT * FROM t\nDROP TABLE t'],
      ['mysql', 'SELECT * FROM t\nTRUNCATE TABLE t'],
      ['mysql', 'SELECT * FROM t\nALTER TABLE t ADD COLUMN c INT'],
      ['mysql', 'SELECT * FROM t FOR UPDATE DELETE FROM t'],
      ['postgres', 'SELECT * FROM t\nGRANT SELECT ON t TO demo'],
      ['postgres', 'WITH x AS (SELECT 1) INSERT INTO t VALUES (1)'],
      ['mysql', 'WITH x AS (SELECT 1) SELECT * FROM x DELETE FROM t'],
    ];

    for (const [type, sql] of cases) {
      const config = { type, protection: { restrictScriptExecution: true } };
      expect(
        findPotentiallyMutatingConnectionStatements(config, sql),
        `${type}: ${sql}`,
      ).not.toEqual([]);
    }
  });

  it('keeps read-only statements read-only when write keywords are not executable (issue #1308)', () => {
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
      ['postgres', 'WITH x AS (SELECT 1) SELECT * FROM x'],
      ['mysql', 'SELECT id, name FROM users WHERE status = 1'],
      ['mysql', 'SHOW CREATE TABLE users'],
      ['mysql', 'SHOW CREATE VIEW v_users'],
      ['mysql', 'EXPLAIN SELECT * FROM t'],
      ['mysql', 'EXPLAIN DELETE FROM t'],
      ['mysql', 'SELECT * FROM t WHERE id = 1 FOR UPDATE'],
    ];

    for (const [type, sql] of cases) {
      const config = { type, protection: { restrictScriptExecution: true } };
      expect(
        findPotentiallyMutatingConnectionStatements(config, sql),
        `${type}: ${sql}`,
      ).toEqual([]);
    }
  });
});
