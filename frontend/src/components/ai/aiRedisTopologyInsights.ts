import type { SavedConnection } from '../../types';
import type { AIInspectionTranslator } from './aiInspectionI18n';
import { translateInspectionCopy } from './aiInspectionI18n';

type RedisTopology = 'single' | 'cluster' | 'sentinel';

type RedisTopologyWarningCode =
  | 'missing_host'
  | 'ssh_unsupported'
  | 'missing_sentinel_master'
  | 'single_sentinel_node'
  | 'sentinel_default_redis_port'
  | 'cluster_single_seed'
  | 'cluster_logical_db'
  | 'cluster_sentinel_fields_ignored'
  | 'single_multiple_nodes'
  | 'single_sentinel_fields_ignored';

interface RedisTopologyWarning {
  code: RedisTopologyWarningCode;
  message: string;
  blocking: boolean;
}

const redisTopologyCopy = (
  translate: AIInspectionTranslator | undefined,
  key: string,
  fallback: string,
  params?: Record<string, string | number | boolean | null | undefined>,
): string => translateInspectionCopy(translate, `ai_chat.inspection.redis_topology.${key}`, fallback, params);

const normalizeText = (input: unknown): string => String(input || '').trim();

const normalizeLowerText = (input: unknown): string => normalizeText(input).toLowerCase();

const normalizeLimit = (input: unknown, fallback: number, max: number): number => {
  const value = Math.floor(Number(input) || fallback);
  if (value < 1) return 1;
  if (value > max) return max;
  return value;
};

const normalizeRedisTopology = (input: unknown): RedisTopology => {
  const value = normalizeLowerText(input);
  if (value === 'cluster') return 'cluster';
  if (value === 'sentinel') return 'sentinel';
  return 'single';
};

const resolveEffectiveRedisTopology = (
  configuredTopology: RedisTopology,
  seedAddresses: string[],
): RedisTopology => {
  if (configuredTopology === 'sentinel') return 'sentinel';
  if (configuredTopology === 'cluster' || seedAddresses.length > 1) return 'cluster';
  return 'single';
};

const topologyAdapterName = (topology: RedisTopology): string => {
  if (topology === 'sentinel') return 'go-redis FailoverClient';
  if (topology === 'cluster') return 'go-redis ClusterClient';
  return 'go-redis Client';
};

