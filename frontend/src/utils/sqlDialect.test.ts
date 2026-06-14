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
    expect(resolveSqlDialect('OpenGauss')).toBe('opengauss');
    expect(resolveSqlDialect('GaussDB')).toBe('gaussdb');
    expect(resolveSqlDialect('OceanBase')).toBe('oceanbase');
    expect(resolveSqlDialect('doris')).toBe('diros');
    expect(resolveSqlDialect('StarRocks')).toBe('starrocks');
    expect(resolveSqlDialect('dameng')).toBe('dameng');
    expect(resolveSqlDialect('InterSystems IRIS')).toBe('iris');
    expect(resolveSqlDialect('custom', 'intersystemsiris')).toBe('iris');
    expect(resolveSqlDialect('custom', 'kingbase8')).toBe('kingbase');
    expect(resolveSqlDialect('custom', 'dm8')).toBe('dameng');
    expect(resolveSqlDialect('custom', 'mariadb')).toBe('mariadb');
    expect(resolveSqlDialect('custom', 'gdb')).toBe('mysql');
    expect(resolveSqlDialect('custom', 'goldendb')).toBe('mysql');
    expect(resolveSqlDialect('custom', 'greatdb')).toBe('mysql');
    expect(resolveSqlDialect('custom', 'open_gauss')).toBe('opengauss');
    expect(resolveSqlDialect('custom', 'gauss_db')).toBe('gaussdb');
    expect(resolveSqlDialect('Elasticsearch')).toBe('elasticsearch');
    expect(resolveSqlDialect('custom', 'elastic')).toBe('elasticsearch');
    expect(resolveSqlDialect('ChromaDB')).toBe('chroma');
    expect(resolveSqlDialect('custom', 'chroma-db')).toBe('chroma');
    expect(resolveSqlDialect('QdrantDB')).toBe('qdrant');
    expect(resolveSqlDialect('custom', 'qdrant-db')).toBe('qdrant');
    expect(resolveSqlDialect('Apache-IoTDB')).toBe('iotdb');
    expect(resolveSqlDialect('custom', 'apache_iotdb')).toBe('iotdb');
    expect(resolveSqlDialect('Apache-Kafka')).toBe('kafka');
    expect(resolveSqlDialect('custom', 'apache_kafka')).toBe('kafka');
    expect(resolveSqlDialect('Rabbit-MQ')).toBe('rabbitmq');
    expect(resolveSqlDialect('custom', 'rabbit_mq')).toBe('rabbitmq');
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
    expect(values(resolveColumnTypeOptions('gaussdb'))).toContain('integer');
    expect(values(resolveColumnTypeOptions('oceanbase'))).toContain('varchar(255)');
    expect(values(resolveColumnTypeOptions('kingbase'))).not.toContain('tinyint(1)');
    expect(values(resolveColumnTypeOptions('diros'))).toContain('LARGEINT');
    expect(values(resolveColumnTypeOptions('starrocks'))).toContain('PERCENTILE');
    expect(values(resolveColumnTypeOptions('sphinx'))).toContain('text');
    expect(values(resolveColumnTypeOptions('clickhouse'))).toContain('DateTime64(3)');
    expect(values(resolveColumnTypeOptions('iris'))).toContain('varchar(255)');
    expect(values(resolveColumnTypeOptions('tdengine'))).toContain('TIMESTAMP');
    expect(values(resolveColumnTypeOptions('iotdb'))).toContain('INT64');
    expect(values(resolveColumnTypeOptions('duckdb'))).toContain('STRUCT');
  });

  it('resolves Apache IoTDB completion keywords and functions independently', () => {
    expect(resolveSqlKeywords('iotdb')).toEqual(expect.arrayContaining(['ALIGN BY DEVICE', 'SHOW TIMESERIES', 'WITH DATATYPE']));
    expect(names(resolveSqlFunctions('iotdb'))).toEqual(expect.arrayContaining(['DATE_BIN', 'DIFF', 'TOP_K']));
    expect(resolveSqlKeywords('iotdb')).not.toEqual(expect.arrayContaining(['TAGS', 'USING']));
  });

  it('resolves Kafka completion keywords for topic discovery and consume syntax', () => {
    expect(resolveSqlKeywords('kafka')).toEqual(expect.arrayContaining(['SHOW TOPICS', 'DESCRIBE TOPIC', 'CONSUME']));
    expect(resolveSqlKeywords('kafka')).not.toEqual(expect.arrayContaining(['ALIGN BY DEVICE', 'AUTO_INCREMENT']));
  });

  it('resolves RabbitMQ completion keywords for queue and exchange discovery', () => {
    expect(resolveSqlKeywords('rabbitmq')).toEqual(expect.arrayContaining(['SHOW VHOSTS', 'SHOW QUEUES', 'SHOW EXCHANGES', 'DESCRIBE QUEUE']));
    expect(resolveSqlKeywords('rabbitmq')).not.toEqual(expect.arrayContaining(['ALIGN BY DEVICE', 'AUTO_INCREMENT']));
  });

  it('resolves GaussDB completion keywords and functions as a PostgreSQL-like dialect', () => {
    expect(resolveSqlKeywords('gaussdb')).toEqual(expect.arrayContaining(['RETURNING', 'SERIAL', 'JSONB']));
    expect(names(resolveSqlFunctions('gaussdb'))).toEqual(expect.arrayContaining(['STRING_AGG', 'TO_CHAR', 'CURRENT_DATABASE']));
    expect(resolveSqlKeywords('gaussdb')).not.toEqual(expect.arrayContaining(['AUTO_INCREMENT', 'CHANGE']));
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
});
