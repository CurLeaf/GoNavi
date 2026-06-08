import { describe, expect, it } from 'vitest';

import { buildRecentSqlActivitySnapshot, buildRecentSqlLogsSnapshot } from './aiSqlLogInsights';

describe('aiSqlLogInsights', () => {
  it('keeps recent sql logs as structured previews with inferred statement metadata', () => {
    const snapshot = buildRecentSqlLogsSnapshot({
      status: 'all',
      limit: 2,
      sqlLogs: [
        {
          id: 'log-1',
          timestamp: 2,
          sql: '/* note */ SELECT * FROM users',
          status: 'success',
          duration: 10,
          dbName: 'crm',
          affectedRows: 2,
        },
        {
          id: 'log-2',
          timestamp: 1,
          sql: 'DELETE FROM users WHERE id = 9',
          status: 'error',
          duration: 50,
          dbName: 'crm',
          message: 'permission denied',
        },
      ],
    });

    expect(snapshot.totalMatched).toBe(2);
    expect(snapshot.logs[0]).toMatchObject({
      statementType: 'select',
      activityKind: 'read',
    });
    expect(snapshot.logs[1]).toMatchObject({
      statementType: 'delete',
      activityKind: 'write',
    });
  });

  it('builds a recent sql activity summary with filters, breakdowns, slowest statements, and top errors', () => {
    const snapshot = buildRecentSqlActivitySnapshot({
      status: 'all',
      activityKind: 'all',
      keyword: 'orders',
      dbName: 'crm',
      limit: 5,
      sqlLogs: [
        {
          id: 'log-1',
          timestamp: 5,
          sql: 'UPDATE orders SET status = \'paid\' WHERE id = 1',
          status: 'error',
          duration: 90,
          dbName: 'crm',
          message: 'row lock timeout',
        },
        {
          id: 'log-2',
          timestamp: 4,
          sql: 'ALTER TABLE orders ADD COLUMN note varchar(32)',
          status: 'success',
          duration: 120,
          dbName: 'crm',
        },
        {
          id: 'log-3',
          timestamp: 3,
          sql: 'WITH recent AS (SELECT * FROM orders) SELECT * FROM recent',
          status: 'success',
          duration: 18,
          dbName: 'crm',
        },
        {
          id: 'log-4',
          timestamp: 2,
          sql: 'SET search_path TO analytics',
          status: 'success',
          duration: 5,
          dbName: 'crm',
        },
        {
          id: 'log-5',
          timestamp: 1,
          sql: 'SELECT * FROM users',
          status: 'success',
          duration: 12,
          dbName: 'crm',
        },
      ],
    });

    expect(snapshot.totalMatched).toBe(3);
    expect(snapshot.writeCount).toBe(1);
    expect(snapshot.ddlCount).toBe(1);
    expect(snapshot.readCount).toBe(1);
    expect(snapshot.statementTypeBreakdown).toEqual({
      alter: 1,
      update: 1,
      with: 1,
    });
    expect(snapshot.dbBreakdown).toEqual({
      crm: 3,
    });
    expect(snapshot.topErrorMessages).toEqual([
      { message: 'row lock timeout', count: 1 },
    ]);
    expect(snapshot.slowestStatements[0]).toMatchObject({
      statementType: 'alter',
      activityKind: 'ddl',
    });
    expect(snapshot.recentMutations).toHaveLength(2);
    expect(snapshot.recentErrors[0]).toMatchObject({
      statementType: 'update',
      activityKind: 'write',
    });
  });
});
