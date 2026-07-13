import { describe, expect, it } from 'vitest';

import {
  buildQueryResultPageSql,
  createInitialQueryResultPagination,
  resolveQueryResultPaginationTotal,
} from './queryResultPagination';

describe('queryResultPagination', () => {
  it('treats MySQL LIMIT offset,count as editor pagination and exports the base query', () => {
    const page = createInitialQueryResultPagination({
      executedSql: 'SELECT id, name FROM users LIMIT 0,500',
      exportSql: 'SELECT id, name FROM users LIMIT 0,500',
      dbType: 'mysql',
      returnedRowCount: 500,
      fallbackPageSize: 5000,
    });

    expect(page).toMatchObject({
      current: 1,
      pageSize: 500,
      total: 1000,
      totalKnown: false,
      baseSql: 'SELECT id, name FROM users',
      exportAllSql: 'SELECT id, name FROM users',
    });
  });

  it('keeps query-editor injected LIMIT pageable instead of treating the cap as the total', () => {
    const page = createInitialQueryResultPagination({
      executedSql: 'SELECT id, name FROM users LIMIT 500',
      exportSql: 'SELECT id, name FROM users',
      dbType: 'mysql',
      returnedRowCount: 500,
      fallbackPageSize: 500,
    });

    expect(page).toMatchObject({
      current: 1,
      pageSize: 500,
      total: 1000,
      totalKnown: false,
      baseSql: 'SELECT id, name FROM users',
      exportAllSql: 'SELECT id, name FROM users',
    });
  });

  it('keeps query-editor injected Oracle ROWNUM wrapper pageable', () => {
    const page = createInitialQueryResultPagination({
      executedSql: 'SELECT * FROM (SELECT id, name FROM users ORDER BY created_at DESC) WHERE ROWNUM <= 500',
      exportSql: 'SELECT id, name FROM users ORDER BY created_at DESC',
      dbType: 'oracle',
      returnedRowCount: 500,
      fallbackPageSize: 500,
    });

    expect(page).toMatchObject({
      current: 1,
      pageSize: 500,
      total: 1000,
      totalKnown: false,
      baseSql: 'SELECT id, name FROM users ORDER BY created_at DESC',
      exportAllSql: 'SELECT id, name FROM users ORDER BY created_at DESC',
    });
  });

  it('builds the next page SQL with one lookahead row', () => {
    expect(buildQueryResultPageSql({
      baseSql: 'SELECT id FROM users',
      dbType: 'mysql',
      page: 2,
      pageSize: 500,
      lookahead: true,
    })).toBe('SELECT * FROM (SELECT id FROM users) AS __gonavi_query_page__ LIMIT 501 OFFSET 500');
  });

  it('marks the last full lookahead page as an exact total', () => {
    expect(resolveQueryResultPaginationTotal({
      current: 2,
      pageSize: 500,
      rowCount: 500,
      hasNext: false,
    })).toEqual({ total: 1000, totalKnown: true });
  });
});
