import type { ConnectionConfig } from '../types';

export type RedisTopology = Extract<
  NonNullable<ConnectionConfig['topology']>,
  'single' | 'cluster' | 'sentinel'
>;

export interface RedisUriFormValues {
  host: string;
  port: number;
  user: string;
  password: string;
  useSSL: boolean;
  sslMode: 'required' | 'skip-verify' | 'disable';
  sslCAPath?: string;
  sslCertPath?: string;
  sslKeyPath?: string;
  redisTopology: RedisTopology;
  redisHosts: string[];
  redisSentinelMaster: string;
  redisSentinelUser: string;
  redisSentinelPassword: string;
  redisDB: number;
}

export interface RedisConfigDraft {
  primaryPort: number;
  hosts: string[];
  topology: RedisTopology;
  redisSentinelMaster: string;
  redisSentinelUser: string;
  redisSentinelPassword: string;
  redisDB: number;
}

const REDIS_DEFAULT_PORT = 6379;
const REDIS_SENTINEL_DEFAULT_PORT = 26379;
const MAX_URI_HOSTS = 32;

const parseHostPort = (
  raw: string,
  defaultPort: number,
): { host: string; port: number } | null => {
  const text = String(raw || '').trim();
  if (!text) {
    return null;
  }
  if (text.startsWith('[')) {
    const closingBracket = text.indexOf(']');
    if (closingBracket > 0) {
      const host = text.slice(1, closingBracket).trim();
      const portText = text
        .slice(closingBracket + 1)
        .trim()
        .replace(/^:/, '');
      const parsedPort = Number(portText);
      return {
        host: host || 'localhost',
        port:
          Number.isFinite(parsedPort) && parsedPort > 0 && parsedPort <= 65535
            ? parsedPort
            : defaultPort,
      };
    }
  }

  const colonCount = (text.match(/:/g) || []).length;
  if (colonCount === 1) {
    const splitIndex = text.lastIndexOf(':');
    const host = text.slice(0, splitIndex).trim();
    const portText = text.slice(splitIndex + 1).trim();
    const parsedPort = Number(portText);
    return {
      host: host || 'localhost',
      port:
        Number.isFinite(parsedPort) && parsedPort > 0 && parsedPort <= 65535
          ? parsedPort
          : defaultPort,
    };
  }

  return { host: text, port: defaultPort };
};

const toAddress = (host: string, port: number, defaultPort: number) => {
  const safeHost = String(host || '').trim() || 'localhost';
  const safePort =
    Number.isFinite(Number(port)) && Number(port) > 0
      ? Number(port)
      : defaultPort;
  return `${safeHost}:${safePort}`;
};

const normalizeAddressList = (
  rawList: unknown,
  defaultPort: number,
): string[] => {
  const list = Array.isArray(rawList) ? rawList : [];
  const seen = new Set<string>();
  const result: string[] = [];
  list.forEach((entry) => {
    const parsed = parseHostPort(String(entry || ''), defaultPort);
    if (!parsed) {
      return;
    }
    const normalized = toAddress(parsed.host, parsed.port, defaultPort);
    if (seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    result.push(normalized);
  });
  return result;
};

const isValidUriHostEntry = (entry: string): boolean => {
  const text = String(entry || '').trim();
  if (!text) return false;
  if (text.length > 255) return false;
  return !/[()\\/\s]/.test(text);
};

const safeDecode = (text: string) => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

const parseMultiHostUri = (uriText: string, expectedScheme: string) => {
  const prefix = `${expectedScheme}://`;
  if (!uriText.toLowerCase().startsWith(prefix)) {
    return null;
  }
  let rest = uriText.slice(prefix.length);
  const hashIndex = rest.indexOf('#');
  if (hashIndex >= 0) {
    rest = rest.slice(0, hashIndex);
  }
  let queryText = '';
  const queryIndex = rest.indexOf('?');
  if (queryIndex >= 0) {
    queryText = rest.slice(queryIndex + 1);
    rest = rest.slice(0, queryIndex);
  }

  let pathText = '';
  const slashIndex = rest.indexOf('/');
  if (slashIndex >= 0) {
    pathText = rest.slice(slashIndex + 1);
    rest = rest.slice(0, slashIndex);
  }

  let hostText = rest;
  let username = '';
  let password = '';
  const atIndex = rest.lastIndexOf('@');
  if (atIndex >= 0) {
    const userInfo = rest.slice(0, atIndex);
    hostText = rest.slice(atIndex + 1);
    const colonIndex = userInfo.indexOf(':');
    if (colonIndex >= 0) {
      username = safeDecode(userInfo.slice(0, colonIndex));
      password = safeDecode(userInfo.slice(colonIndex + 1));
    } else {
      username = safeDecode(userInfo);
    }
  }

  const hosts = hostText
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    username,
    password,
    hosts,
    database: safeDecode(pathText),
    params: new URLSearchParams(queryText),
  };
};

