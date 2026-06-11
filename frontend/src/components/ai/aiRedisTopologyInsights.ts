import type { SavedConnection } from '../../types';

const normalizeText = (input: unknown): string => String(input || '').trim();

const normalizeLowerText = (input: unknown): string => normalizeText(input).toLowerCase();

const normalizeLimit = (input: unknown, fallback: number, max: number): number => {
  const value = Math.floor(Number(input) || fallback);
  if (value < 1) return 1;
  if (value > max) return max;
  return value;
};

const normalizeRedisTopology = (input: unknown): 'single' | 'cluster' | 'sentinel' => {
  const value = normalizeLowerText(input);
  if (value === 'cluster') return 'cluster';
  if (value === 'sentinel') return 'sentinel';
  return 'single';
};

const buildSeedAddresses = (connection: SavedConnection): string[] => {
  const config = connection.config || {};
  const defaultPort = Number.isFinite(Number(config.port)) ? Number(config.port) : 6379;
  const primary = normalizeText(config.host)
    ? `${normalizeText(config.host)}:${defaultPort}`
    : '';
  const extraHosts = Array.isArray(config.hosts)
    ? config.hosts.map((host) => normalizeText(host)).filter(Boolean)
    : [];
  return [primary, ...extraHosts].filter(Boolean);
};

const matchesKeyword = (keyword: string, connection: SavedConnection, seedAddresses: string[]): boolean => {
  if (!keyword) return true;
  const config = connection.config || {};
  return [
    connection.id,
    connection.name,
    config.type,
    config.host,
    config.user,
    config.database,
    config.topology,
    config.redisSentinelMaster,
    config.redisSentinelUser,
    ...seedAddresses,
  ].some((field) => normalizeLowerText(field).includes(keyword));
};

const buildRedisTopologyWarnings = (connection: SavedConnection, seedAddresses: string[]): string[] => {
  const config = connection.config || {};
  const topology = normalizeRedisTopology(config.topology);
  const warnings: string[] = [];

  if (!normalizeText(config.host)) {
    warnings.push('主机地址为空，连接前需要填写 Redis 节点或 Sentinel 地址');
  }
  if ((topology === 'cluster' || topology === 'sentinel') && config.useSSH === true) {
    warnings.push(`${topology === 'cluster' ? 'Redis Cluster' : 'Redis Sentinel'} 当前后端不支持 SSH 隧道，请改用直连、代理或远程 MCP HTTP 方案`);
  }
  if (topology === 'sentinel') {
    if (!normalizeText(config.redisSentinelMaster)) {
      warnings.push('Sentinel master 名称为空，go-redis FailoverClient 无法发现主节点');
    }
    if (seedAddresses.length < 2) {
      warnings.push('Sentinel 只配置了一个节点，建议至少填写 2-3 个 Sentinel 地址以避免单点失败');
    }
    if (Number(config.port) === 6379) {
      warnings.push('Sentinel 主地址端口是 6379，请确认这里填写的是 Sentinel 端口，常见默认值是 26379');
    }
  }
  if (topology === 'cluster') {
    if (seedAddresses.length < 2) {
      warnings.push('Cluster 只配置了一个种子节点，建议填写多个 master/replica 节点提高发现成功率');
    }
    const redisDB = Number(config.redisDB || 0);
    const includeRedisDatabases = Array.isArray(connection.includeRedisDatabases)
      ? connection.includeRedisDatabases.filter((item) => typeof item === 'number')
      : [];
    if (redisDB > 0 || includeRedisDatabases.some((item) => item > 0)) {
      warnings.push('Redis Cluster 物理上只支持 db0；GoNavi 会用 __gonavi_db_N__: 前缀模拟逻辑库隔离');
    }
    if (normalizeText(config.redisSentinelMaster) || normalizeText(config.redisSentinelUser)) {
      warnings.push('Cluster 模式下 Sentinel master / Sentinel 用户字段不会生效');
    }
  }
  if (topology === 'single') {
    if (seedAddresses.length > 1) {
      warnings.push('单机模式下存在多个节点地址，后端会按多节点集群路径处理，建议显式改为 Cluster 模式');
    }
    if (normalizeText(config.redisSentinelMaster) || normalizeText(config.redisSentinelUser)) {
      warnings.push('单机模式下 Sentinel 字段不会生效，如需哨兵发现请切换为 Sentinel 模式');
    }
  }

  return warnings;
};

