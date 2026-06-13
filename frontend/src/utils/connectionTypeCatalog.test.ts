import { describe, expect, it } from 'vitest';

import {
  CONNECTION_TYPE_GROUPS,
  getAllConnectionTypeCatalogItems,
  getConnectionTypeDefaultPort,
  getConnectionTypeHint,
} from './connectionTypeCatalog';

describe('connectionTypeCatalog', () => {
  it('keeps supported connection types grouped for the creation modal', () => {
    expect(CONNECTION_TYPE_GROUPS.map((group) => group.label)).toEqual([
      '关系型数据库',
      '国产数据库',
      'NoSQL',
      '向量数据库',
      '时序数据库',
      '其他',
    ]);

    const keys = getAllConnectionTypeCatalogItems().map((item) => item.key);
    expect(keys).toContain('mysql');
    expect(keys).toContain('oceanbase');
    expect(keys).toContain('mongodb');
    expect(keys).toContain('redis');
    expect(keys).toContain('elasticsearch');
    expect(keys).toContain('chroma');
    expect(keys).toContain('jvm');
    expect(keys).toContain('custom');
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('returns the existing default port mapping for supported connection types', () => {
    expect(getConnectionTypeDefaultPort('mysql')).toBe(3306);
    expect(getConnectionTypeDefaultPort('oceanbase')).toBe(2881);
    expect(getConnectionTypeDefaultPort('diros')).toBe(9030);
    expect(getConnectionTypeDefaultPort('postgres')).toBe(5432);
    expect(getConnectionTypeDefaultPort('redis')).toBe(6379);
    expect(getConnectionTypeDefaultPort('oracle')).toBe(1521);
    expect(getConnectionTypeDefaultPort('mongodb')).toBe(27017);
    expect(getConnectionTypeDefaultPort('elasticsearch')).toBe(9200);
    expect(getConnectionTypeDefaultPort('chroma')).toBe(8000);
    expect(getConnectionTypeDefaultPort('sqlite')).toBe(0);
    expect(getConnectionTypeDefaultPort('duckdb')).toBe(0);
    expect(getConnectionTypeDefaultPort('unknown')).toBe(3306);
  });

  it('keeps concise localized hints for special connection types', () => {
    expect(getConnectionTypeHint('redis')).toBe('单机 / 哨兵 / 集群');
    expect(getConnectionTypeHint('mongodb')).toBe('单机 / 副本集');
    expect(getConnectionTypeHint('elasticsearch')).toContain('Mapping');
    expect(getConnectionTypeHint('chroma')).toContain('向量');
    expect(getConnectionTypeHint('oceanbase')).toBe('MySQL / Oracle 租户');
    expect(getConnectionTypeHint('duckdb')).toBe('本地文件连接');
    expect(getConnectionTypeHint('mysql')).toBe('标准连接配置');
  });
});
