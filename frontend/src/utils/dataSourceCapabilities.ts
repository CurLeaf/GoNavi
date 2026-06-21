import type { ConnectionConfig } from '../types';
import { normalizeOceanBaseProtocol } from './oceanBaseProtocol';

type ConnectionLike = Pick<ConnectionConfig, 'type' | 'driver' | 'oceanBaseProtocol'> | null | undefined;

const normalizeDataSourceToken = (raw: string): string => {
  const normalized = String(raw || '').trim().toLowerCase();
  switch (normalized) {
    case 'doris':
      return 'diros';
    case 'starrocks':
      return 'starrocks';
    case 'postgresql':
      return 'postgres';
    case 'opengauss':
    case 'open_gauss':
    case 'open-gauss':
      return 'opengauss';
    case 'gaussdb':
    case 'gauss_db':
    case 'gauss-db':
      return 'gaussdb';
    case 'goldendb':
    case 'greatdb':
    case 'gdb':
      return 'goldendb';
    case 'dm':
      return 'dameng';
    case 'elastic':
    case 'elasticsearch':
      return 'elasticsearch';
    case 'chromadb':
    case 'chroma-db':
      return 'chroma';
    case 'qdrantdb':
    case 'qdrant-db':
      return 'qdrant';
    case 'rocketmq':
    case 'rocket-mq':
    case 'rocket_mq':
    case 'apache-rocketmq':
    case 'apache_rocketmq':
    case 'rmq':
      return 'rocketmq';
    case 'mqtt':
    case 'mqtts':
      return 'mqtt';
    case 'apache-iotdb':
    case 'apache_iotdb':
      return 'iotdb';
    case 'kafka':
    case 'apache-kafka':
    case 'apache_kafka':
      return 'kafka';
    case 'rabbitmq':
    case 'rabbit-mq':
    case 'rabbit_mq':
      return 'rabbitmq';
    case 'intersystems':
    case 'intersystemsiris':
    case 'inter-systems':
    case 'inter-systems-iris':
      return 'iris';
    default:
      return normalized;
  }
};

export const resolveDataSourceType = (config: ConnectionLike): string => {
  if (!config) return '';
  const type = normalizeDataSourceToken(String(config.type || ''));
  if (type === 'custom') {
    const driver = normalizeDataSourceToken(String(config.driver || ''));
    if (driver === 'oceanbase' && normalizeOceanBaseProtocol(config.oceanBaseProtocol) === 'oracle') {
      return 'oracle';
    }
    return driver || 'custom';
  }
  if (type === 'oceanbase' && normalizeOceanBaseProtocol(config.oceanBaseProtocol) === 'oracle') {
    return 'oracle';
  }
  return type;
};

export const shouldShowOceanBaseRowNumberColumn = (config: ConnectionLike): boolean => {
  if (!config) return false;
  const type = normalizeDataSourceToken(String(config.type || ''));
  const driver = normalizeDataSourceToken(String(config.driver || ''));
  return type === 'oceanbase' || driver === 'oceanbase';
};

const SQL_QUERY_EXPORT_TYPES = new Set([
  'mysql',
  'goldendb',
  'mariadb',
  'oceanbase',
  'diros',
  'starrocks',
  'sphinx',
  'postgres',
  'kingbase',
  'highgo',
  'vastbase',
  'opengauss',
  'gaussdb',
  'sqlserver',
  'iris',
  'sqlite',
  'duckdb',
  'oracle',
  'dameng',
  'tdengine',
  'clickhouse',
  'trino',
]);

const COPY_INSERT_TYPES = new Set([
  'mysql',
  'goldendb',
  'mariadb',
  'oceanbase',
  'diros',
  'starrocks',
  'sphinx',
  'postgres',
  'kingbase',
  'highgo',
  'vastbase',
  'opengauss',
  'gaussdb',
  'sqlserver',
  'iris',
  'sqlite',
  'duckdb',
  'oracle',
  'dameng',
  'tdengine',
  'clickhouse',
  'trino',
]);

const QUERY_EDITOR_DISABLED_TYPES = new Set(['redis']);
const FORCE_READ_ONLY_QUERY_TYPES = new Set(['tdengine', 'iotdb', 'clickhouse', 'rocketmq', 'mqtt', 'kafka', 'rabbitmq']);
const MESSAGE_PUBLISH_TYPES = new Set(['rocketmq', 'mqtt', 'kafka', 'rabbitmq']);
const MANUAL_TOTAL_COUNT_TYPES = new Set(['duckdb', 'oracle', 'rocketmq', 'mqtt']);
const APPROXIMATE_TABLE_COUNT_TYPES = new Set(['duckdb', 'oracle']);
const APPROXIMATE_TOTAL_PAGE_TYPES = new Set(['duckdb']);

export type DataSourceCapabilities = {
  type: string;
  supportsQueryEditor: boolean;
  supportsSqlQueryExport: boolean;
  supportsCopyInsert: boolean;
  supportsCreateDatabase: boolean;
  supportsRenameDatabase: boolean;
  supportsDropDatabase: boolean;
  supportsMessagePublish: boolean;
  forceReadOnlyQueryResult: boolean;
  preferManualTotalCount: boolean;
  supportsApproximateTableCount: boolean;
  supportsApproximateTotalPages: boolean;
};

const CREATE_DATABASE_TYPES = new Set([
  'mysql',
  'goldendb',
  'mariadb',
  'oceanbase',
  'diros',
  'starrocks',
  'postgres',
  'kingbase',
  'highgo',
  'vastbase',
  'opengauss',
  'gaussdb',
  'sqlserver',
  'tdengine',
  'clickhouse',
]);

const RENAME_DATABASE_TYPES = new Set([
  'diros',
  'postgres',
  'kingbase',
  'highgo',
  'vastbase',
  'opengauss',
  'gaussdb',
]);

const DROP_DATABASE_TYPES = new Set([
  'mysql',
  'goldendb',
  'mariadb',
  'oceanbase',
  'diros',
  'starrocks',
  'postgres',
  'kingbase',
  'highgo',
  'vastbase',
  'opengauss',
  'gaussdb',
  'tdengine',
  'clickhouse',
]);

export const getDataSourceCapabilities = (config: ConnectionLike): DataSourceCapabilities => {
  const type = resolveDataSourceType(config);
  return {
    type,
    supportsQueryEditor: !QUERY_EDITOR_DISABLED_TYPES.has(type),
    supportsSqlQueryExport: SQL_QUERY_EXPORT_TYPES.has(type),
    supportsCopyInsert: COPY_INSERT_TYPES.has(type),
    supportsCreateDatabase: CREATE_DATABASE_TYPES.has(type),
    supportsRenameDatabase: RENAME_DATABASE_TYPES.has(type),
    supportsDropDatabase: DROP_DATABASE_TYPES.has(type),
    supportsMessagePublish: MESSAGE_PUBLISH_TYPES.has(type),
    forceReadOnlyQueryResult: FORCE_READ_ONLY_QUERY_TYPES.has(type),
    preferManualTotalCount: MANUAL_TOTAL_COUNT_TYPES.has(type),
    supportsApproximateTableCount: APPROXIMATE_TABLE_COUNT_TYPES.has(type),
    supportsApproximateTotalPages: APPROXIMATE_TOTAL_PAGE_TYPES.has(type),
  };
};
