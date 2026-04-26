import { describe, expect, it } from 'vitest';

import {
  isMysqlFamilyDialect,
  resolveColumnTypeOptions,
  resolveSqlDialect,
  resolveSqlFunctions,
  resolveSqlKeywords,
} from './sqlDialect';

const values = (options: Array<{ value: string }>) => options.map((item) => item.value);
const names = (items: Array<{ name: string }>) => items.map((item) => item.name);

describe('sqlDialect', () => {
  it('normalizes datasource aliases without collapsing all dialects to mysql', () => {
    expect(resolveSqlDialect('postgresql')).toBe('postgres');
    expect(resolveSqlDialect('doris')).toBe('diros');
    expect(resolveSqlDialect('dameng')).toBe('dameng');
    expect(resolveSqlDialect('custom', 'kingbase8')).toBe('kingbase');
    expect(resolveSqlDialect('custom', 'dm8')).toBe('dameng');
    expect(resolveSqlDialect('custom', 'mariadb')).toBe('mariadb');
    expect(isMysqlFamilyDialect('mariadb')).toBe(true);
    expect(isMysqlFamilyDialect('oracle')).toBe(false);
  });

  it('resolves field type options per datasource family', () => {
    expect(values(resolveColumnTypeOptions('oracle'))).toContain('VARCHAR2(255)');
    expect(values(resolveColumnTypeOptions('oracle'))).not.toContain('tinyint(1)');
    expect(values(resolveColumnTypeOptions('dameng'))).toContain('VARCHAR2(255)');
    expect(values(resolveColumnTypeOptions('kingbase'))).toContain('integer');
    expect(values(resolveColumnTypeOptions('kingbase'))).not.toContain('tinyint(1)');
    expect(values(resolveColumnTypeOptions('diros'))).toContain('LARGEINT');
    expect(values(resolveColumnTypeOptions('sphinx'))).toContain('text');
    expect(values(resolveColumnTypeOptions('clickhouse'))).toContain('DateTime64(3)');
    expect(values(resolveColumnTypeOptions('tdengine'))).toContain('TIMESTAMP');
    expect(values(resolveColumnTypeOptions('duckdb'))).toContain('STRUCT');
  });

  it('resolves oracle completion keywords and functions without mysql-only suggestions', () => {
    expect(resolveSqlKeywords('oracle')).toEqual(expect.arrayContaining(['ROWNUM', 'FETCH', 'VARCHAR2', 'NUMBER']));
    expect(resolveSqlKeywords('oracle')).not.toEqual(expect.arrayContaining(['AUTO_INCREMENT', 'CHANGE', 'LIMIT']));

    expect(names(resolveSqlFunctions('oracle'))).toEqual(expect.arrayContaining(['NVL', 'SYSDATE', 'TO_DATE']));
    expect(names(resolveSqlFunctions('oracle'))).not.toEqual(expect.arrayContaining(['DATE_FORMAT', 'GROUP_CONCAT']));
  });

  it('resolves mysql-family completion keywords and functions with mysql syntax', () => {
    expect(resolveSqlKeywords('mariadb')).toEqual(expect.arrayContaining(['LIMIT', 'CHANGE', 'AUTO_INCREMENT']));
    expect(names(resolveSqlFunctions('diros'))).toEqual(expect.arrayContaining(['DATE_FORMAT', 'GROUP_CONCAT']));
  });

  it('resolves sqlserver completion without mysql-only ddl tokens', () => {
    expect(resolveSqlKeywords('sqlserver')).toEqual(expect.arrayContaining(['TOP', 'IDENTITY', 'NVARCHAR']));
    expect(resolveSqlKeywords('sqlserver')).not.toEqual(expect.arrayContaining(['AUTO_INCREMENT', 'CHANGE']));
    expect(names(resolveSqlFunctions('sqlserver'))).toEqual(expect.arrayContaining(['GETDATE', 'ISNULL', 'NEWID']));
    expect(names(resolveSqlFunctions('sqlserver'))).not.toEqual(expect.arrayContaining(['GROUP_CONCAT']));
  });
});