const buildRedisTopologyRecommendations = (connection: SavedConnection, warnings: string[]): string[] => {
  const config = connection.config || {};
  const topology = normalizeRedisTopology(config.topology);
  const recommendations: string[] = [];

  if (topology === 'sentinel') {
    recommendations.push('确认主机和附加节点填写的是 Sentinel 地址，不是 Redis master 地址');
    recommendations.push('分别填写 Redis 数据节点账号密码和 Sentinel 自身账号密码，二者不要混用');
  } else if (topology === 'cluster') {
    recommendations.push('优先配置 2 个以上种子节点，并确认这些节点属于同一个 Redis Cluster');
    recommendations.push('如果需要多库视图，优先在业务 key 上显式使用命名空间，避免误解 Cluster 的物理 db0 限制');
  } else {
    recommendations.push('单机模式只填写一个 Redis 地址；如果有多个节点，请改用 Cluster 或 Sentinel 模式');
  }

  if (warnings.some((warning) => warning.includes('SSH'))) {
    recommendations.push('跨网络访问 Redis Cluster/Sentinel 时，优先使用网络代理、VPN 或 GoNavi MCP HTTP，而不是单端口 SSH 隧道');
  }
  if (config.useSSL === true) {
    recommendations.push('已启用 TLS，连接失败时优先核对 sslMode、CA/证书路径和服务端 SNI');
  }
  return recommendations;
};

export const buildRedisTopologySnapshot = (params: {
  connections: SavedConnection[];
  connectionId?: unknown;
  keyword?: unknown;
  limit?: unknown;
  includeRecommendations?: unknown;
}) => {
  const {
    connections,
    connectionId,
    keyword,
    limit,
    includeRecommendations,
  } = params;
  const safeConnectionId = normalizeText(connectionId);
  const safeKeyword = normalizeLowerText(keyword);
  const safeLimit = normalizeLimit(limit, 20, 100);
  const shouldIncludeRecommendations = includeRecommendations !== false;

  const redisConnections = connections.filter((connection) =>
    normalizeLowerText(connection.config?.type) === 'redis',
  );
  const matchedConnections = redisConnections.filter((connection) => {
    if (safeConnectionId && connection.id !== safeConnectionId) {
      return false;
    }
    return matchesKeyword(safeKeyword, connection, buildSeedAddresses(connection));
  });

  const topologyBreakdown = matchedConnections.reduce<Record<string, number>>((acc, connection) => {
    const key = normalizeRedisTopology(connection.config?.topology);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const visibleConnections = matchedConnections.slice(0, safeLimit).map((connection) => {
    const config = connection.config || {};
    const topology = normalizeRedisTopology(config.topology);
    const seedAddresses = buildSeedAddresses(connection);
    const warnings = buildRedisTopologyWarnings(connection, seedAddresses);
    const includeRedisDatabases = Array.isArray(connection.includeRedisDatabases)
      ? connection.includeRedisDatabases.filter((item) => typeof item === 'number')
      : [];
    return {
      id: connection.id,
      name: connection.name,
      topology,
      host: normalizeText(config.host),
      port: Number.isFinite(Number(config.port)) ? Number(config.port) : null,
      seedAddresses,
      seedAddressCount: seedAddresses.length,
      redisDB: typeof config.redisDB === 'number' ? config.redisDB : 0,
      includeRedisDatabases,
      useSSL: config.useSSL === true,
      sslMode: config.sslMode || '',
      useSSH: config.useSSH === true,
      useProxy: config.useProxy === true,
      useHttpTunnel: config.useHttpTunnel === true,
      sentinelMaster: topology === 'sentinel' ? normalizeText(config.redisSentinelMaster) : '',
      hasRedisAuth: Boolean(normalizeText(config.user) || normalizeText(config.password) || connection.hasPrimaryPassword === true),
      hasSentinelAuth: topology === 'sentinel'
        ? Boolean(normalizeText(config.redisSentinelUser) || normalizeText(config.redisSentinelPassword) || connection.hasRedisSentinelPassword === true)
        : false,
      warnings,
      recommendations: shouldIncludeRecommendations
        ? buildRedisTopologyRecommendations(connection, warnings)
        : undefined,
    };
  });

  const warningCount = visibleConnections.reduce((total, connection) => total + connection.warnings.length, 0);

  return {
    connectionId: safeConnectionId,
    keyword: safeKeyword,
    limit: safeLimit,
    totalRedisConnections: redisConnections.length,
    totalMatched: matchedConnections.length,
    returnedConnections: visibleConnections.length,
    truncated: matchedConnections.length > visibleConnections.length,
    topologyBreakdown,
    warningCount,
    connections: visibleConnections,
  };
};
