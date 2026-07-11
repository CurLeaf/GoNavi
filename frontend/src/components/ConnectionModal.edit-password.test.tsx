import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const connectionModalSource = readFileSync(new URL('./ConnectionModal.tsx', import.meta.url), 'utf8');
const connectionModalConfigSource = readFileSync(new URL('./connectionModal/connectionModalConfig.ts', import.meta.url), 'utf8');
const connectionModalStep2Source = readFileSync(new URL('./connectionModal/ConnectionModalStep2.tsx', import.meta.url), 'utf8');
const connectionModalNetworkSecuritySource = readFileSync(new URL('./connectionModal/ConnectionModalNetworkSecuritySection.tsx', import.meta.url), 'utf8');
const connectionModalUriSource = readFileSync(new URL('./connectionModal/connectionModalUri.ts', import.meta.url), 'utf8');
const redisSectionsSource = readFileSync(new URL('./ConnectionModalRedisSections.tsx', import.meta.url), 'utf8');
const mongoSectionsSource = readFileSync(new URL('./ConnectionModalMongoSections.tsx', import.meta.url), 'utf8');
const connectionTypeCatalogSource = readFileSync(new URL('../utils/connectionTypeCatalog.ts', import.meta.url), 'utf8');
const connectionTypeCapabilitiesSource = readFileSync(new URL('../utils/connectionTypeCapabilities.ts', import.meta.url), 'utf8');
const source = `${connectionModalSource}\n${connectionModalConfigSource}\n${connectionModalStep2Source}\n${connectionModalNetworkSecuritySource}\n${connectionModalUriSource}\n${redisSectionsSource}\n${mongoSectionsSource}\n${connectionTypeCatalogSource}\n${connectionTypeCapabilitiesSource}`;

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

  it('reuses the shared backend-cancel helper for file and certificate pickers', () => {
    expect(source).not.toContain('res?.message !== "已取消"');
    expect(source.match(/isBackendCancelledResult\(res\)/g) ?? []).toHaveLength(3);
  });

  it('uses localized SSL mode labels instead of hardcoded English strings', () => {
    expect(source).not.toContain('label: "Preferred"');
    expect(source).not.toContain('label: "Required"');
    expect(source).not.toContain('label: "Skip Verify"');
    expect(source).toMatch(
      /label:\s*t\(\s*"connection\.modal\.network\.ssl_mode\.preferred",\s*\)/,
    );
    expect(source).toMatch(
      /label:\s*t\(\s*"connection\.modal\.network\.ssl_mode\.required",\s*\)/,
    );
    expect(source).toMatch(
      /label:\s*t\(\s*"connection\.modal\.network\.ssl_mode\.skip_verify",\s*\)/,
    );
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
    expect(source).toContain("'connection_modal.step1.hint.elasticsearch'");
    expect(source).toContain(
      "'Index browsing, Mapping inspection, JSON DSL, and query_string queries'",
    );
    expect(source).toContain('const PRIMARY_USERNAME_OPTIONAL_TYPES = new Set([');
    expect(source).toContain('"mqtt",');
    expect(source).toContain(
      'type === "clickhouse" ? "default" : (type === "redis" || type === "elasticsearch" || type === "chroma" || type === "qdrant" || type === "milvus" || type === "rocketmq" || type === "mqtt" || type === "kafka" || type === "rabbitmq") ? "" : "root";',
    );
    expect(source).toContain('PRIMARY_USERNAME_OPTIONAL_TYPES.has(dbType)');
    expect(source).toContain('connection.modal.field.displayDatabases.label');
  });

  it('keeps MQTT username optional during test-connection validation', () => {
    expect(source).toContain('"mqtt",');
    expect(source).toContain('PRIMARY_USERNAME_OPTIONAL_TYPES.has(dbType)');
    expect(source).toContain('connection.modal.field.username.required');
    expect(source).toContain('connection.modal.field.username.optional_placeholder');
  });

  it('exposes Chroma in the create-connection picker with vector defaults', () => {
    expect(source).toContain("case 'chroma':");
    expect(source).toContain('return 8000;');
    expect(source).toContain('chroma: ["http", "https", "chroma"]');
    expect(source).toContain("key: 'chroma'");
    expect(source).toContain("name: 'Chroma'");
    expect(source).toContain('type === "chroma"');
    expect(source).toContain("'connection_modal.step1.hint.chroma'");
    expect(source).toContain(
      "'Collection browsing, vector retrieval, and metadata filtering'",
    );
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
    expect(source).toContain("'connection_modal.step1.hint.qdrant'");
    expect(source).toContain(
      "'Collection browsing, vector search, and Payload filtering'",
    );
    expect(source).toContain('return "http://127.0.0.1:6333";');
    expect(source).toContain('return "apiKey=...";');
  });

  it('exposes Milvus in the create-connection picker with vector defaults', () => {
    expect(source).toContain("case 'milvus':");
    expect(source).toContain('return 19530;');
    expect(source).toContain('milvus: ["http", "https", "milvus"]');
    expect(source).toContain("key: 'milvus'");
    expect(source).toContain("name: 'Milvus'");
    expect(source).toContain('type === "milvus"');
    expect(source).toContain("'connection_modal.step1.hint.milvus'");
    expect(source).toContain(
      "'Collection browsing, vector search, and scalar filtering'",
    );
    expect(source).toContain('return "http://127.0.0.1:19530/default";');
    expect(source).toContain('return "token=...";');
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

  it('exposes RocketMQ in the create-connection picker with nameserver and topic defaults', () => {
    expect(source).toContain("case 'rocketmq':");
    expect(source).toContain('return 9876;');
    expect(source).toContain('rocketmq: ["rocketmq", "rmq"]');
    expect(source).toContain("key: 'rocketmq'");
    expect(source).toContain("name: 'RocketMQ'");
    expect(source).toContain('dbType === "rocketmq"');
    expect(source).toContain("return 'NameServer / Topic / Consumer Group';");
    expect(source).toContain('return "rocketmq://accessKey:secretKey@127.0.0.1:9876,127.0.0.2:9876/orders.events?topology=cluster&groupId=gonavi&namespace=prod&tag=TagA&pullBatchSize=32&startOffset=latest";');
    expect(source).toContain('return "groupId=gonavi&namespace=prod&tag=TagA&pullBatchSize=32&startOffset=latest";');
    expect(source).toContain('t("connection.modal.messageQueue.rocketmq.defaultTopic.label")');
    expect(source).toContain('connection.modal.field.username.label');
    expect(source).toContain('connection.modal.field.password.label');
    expect(source).toContain('connection.modal.field.username.optional_placeholder');
    expect(source).toContain('connection.modal.field.password.retained');
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
    expect(source).toContain('t("connection.modal.messageQueue.mqtt.defaultTopicFilter.label")');
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
    expect(source).toContain('t("connection.modal.messageQueue.kafka.defaultTopic.label")');
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
    expect(source).toContain('t("connection.modal.messageQueue.rabbitmq.defaultVirtualHost.label")');
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
    expect(source).toContain("'connection_modal.step1.hint.goldendb'");
    expect(source).toContain("'MySQL compatible / distributed transactions'");
    expect(source).toContain('dbType === "goldendb" ? "goldendb" : "mysql"');
    expect(source).toContain('type === "goldendb" ? "goldendb" : "mysql"');
    expect(source).toContain('? "goldendb"');
  });

  it('keeps OceanBase Oracle service name optional for OBClient/MySQL-wire connections', () => {
    expect(source).toContain('connection.modal.field.oceanBaseServiceName.label');
    expect(source).toMatch(
      /isOceanBaseOracle\s*\?\s*\[\]\s*:\s*\[\s*createUriAwareRequiredRule\(\s*t\("connection\.modal\.field\.serviceName\.required"/,
    );
    expect(source).toContain('connection.modal.field.oceanBaseServiceName.help');
    expect(source).toContain('connection.modal.field.serviceName.help');
    expect(source).toContain('connection.modal.field.serviceName.required');
    expect(source).not.toContain('请输入 OceanBase Oracle 服务名');
    expect(source).not.toContain('Oracle 租户必须填写监听器注册的 SERVICE_NAME');
  });

  it('uses localized message queue service, topology, and extra host copy', () => {
    [
      'label="默认 Topic（可选）"',
      'label="默认 Topic / Filter（可选）"',
      'label="默认 Virtual Host（可选）"',
      'label: "单 Broker"',
      'label: "单 NameServer"',
      'label="额外 Broker 地址"',
      'label="额外 NameServer 地址"',
      'help="可输入多个 broker 地址，格式：host:port（回车确认）"',
      'help="可输入多个 NameServer 地址，格式：host:port（回车确认）"',
    ].forEach((snippet) => {
      expect(source).not.toContain(snippet);
    });

    [
      'connection.modal.messageQueue.kafka.defaultTopic.help',
      'connection.modal.messageQueue.rocketmq.defaultTopic.help',
      'connection.modal.messageQueue.mqtt.defaultTopicFilter.help',
      'connection.modal.messageQueue.rabbitmq.defaultVirtualHost.help',
      'connection.modal.messageQueue.kafka.topology.single.label',
      'connection.modal.messageQueue.rocketmq.topology.single.label',
      'connection.modal.messageQueue.mqtt.topology.cluster.description',
      'connection.modal.messageQueue.kafka.extraBrokers.placeholder',
      'connection.modal.messageQueue.rocketmq.extraNameServers.placeholder',
      'connection.modal.messageQueue.mqtt.extraBrokers.placeholder',
    ].forEach((key) => {
      expect(source).toContain(key);
    });
  });
});

describe('ConnectionModal Redis Sentinel configuration', () => {
  it('exposes Sentinel topology fields and safe defaults', () => {
    expect(source).toContain('connection.modal.redis.topology.sentinel.label');
    expect(source).toContain('name="redisSentinelMaster"');
    expect(source).toContain('connection.modal.redis.sentinel.master.label');
    expect(source).toContain('name="redisSentinelPassword"');
    expect(source).toContain('hasRedisSentinelPassword');
    expect(source).toContain('clearKey: "redisSentinelPassword"');
    expect(source).toContain('form.setFieldValue("port", 26379)');
    expect(source).toContain('form.setFieldValue("port", 6379)');
  });

  it('uses localized Redis topology, sentinel, credential, and database-scope copy', () => {
    [
      'label: "单机模式"',
      'description: "只连接一个 Redis 节点。"',
      'label: "集群模式"',
      'description: "Redis Cluster，配置多个种子节点。"',
      'label: "哨兵模式"',
      'description: "通过 Sentinel 发现主节点，适合主从高可用。"',
      '? "Sentinel 附加节点地址"',
      ': "集群附加节点地址"',
      '? "上方主机地址作为第一个 Sentinel；这里填写其他 Sentinel 节点，格式：host:port"',
      ': "主节点使用上方主机地址；这里填写其他种子节点，格式：host:port"',
      'label="Sentinel master 名称"',
      'help="填写 Sentinel 配置中的 monitor 名称，例如 mymaster。"',
      'label="密码 (可选)"',
      'emptyPlaceholder: "Redis 密码（如果设置了 requirepass）"',
      'retainedLabel: "已保存 Redis 密码"',
      'label="Sentinel 用户名（可选）"',
      'placeholder="留空表示 Sentinel 不使用 ACL 用户名"',
      'label="Sentinel 密码（可选）"',
      'emptyPlaceholder: "Sentinel 自身认证密码，留空则不发送"',
      'retainedLabel: "已保存 Sentinel 密码"',
      'clearLabel: "清除已保存 Sentinel 密码"',
      'label="显示数据库 (留空显示全部)"',
      'help="连接测试成功后可选择"',
      'placeholder="选择显示的数据库"',
    ].forEach((snippet) => {
      expect(redisSectionsSource).not.toContain(snippet);
    });

    [
      'connection.modal.redis.topology.single.label',
      'connection.modal.redis.topology.cluster.description',
      'connection.modal.redis.topology.sentinel.label',
      'connection.modal.redis.hosts.sentinel.label',
      'connection.modal.redis.hosts.cluster.help',
      'connection.modal.redis.sentinel.master.required',
      'connection.modal.redis.credentials.primary.placeholder.empty',
      'connection.modal.redis.credentials.sentinelPassword.clear',
      'connection.modal.redis.databaseScope.placeholder',
    ].forEach((key) => {
      expect(redisSectionsSource).toContain(key);
    });
  });

  it('uses localized Redis test feedback and optional-auth placeholders', () => {
    [
      '测试连接前请填写新的 Sentinel 密码，或取消清除已保存 Sentinel 密码',
      '连接成功但拉取 Redis 数据库列表超时',
      '连接成功，但获取 Redis 数据库列表失败',
      '未知错误',
      '? "未开启认证可留空"',
    ].forEach((snippet) => {
      expect(connectionModalSource).not.toContain(snippet);
    });

    [
      'connection.modal.secret.blocking.redis_sentinel',
      'connection.modal.test.redis_database_list_timeout',
      'connection.modal.test.redis_database_list_failure',
      'connection.modal.error.unknown',
      'connection.modal.field.username.optional_placeholder',
    ].forEach((key) => {
      expect(source).toContain(key);
    });
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
    expect(source).toContain('connection.modal.mongodb.discovery.srv_ssh_warning');
    expect(source).toContain('name="mongoReplicaPassword"');
    expect(source).toContain('clearKey: "mongoReplicaPassword"');
    expect(source).toContain('connection.modal.action.discover_members');
    expect(source).toContain('fieldName: "mongoReadPreference"');
  });

  it('uses localized MongoDB topology, discovery, replica, and policy copy', () => {
    [
      'label: "单机模式"',
      'description: "只连接一个 MongoDB 节点。"',
      'label: "副本集 / 多节点"',
      'description: "配置副本集名称和多个候选节点。"',
      'label: "标准地址"',
      'description: "使用 host:port 直连或副本集节点列表。"',
      'label: "SRV 地址"',
      'description: "使用 mongodb+srv，由 DNS 发现目标节点。"',
      '<Tag color="blue">当前</Tag>',
      'message="SRV 与 SSH 隧道同时启用时，可能依赖本地 DNS 解析能力"',
      'label={mongoSrv ? "附加 SRV 主机（可选）" : "附加节点地址"}',
      '? "可输入多个候选主机名，格式：host；若留空则仅使用上方主机。"',
      ': "可输入多个节点地址，格式：host:port（回车确认）"',
      'label="副本集名称（可选）"',
      'label="副本集用户名（可选）"',
      'placeholder="留空沿用主用户名"',
      'label="副本集密码（可选）"',
      'emptyPlaceholder: "留空沿用主密码"',
      'retainedLabel: "已保存副本集密码"',
      'clearLabel: "清除已保存副本集密码"',
      '当前已保存副本集密码。留空表示继续沿用，输入新值表示替换。',
      '自动发现成员',
      'title: "角色"',
      'title: "健康"',
      '? "正常" : "异常"',
      'label="认证库 (authSource)"',
      'placeholder="默认使用 database 或 admin"',
      '<Text strong>读偏好 (readPreference)</Text>',
      'description: "只读主节点。"',
      'description: "主节点优先。"',
      'description: "只读从节点。"',
      'description: "从节点优先。"',
      'description: "选择最近节点。"',
    ].forEach((snippet) => {
      expect(mongoSectionsSource).not.toContain(snippet);
    });

    [
      'connection.modal.mongodb.topology.single.label',
      'connection.modal.mongodb.discovery.standard.label',
      'connection.modal.mongodb.discovery.srv_ssh_warning',
      'connection.modal.mongodb.replica.hosts.srv.label',
      'connection.modal.mongodb.replica.password.description',
      'connection.modal.action.discover_members',
      'connection.modal.mongodb.members.role',
      'connection.modal.mongodb.policy.auth_source.label',
      'connection.modal.mongodb.read_preference.primary',
    ].forEach((key) => {
      expect(mongoSectionsSource).toContain(key);
    });
  });
});
