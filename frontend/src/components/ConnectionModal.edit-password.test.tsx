import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const connectionModalSource = readFileSync(new URL('./ConnectionModal.tsx', import.meta.url), 'utf8');
const redisSectionsSource = readFileSync(new URL('./ConnectionModalRedisSections.tsx', import.meta.url), 'utf8');
const mongoSectionsSource = readFileSync(new URL('./ConnectionModalMongoSections.tsx', import.meta.url), 'utf8');
const connectionTypeCatalogSource = readFileSync(new URL('../utils/connectionTypeCatalog.ts', import.meta.url), 'utf8');
const connectionTypeCapabilitiesSource = readFileSync(new URL('../utils/connectionTypeCapabilities.ts', import.meta.url), 'utf8');
const source = `${connectionModalSource}\n${redisSectionsSource}\n${mongoSectionsSource}\n${connectionTypeCatalogSource}\n${connectionTypeCapabilitiesSource}`;

describe('ConnectionModal edit password behavior', () => {
  it('keeps the prefilled primary password masked by default', () => {
    expect(source).toContain('const [primaryPasswordVisible, setPrimaryPasswordVisible] = useState(false);');
    expect(source).not.toContain('setPrimaryPasswordVisible(String(config.password || "").trim() !== "")');
    expect(source).toContain('visible: primaryPasswordVisible,');
  });

  it('does not render the primary-password clear helper block anymore', () => {
    expect(source).not.toContain('description:\n                          "当前已保存主连接密码。留空表示继续沿用，输入新值表示替换。"');
    expect(source).not.toContain('description:\n                          "当前已保存 Redis 密码。留空表示继续沿用，输入新值表示替换。"');
    expect(source).toContain('String(config.password || "") === ""');
  });
});

