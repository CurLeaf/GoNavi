import { describe, expect, it } from 'vitest';

import { shouldUseSqlEditorManagedTransactionForType } from '../../utils/sqlEditorTransaction';
import {
  findQueryEditorMutatingStatements,
  shouldWarnQueryEditorUnmanagedWrite,
} from './queryEditorUnmanagedWriteGuard';

const mysqlConfig = { type: 'mysql' };

describe('queryEditorUnmanagedWriteGuard', () => {
  it('warns when a write ran without backend transactionPending (DDL autocommit)', () => {
    // DDL 在后端 shouldUseManagedSQLTransaction 中不算可托管写操作，
    // 会以 autocommit 直接落地：必须显式告知不可撤销。
    const mutatingStatements = findQueryEditorMutatingStatements(
      mysqlConfig,
      'DROP TABLE tmp_table;',
    );
    expect(mutatingStatements).not.toEqual([]);
    expect(shouldWarnQueryEditorUnmanagedWrite({
      success: true,
      mutatingStatements,
      transactionPending: false,
    })).toBe(true);
  });

  it('does not trust the looser frontend managed-transaction heuristic', () => {
    // DELETE 会被前端 shouldUseSqlEditorManagedTransactionForType 判为可托管，
    // 但后端可能因数据源不支持事务而未返回 transactionPending。
    const sql = 'DELETE FROM users WHERE id = 1;';
    expect(shouldUseSqlEditorManagedTransactionForType('mysql', [sql])).toBe(true);
    const mutatingStatements = findQueryEditorMutatingStatements(mysqlConfig, sql);
    expect(mutatingStatements).not.toEqual([]);
    expect(shouldWarnQueryEditorUnmanagedWrite({
      success: true,
      mutatingStatements,
      transactionPending: false,
    })).toBe(true);
    expect(shouldWarnQueryEditorUnmanagedWrite({
      success: true,
      mutatingStatements,
      transactionPending: true,
    })).toBe(false);
  });

  it('does not warn about rollback for a pure read', () => {
    const mutatingStatements = findQueryEditorMutatingStatements(
      mysqlConfig,
      'SELECT * FROM users;',
    );
    expect(mutatingStatements).toEqual([]);
    expect(shouldWarnQueryEditorUnmanagedWrite({
      success: true,
      mutatingStatements,
      transactionPending: false,
    })).toBe(false);
  });

  it('does not warn when execution failed', () => {
    expect(shouldWarnQueryEditorUnmanagedWrite({
      success: false,
      mutatingStatements: ['DELETE FROM users'],
      transactionPending: false,
    })).toBe(false);
  });
});
