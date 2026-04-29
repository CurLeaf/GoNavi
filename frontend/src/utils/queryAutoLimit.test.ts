import { describe, expect, it } from 'vitest';

import { applyQueryAutoLimit } from './queryAutoLimit';

describe('applyQueryAutoLimit', () => {
  const limitDialects = [
    'mysql',
    'mariadb',
    'diros',
    'doris',
    'sphinx',
    'postgres',
    'postgresql',
    'kingbase',
    'kingbase8',
    'highgo',
    'vastbase',
    'sqlite',
    'sqlite3',
    'duckdb',
    'clickhouse',
    'tdengine',
  ];

  it.each(limitDialects)('adds generic LIMIT for %s connections', (dbType) => {
    expect(applyQueryAutoLimit('SELECT * FROM users', dbType, 500).sql)
      .toBe('SELECT * FROM users LIMIT 500');
  });

  it.each([
    ['oracle'],
    ['dameng'],
    ['dm'],
    ['dm8'],
  ])('adds FETCH FIRST limit for %s connections', (dbType) => {
    expect(applyQueryAutoLimit('SELECT * FROM MYCIMLED.EDC_LOG', dbType, 500).sql)
      .toBe('SELECT * FROM MYCIMLED.EDC_LOG FETCH FIRST 500 ROWS ONLY');
  });

  it.each([
    ['sqlserver'],
    ['mssql'],
    ['sql_server'],
    ['sql-server'],
  ])('adds TOP limit for %s connections', (dbType) => {
    expect(applyQueryAutoLimit('SELECT * FROM users', dbType, 500).sql)
      .toBe('SELECT TOP 500 * FROM users');
  });

  it('adds SQL Server TOP after DISTINCT', () => {
    expect(applyQueryAutoLimit('SELECT DISTINCT name FROM users', 'sqlserver', 500).sql)
      .toBe('SELECT DISTINCT TOP 500 name FROM users');
  });

  it.each([
    ['oracle', 'SELECT * FROM users FETCH FIRST 500 ROWS ONLY'],
    ['dm8', 'SELECT * FROM users FETCH FIRST 500 ROWS ONLY'],
    ['mssql', 'SELECT TOP 500 * FROM users'],
    ['postgresql', 'SELECT * FROM users LIMIT 500'],
    ['doris', 'SELECT * FROM users LIMIT 500'],
    ['sqlite3', 'SELECT * FROM users LIMIT 500'],
  ])('uses custom driver dialect %s', (driver, expected) => {
    expect(applyQueryAutoLimit('SELECT * FROM users', 'custom', 500, driver).sql)
      .toBe(expected);
  });

  it('keeps trailing semicolon and comments after injected Oracle limit', () => {
    expect(applyQueryAutoLimit('SELECT * FROM MYCIMLED.EDC_LOG; -- preview', 'oracle', 500).sql)
      .toBe('SELECT * FROM MYCIMLED.EDC_LOG FETCH FIRST 500 ROWS ONLY; -- preview');
  });

  it('does not add another generic limit when SQL already limits rows', () => {
    expect(applyQueryAutoLimit('SELECT * FROM users LIMIT 10', 'mysql', 500).applied)
      .toBe(false);
    expect(applyQueryAutoLimit('SELECT * FROM users OFFSET 10 LIMIT 10', 'postgres', 500).applied)
      .toBe(false);
  });

  it('does not treat nested LIMIT as the outer query limit', () => {
    expect(applyQueryAutoLimit('SELECT * FROM (SELECT * FROM users LIMIT 10) t', 'postgres', 500).sql)
      .toBe('SELECT * FROM (SELECT * FROM users LIMIT 10) t LIMIT 500');
  });

  it('does not add another Oracle limit when Oracle SQL already limits rows', () => {
    expect(applyQueryAutoLimit('SELECT * FROM users WHERE ROWNUM <= 10', 'oracle', 500).applied)
      .toBe(false);
    expect(applyQueryAutoLimit('SELECT * FROM users FETCH FIRST 10 ROWS ONLY', 'oracle', 500).applied)
      .toBe(false);
  });

  it('does not add another SQL Server limit when SQL already uses TOP', () => {
    expect(applyQueryAutoLimit('SELECT TOP 10 * FROM users', 'sqlserver', 500).applied)
      .toBe(false);
  });

  it('adds generic LIMIT before locking clauses', () => {
    expect(applyQueryAutoLimit('SELECT * FROM users FOR UPDATE', 'mysql', 500).sql)
      .toBe('SELECT * FROM users LIMIT 500 FOR UPDATE');
  });

  it('adds generic LIMIT before OFFSET clauses', () => {
    expect(applyQueryAutoLimit('SELECT * FROM users OFFSET 10', 'postgres', 500).sql)
      .toBe('SELECT * FROM users LIMIT 500 OFFSET 10');
  });

  it('does not limit non-select statements', () => {
    expect(applyQueryAutoLimit('UPDATE users SET name = \'a\'', 'mysql', 500).applied)
      .toBe(false);
  });
});
