import { describe, expect, it } from 'vitest';

import {
  resolveSqlEditorOperationKeyword,
  shouldUseSqlEditorManagedTransaction,
  shouldUseSqlEditorManagedTransactionForType,
} from './sqlEditorTransaction';

describe('sqlEditorTransaction', () => {
  it('keeps regular DML in a managed transaction', () => {
    expect(shouldUseSqlEditorManagedTransaction(['UPDATE users SET name = "n" WHERE id = 1'])).toBe(true);
    expect(shouldUseSqlEditorManagedTransaction(['INSERT INTO users(id) VALUES (1)'])).toBe(true);
    expect(shouldUseSqlEditorManagedTransaction(['DELETE FROM users WHERE id = 1'])).toBe(true);
  });

  it('classifies WITH statements by their top-level operation', () => {
    expect(resolveSqlEditorOperationKeyword('WITH target AS (SELECT id FROM users) SELECT * FROM target')).toBe('select');
    expect(resolveSqlEditorOperationKeyword('WITH target AS (SELECT id FROM users) UPDATE users SET synced = 1')).toBe('update');
    expect(resolveSqlEditorOperationKeyword('WITH target AS (SELECT id FROM users) DELETE FROM users WHERE id IN (SELECT id FROM target)')).toBe('delete');
  });

  it('uses managed transactions for WITH DML but not WITH SELECT', () => {
    expect(shouldUseSqlEditorManagedTransaction([
      'WITH target AS (SELECT id FROM users) UPDATE users SET synced = 1 WHERE id IN (SELECT id FROM target)',
    ])).toBe(true);
    expect(shouldUseSqlEditorManagedTransaction([
      'WITH target AS (SELECT id FROM users) SELECT * FROM target',
    ])).toBe(false);
  });

  it('uses managed transactions for data-changing CTEs even when the top-level operation is SELECT', () => {
    const sql = 'WITH moved AS (DELETE FROM audit_logs WHERE created_at < NOW() RETURNING id) SELECT * FROM moved';
    expect(resolveSqlEditorOperationKeyword(sql)).toBe('select');
    expect(shouldUseSqlEditorManagedTransaction([sql])).toBe(true);
  });

  it('does not wrap user-authored explicit transactions', () => {
    expect(shouldUseSqlEditorManagedTransaction([
      'BEGIN',
      'UPDATE users SET name = "n" WHERE id = 1',
      'COMMIT',
    ])).toBe(false);
    expect(shouldUseSqlEditorManagedTransaction([
      'START TRANSACTION',
      'DELETE FROM users WHERE id = 1',
    ])).toBe(false);
  });

  it('keeps Trino DML on the plain multi-statement execution path', () => {
    expect(shouldUseSqlEditorManagedTransactionForType('trino', [
      'UPDATE hive.default.orders SET status = \'done\'',
    ])).toBe(false);
  });
});