const firstConnectionParamValue = (
  params: URLSearchParams,
  names: string[],
): string => {
  for (const name of names) {
    const value = String(params.get(name) || '').trim();
    if (value) return value;
  }
  return '';
};

const extractRedisSSLPathValuesFromParams = (
  params: URLSearchParams,
): Pick<RedisUriFormValues, 'sslCAPath' | 'sslCertPath' | 'sslKeyPath'> => {
  const caPath = firstConnectionParamValue(params, [
    'sslCAPath',
    'ssl_ca_path',
    'sslrootcert',
    'sslRootCert',
    'tlsCAFile',
    'caFile',
    'certificate',
    'servercertificate',
    'serverCertificate',
  ]);
  const certPath = firstConnectionParamValue(params, [
    'sslCertPath',
    'ssl_cert_path',
    'SSL_CERT_PATH',
    'sslcert',
    'sslCert',
    'tlsCertificateFile',
  ]);
  const keyPath = firstConnectionParamValue(params, [
    'sslKeyPath',
    'ssl_key_path',
    'SSL_KEY_PATH',
    'sslkey',
    'sslKey',
    'tlsKeyFile',
  ]);
  return {
    ...(caPath ? { sslCAPath: caPath } : {}),
    ...(certPath ? { sslCertPath: certPath } : {}),
    ...(keyPath ? { sslKeyPath: keyPath } : {}),
  };
};

const appendRedisSSLPathParamsForUri = (
  params: URLSearchParams,
  values: Record<string, any>,
) => {
  const caPath = String(values.sslCAPath || '').trim();
  const certPath = String(values.sslCertPath || '').trim();
  const keyPath = String(values.sslKeyPath || '').trim();
  if (caPath) {
    params.set('sslCAPath', caPath);
  }
  if (certPath) {
    params.set('sslCertPath', certPath);
  }
  if (keyPath) {
    params.set('sslKeyPath', keyPath);
  }
};

const normalizeRedisDB = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 15
    ? Math.trunc(parsed)
    : 0;
};

const normalizeRedisTopology = (value: unknown): RedisTopology => {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'cluster' || text === 'sentinel') {
    return text;
  }
  return 'single';
};