describe('ConnectionModal data source registry', () => {
  it('exposes Elasticsearch in the create-connection picker with HTTP defaults', () => {
    expect(source).toContain("case 'elasticsearch':");
    expect(source).toContain('return 9200;');
    expect(source).toContain('elasticsearch: ["http", "https"]');
    expect(source).toContain("key: 'elasticsearch'");
    expect(source).toContain("name: 'Elasticsearch'");
    expect(source).toContain('icon: getDbIcon(item.key, undefined, 36)');
    expect(source).toContain('type === "elasticsearch"');
    expect(source).toContain("return '支持索引浏览、Mapping 检查、JSON DSL 和 query_string 查询';");
    expect(source).toContain(
      'type === "clickhouse" ? "default" : (type === "redis" || type === "elasticsearch" || type === "chroma" || type === "qdrant" || type === "mqtt" || type === "kafka" || type === "rabbitmq") ? "" : "root";',
    );
    expect(source).toContain(
      'placeholder={(dbType === "elasticsearch" || dbType === "chroma" || dbType === "qdrant" || dbType === "mqtt" || dbType === "kafka" || dbType === "rabbitmq") ? "未开启认证可留空" : undefined}',
    );
    expect(source).toContain('label="显示数据库 (留空显示全部)"');
  });

  it('exposes Chroma in the create-connection picker with vector defaults', () => {
    expect(source).toContain("case 'chroma':");
    expect(source).toContain('return 8000;');
    expect(source).toContain('chroma: ["http", "https", "chroma"]');
    expect(source).toContain("key: 'chroma'");
    expect(source).toContain("name: 'Chroma'");
    expect(source).toContain('type === "chroma"');
    expect(source).toContain("return 'Collection 浏览、向量检索和元数据过滤';");
    expect(source).toContain('return "http://127.0.0.1:8000/default_database?tenant=default_tenant";');
    expect(source).toContain('return "tenant=default_tenant&apiKey=...";');
  });

  it('exposes Qdrant in the create-connection picker with vector defaults', () => {
    expect(source).toContain("case 'qdrant':");
    expect(source).toContain('return 6333;');
    expect(source).toContain('qdrant: ["http", "https", "qdrant"]');
    expect(source).toContain("key: 'qdrant'");
    expect(source).toContain("name: 'Qdrant'");
    expect(source).toContain('type === "qdrant"');
    expect(source).toContain("return 'Collection 浏览、向量搜索和 Payload 过滤';");
    expect(source).toContain('return "http://127.0.0.1:6333";');
    expect(source).toContain('return "apiKey=...";');
  });

  it('exposes Apache IoTDB in the create-connection picker with timeseries defaults', () => {
    expect(source).toContain("case 'iotdb':");
    expect(source).toContain('return 6667;');
    expect(source).toContain('iotdb: ["iotdb"]');
    expect(source).toContain("key: 'iotdb'");
    expect(source).toContain("name: 'Apache IoTDB'");
    expect(source).toContain('dbType === "iotdb"');
    expect(source).toContain("return 'Storage Group / Device / Timeseries';");
    expect(source).toContain('return "iotdb://root:root@127.0.0.1:6667/root.sg";');
    expect(source).toContain('return "fetchSize=1024&timeZone=Asia%2FShanghai";');
  });

  it('exposes MQTT in the create-connection picker with broker and topic-filter defaults', () => {
    expect(source).toContain("case 'mqtt':");
    expect(source).toContain('return 1883;');
    expect(source).toContain('mqtt: ["mqtt", "mqtts", "tcp", "ssl", "tls"]');
    expect(source).toContain("key: 'mqtt'");
    expect(source).toContain("name: 'MQTT'");
    expect(source).toContain('dbType === "mqtt"');
    expect(source).toContain("return 'Broker / Topic Filter / QoS';");
    expect(source).toContain('return "mqtt://user:pass@127.0.0.1:1883/devices%2F%2B%2Ftelemetry?topology=cluster&clientId=gonavi-desktop&qos=1";');
    expect(source).toContain('return "topics=devices%2F%2B%2Ftelemetry,%24SYS%2F%23&clientId=gonavi-desktop&qos=1&cleanSession=true&fetchWaitMs=4000";');
    expect(source).toContain('label="默认 Topic / Filter（可选）"');
  });

  it('exposes Kafka in the create-connection picker with broker and topic defaults', () => {
    expect(source).toContain("case 'kafka':");
    expect(source).toContain('return 9092;');
    expect(source).toContain("key: 'kafka'");
    expect(source).toContain("name: 'Kafka'");
    expect(source).toContain('dbType === "kafka"');
    expect(source).toContain("return 'Broker / Topic / Consumer Group';");
    expect(source).toContain('return "kafka://user:pass@127.0.0.1:9092,127.0.0.2:9092/orders.events?topology=cluster&groupId=analytics&mechanism=scram-sha-256";');
    expect(source).toContain('return "groupId=gonavi&mechanism=scram-sha-256&clientId=gonavi-desktop&startOffset=latest";');
    expect(source).toContain('label="默认 Topic（可选）"');
  });

  it('exposes RabbitMQ in the create-connection picker with management-api and vhost defaults', () => {
    expect(source).toContain("case 'rabbitmq':");
    expect(source).toContain('return 15672;');
    expect(source).toContain('rabbitmq: ["rabbitmq", "http", "https"]');
    expect(source).toContain("key: 'rabbitmq'");
    expect(source).toContain("name: 'RabbitMQ'");
    expect(source).toContain('dbType === "rabbitmq"');
    expect(source).toContain("return 'Management API / Virtual Host / Queue';");
    expect(source).toContain('return "rabbitmq://guest:guest@127.0.0.1:15672/%2F?defaultQueue=orders.queue&exchange=events.topic&timeout=30";');
    expect(source).toContain('return "defaultQueue=orders.queue&exchange=events.topic&managementPathPrefix=/rabbitmq";');
    expect(source).toContain('label="默认 Virtual Host（可选）"');
  });

  it('exposes GaussDB in the create-connection picker with PostgreSQL-family defaults', () => {
    expect(source).toContain("case 'gaussdb':");
    expect(source).toContain('return 5432;');
    expect(source).toContain('gaussdb: ["gaussdb", "postgresql", "postgres"]');
    expect(source).toContain("key: 'gaussdb'");
    expect(source).toContain("name: 'GaussDB'");
    expect(source).toContain('type === "gaussdb"');
    expect(source).toContain('return "gaussdb://user:pass@127.0.0.1:5432/db_name";');
    expect(source).toContain('return "application_name=GoNavi&statement_timeout=30000";');
    expect(source).toContain('? "gaussdb"');
    expect(source).toContain('dbType === "gaussdb"');
  });

  it('exposes GoldenDB in the create-connection picker with MySQL-compatible defaults', () => {
    expect(source).toContain("case 'goldendb':");
    expect(source).toContain('return 1523;');
    expect(source).toContain("key: 'goldendb'");
    expect(source).toContain("name: 'GoldenDB'");
    expect(source).toContain('type === "goldendb"');
    expect(source).toContain("return 'MySQL 兼容 / 分布式事务';");
    expect(source).toContain('dbType === "goldendb" ? "goldendb" : "mysql"');
    expect(source).toContain('type === "goldendb" ? "goldendb" : "mysql"');
    expect(source).toContain('? "goldendb"');
  });
});

describe('ConnectionModal Redis Sentinel configuration', () => {
  it('exposes Sentinel topology fields and safe defaults', () => {
    expect(source).toContain('label: "哨兵模式"');
    expect(source).toContain('name="redisSentinelMaster"');
    expect(source).toContain('Sentinel master 名称');
    expect(source).toContain('name="redisSentinelPassword"');
    expect(source).toContain('hasRedisSentinelPassword');
    expect(source).toContain('clearKey: "redisSentinelPassword"');
    expect(source).toContain('form.setFieldValue("port", 26379)');
    expect(source).toContain('form.setFieldValue("port", 6379)');
  });

  it('keeps the saved host as the primary Redis node when editing multi-node configs', () => {
    expect(source).toContain('const savedPrimaryAddress = isFileDbConfigType');
    expect(source).toContain('savedPrimaryAddress,');
    expect(source).toContain('...(Array.isArray(config.hosts) ? config.hosts : [])');
    expect(source).toContain('const redisHosts =');
    expect(source).toContain('configType === "redis" ? normalizedHosts.slice(1) : [];');
  });
});

describe('ConnectionModal MongoDB configuration', () => {
  it('keeps replica, SRV, and read preference fields in the split Mongo sections', () => {
    expect(source).toContain('ConnectionModalMongoSections');
    expect(source).toContain('name="mongoSrv"');
    expect(source).toContain('SRV 与 SSH 隧道同时启用');
    expect(source).toContain('name="mongoReplicaPassword"');
    expect(source).toContain('clearKey: "mongoReplicaPassword"');
    expect(source).toContain('自动发现成员');
    expect(source).toContain('fieldName: "mongoReadPreference"');
  });
});
