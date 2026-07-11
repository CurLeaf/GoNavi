import { describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';

import {
  buildConnectionTypeGroups,
  CONNECTION_TYPE_GROUPS,
  getAllConnectionTypeCatalogItems,
  getConnectionTypeDefaultPort,
  getConnectionTypeHint,
} from './connectionTypeCatalog';

const source = readFileSync(new URL('./connectionTypeCatalog.ts', import.meta.url), 'utf8');

const translatedCopy: Record<string, string> = {
  'connection_modal.step1.group.relational': 'T:relational',
  'connection_modal.step1.group.domestic': 'T:domestic',
  'connection_modal.step1.group.nosql': 'T:nosql',
  'connection_modal.step1.group.vector': 'T:vector',
  'connection_modal.step1.group.timeseries': 'T:timeseries',
  'connection_modal.step1.group.message_queue': 'T:message-queue',
  'connection_modal.step1.group.other': 'T:other',
  'connection_modal.step1.hint.redis': 'T:redis',
  'connection_modal.step1.hint.mongodb': 'T:mongodb',
  'connection_modal.step1.hint.elasticsearch': 'T:elasticsearch',
  'connection_modal.step1.hint.chroma': 'T:chroma',
  'connection_modal.step1.hint.qdrant': 'T:qdrant',
  'connection_modal.step1.hint.milvus': 'T:milvus',
  'connection_modal.step1.hint.oceanBase': 'T:oceanbase',
  'connection_modal.step1.hint.goldendb': 'T:goldendb',
  'connection_modal.step1.hint.file': 'T:file',
  'connection_modal.step1.hint.standard': 'T:standard',
  'connection_modal.db_icon_label.custom': 'T:custom',
};

const translate = (key: string) => translatedCopy[key] || key;

describe('connectionTypeCatalog', () => {
  it('keeps supported connection types grouped for the creation modal', () => {
    expect(CONNECTION_TYPE_GROUPS.map((group) => group.labelKey)).toEqual([
      'connection_modal.step1.group.relational',
      'connection_modal.step1.group.domestic',
      'connection_modal.step1.group.nosql',
      'connection_modal.step1.group.vector',
      'connection_modal.step1.group.timeseries',
      'connection_modal.step1.group.message_queue',
      'connection_modal.step1.group.other',
    ]);
    expect(buildConnectionTypeGroups(translate).map((group) => group.label)).toEqual([
      'T:relational',
      'T:domestic',
      'T:nosql',
      'T:vector',
      'T:timeseries',
      'T:message-queue',
      'T:other',
    ]);
    expect(
      buildConnectionTypeGroups(translate)
        .flatMap((group) => group.items)
        .find((item) => item.key === 'custom')?.name,
    ).toBe('T:custom');

    const keys = getAllConnectionTypeCatalogItems().map((item) => item.key);
    expect(keys).toContain('mysql');
    expect(keys).toContain('oceanbase');
    expect(keys).toContain('gaussdb');
    expect(keys).toContain('goldendb');
    expect(keys).toContain('trino');
    expect(keys).toContain('mongodb');
    expect(keys).toContain('redis');
    expect(keys).toContain('elasticsearch');
    expect(keys).toContain('chroma');
    expect(keys).toContain('qdrant');
    expect(keys).toContain('milvus');
    expect(keys).toContain('iotdb');
    expect(keys).toContain('kafka');
    expect(keys).toContain('jvm');
    expect(keys).toContain('custom');
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('returns the existing default port mapping for supported connection types', () => {
    expect(getConnectionTypeDefaultPort('mysql')).toBe(3306);
    expect(getConnectionTypeDefaultPort('oceanbase')).toBe(2881);
    expect(getConnectionTypeDefaultPort('goldendb')).toBe(1523);
    expect(getConnectionTypeDefaultPort('diros')).toBe(9030);
    expect(getConnectionTypeDefaultPort('postgres')).toBe(5432);
    expect(getConnectionTypeDefaultPort('gaussdb')).toBe(5432);
    expect(getConnectionTypeDefaultPort('redis')).toBe(6379);
    expect(getConnectionTypeDefaultPort('oracle')).toBe(1521);
    expect(getConnectionTypeDefaultPort('mongodb')).toBe(27017);
    expect(getConnectionTypeDefaultPort('trino')).toBe(8080);
    expect(getConnectionTypeDefaultPort('elasticsearch')).toBe(9200);
    expect(getConnectionTypeDefaultPort('chroma')).toBe(8000);
    expect(getConnectionTypeDefaultPort('qdrant')).toBe(6333);
    expect(getConnectionTypeDefaultPort('milvus')).toBe(19530);
    expect(getConnectionTypeDefaultPort('iotdb')).toBe(6667);
    expect(getConnectionTypeDefaultPort('kafka')).toBe(9092);
    expect(getConnectionTypeDefaultPort('sqlite')).toBe(0);
    expect(getConnectionTypeDefaultPort('duckdb')).toBe(0);
    expect(getConnectionTypeDefaultPort('unknown')).toBe(3306);
  });

  it('keeps concise localized hints for special connection types', () => {
    expect(getConnectionTypeHint('redis', translate)).toBe('T:redis');
    expect(getConnectionTypeHint('mongodb', translate)).toBe('T:mongodb');
    expect(getConnectionTypeHint('elasticsearch', translate)).toBe('T:elasticsearch');
    expect(getConnectionTypeHint('chroma', translate)).toBe('T:chroma');
    expect(getConnectionTypeHint('qdrant', translate)).toBe('T:qdrant');
    expect(getConnectionTypeHint('milvus', translate)).toBe('T:milvus');
    expect(getConnectionTypeHint('iotdb')).toContain('Timeseries');
    expect(getConnectionTypeHint('kafka')).toContain('Consumer Group');
    expect(getConnectionTypeHint('oceanbase', translate)).toBe('T:oceanbase');
    expect(getConnectionTypeHint('goldendb', translate)).toBe('T:goldendb');
    expect(getConnectionTypeHint('trino')).toBe('HTTP / HTTPS / catalog.schema');
    expect(getConnectionTypeHint('duckdb', translate)).toBe('T:file');
    expect(getConnectionTypeHint('mysql', translate)).toBe('T:standard');
  });

  it('keeps connection type group labels and hints out of hard-coded Chinese UI copy', () => {
    [
      '关系型数据库',
      '国产数据库',
      '向量数据库',
      '时序数据库',
      '消息队列',
      '其他',
      '自定义驱动与 DSN',
      '单机 / 哨兵 / 集群',
      '单机 / 副本集',
      '支持索引浏览、Mapping 检查、JSON DSL 和 query_string 查询',
      'Collection 浏览、向量检索和元数据过滤',
      'Collection 浏览、向量搜索和 Payload 过滤',
      'MySQL / Oracle 租户',
      'MySQL 兼容 / 分布式事务',
      '本地文件连接',
      '标准连接配置',
      'Custom (自定义)',
    ].forEach((snippet) => {
      expect(source).not.toContain(snippet);
    });
  });
});