export const parseRedisUriToFormValues = (
  uriText: string,
): RedisUriFormValues | null => {
  const trimmedUri = String(uriText || '').trim();
  const parsed =
    parseMultiHostUri(trimmedUri, 'redis') ||
    parseMultiHostUri(trimmedUri, 'rediss');
  if (!parsed) {
    return null;
  }
  if (!parsed.hosts.length || parsed.hosts.length > MAX_URI_HOSTS) {
    return null;
  }
  if (parsed.hosts.some((entry) => !isValidUriHostEntry(entry))) {
    return null;
  }
  const topologyParam = String(parsed.params.get('topology') || '').toLowerCase();
  const isSentinelTopology = topologyParam === 'sentinel';
  const redisNodeDefaultPort = isSentinelTopology
    ? REDIS_SENTINEL_DEFAULT_PORT
    : REDIS_DEFAULT_PORT;
  const hostList = normalizeAddressList(parsed.hosts, redisNodeDefaultPort);
  if (!hostList.length) {
    return null;
  }
  const primary = parseHostPort(
    hostList[0] || `localhost:${redisNodeDefaultPort}`,
    redisNodeDefaultPort,
  );
  const dbText = String(parsed.database || '')
    .trim()
    .replace(/^\//, '');
  const isRediss = trimmedUri.toLowerCase().startsWith('rediss://');
  const skipVerifyText = String(parsed.params.get('skip_verify') || '')
    .trim()
    .toLowerCase();
  const skipVerify =
    skipVerifyText === '1' ||
    skipVerifyText === 'true' ||
    skipVerifyText === 'yes' ||
    skipVerifyText === 'on';
  return {
    host: primary?.host || 'localhost',
    port: primary?.port || redisNodeDefaultPort,
    user: parsed.username || '',
    password: parsed.password || '',
    useSSL: isRediss,
    sslMode: isRediss ? (skipVerify ? 'skip-verify' : 'required') : 'disable',
    ...extractRedisSSLPathValuesFromParams(parsed.params),
    redisTopology: isSentinelTopology
      ? 'sentinel'
      : hostList.length > 1 || topologyParam === 'cluster'
        ? 'cluster'
        : 'single',
    redisHosts: hostList.slice(1),
    redisSentinelMaster: isSentinelTopology
      ? String(
          parsed.params.get('master') ||
            parsed.params.get('master_name') ||
            parsed.params.get('sentinel_master') ||
            '',
        ).trim()
      : '',
    redisSentinelUser: isSentinelTopology
      ? String(
          parsed.params.get('sentinel_user') ||
            parsed.params.get('sentinel_username') ||
            '',
        ).trim()
      : '',
    redisSentinelPassword: isSentinelTopology
      ? String(parsed.params.get('sentinel_password') || '')
      : '',
    redisDB: normalizeRedisDB(dbText),
  };
};

export const buildRedisUriFromValues = (values: Record<string, any>): string => {
  const redisTopology = normalizeRedisTopology(values.redisTopology);
  const redisNodeDefaultPort =
    redisTopology === 'sentinel'
      ? REDIS_SENTINEL_DEFAULT_PORT
      : REDIS_DEFAULT_PORT;
  const primary = toAddress(
    String(values.host || '').trim() || 'localhost',
    Number(values.port || redisNodeDefaultPort),
    redisNodeDefaultPort,
  );
  const extraRedisHosts =
    redisTopology === 'cluster' || redisTopology === 'sentinel'
      ? normalizeAddressList(values.redisHosts, redisNodeDefaultPort)
      : [];
  const hosts = normalizeAddressList(
    [primary, ...extraRedisHosts],
    redisNodeDefaultPort,
  );
  const params = new URLSearchParams();
  if (redisTopology === 'sentinel') {
    params.set('topology', 'sentinel');
    const sentinelMaster = String(values.redisSentinelMaster || '').trim();
    if (sentinelMaster) {
      params.set('master', sentinelMaster);
    }
    const sentinelUser = String(values.redisSentinelUser || '').trim();
    if (sentinelUser) {
      params.set('sentinel_user', sentinelUser);
    }
    const sentinelPassword = String(values.redisSentinelPassword || '');
    if (sentinelPassword) {
      params.set('sentinel_password', sentinelPassword);
    }
  } else if (hosts.length > 1 || redisTopology === 'cluster') {
    params.set('topology', 'cluster');
  }
  const redisUser = String(values.user || '').trim();
  const redisPassword = String(values.password || '');
  let redisAuth = '';
  if (redisUser || redisPassword) {
    const encodedPassword = redisPassword
      ? encodeURIComponent(redisPassword)
      : '';
    redisAuth = redisUser
      ? `${encodeURIComponent(redisUser)}${redisPassword ? `:${encodedPassword}` : ''}@`
      : `:${encodedPassword}@`;
  }
  const redisDB = normalizeRedisDB(values.redisDB);
  if (values.useSSL) {
    const mode = String(values.sslMode || 'preferred')
      .trim()
      .toLowerCase();
    if (mode === 'skip-verify' || mode === 'preferred') {
      params.set('skip_verify', 'true');
    }
  }
  appendRedisSSLPathParamsForUri(params, values);
  const query = params.toString();
  const scheme = values.useSSL ? 'rediss' : 'redis';
  return `${scheme}://${redisAuth}${hosts.join(',')}/${redisDB}${query ? `?${query}` : ''}`;
};

export const resolveRedisConfigDraft = (
  values: Record<string, any>,
  primaryHost: string,
  primaryPort: number,
  defaultPort: number,
): RedisConfigDraft => {
  const redisTopology = normalizeRedisTopology(values.redisTopology);
  const redisNodeDefaultPort =
    redisTopology === 'sentinel'
      ? REDIS_SENTINEL_DEFAULT_PORT
      : defaultPort;
  const normalizedPrimaryPort =
    redisTopology === 'sentinel' &&
    (!Number(values.port) || Number(values.port) === defaultPort)
      ? redisNodeDefaultPort
      : primaryPort;
  const extraRedisNodes =
    redisTopology === 'cluster' || redisTopology === 'sentinel'
      ? normalizeAddressList(values.redisHosts, redisNodeDefaultPort)
      : [];
  const allHosts = normalizeAddressList(
    [`${primaryHost}:${normalizedPrimaryPort}`, ...extraRedisNodes],
    redisNodeDefaultPort,
  );

  if (redisTopology === 'sentinel') {
    return {
      primaryPort: normalizedPrimaryPort,
      hosts: allHosts,
      topology: 'sentinel',
      redisSentinelMaster: String(values.redisSentinelMaster || '').trim(),
      redisSentinelUser: String(values.redisSentinelUser || '').trim(),
      redisSentinelPassword: String(values.redisSentinelPassword || ''),
      redisDB: normalizeRedisDB(values.redisDB),
    };
  }

  return {
    primaryPort: normalizedPrimaryPort,
    hosts: redisTopology === 'cluster' || allHosts.length > 1 ? allHosts : [],
    topology: redisTopology === 'cluster' || allHosts.length > 1 ? 'cluster' : 'single',
    redisSentinelMaster: '',
    redisSentinelUser: '',
    redisSentinelPassword: '',
    redisDB: normalizeRedisDB(values.redisDB),
  };
};
