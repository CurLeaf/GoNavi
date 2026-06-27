import { describe, expect, it } from 'vitest';

import {
  canReusePendingSqlEditorTransactionForType,
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

  it.each([
    ['trino', 'UPDATE hive.default.orders SET status = \'done\''],
    ['tdengine', 'INSERT INTO meters(ts, current) VALUES (NOW, 10.2)'],
    ['clickhouse', 'INSERT INTO events FORMAT JSONEachRow {"id":1}'],
    ['iotdb', 'INSERT INTO root.ln.wf01.wt01(timestamp,status) VALUES(1,true)'],
  ])('keeps %s writes on the plain multi-statement execution path', (dbType, sql) => {
    expect(shouldUseSqlEditorManagedTransactionForType(dbType, [sql])).toBe(false);
    expect(canReusePendingSqlEditorTransactionForType(dbType, [
      'SELECT * FROM users WHERE id = 1',
    ])).toBe(false);
  });

  it('reuses a pending managed transaction only for read-only follow-up SQL', () => {
    expect(canReusePendingSqlEditorTransactionForType('mysql', [
      'SELECT * FROM users WHERE id = 1',
    ])).toBe(true);
    expect(canReusePendingSqlEditorTransactionForType('mysql', [
      'WITH target AS (SELECT id FROM users) SELECT * FROM target',
    ])).toBe(true);
    expect(canReusePendingSqlEditorTransactionForType('mysql', [
      'UPDATE users SET name = "n" WHERE id = 1',
    ])).toBe(false);
    expect(canReusePendingSqlEditorTransactionForType('mysql', [
      'COMMIT',
    ])).toBe(false);
  });
});