const topologyModeLabel = (
  topology: RedisTopology,
  translate?: AIInspectionTranslator,
): string => {
  if (topology === 'sentinel') {
    return redisTopologyCopy(translate, 'label.sentinel', 'Redis Sentinel');
  }
  if (topology === 'cluster') {
    return redisTopologyCopy(translate, 'label.cluster', 'Redis Cluster');
  }
  return redisTopologyCopy(translate, 'label.single', 'Standalone Redis');
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

const buildRedisTopologyWarnings = (
  connection: SavedConnection,
  seedAddresses: string[],
  translate?: AIInspectionTranslator,
): RedisTopologyWarning[] => {
  const config = connection.config || {};
  const configuredTopology = normalizeRedisTopology(config.topology);
  const effectiveTopology = resolveEffectiveRedisTopology(configuredTopology, seedAddresses);
  const warnings: RedisTopologyWarning[] = [];
  const pushWarning = (
    code: RedisTopologyWarningCode,
    fallback: string,
    options: {
      blocking?: boolean;
      params?: Record<string, string | number | boolean | null | undefined>;
    } = {},
  ) => {
    warnings.push({
      code,
      blocking: options.blocking === true,
      message: redisTopologyCopy(translate, `warning.${code}`, fallback, options.params),
    });
  };

  if (!normalizeText(config.host)) {
    pushWarning(
      'missing_host',
      'Host is empty; fill in a Redis node or Sentinel address before connecting',
      { blocking: true },
    );
  }
  if ((effectiveTopology === 'cluster' || effectiveTopology === 'sentinel') && config.useSSH === true) {
    const topologyLabel = topologyModeLabel(effectiveTopology, translate);
    pushWarning(
      'ssh_unsupported',
      `${topologyLabel} is not supported with SSH tunnels by the current backend; use direct access, a proxy, or remote MCP HTTP instead`,
      {
        blocking: true,
        params: { topologyLabel },
      },
    );
  }
  if (configuredTopology === 'sentinel') {
    if (!normalizeText(config.redisSentinelMaster)) {
      pushWarning(
        'missing_sentinel_master',
        'Sentinel master name is empty; go-redis FailoverClient cannot discover the primary node',
        { blocking: true },
      );
    }
    if (seedAddresses.length < 2) {
      pushWarning(
        'single_sentinel_node',
        'Only one Sentinel node is configured; provide at least 2-3 Sentinel addresses to avoid a single point of failure',
      );
    }
    if (Number(config.port) === 6379) {
      pushWarning(
        'sentinel_default_redis_port',
        'The primary Sentinel address uses port 6379; confirm this is a Sentinel port, commonly 26379 by default',
      );
    }
  }
  if (effectiveTopology === 'cluster') {
    if (seedAddresses.length < 2) {
      pushWarning(
        'cluster_single_seed',
        'Only one Cluster seed node is configured; add multiple master/replica nodes to improve discovery reliability',
      );
    }
    const redisDB = Number(config.redisDB || 0);
    const includeRedisDatabases = Array.isArray(connection.includeRedisDatabases)
      ? connection.includeRedisDatabases.filter((item) => typeof item === 'number')
      : [];
    if (redisDB > 0 || includeRedisDatabases.some((item) => item > 0)) {
      pushWarning(
        'cluster_logical_db',
        'Redis Cluster physically supports only db0; GoNavi uses the __gonavi_db_N__: prefix to emulate logical DB isolation',
      );
    }
    if (normalizeText(config.redisSentinelMaster) || normalizeText(config.redisSentinelUser)) {
      pushWarning(
        'cluster_sentinel_fields_ignored',
        'Sentinel master and Sentinel user fields do not take effect in Cluster mode',
      );
    }
  }
  if (configuredTopology === 'single') {
    if (seedAddresses.length > 1) {
      pushWarning(
        'single_multiple_nodes',
        'Standalone mode has multiple node addresses; the backend will use the multi-node Cluster path, so explicitly switch to Cluster mode',
      );
    }
    if (normalizeText(config.redisSentinelMaster) || normalizeText(config.redisSentinelUser)) {
      pushWarning(
        'single_sentinel_fields_ignored',
        'Sentinel fields do not take effect in Standalone mode; switch to Sentinel mode if Sentinel discovery is required',
      );
    }
  }

  return warnings;
};

const buildSafeRedisUriExample = (
  connection: SavedConnection,
  seedAddresses: string[],
): string => {
  const config = connection.config || {};
  const configuredTopology = normalizeRedisTopology(config.topology);
  const effectiveTopology = resolveEffectiveRedisTopology(configuredTopology, seedAddresses);
  const scheme = config.useSSL === true ? 'rediss' : 'redis';
  const hosts = seedAddresses.length > 0 ? seedAddresses : ['localhost:6379'];
  const params = new URLSearchParams();
  if (effectiveTopology === 'sentinel') {
    params.set('topology', 'sentinel');
    const masterName = normalizeText(config.redisSentinelMaster);
    if (masterName) {
      params.set('master', masterName);
    }
    const sentinelUser = normalizeText(config.redisSentinelUser);
    if (sentinelUser) {
      params.set('sentinel_user', sentinelUser);
    }
    if (normalizeText(config.redisSentinelPassword) || connection.hasRedisSentinelPassword === true) {
      params.set('sentinel_password', '<hidden>');
    }
  } else if (effectiveTopology === 'cluster') {
    params.set('topology', 'cluster');
  }
  if (config.useSSL === true) {
    const sslMode = normalizeLowerText(config.sslMode || 'preferred');
    if (sslMode === 'skip-verify' || sslMode === 'preferred') {
      params.set('skip_verify', 'true');
    }
  }

  const redisUser = normalizeText(config.user);
  const hasRedisPassword = normalizeText(config.password) || connection.hasPrimaryPassword === true;
  const auth = redisUser
    ? `${encodeURIComponent(redisUser)}${hasRedisPassword ? ':<hidden>' : ''}@`
    : hasRedisPassword
      ? ':<hidden>@'
      : '';
  const redisDB = effectiveTopology === 'cluster' ? 0 : Number(config.redisDB || 0);
  const query = params.toString();
  return `${scheme}://${auth}${hosts.join(',')}/${Number.isFinite(redisDB) ? Math.max(0, Math.trunc(redisDB)) : 0}${query ? `?${query}` : ''}`;
};

const buildRedisDBSemantics = (
  connection: SavedConnection,
  effectiveTopology: RedisTopology,
  translate?: AIInspectionTranslator,
) => {
  const config = connection.config || {};
  const redisDB = typeof config.redisDB === 'number' ? config.redisDB : 0;
  const includeRedisDatabases = Array.isArray(connection.includeRedisDatabases)
    ? connection.includeRedisDatabases.filter((item) => typeof item === 'number')
    : [];
  if (effectiveTopology === 'cluster') {
    return {
      physicalDb: 0,
      selectedDb: redisDB,
      includeRedisDatabases,
      mode: 'cluster_logical_namespace',
      note: redisTopologyCopy(
        translate,
        'db_note.cluster_logical_namespace',
        'Redis Cluster physically supports only db0; GoNavi uses the __gonavi_db_N__: prefix to emulate a multi-DB view.',
      ),
    };
  }
  return {
    physicalDb: redisDB,
    selectedDb: redisDB,
    includeRedisDatabases,
    mode: effectiveTopology === 'sentinel' ? 'failover_selected_db' : 'selected_db',
    note: effectiveTopology === 'sentinel'
      ? redisTopologyCopy(
        translate,
        'db_note.sentinel_selected_db',
        'After Sentinel discovers the master, GoNavi connects to the selected DB and keeps the Sentinel settings when reconnecting.',
      )
      : redisTopologyCopy(
        translate,
        'db_note.single_selected_db',
        'Standalone mode uses Redis SELECT DB directly.',
      ),
  };
};

const buildRedisNextActions = (
  connection: SavedConnection,
  warnings: RedisTopologyWarning[],
  translate?: AIInspectionTranslator,
): string[] => {
  const config = connection.config || {};
  const topology = normalizeRedisTopology(config.topology);
  const actions: string[] = [];
  if (!normalizeText(config.host)) {
    actions.push(redisTopologyCopy(
      translate,
      'next_action.fill_host',
      'Fill in the host first; use Sentinel addresses for Sentinel mode and Redis Cluster seed nodes for Cluster mode.',
    ));
  }
  if (topology === 'sentinel' && !normalizeText(config.redisSentinelMaster)) {
    actions.push(redisTopologyCopy(
      translate,
      'next_action.fill_sentinel_master',
      'Fill in the Sentinel master name, for example mymaster.',
    ));
  }
  if (warnings.some((warning) => warning.code === 'ssh_unsupported')) {
    actions.push(redisTopologyCopy(
      translate,
      'next_action.disable_ssh',
      'Disable the SSH tunnel and use direct access, proxy/VPN, or GoNavi MCP HTTP so the remote Agent can access Redis through local GoNavi.',
    ));
  }
  if (warnings.some((warning) => warning.code === 'sentinel_default_redis_port')) {
    actions.push(redisTopologyCopy(
      translate,
      'next_action.check_sentinel_port',
      'Change the primary Sentinel address port to 26379 unless your Sentinel explicitly listens on another port.',
    ));
  }
  if (warnings.some((warning) => warning.code === 'cluster_logical_db')) {
    actions.push(redisTopologyCopy(
      translate,
      'next_action.review_cluster_logical_db',
      'Confirm whether the workload really needs a Redis Cluster multi-DB view; if this is only key grouping, prefer an application namespace.',
    ));
  }
  if (warnings.some((warning) => warning.code === 'single_multiple_nodes')) {
    actions.push(redisTopologyCopy(
      translate,
      'next_action.align_single_topology',
      'Explicitly switch to Cluster mode, or remove extra nodes and keep one Standalone address to avoid mismatch between configured and backend topology.',
    ));
  }
  if (actions.length === 0) {
    const topologyLabel = topologyModeLabel(topology, translate);
    actions.push(redisTopologyCopy(
      translate,
      'next_action.test_connection',
      `The configuration looks usable for ${topologyLabel}; next, test the connection and inspect the Redis DB/key tree.`,
      { topologyLabel },
    ));
  }
  return actions;
};

const buildRedisTopologyRecommendations = (
  connection: SavedConnection,
  warnings: RedisTopologyWarning[],
  translate?: AIInspectionTranslator,
): string[] => {
  const config = connection.config || {};
  const configuredTopology = normalizeRedisTopology(config.topology);
  const seedAddresses = buildSeedAddresses(connection);
  const effectiveTopology = resolveEffectiveRedisTopology(configuredTopology, seedAddresses);
  const recommendations: string[] = [];

  if (configuredTopology === 'sentinel') {
    recommendations.push(redisTopologyCopy(
      translate,
      'recommendation.sentinel_addresses',
      'Confirm that host and extra nodes are Sentinel addresses, not Redis master addresses.',
    ));
    recommendations.push(redisTopologyCopy(
      translate,
      'recommendation.separate_auth',
      'Fill Redis data-node credentials and Sentinel credentials separately; do not mix them.',
    ));
  } else if (effectiveTopology === 'cluster') {
    recommendations.push(redisTopologyCopy(
      translate,
      'recommendation.cluster_multiple_seeds',
      'Prefer at least two seed nodes, and confirm these nodes belong to the same Redis Cluster.',
    ));
    recommendations.push(redisTopologyCopy(
      translate,
      'recommendation.cluster_namespace',
      'If a multi-DB view is needed, prefer explicit namespaces in business keys to avoid misunderstanding the physical db0 limit of Cluster.',
    ));
  } else {
    recommendations.push(redisTopologyCopy(
      translate,
      'recommendation.single_one_address',
      'Standalone mode should contain one Redis address; if there are multiple nodes, use Cluster or Sentinel mode instead.',
    ));
  }

  if (warnings.some((warning) => warning.code === 'ssh_unsupported')) {
    recommendations.push(redisTopologyCopy(
      translate,
      'recommendation.network_for_cluster_sentinel',
      'For cross-network Redis Cluster/Sentinel access, prefer a network proxy, VPN, or GoNavi MCP HTTP instead of a single-port SSH tunnel.',
    ));
  }
  if (config.useSSL === true) {
    recommendations.push(redisTopologyCopy(
      translate,
      'recommendation.check_tls',
      'TLS is enabled; if connection fails, first check sslMode, CA/certificate paths, and server SNI.',
    ));
  }
  return recommendations;
};

export const buildRedisTopologySnapshot = (params: {
  connections: SavedConnection[];
  connectionId?: unknown;
  keyword?: unknown;
  limit?: unknown;
  includeRecommendations?: unknown;
  translate?: AIInspectionTranslator;
}) => {
  const {
    connections,
    connectionId,
    keyword,
    limit,
    includeRecommendations,
    translate,
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
    const effectiveTopology = resolveEffectiveRedisTopology(topology, seedAddresses);
    const warningDetails = buildRedisTopologyWarnings(connection, seedAddresses, translate);
    const warnings = warningDetails.map((warning) => warning.message);
    const includeRedisDatabases = Array.isArray(connection.includeRedisDatabases)
      ? connection.includeRedisDatabases.filter((item) => typeof item === 'number')
      : [];
    const blockingReasons = warningDetails
      .filter((warning) => warning.blocking)
      .map((warning) => warning.message);
    const status = blockingReasons.length > 0
      ? 'blocked'
      : warnings.length > 0
        ? 'needs_attention'
        : 'ready';
    return {
      id: connection.id,
      name: connection.name,
      topology,
      topologyLabel: topologyModeLabel(topology, translate),
      effectiveTopology,
      effectiveTopologyLabel: topologyModeLabel(effectiveTopology, translate),
      topologyMismatch: topology !== effectiveTopology,
      status,
      blockingReasons,
      backendAdapter: topologyAdapterName(effectiveTopology),
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
      safeUriExample: buildSafeRedisUriExample(connection, seedAddresses),
      dbSemantics: buildRedisDBSemantics(connection, effectiveTopology, translate),
      warnings,
      nextActions: buildRedisNextActions(connection, warningDetails, translate),
      recommendations: shouldIncludeRecommendations
        ? buildRedisTopologyRecommendations(connection, warningDetails, translate)
        : undefined,
    };
  });

  const warningCount = visibleConnections.reduce((total, connection) => total + connection.warnings.length, 0);
  const blockedCount = visibleConnections.filter((connection) => connection.status === 'blocked').length;

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
    blockedCount,
    connections: visibleConnections,
  };
};
