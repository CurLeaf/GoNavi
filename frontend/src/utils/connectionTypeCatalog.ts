export type ConnectionTypeCatalogItem = {
  key: string;
  name: string;
};

export type ConnectionTypeCatalogGroup = {
  label: string;
  items: ConnectionTypeCatalogItem[];
};

export const CONNECTION_TYPE_GROUPS: ConnectionTypeCatalogGroup[] = [
  {
    label: '关系型数据库',
    items: [
      { key: 'mysql', name: 'MySQL' },
      { key: 'mariadb', name: 'MariaDB' },
      { key: 'diros', name: 'Doris' },
      { key: 'starrocks', name: 'StarRocks' },
      { key: 'sphinx', name: 'Sphinx' },
      { key: 'clickhouse', name: 'ClickHouse' },
      { key: 'postgres', name: 'PostgreSQL' },
      { key: 'sqlserver', name: 'SQL Server' },
      { key: 'iris', name: 'InterSystems IRIS' },
      { key: 'sqlite', name: 'SQLite' },
      { key: 'duckdb', name: 'DuckDB' },
      { key: 'oracle', name: 'Oracle' },
    ],
  },
  {
    label: '国产数据库',
    items: [
      { key: 'oceanbase', name: 'OceanBase' },
      { key: 'dameng', name: 'Dameng (达梦)' },
      { key: 'kingbase', name: 'Kingbase (人大金仓)' },
      { key: 'highgo', name: 'HighGo (瀚高)' },
      { key: 'vastbase', name: 'Vastbase (海量)' },
      { key: 'opengauss', name: 'OpenGauss' },
      { key: 'gaussdb', name: 'GaussDB' },
      { key: 'goldendb', name: 'GoldenDB' },
    ],
  },
  {
    label: 'NoSQL',
    items: [
      { key: 'mongodb', name: 'MongoDB' },
      { key: 'redis', name: 'Redis' },
      { key: 'elasticsearch', name: 'Elasticsearch' },
    ],
  },
  {
    label: '向量数据库',
    items: [
      { key: 'chroma', name: 'Chroma' },
      { key: 'qdrant', name: 'Qdrant' },
    ],
  },
  {
    label: '时序数据库',
    items: [
      { key: 'tdengine', name: 'TDengine' },
      { key: 'iotdb', name: 'Apache IoTDB' },
    ],
  },
  {
    label: '消息队列',
    items: [
      { key: 'kafka', name: 'Kafka' },
      { key: 'rabbitmq', name: 'RabbitMQ' },
    ],
  },
  {
    label: '其他',
    items: [
      { key: 'jvm', name: 'JVM Runtime' },
      { key: 'custom', name: 'Custom (自定义)' },
    ],
  },
];

export const getConnectionTypeDefaultPort = (type: string): number => {
  switch (String(type || '').trim().toLowerCase()) {
    case 'jvm':
      return 9010;
    case 'mysql':
      return 3306;
    case 'oceanbase':
      return 2881;
    case 'goldendb':
      return 1523;
    case 'doris':
    case 'diros':
    case 'starrocks':
      return 9030;
    case 'sphinx':
      return 9306;
    case 'clickhouse':
      return 9000;
    case 'postgres':
    case 'opengauss':
    case 'gaussdb':
      return 5432;
    case 'redis':
      return 6379;
    case 'tdengine':
      return 6041;
    case 'iotdb':
      return 6667;
    case 'oracle':
      return 1521;
    case 'dameng':
      return 5236;
    case 'kingbase':
      return 54321;
    case 'sqlserver':
      return 1433;
    case 'iris':
      return 1972;
    case 'mongodb':
      return 27017;
    case 'elasticsearch':
      return 9200;
    case 'chroma':
      return 8000;
    case 'qdrant':
      return 6333;
    case 'kafka':
      return 9092;
    case 'rabbitmq':
      return 15672;
    case 'highgo':
      return 5866;
    case 'mariadb':
      return 3306;
    case 'vastbase':
      return 5432;
    case 'sqlite':
    case 'duckdb':
      return 0;
    default:
      return 3306;
  }
};

export const getConnectionTypeHint = (type: string): string => {
  switch (String(type || '').trim().toLowerCase()) {
    case 'jvm':
      return 'JMX / Endpoint / Agent';
    case 'custom':
      return '自定义驱动与 DSN';
    case 'redis':
      return '单机 / 哨兵 / 集群';
    case 'mongodb':
      return '单机 / 副本集';
    case 'elasticsearch':
      return '支持索引浏览、Mapping 检查、JSON DSL 和 query_string 查询';
    case 'chroma':
      return 'Collection 浏览、向量检索和元数据过滤';
    case 'qdrant':
      return 'Collection 浏览、向量搜索和 Payload 过滤';
    case 'iotdb':
      return 'Storage Group / Device / Timeseries';
    case 'kafka':
      return 'Broker / Topic / Consumer Group';
    case 'rabbitmq':
      return 'Management API / Virtual Host / Queue';
    case 'oceanbase':
      return 'MySQL / Oracle 租户';
    case 'goldendb':
      return 'MySQL 兼容 / 分布式事务';
    case 'sqlite':
    case 'duckdb':
      return '本地文件连接';
    default:
      return '标准连接配置';
  }
};

export const getAllConnectionTypeCatalogItems = (): ConnectionTypeCatalogItem[] =>
  CONNECTION_TYPE_GROUPS.flatMap((group) => group.items);
