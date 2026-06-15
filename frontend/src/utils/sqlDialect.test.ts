import { describe, expect, it } from 'vitest';

import { setCurrentLanguage } from '../i18n';
import {
  isMysqlFamilyDialect,
  resolveColumnTypeOptions,
  resolveSqlDialect,
  resolveSqlFunctions,
  resolveSqlKeywords,
} from './sqlDialect';

const values = (options: Array<{ value: string }>) => options.map((item) => item.value);
const names = (items: Array<{ name: string }>) => items.map((item) => item.name);
const detailByName = (dbType: string, name: string) => (
  resolveSqlFunctions(dbType).find((item) => item.name === name)?.detail
);

describe('sqlDialect', () => {
  it('normalizes datasource aliases without collapsing all dialects to mysql', () => {
    expect(resolveSqlDialect('postgresql')).toBe('postgres');
    expect(resolveSqlDialect('OpenGauss')).toBe('opengauss');
    expect(resolveSqlDialect('OceanBase')).toBe('oceanbase');
    expect(resolveSqlDialect('doris')).toBe('diros');
    expect(resolveSqlDialect('StarRocks')).toBe('starrocks');
    expect(resolveSqlDialect('dameng')).toBe('dameng');
    expect(resolveSqlDialect('InterSystems IRIS')).toBe('iris');
    expect(resolveSqlDialect('custom', 'intersystemsiris')).toBe('iris');
    expect(resolveSqlDialect('custom', 'kingbase8')).toBe('kingbase');
    expect(resolveSqlDialect('custom', 'dm8')).toBe('dameng');
    expect(resolveSqlDialect('custom', 'mariadb')).toBe('mariadb');
    expect(resolveSqlDialect('custom', 'open_gauss')).toBe('opengauss');
    expect(resolveSqlDialect('OceanBase', '', { oceanBaseProtocol: 'oracle' })).toBe('oracle');
    expect(resolveSqlDialect('custom', 'oceanbase', { oceanBaseProtocol: 'oracle' })).toBe('oracle');
    expect(isMysqlFamilyDialect('mariadb')).toBe(true);
    expect(isMysqlFamilyDialect('oceanbase')).toBe(true);
    expect(isMysqlFamilyDialect('starrocks')).toBe(true);
    expect(isMysqlFamilyDialect('oracle')).toBe(false);
  });

  it('resolves field type options per datasource family', () => {
    expect(values(resolveColumnTypeOptions('oracle'))).toContain('VARCHAR2(255)');
    expect(values(resolveColumnTypeOptions('oracle'))).not.toContain('tinyint(1)');
    expect(values(resolveColumnTypeOptions('dameng'))).toContain('VARCHAR2(255)');
    expect(values(resolveColumnTypeOptions('kingbase'))).toContain('integer');
    expect(values(resolveColumnTypeOptions('opengauss'))).toContain('integer');
    expect(values(resolveColumnTypeOptions('oceanbase'))).toContain('varchar(255)');
    expect(values(resolveColumnTypeOptions('kingbase'))).not.toContain('tinyint(1)');
    expect(values(resolveColumnTypeOptions('diros'))).toContain('LARGEINT');
    expect(values(resolveColumnTypeOptions('starrocks'))).toContain('PERCENTILE');
    expect(values(resolveColumnTypeOptions('sphinx'))).toContain('text');
    expect(values(resolveColumnTypeOptions('clickhouse'))).toContain('DateTime64(3)');
    expect(values(resolveColumnTypeOptions('iris'))).toContain('varchar(255)');
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
    expect(resolveSqlKeywords('starrocks')).toEqual(expect.arrayContaining(['OLAP', 'DISTRIBUTED BY', 'BUCKETS', 'ADD ROLLUP', 'EXTERNAL CATALOG']));
    expect(names(resolveSqlFunctions('starrocks'))).toEqual(expect.arrayContaining(['TO_BITMAP', 'HLL_UNION_AGG']));
  });

  it('resolves sqlserver completion without mysql-only ddl tokens', () => {
    expect(resolveSqlKeywords('sqlserver')).toEqual(expect.arrayContaining(['TOP', 'IDENTITY', 'NVARCHAR']));
    expect(resolveSqlKeywords('sqlserver')).not.toEqual(expect.arrayContaining(['AUTO_INCREMENT', 'CHANGE']));
    expect(names(resolveSqlFunctions('sqlserver'))).toEqual(expect.arrayContaining(['GETDATE', 'ISNULL', 'NEWID']));
    expect(names(resolveSqlFunctions('sqlserver'))).not.toEqual(expect.arrayContaining(['GROUP_CONCAT']));
  });

  it('localizes common function completion details for zh-CN and en-US', () => {
    setCurrentLanguage('zh-CN');
    expect(detailByName('mysql', 'COUNT')).toBe('聚合函数 - 计数');

    setCurrentLanguage('en-US');
    expect(detailByName('mysql', 'COUNT')).toBe('Aggregate function - count');
  });

  it('localizes mysql and starrocks function completion details for zh-CN and en-US', () => {
    setCurrentLanguage('zh-CN');
    expect(detailByName('mysql', 'GROUP_CONCAT')).toBe('MySQL - 分组拼接');
    expect(detailByName('starrocks', 'TO_BITMAP')).toBe('StarRocks - 构造 Bitmap');

    setCurrentLanguage('en-US');
    expect(detailByName('mysql', 'GROUP_CONCAT')).toBe('MySQL - grouped concatenation');
    expect(detailByName('starrocks', 'TO_BITMAP')).toBe('StarRocks - build bitmap');
  });

  it('localizes postgresql and oracle function completion details for zh-CN and en-US', () => {
    setCurrentLanguage('zh-CN');
    expect(detailByName('postgres', 'STRING_AGG')).toBe('PostgreSQL - 字符串聚合');
    expect(detailByName('oracle', 'NVL')).toBe('Oracle - NULL 替换');

    setCurrentLanguage('en-US');
    expect(detailByName('postgres', 'STRING_AGG')).toBe('PostgreSQL - string aggregation');
    expect(detailByName('oracle', 'NVL')).toBe('Oracle - null replacement');
  });

  it('localizes sql server and sqlite function completion details for zh-CN and en-US', () => {
    setCurrentLanguage('zh-CN');
    expect(detailByName('sqlserver', 'GETDATE')).toBe('SQL Server - 当前日期时间');
    expect(detailByName('sqlite', 'JSON_EXTRACT')).toBe('SQLite - JSON 提取');

    setCurrentLanguage('en-US');
    expect(detailByName('sqlserver', 'GETDATE')).toBe('SQL Server - current date and time');
    expect(detailByName('sqlite', 'JSON_EXTRACT')).toBe('SQLite - JSON value extraction');
  });

  it('localizes duckdb clickhouse and tdengine function completion details for zh-CN and en-US', () => {
    setCurrentLanguage('zh-CN');
    expect(detailByName('duckdb', 'STRUCT_PACK')).toBe('DuckDB - 构造结构体');
    expect(detailByName('clickhouse', 'formatDateTime')).toBe('ClickHouse - 日期格式化');
    expect(detailByName('tdengine', 'TIMEDIFF')).toBe('TDengine - 时间差');

    setCurrentLanguage('en-US');
    expect(detailByName('duckdb', 'STRUCT_PACK')).toBe('DuckDB - build struct');
    expect(detailByName('clickhouse', 'formatDateTime')).toBe('ClickHouse - date formatting');
    expect(detailByName('tdengine', 'TIMEDIFF')).toBe('TDengine - time difference');
  });
});
