import { describe, expect, it } from 'vitest';

import {
  canReusePendingSqlEditorTransactionForType,
  shouldUseSqlEditorManagedTransactionForType,
} from './sqlEditorTransaction';

describe('sqlEditorTransaction embedded write', () => {
  // issue #1308: without a semicolon the splitter emits one SELECT-leading
  // statement, so the editor used to skip the managed transaction and run
  // under autocommit.
  it('uses a managed transaction when a read statement embeds a semicolon-less write (issue #1308)', () => {
    const incidentSql = [
      'SELECT',
      '    *',
      'FROM',
      '    t_bank_payment',
      'WHERE',
      "    f_bank_name = '安徽农商银行'",
      'ORDER BY',
      '    id DESC',
      'DELETE FROM t_bank_payment',
      'WHERE',
      "    f_bank_name = '安徽农商银行'",
    ].join('\n');

    expect(shouldUseSqlEditorManagedTransactionForType('mysql', [incidentSql])).toBe(true);
    expect(canReusePendingSqlEditorTransactionForType('mysql', [incidentSql])).toBe(false);
  });

  it('uses a managed transaction for a WITH followed by a write', () => {
    expect(shouldUseSqlEditorManagedTransactionForType(
      'postgres',
      ['WITH x AS (SELECT 1) INSERT INTO t VALUES (1)'],
    )).toBe(true);
    expect(shouldUseSqlEditorManagedTransactionForType(
      'mysql',
      ['WITH x AS (SELECT 1) SELECT * FROM x DELETE FROM t'],
    )).toBe(true);
  });

  it('keeps read-only statements on the non-transactional path (issue #1308)', () => {
    const readOnlyCases: Array<[string, string]> = [
      ['mysql', 'SELECT * FROM delete_log'],
      ['mysql', "SELECT 'DELETE FROM t' AS note"],
      ['mysql', 'SELECT 1 -- DELETE FROM t'],
      ['mysql', 'SHOW CREATE TABLE users'],
      ['mysql', 'SELECT * FROM t WHERE id = 1 FOR UPDATE'],
      ['postgres', 'SELECT $$ DELETE FROM t $$'],
      ['postgres', 'WITH x AS (SELECT 1) SELECT * FROM x'],
    ];

    for (const [dbType, sql] of readOnlyCases) {
      expect(
        shouldUseSqlEditorManagedTransactionForType(dbType, [sql]),
        `${dbType}: ${sql}`,
      ).toBe(false);
      expect(
        canReusePendingSqlEditorTransactionForType(dbType, [sql]),
        `${dbType}: ${sql}`,
      ).toBe(true);
    }
  });
});
