import { connection } from '../../wailsjs/go/models';

export type RpcConnectionConfig = connection.ConnectionConfig & { id?: string };
type ConnectionConfigInput = {
  id?: string;
  ssh?: Record<string, any>;
  proxy?: Record<string, any>;
  httpTunnel?: Record<string, any>;
  [key: string]: any;
};
type SSHConfigInput = Record<string, any>;
type ProxyConfigInput = Record<string, any>;
type HttpTunnelConfigInput = Record<string, any>;

const toStringValue = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return fallback;
};

const toOptionalInteger = (value: unknown, fallback?: number): number | undefined => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.trunc(parsed);
};

const normalizeProxyType = (value: unknown): 'socks5' | 'http' => {
  return toStringValue(value).toLowerCase() === 'http' ? 'http' : 'socks5';
};

const normalizeSSHConfig = (value: unknown): connection.SSHConfig => {
  const raw = (value ?? {}) as SSHConfigInput;
  return new connection.SSHConfig({
    host: toStringValue(raw.host),
    port: toOptionalInteger(raw.port, 22) ?? 22,
    user: toStringValue(raw.user),
    password: toStringValue(raw.password),
    keyPath: toStringValue(raw.keyPath),
  });
};

const normalizeProxyConfig = (value: unknown): connection.ProxyConfig => {
  const raw = (value ?? {}) as ProxyConfigInput;
  const type = normalizeProxyType(raw.type);
  return new connection.ProxyConfig({
    type,
    host: toStringValue(raw.host),
    port: toOptionalInteger(raw.port, type === 'http' ? 8080 : 1080) ?? (type === 'http' ? 8080 : 1080),
    user: toStringValue(raw.user),
    password: toStringValue(raw.password),
  });
};

const normalizeHttpTunnelConfig = (value: unknown): connection.HTTPTunnelConfig => {
  const raw = (value ?? {}) as HttpTunnelConfigInput;
  return new connection.HTTPTunnelConfig({
    host: toStringValue(raw.host),
    port: toOptionalInteger(raw.port, 8080) ?? 8080,
    user: toStringValue(raw.user),
    password: toStringValue(raw.password),
  });
};

export function buildRpcConnectionConfig(
  config: ConnectionConfigInput,
  overrides: ConnectionConfigInput = {},
): RpcConnectionConfig {
  const mergedSSH = {
    ...(config.ssh ?? {}),
    ...(overrides.ssh ?? {}),
  };
  const mergedProxy = {
    ...(config.proxy ?? {}),
    ...(overrides.proxy ?? {}),
  };
  const mergedHttpTunnel = {
    ...(config.httpTunnel ?? {}),
    ...(overrides.httpTunnel ?? {}),
  };
  const merged: ConnectionConfigInput = {
    ...config,
    ...overrides,
    ssh: mergedSSH,
    proxy: mergedProxy,
    httpTunnel: mergedHttpTunnel,
  };

  const baseId = toStringValue(config.id).trim() || toStringValue(overrides.id).trim() || undefined;
  const timeout = toOptionalInteger(merged.timeout, toOptionalInteger(config.timeout));
  const redisDB = toOptionalInteger(merged.redisDB, toOptionalInteger(config.redisDB));

  const rpcConfig = new connection.ConnectionConfig({
    ...merged,
    type: toStringValue(merged.type),
    host: toStringValue(merged.host),
    port: toOptionalInteger(merged.port, toOptionalInteger(config.port, 0)) ?? 0,
    user: toStringValue(merged.user),
    password: toStringValue(merged.password),
    database: toStringValue(merged.database),
    useSSH: merged.useSSH === true,
    ssh: normalizeSSHConfig(merged.ssh),
    useProxy: merged.useProxy === true,
    proxy: normalizeProxyConfig(merged.proxy),
    useHttpTunnel: merged.useHttpTunnel === true,
    httpTunnel: normalizeHttpTunnelConfig(merged.httpTunnel),
    timeout,
    redisDB,
  }) as RpcConnectionConfig;

  rpcConfig.id = baseId;
  return rpcConfig;
}

