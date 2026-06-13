import { create } from "zustand";
import {
  createJSONStorage,
  persist,
  type PersistStorage,
  type StateStorage,
} from "zustand/middleware";
import {
  ConnectionConfig,
  ProxyConfig,
  SavedConnection,
  TabData,
  SavedQuery,
  ConnectionTag,
  AIChatMessage,
  AIContextItem,
  GlobalProxyConfig,
  ExternalSQLDirectory,
  JVMDiagnosticCommandDraft,
  JVMDiagnosticEventChunk,
  SqlSnippet,
} from "./types";
import {
  ShortcutAction,
  ShortcutOptions,
  DEFAULT_SHORTCUT_OPTIONS,
  cloneShortcutOptions,
  getShortcutPlatform,
  sanitizeShortcutOptions,
  type ShortcutPlatformBinding,
  type ShortcutPlatform,
} from "./utils/shortcuts";
import { buildExternalSQLDirectoryId } from "./utils/externalSqlTree";
import {
  DEFAULT_SQL_SNIPPETS,
  BUILTIN_SNIPPET_MAP,
} from "./utils/sqlSnippetDefaults";
import { toPersistedGlobalProxy } from "./utils/globalProxyDraft";
import {
  DEFAULT_DATA_GRID_DISPLAY_SETTINGS,
  sanitizeDataGridDisplaySettings,
  type DataGridDisplaySettings,
} from "./utils/dataGridDisplay";
import {
  normalizeOceanBaseProtocol,
  resolveOceanBaseProtocolFromConfig,
  resolveOceanBaseProtocolFromQueryText,
} from "./utils/oceanBaseProtocol";
import { sanitizeFontFamilyInput } from "./utils/fontFamilies";
import {
  DEFAULT_TAB_DISPLAY_SETTINGS,
  sanitizeTabDisplaySettings,
  type TabDisplaySettings,
} from "./utils/tabDisplay";

export interface AppearanceSettings extends DataGridDisplaySettings {
  uiVersion: "legacy" | "v2";
  enabled: boolean;
  opacity: number;
  blur: number;
  useNativeMacWindowControls: boolean;
  v2SidebarSearchMode: "command" | "filter";
  v2CommandSearchPersistentFilterEnabled: boolean;
  v2SidebarPersistedFilter: string;
  customUIFontFamily: string | null;
  customMonoFontFamily: string | null;
  tabDisplay: TabDisplaySettings;
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  uiVersion: "legacy",
  enabled: true,
  opacity: 1.0,
  blur: 0,
  useNativeMacWindowControls: false,
  v2SidebarSearchMode: "command",
  v2CommandSearchPersistentFilterEnabled: false,
  v2SidebarPersistedFilter: "",
  customUIFontFamily: null,
  customMonoFontFamily: null,
  tabDisplay: DEFAULT_TAB_DISPLAY_SETTINGS,
  ...DEFAULT_DATA_GRID_DISPLAY_SETTINGS,
};
const DEFAULT_UI_SCALE = 1.0;
const MIN_UI_SCALE = 0.8;
const MAX_UI_SCALE = 1.25;
const DEFAULT_FONT_SIZE = 14;
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 20;
const DEFAULT_STARTUP_FULLSCREEN = false;
const LEGACY_DEFAULT_OPACITY = 0.95;
const OPACITY_EPSILON = 1e-6;
const MAX_SIDEBAR_PERSISTED_FILTER_LENGTH = 120;

const sanitizeV2SidebarSearchMode = (
  value: unknown,
): AppearanceSettings["v2SidebarSearchMode"] => {
  return value === "filter" ? "filter" : DEFAULT_APPEARANCE.v2SidebarSearchMode;
};

const sanitizeV2SidebarPersistedFilter = (value: unknown): string => {
  if (typeof value !== "string") {
    return DEFAULT_APPEARANCE.v2SidebarPersistedFilter;
  }
  return value.trim().slice(0, MAX_SIDEBAR_PERSISTED_FILTER_LENGTH);
};
const MAX_URI_LENGTH = 4096;
const MAX_HOST_ENTRY_LENGTH = 512;
const MAX_HOST_ENTRIES = 64;
const DEFAULT_TIMEOUT_SECONDS = 30;
const MAX_TIMEOUT_SECONDS = 3600;
const DEFAULT_DIAGNOSTIC_TIMEOUT_SECONDS = 15;
const MAX_DIAGNOSTIC_TIMEOUT_SECONDS = 300;
const PERSIST_VERSION = 10;
const PERSIST_STORAGE_KEY = "lite-db-storage";
const PERSIST_WRITE_DEBOUNCE_MS = 160;
const MAX_PERSISTED_QUERY_TABS = 20;
const MAX_PERSISTED_QUERY_LENGTH = 1024 * 1024;
const MAX_SQL_LOGS = 1000;
const MAX_PERSISTED_SQL_LOGS = 200;
const MAX_PERSISTED_SQL_LOG_LENGTH = 100 * 1024;
const MAX_PERSISTED_SQL_LOG_MESSAGE_LENGTH = 2 * 1024;
const DEFAULT_CONNECTION_TYPE = "mysql";
const DEFAULT_JVM_PORT = 9010;
const MAX_REDIS_DATABASE_INDEX = Number.MAX_SAFE_INTEGER;
const DEFAULT_GLOBAL_PROXY: GlobalProxyConfig = {
  enabled: false,
  type: "socks5",
  host: "",
  port: 1080,
  user: "",
  password: "",
  hasPassword: false,
};

const isFrontendTestRuntime = (): boolean => {
  const env = (import.meta as unknown as { env?: Record<string, unknown> }).env || {};
  return env.MODE === "test" || env.VITEST === true || env.VITEST === "true";
};

const createDebouncedPersistStorage = <S>(
  getStorage: () => StateStorage,
  debounceMs = PERSIST_WRITE_DEBOUNCE_MS,
): PersistStorage<S> | undefined => {
  const baseStorage = createJSONStorage<S>(getStorage);
  if (!baseStorage || isFrontendTestRuntime()) {
    return baseStorage;
  }

  type PersistedValue = Parameters<PersistStorage<S>["setItem"]>[1];
  let pendingWrite: { name: string; value: PersistedValue } | null = null;
  let pendingTimer: number | null = null;
  let listenersBound = false;
  let pendingResolves: Array<() => void> = [];
  let pendingRejects: Array<(error: unknown) => void> = [];

  const settlePending = (error?: unknown) => {
    const resolves = pendingResolves;
    const rejects = pendingRejects;
    pendingResolves = [];
    pendingRejects = [];
    if (error !== undefined) {
      rejects.forEach((reject) => reject(error));
      return;
    }
    resolves.forEach((resolve) => resolve());
  };

  const flushPendingWrite = async (): Promise<void> => {
    if (pendingTimer !== null) {
      window.clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    const nextWrite = pendingWrite;
    pendingWrite = null;
    if (!nextWrite) {
      settlePending();
      return;
    }
    try {
      await baseStorage.setItem(nextWrite.name, nextWrite.value);
      settlePending();
    } catch (error) {
      settlePending(error);
      throw error;
    }
  };

  const bindFlushListeners = () => {
    if (listenersBound || typeof window === "undefined") {
      return;
    }
    listenersBound = true;
    const handleFlush = () => {
      void flushPendingWrite();
    };
    window.addEventListener("pagehide", handleFlush, { capture: true });
    window.addEventListener("beforeunload", handleFlush, { capture: true });
  };

  return {
    getItem: baseStorage.getItem,
    setItem: (name, value) => {
      bindFlushListeners();
      pendingWrite = { name, value };
      if (pendingTimer !== null) {
        window.clearTimeout(pendingTimer);
      }
      return new Promise<void>((resolve, reject) => {
        pendingResolves.push(resolve);
        pendingRejects.push(reject);
        pendingTimer = window.setTimeout(() => {
          void flushPendingWrite();
        }, debounceMs);
      });
    },
    removeItem: async (name) => {
      pendingWrite = null;
      if (pendingTimer !== null) {
        window.clearTimeout(pendingTimer);
        pendingTimer = null;
      }
      settlePending();
      await baseStorage.removeItem(name);
    },
  };
};

const writePersistedStatePatch = (
  patch: Record<string, unknown>,
): void => {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    const payload = localStorage.getItem(PERSIST_STORAGE_KEY);
    const raw =
      payload && payload.trim() !== ""
        ? (JSON.parse(payload) as Record<string, unknown>)
        : {};
    const state = unwrapPersistedAppState(raw);
    localStorage.setItem(
      PERSIST_STORAGE_KEY,
      JSON.stringify({
        ...raw,
        state: {
          ...state,
          ...patch,
        },
        version:
          typeof raw.version === "number" ? raw.version : PERSIST_VERSION,
      }),
    );
  } catch {
    // ignore
  }
};

const resolveOceanBaseProtocol = (
  raw: Record<string, unknown>,
  normalizedConnectionParams: string,
  normalizedUri: string,
): "mysql" | "oracle" => {
  const normalizedConfig = {
    ...raw,
    connectionParams: normalizedConnectionParams,
    uri: normalizedUri,
  };
  try {
    return resolveOceanBaseProtocolFromConfig(normalizedConfig);
  } catch {
    return (
      normalizeOceanBaseProtocol(raw.oceanBaseProtocol) ||
      resolveOceanBaseProtocolFromQueryText(normalizedConnectionParams).protocol ||
      resolveOceanBaseProtocolFromQueryText(normalizedUri).protocol ||
      "mysql"
    );
  }
};
const SUPPORTED_CONNECTION_TYPES = new Set([
  "mysql",
  "mariadb",
  "oceanbase",
  "doris",
  "diros",
  "starrocks",
  "sphinx",
  "clickhouse",
  "postgres",
  "redis",
  "tdengine",
  "iotdb",
  "kafka",
  "oracle",
  "dameng",
  "kingbase",
  "sqlserver",
  "iris",
  "mongodb",
  "elasticsearch",
  "highgo",
  "vastbase",
  "opengauss",
  "gaussdb",
  "jvm",
  "sqlite",
  "duckdb",
  "custom",
]);
const SSL_SUPPORTED_CONNECTION_TYPES = new Set([
  "mysql",
  "mariadb",
  "oceanbase",
  "diros",
  "starrocks",
  "sphinx",
  "dameng",
  "clickhouse",
  "postgres",
  "sqlserver",
  "oracle",
  "kingbase",
  "highgo",
  "vastbase",
  "opengauss",
  "gaussdb",
  "mongodb",
  "redis",
  "elasticsearch",
  "tdengine",
  "kafka",
]);

const getDefaultPortByType = (type: string): number => {
  switch (type) {
    case "jvm":
      return DEFAULT_JVM_PORT;
    case "mysql":
    case "mariadb":
      return 3306;
    case "oceanbase":
      return 2881;
    case "doris":
    case "diros":
    case "starrocks":
      return 9030;
    case "duckdb":
      return 0;
    case "sphinx":
      return 9306;
    case "clickhouse":
      return 9000;
    case "postgres":
    case "vastbase":
    case "opengauss":
    case "gaussdb":
      return 5432;
    case "redis":
      return 6379;
    case "tdengine":
      return 6041;
    case "iotdb":
      return 6667;
    case "kafka":
      return 9092;
    case "oracle":
      return 1521;
    case "dameng":
      return 5236;
    case "kingbase":
      return 54321;
    case "sqlserver":
      return 1433;
    case "iris":
      return 1972;
    case "mongodb":
      return 27017;
    case "elasticsearch":
      return 9200;
    case "highgo":
      return 5866;
    default:
      return 3306;
  }
};

const toTrimmedString = (value: unknown, fallback = ""): string => {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return fallback;
};

const normalizeClickHouseProtocol = (
  value: unknown,
): "auto" | "http" | "native" => {
  const text = toTrimmedString(value).toLowerCase();
  if (text === "http" || text === "https") return "http";
  if (text === "native" || text === "tcp") return "native";
  return "auto";
};

const normalizePort = (value: unknown, fallbackPort: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallbackPort;
  const port = Math.trunc(parsed);
  if (port <= 0 || port > 65535) return fallbackPort;
  return port;
};

const normalizeIntegerInRange = (
  value: unknown,
  fallbackValue: number,
  min: number,
  max: number,
): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallbackValue;
  const normalized = Math.trunc(parsed);
  if (normalized < min || normalized > max) return fallbackValue;
  return normalized;
};

const normalizeFloatInRange = (
  value: unknown,
  fallbackValue: number,
  min: number,
  max: number,
): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallbackValue;
  if (parsed < min || parsed > max) return fallbackValue;
  return parsed;
};

const isValidHostEntry = (entry: string): boolean => {
  if (!entry) return false;
  if (entry.length > MAX_HOST_ENTRY_LENGTH) return false;
  if (/[()\\/\s]/.test(entry)) return false;
  return true;
};

const sanitizeStringArray = (value: unknown, maxLength = 256): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  value.forEach((entry) => {
    const normalized = toTrimmedString(entry);
    if (!normalized || normalized.length > maxLength) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });
  return result;
};

const sanitizeNumberArray = (
  value: unknown,
  min: number,
  max: number,
): number[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  const result: number[] = [];
  value.forEach((entry) => {
    const parsed = Number(entry);
    if (!Number.isFinite(parsed)) return;
    const num = Math.trunc(parsed);
    if (num < min || num > max) return;
    if (seen.has(num)) return;
    seen.add(num);
    result.push(num);
  });
  return result;
};

const sanitizeAddressList = (value: unknown): string[] => {
  const all = sanitizeStringArray(value, MAX_HOST_ENTRY_LENGTH).filter(
    (entry) => isValidHostEntry(entry),
  );
  return all.slice(0, MAX_HOST_ENTRIES);
};

const sanitizeConnectionIconType = (value: unknown): string | undefined => {
  const iconType = toTrimmedString(value).toLowerCase();
  return iconType || undefined;
};

const sanitizeConnectionIconColor = (value: unknown): string | undefined => {
  const color = toTrimmedString(value);
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)
    ? color
    : undefined;
};

const normalizeConnectionType = (value: unknown): string => {
  const type = toTrimmedString(value).toLowerCase();
  if (type === "doris") {
    return "diros";
  }
  if (type === "postgresql") {
    return "postgres";
  }
  if (type === "mssql" || type === "sql_server" || type === "sql-server") {
    return "sqlserver";
  }
  if (type === "kingbase8" || type === "kingbasees" || type === "kingbasev8") {
    return "kingbase";
  }
  if (type === "dm" || type === "dm8") {
    return "dameng";
  }
  if (type === "sqlite3") {
    return "sqlite";
  }
  if (type === "sphinxql") {
    return "sphinx";
  }
  if (
    type === "open_gauss" ||
    type === "open-gauss" ||
    type === "opengauss"
  ) {
    return "opengauss";
  }
  if (type === "gaussdb" || type === "gauss_db" || type === "gauss-db") {
    return "gaussdb";
  }
  if (type === "kafka" || type === "apache-kafka" || type === "apache_kafka") {
    return "kafka";
  }
  if (
    type === "inter-systems" ||
    type === "inter-systems-iris" ||
    type === "intersystems" ||
    type === "intersystems iris" ||
    type === "intersystemsiris" ||
    type.includes("iris")
  ) {
    return "iris";
  }
  return SUPPORTED_CONNECTION_TYPES.has(type) ? type : DEFAULT_CONNECTION_TYPE;
};

const sanitizeJVMModes = (
  value: unknown,
): Array<"jmx" | "endpoint" | "agent"> => {
  if (!Array.isArray(value)) return ["jmx"];
  const result: Array<"jmx" | "endpoint" | "agent"> = [];
  const seen = new Set<"jmx" | "endpoint" | "agent">();
  value.forEach((entry) => {
    const normalized = toTrimmedString(entry).toLowerCase();
    if (
      normalized !== "jmx" &&
      normalized !== "endpoint" &&
      normalized !== "agent"
    )
      return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });
  return result.length > 0 ? result : ["jmx"];
};

const sanitizeJVMConfig = (
  value: unknown,
  options: {
    host: string;
    port: number;
    timeout: number;
    persistSecrets: boolean;
  },
): ConnectionConfig["jvm"] => {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const allowedModes = sanitizeJVMModes(raw.allowedModes);
  const preferredModeRaw = toTrimmedString(raw.preferredMode).toLowerCase();
  const preferredMode = allowedModes.includes(
    preferredModeRaw as "jmx" | "endpoint" | "agent",
  )
    ? (preferredModeRaw as "jmx" | "endpoint" | "agent")
    : allowedModes[0];
  const environmentRaw = toTrimmedString(raw.environment, "dev").toLowerCase();
  const environment: "dev" | "uat" | "prod" =
    environmentRaw === "uat"
      ? "uat"
      : environmentRaw === "prod"
        ? "prod"
        : "dev";
  const jmxRaw =
    raw.jmx && typeof raw.jmx === "object"
      ? (raw.jmx as Record<string, unknown>)
      : {};
  const endpointRaw =
    raw.endpoint && typeof raw.endpoint === "object"
      ? (raw.endpoint as Record<string, unknown>)
      : {};
  const agentRaw =
    raw.agent && typeof raw.agent === "object"
      ? (raw.agent as Record<string, unknown>)
      : {};
  const diagnosticRaw =
    raw.diagnostic && typeof raw.diagnostic === "object"
      ? (raw.diagnostic as Record<string, unknown>)
      : {};
  const diagnosticTransportRaw = toTrimmedString(
    diagnosticRaw.transport,
    "agent-bridge",
  ).toLowerCase();
  const diagnosticTransport =
    diagnosticTransportRaw === "arthas-tunnel"
      ? "arthas-tunnel"
      : "agent-bridge";
  const fallbackPort = options.port > 0 ? options.port : DEFAULT_JVM_PORT;
  const fallbackTimeout =
    options.timeout > 0 ? options.timeout : DEFAULT_TIMEOUT_SECONDS;

  return {
    environment,
    readOnly: typeof raw.readOnly === "boolean" ? raw.readOnly : true,
    allowedModes,
    preferredMode,
    jmx: {
      enabled: jmxRaw.enabled === true || allowedModes.includes("jmx"),
      host: toTrimmedString(jmxRaw.host, options.host) || options.host,
      port: normalizePort(jmxRaw.port, fallbackPort),
      username: toTrimmedString(jmxRaw.username),
      password: options.persistSecrets ? toTrimmedString(jmxRaw.password) : "",
      domainAllowlist: sanitizeStringArray(jmxRaw.domainAllowlist, 256),
    },
    endpoint: {
      enabled: endpointRaw.enabled === true,
      baseUrl: toTrimmedString(endpointRaw.baseUrl),
      apiKey: options.persistSecrets ? toTrimmedString(endpointRaw.apiKey) : "",
      timeoutSeconds: normalizeIntegerInRange(
        endpointRaw.timeoutSeconds,
        fallbackTimeout,
        1,
        MAX_TIMEOUT_SECONDS,
      ),
    },
    agent: {
      enabled: agentRaw.enabled === true,
      baseUrl: toTrimmedString(agentRaw.baseUrl),
      apiKey: options.persistSecrets ? toTrimmedString(agentRaw.apiKey) : "",
      timeoutSeconds: normalizeIntegerInRange(
        agentRaw.timeoutSeconds,
        fallbackTimeout,
        1,
        MAX_TIMEOUT_SECONDS,
      ),
    },
    diagnostic: {
      enabled: diagnosticRaw.enabled === true,
      transport: diagnosticTransport,
      baseUrl: toTrimmedString(diagnosticRaw.baseUrl),
      targetId: toTrimmedString(diagnosticRaw.targetId),
      apiKey: options.persistSecrets
        ? toTrimmedString(diagnosticRaw.apiKey)
        : "",
      allowObserveCommands: diagnosticRaw.allowObserveCommands !== false,
      allowTraceCommands: diagnosticRaw.allowTraceCommands === true,
      allowMutatingCommands: diagnosticRaw.allowMutatingCommands === true,
      timeoutSeconds: normalizeIntegerInRange(
        diagnosticRaw.timeoutSeconds,
        DEFAULT_DIAGNOSTIC_TIMEOUT_SECONDS,
        1,
        MAX_DIAGNOSTIC_TIMEOUT_SECONDS,
      ),
    },
  };
};

const sanitizeConnectionConfig = (value: unknown): ConnectionConfig => {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const type = normalizeConnectionType(raw.type);
  const defaultPort = getDefaultPortByType(type);
  const savePassword =
    typeof raw.savePassword === "boolean" ? raw.savePassword : true;
  const mongoSrv = !!raw.mongoSrv;
  const sslCapable = SSL_SUPPORTED_CONNECTION_TYPES.has(type);
  const sslModeRaw = toTrimmedString(raw.sslMode, "preferred").toLowerCase();
  const sslMode: "preferred" | "required" | "skip-verify" | "disable" =
    sslModeRaw === "required"
      ? "required"
      : sslModeRaw === "skip-verify"
        ? "skip-verify"
        : sslModeRaw === "disable"
          ? "disable"
          : "preferred";

  const sshRaw =
    raw.ssh && typeof raw.ssh === "object"
      ? (raw.ssh as Record<string, unknown>)
      : {};
  const ssh = {
    host: toTrimmedString(sshRaw.host),
    port: normalizePort(sshRaw.port, 22),
    user: toTrimmedString(sshRaw.user),
    password: toTrimmedString(sshRaw.password),
    keyPath: toTrimmedString(sshRaw.keyPath),
  };
  const proxyRaw =
    raw.proxy && typeof raw.proxy === "object"
      ? (raw.proxy as Record<string, unknown>)
      : {};
  const proxyTypeRaw = toTrimmedString(proxyRaw.type, "socks5").toLowerCase();
  const proxyType: "socks5" | "http" =
    proxyTypeRaw === "http" ? "http" : "socks5";
  const proxy = {
    type: proxyType,
    host: toTrimmedString(proxyRaw.host),
    port: normalizePort(proxyRaw.port, proxyTypeRaw === "http" ? 8080 : 1080),
    user: toTrimmedString(proxyRaw.user),
    password: toTrimmedString(proxyRaw.password),
  };
  const httpTunnelRaw =
    raw.httpTunnel && typeof raw.httpTunnel === "object"
      ? (raw.httpTunnel as Record<string, unknown>)
      : raw.HTTPTunnel && typeof raw.HTTPTunnel === "object"
        ? (raw.HTTPTunnel as Record<string, unknown>)
        : {};
  const httpTunnel = {
    host: toTrimmedString(httpTunnelRaw.host ?? raw.httpTunnelHost),
    port: normalizePort(httpTunnelRaw.port ?? raw.httpTunnelPort, 8080),
    user: toTrimmedString(httpTunnelRaw.user ?? raw.httpTunnelUser),
    password: toTrimmedString(httpTunnelRaw.password ?? raw.httpTunnelPassword),
  };
  const supportsNetworkTunnel = type !== "sqlite" && type !== "duckdb";
  const useHttpTunnel =
    supportsNetworkTunnel &&
    (raw.useHttpTunnel === true || raw.UseHTTPTunnel === true);
  const useProxy = supportsNetworkTunnel && !!raw.useProxy && !useHttpTunnel;

  const safeConfig: ConnectionConfig & Record<string, unknown> = {
    ...raw,
    id: toTrimmedString(raw.id ?? raw.ID),
    type,
    host: toTrimmedString(raw.host, "localhost") || "localhost",
    port: normalizePort(raw.port, defaultPort),
    user: toTrimmedString(raw.user),
    password: savePassword ? toTrimmedString(raw.password) : "",
    savePassword,
    database: toTrimmedString(raw.database),
    useSSL: sslCapable ? !!raw.useSSL : false,
    sslMode: sslCapable ? sslMode : "disable",
    sslCAPath: sslCapable ? toTrimmedString(raw.sslCAPath) : "",
    sslCertPath: sslCapable ? toTrimmedString(raw.sslCertPath) : "",
    sslKeyPath: sslCapable ? toTrimmedString(raw.sslKeyPath) : "",
    useSSH: !!raw.useSSH,
    ssh,
    useProxy,
    proxy,
    useHttpTunnel,
    httpTunnel,
    uri: toTrimmedString(raw.uri).slice(0, MAX_URI_LENGTH),
    connectionParams: toTrimmedString(raw.connectionParams).slice(
      0,
      MAX_URI_LENGTH,
    ),
    hosts: sanitizeAddressList(raw.hosts),
    topology:
      raw.topology === "replica"
        ? "replica"
        : raw.topology === "cluster"
          ? "cluster"
          : raw.topology === "sentinel"
            ? "sentinel"
          : "single",
    mysqlReplicaUser: toTrimmedString(raw.mysqlReplicaUser),
    mysqlReplicaPassword: savePassword
      ? toTrimmedString(raw.mysqlReplicaPassword)
      : "",
    replicaSet: toTrimmedString(raw.replicaSet),
    authSource: toTrimmedString(raw.authSource),
    readPreference: toTrimmedString(raw.readPreference),
    mongoSrv,
    mongoAuthMechanism: toTrimmedString(raw.mongoAuthMechanism),
    mongoReplicaUser: toTrimmedString(raw.mongoReplicaUser),
    mongoReplicaPassword: savePassword
      ? toTrimmedString(raw.mongoReplicaPassword)
      : "",
    timeout: normalizeIntegerInRange(
      raw.timeout,
      DEFAULT_TIMEOUT_SECONDS,
      1,
      MAX_TIMEOUT_SECONDS,
    ),
  };

  if (type === "redis") {
    safeConfig.redisDB = normalizeIntegerInRange(
      raw.redisDB,
      0,
      0,
      MAX_REDIS_DATABASE_INDEX,
    );
    safeConfig.redisSentinelMaster = toTrimmedString(raw.redisSentinelMaster);
    safeConfig.redisSentinelUser = toTrimmedString(raw.redisSentinelUser);
    safeConfig.redisSentinelPassword = savePassword
      ? toTrimmedString(raw.redisSentinelPassword)
      : "";
  }

  if (type === "clickhouse") {
    safeConfig.clickHouseProtocol = normalizeClickHouseProtocol(
      raw.clickHouseProtocol,
    );
  }

  if (type === "oceanbase") {
    safeConfig.oceanBaseProtocol = resolveOceanBaseProtocol(
      raw,
      safeConfig.connectionParams || "",
      safeConfig.uri || "",
    );
  }

  if (type === "custom") {
    safeConfig.driver = toTrimmedString(raw.driver);
    safeConfig.dsn = toTrimmedString(raw.dsn).slice(0, MAX_URI_LENGTH);
  }

  if (type === "jvm") {
    safeConfig.jvm = sanitizeJVMConfig(raw.jvm, {
      host: safeConfig.host,
      port: safeConfig.port,
      timeout: safeConfig.timeout || DEFAULT_TIMEOUT_SECONDS,
      persistSecrets: savePassword,
    });
  }

  return safeConfig;
};

const resolveConnectionConfigPayload = (
  raw: Record<string, unknown>,
): unknown => {
  if (raw.config && typeof raw.config === "object") {
    return raw.config;
  }
  // 兼容历史/导入场景：连接对象可能是扁平结构（无 config 包装）。
  const hasLegacyFlatConfig =
    raw.type !== undefined ||
    raw.host !== undefined ||
    raw.port !== undefined ||
    raw.user !== undefined ||
    raw.database !== undefined;
  if (hasLegacyFlatConfig) {
    return raw;
  }
  return undefined;
};

const sanitizeSavedConnection = (
  value: unknown,
  index: number,
): SavedConnection | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const config = sanitizeConnectionConfig(resolveConnectionConfigPayload(raw));
  const id =
    toTrimmedString(raw.id, `conn-${index + 1}`) || `conn-${index + 1}`;
  const displayType = config.type === "diros" ? "doris" : config.type;
  const fallbackName = config.host
    ? `${displayType}-${config.host}`
    : `连接-${index + 1}`;
  const name = toTrimmedString(raw.name, fallbackName) || fallbackName;
  const includeDatabases = sanitizeStringArray(raw.includeDatabases, 256);
  const includeRedisDatabases = sanitizeNumberArray(
    raw.includeRedisDatabases,
    0,
    MAX_REDIS_DATABASE_INDEX,
  );

  return {
    id,
    name,
    config: { ...config, id: config.id || id },
    secretRef: toTrimmedString(raw.secretRef) || undefined,
    hasPrimaryPassword: raw.hasPrimaryPassword === true,
    hasSSHPassword: raw.hasSSHPassword === true,
    hasProxyPassword: raw.hasProxyPassword === true,
    hasHttpTunnelPassword: raw.hasHttpTunnelPassword === true,
    hasMySQLReplicaPassword: raw.hasMySQLReplicaPassword === true,
    hasMongoReplicaPassword: raw.hasMongoReplicaPassword === true,
    hasRedisSentinelPassword: raw.hasRedisSentinelPassword === true,
    hasOpaqueURI: raw.hasOpaqueURI === true,
    hasOpaqueDSN: raw.hasOpaqueDSN === true,
    includeDatabases:
      includeDatabases.length > 0 ? includeDatabases : undefined,
    includeRedisDatabases:
      includeRedisDatabases.length > 0 ? includeRedisDatabases : undefined,
    iconType: sanitizeConnectionIconType(raw.iconType),
    iconColor: sanitizeConnectionIconColor(raw.iconColor),
  };
};

const sanitizeConnections = (value: unknown): SavedConnection[] => {
  if (!Array.isArray(value)) return [];
  const result: SavedConnection[] = [];
  const idSet = new Set<string>();

  value.forEach((entry, index) => {
    const conn = sanitizeSavedConnection(entry, index);
    if (!conn) return;
    let nextId = conn.id;
    if (idSet.has(nextId)) {
      nextId = `${nextId}-${index + 1}`;
    }
    idSet.add(nextId);
    result.push({ ...conn, id: nextId });
  });

  return result;
};

const sanitizeConnectionTags = (value: unknown): ConnectionTag[] => {
  if (!Array.isArray(value)) return [];
  const result: ConnectionTag[] = [];
  const idSet = new Set<string>();

  value.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const raw = entry as Record<string, unknown>;
    const id =
      toTrimmedString(raw.id, `tag-${index + 1}`) || `tag-${index + 1}`;
    if (idSet.has(id)) return;
    idSet.add(id);

    const name =
      toTrimmedString(raw.name, `标签-${index + 1}`) || `标签-${index + 1}`;
    const connectionIds = sanitizeStringArray(raw.connectionIds, 256);

    result.push({ id, name, connectionIds });
  });

  return result;
};

const SIDEBAR_ROOT_TAG_TOKEN_PREFIX = "tag:";
const SIDEBAR_ROOT_CONNECTION_TOKEN_PREFIX = "connection:";

export const buildSidebarRootTagToken = (tagId: string): string =>
  `${SIDEBAR_ROOT_TAG_TOKEN_PREFIX}${toTrimmedString(tagId)}`;

export const buildSidebarRootConnectionToken = (
  connectionId: string,
): string => `${SIDEBAR_ROOT_CONNECTION_TOKEN_PREFIX}${toTrimmedString(connectionId)}`;

const isSidebarRootTagToken = (token: string): boolean =>
  token.startsWith(SIDEBAR_ROOT_TAG_TOKEN_PREFIX) &&
  token.length > SIDEBAR_ROOT_TAG_TOKEN_PREFIX.length;

const isSidebarRootConnectionToken = (token: string): boolean =>
  token.startsWith(SIDEBAR_ROOT_CONNECTION_TOKEN_PREFIX) &&
  token.length > SIDEBAR_ROOT_CONNECTION_TOKEN_PREFIX.length;

const sanitizeSidebarRootOrder = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  value.forEach((entry) => {
    const token = toTrimmedString(entry);
    if (!token) return;
    if (!isSidebarRootTagToken(token) && !isSidebarRootConnectionToken(token)) {
      return;
    }
    if (seen.has(token)) return;
    seen.add(token);
    result.push(token);
  });
  return result;
};

const buildDefaultSidebarRootOrderTokens = (
  connectionTags: ConnectionTag[],
  connections: SavedConnection[],
): string[] => {
  const groupedConnectionIds = new Set<string>();
  connectionTags.forEach((tag) => {
    tag.connectionIds.forEach((connectionId) => {
      if (connectionId) groupedConnectionIds.add(connectionId);
    });
  });

  return [
    ...connectionTags.map((tag) => buildSidebarRootTagToken(tag.id)),
    ...connections
      .filter((connection) => !groupedConnectionIds.has(connection.id))
      .map((connection) => buildSidebarRootConnectionToken(connection.id)),
  ];
};

export const resolveSidebarRootOrderTokens = (
  sidebarRootOrder: unknown,
  connectionTags: ConnectionTag[],
  connections: SavedConnection[],
): string[] => {
  const defaultOrder = buildDefaultSidebarRootOrderTokens(
    connectionTags,
    connections,
  );
  if (defaultOrder.length === 0) {
    return [];
  }

  const validTokens = new Set(defaultOrder);
  const seen = new Set<string>();
  const result: string[] = [];

  sanitizeSidebarRootOrder(sidebarRootOrder).forEach((token) => {
    if (!validTokens.has(token) || seen.has(token)) return;
    seen.add(token);
    result.push(token);
  });

  defaultOrder.forEach((token) => {
    if (seen.has(token)) return;
    seen.add(token);
    result.push(token);
  });

  return result;
};

const insertSidebarRootTokenBeforeUngrouped = (
  sidebarRootOrder: string[],
  token: string,
): string[] => {
  if (!token || sidebarRootOrder.includes(token)) {
    return [...sidebarRootOrder];
  }
  const firstConnectionIndex = sidebarRootOrder.findIndex(
    isSidebarRootConnectionToken,
  );
  if (firstConnectionIndex === -1) {
    return [...sidebarRootOrder, token];
  }
  const nextOrder = [...sidebarRootOrder];
  nextOrder.splice(firstConnectionIndex, 0, token);
  return nextOrder;
};

const insertSidebarRootTokenAfter = (
  sidebarRootOrder: string[],
  token: string,
  anchorToken: string,
): string[] => {
  if (!token) return [...sidebarRootOrder];
  const nextOrder = sidebarRootOrder.filter((item) => item !== token);
  const anchorIndex = nextOrder.indexOf(anchorToken);
  if (anchorIndex === -1) {
    nextOrder.push(token);
    return nextOrder;
  }
  nextOrder.splice(anchorIndex + 1, 0, token);
  return nextOrder;
};

const moveSidebarRootToken = (
  sidebarRootOrder: string[],
  sourceToken: string,
  targetToken: string,
  insertBefore: boolean,
): string[] => {
  if (!sourceToken || !targetToken || sourceToken === targetToken) {
    return [...sidebarRootOrder];
  }
  const filtered = sidebarRootOrder.filter((token) => token !== sourceToken);
  const targetIndex = filtered.indexOf(targetToken);
  const insertIndex =
    targetIndex === -1
      ? filtered.length
      : Math.max(
          0,
          Math.min(
            filtered.length,
            insertBefore ? targetIndex : targetIndex + 1,
          ),
        );
  filtered.splice(insertIndex, 0, sourceToken);
  return filtered;
};

const orderConnectionTagsBySidebarRootOrder = (
  connectionTags: ConnectionTag[],
  sidebarRootOrder: string[],
): ConnectionTag[] => {
  const tagMap = new Map(connectionTags.map((tag) => [tag.id, tag]));
  const orderedTags: ConnectionTag[] = [];
  sidebarRootOrder.forEach((token) => {
    if (!isSidebarRootTagToken(token)) return;
    const tagId = token.slice(SIDEBAR_ROOT_TAG_TOKEN_PREFIX.length);
    const tag = tagMap.get(tagId);
    if (!tag) return;
    orderedTags.push(tag);
    tagMap.delete(tagId);
  });
  orderedTags.push(...Array.from(tagMap.values()));
  return orderedTags;
};

const isLegacyDefaultAppearance = (
  appearance: Partial<{ opacity: number; blur: number }> | undefined,
): boolean => {
  if (!appearance) {
    return true;
  }
  const opacity =
    typeof appearance.opacity === "number"
      ? appearance.opacity
      : LEGACY_DEFAULT_OPACITY;
  const blur = typeof appearance.blur === "number" ? appearance.blur : 0;
  return (
    Math.abs(opacity - LEGACY_DEFAULT_OPACITY) < OPACITY_EPSILON && blur === 0
  );
};

export interface SqlLog {
  id: string;
  timestamp: number;
  sql: string;
  status: "success" | "error";
  duration: number;
  message?: string;
  dbName?: string;
  affectedRows?: number;
}

export interface QueryOptions {
  maxRows: number;
  showColumnComment: boolean;
  showColumnType: boolean;
  showQueryResultsPanel: boolean;
}

export interface DataEditTransactionOptions {
  commitMode: "manual" | "auto";
  autoCommitDelayMs: number;
}

export interface SqlEditorTransactionOptions {
  commitMode: "manual" | "auto";
  autoCommitDelayMs: number;
}

export interface SqlEditorPendingTransactionState {
  id: string;
  tabId: string;
  commitMode: "manual" | "auto";
  autoCommitDelayMs: number;
  createdAt: number;
  autoCommitDueAt?: number | null;
  statementCount?: number;
}

interface AppState {
  connections: SavedConnection[];
  connectionTags: ConnectionTag[];
  sidebarRootOrder: string[];
  tabs: TabData[];
  activeTabId: string | null;
  activeContext: { connectionId: string; dbName: string } | null;
  savedQueries: SavedQuery[];
  externalSQLDirectories: ExternalSQLDirectory[];
  theme: "light" | "dark";
  appearance: AppearanceSettings;
  uiScale: number;
  fontSize: number;
  startupFullscreen: boolean;
  globalProxy: GlobalProxyConfig;
  sqlFormatOptions: { keywordCase: "upper" | "lower" };
  queryOptions: QueryOptions;
  dataEditTransactionOptions: DataEditTransactionOptions;
  sqlEditorTransactionOptions: SqlEditorTransactionOptions;
  sqlEditorPendingTransactions: Record<string, SqlEditorPendingTransactionState>;
  shortcutOptions: ShortcutOptions;
  sqlSnippets: SqlSnippet[];
  sqlLogs: SqlLog[];
  tableAccessCount: Record<string, number>;
  tableSortPreference: Record<string, "name" | "frequency">;
  tableColumnOrders: Record<string, string[]>;
  enableColumnOrderMemory: boolean;
  tableHiddenColumns: Record<string, string[]>;
  enableHiddenColumnMemory: boolean;
  pinnedSidebarTables: string[];
  windowBounds: { width: number; height: number; x: number; y: number } | null;
  windowState: "normal" | "fullscreen" | "maximized";
  sidebarWidth: number;

  // AI 运行时与持久化状态
  aiPanelVisible: boolean;
  aiChatHistory: Record<string, AIChatMessage[]>; // sessionId -> messages
  replaceAIChatHistory: (sessionId: string, messages: AIChatMessage[]) => void;
  aiChatSessions: { id: string; title: string; updatedAt: number }[]; // 历史会话列表
  aiActiveSessionId: string | null;
  updateAISessionTitle: (sessionId: string, title: string) => void;

  aiContexts: Record<string, AIContextItem[]>;
  addAIContext: (connectionKey: string, context: AIContextItem) => void;
  removeAIContext: (
    connectionKey: string,
    dbName: string,
    tableName: string,
  ) => void;
  clearAIContexts: (connectionKey: string) => void;

  jvmDiagnosticDrafts: Record<string, JVMDiagnosticCommandDraft>;
  jvmDiagnosticOutputs: Record<string, JVMDiagnosticEventChunk[]>;
  setJVMDiagnosticDraft: (
    tabId: string,
    draft: Partial<JVMDiagnosticCommandDraft>,
  ) => void;
  appendJVMDiagnosticOutput: (
    tabId: string,
    chunks: JVMDiagnosticEventChunk[],
  ) => void;
  clearJVMDiagnosticOutput: (tabId: string) => void;

  addConnection: (conn: SavedConnection) => void;
  updateConnection: (conn: SavedConnection) => void;
  removeConnection: (id: string) => void;
  replaceConnections: (connections: SavedConnection[]) => void;

  addConnectionTag: (tag: ConnectionTag) => void;
  updateConnectionTag: (tag: ConnectionTag) => void;
  removeConnectionTag: (id: string) => void;
  moveConnectionToTag: (
    connectionId: string,
    targetTagId: string | null,
  ) => void;
  reorderConnections: (
    connectionId: string,
    targetConnectionId: string,
    targetTagId: string | null,
    insertBefore?: boolean,
  ) => void;
  reorderTags: (tagIds: string[]) => void;
  reorderSidebarRoot: (
    sourceToken: string,
    targetToken: string,
    insertBefore: boolean,
  ) => void;

  addTab: (tab: TabData) => void;
  updateQueryTabDraft: (
    id: string,
    draft: Partial<
      Pick<
        TabData,
        "query" | "connectionId" | "dbName" | "title" | "resultPanelVisible"
      >
    >,
  ) => void;
  closeTab: (id: string) => void;
  closeOtherTabs: (id: string) => void;
  closeTabsToLeft: (id: string) => void;
  closeTabsToRight: (id: string) => void;
  closeTabsByConnection: (connectionId: string) => void;
  closeTabsByDatabase: (connectionId: string, dbName: string) => void;
  moveTab: (sourceId: string, targetId: string) => void;
  closeAllTabs: () => void;
  setActiveTab: (id: string) => void;
  setActiveContext: (
    context: { connectionId: string; dbName: string } | null,
  ) => void;

  saveQuery: (query: SavedQuery) => void;
  deleteQuery: (id: string) => void;
  saveExternalSQLDirectory: (directory: ExternalSQLDirectory) => void;
  deleteExternalSQLDirectory: (id: string) => void;

  setTheme: (theme: "light" | "dark") => void;
  setAppearance: (appearance: Partial<AppearanceSettings>) => void;
  setUiScale: (scale: number) => void;
  setFontSize: (size: number) => void;
  setStartupFullscreen: (enabled: boolean) => void;
  setGlobalProxy: (proxy: Partial<GlobalProxyConfig>) => void;
  replaceGlobalProxy: (proxy: Partial<GlobalProxyConfig>) => void;
  setSqlFormatOptions: (options: { keywordCase: "upper" | "lower" }) => void;
  setQueryOptions: (options: Partial<QueryOptions>) => void;
  setDataEditTransactionOptions: (
    options: Partial<DataEditTransactionOptions>,
  ) => void;
  setSqlEditorTransactionOptions: (
    options: Partial<SqlEditorTransactionOptions>,
  ) => void;
  setSqlEditorPendingTransaction: (
    tabId: string,
    transaction: Omit<SqlEditorPendingTransactionState, "tabId"> | null,
  ) => void;
  updateShortcut: (
    action: ShortcutAction,
    binding: Partial<ShortcutPlatformBinding>,
    platform?: ShortcutPlatform,
  ) => void;
  resetShortcutOptions: () => void;
  saveSqlSnippet: (snippet: SqlSnippet) => void;
  deleteSqlSnippet: (id: string) => void;
  resetBuiltinSqlSnippet: (id: string) => void;

  addSqlLog: (log: SqlLog) => void;
  clearSqlLogs: () => void;

  recordTableAccess: (
    connectionId: string,
    dbName: string,
    tableName: string,
  ) => void;
  setTableSortPreference: (
    connectionId: string,
    dbName: string,
    sortBy: "name" | "frequency",
  ) => void;
  setSidebarTablePinned: (
    connectionId: string,
    dbName: string,
    tableName: string,
    schemaName: string | undefined,
    pinned: boolean,
  ) => void;
  setTableColumnOrder: (
    connectionId: string,
    dbName: string,
    tableName: string,
    order: string[],
  ) => void;
  setEnableColumnOrderMemory: (enabled: boolean) => void;
  clearTableColumnOrder: (
    connectionId: string,
    dbName: string,
    tableName: string,
  ) => void;

  setTableHiddenColumns: (
    connectionId: string,
    dbName: string,
    tableName: string,
    hiddenColumns: string[],
  ) => void;
  setEnableHiddenColumnMemory: (enabled: boolean) => void;
  clearTableHiddenColumns: (
    connectionId: string,
    dbName: string,
    tableName: string,
  ) => void;
  setWindowBounds: (bounds: {
    width: number;
    height: number;
    x: number;
    y: number;
  }) => void;
  setWindowState: (state: "normal" | "fullscreen" | "maximized") => void;
  setSidebarWidth: (width: number) => void;

  // AI actions
  toggleAIPanel: () => void;
  setAIPanelVisible: (visible: boolean) => void;
  addAIChatMessage: (sessionId: string, message: AIChatMessage) => void;
  updateAIChatMessage: (
    sessionId: string,
    messageId: string,
    updates: Partial<AIChatMessage>,
  ) => void;
  deleteAIChatMessage: (sessionId: string, messageId: string) => void;
  truncateAIChatMessages: (sessionId: string, upToMessageId: string) => void;
  clearAIChatHistory: (sessionId: string) => void;
  deleteAISession: (sessionId: string) => void;
  createNewAISession: () => void;
  setAIActiveSessionId: (sessionId: string | null) => void;
}

const sanitizeSavedQueries = (value: unknown): SavedQuery[] => {
  if (!Array.isArray(value)) return [];
  const result: SavedQuery[] = [];
  value.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const raw = entry as Record<string, unknown>;
    const id =
      toTrimmedString(raw.id, `query-${index + 1}`) || `query-${index + 1}`;
    const sql = toTrimmedString(raw.sql);
    const connectionId = toTrimmedString(raw.connectionId);
    const dbName = toTrimmedString(raw.dbName);
    if (!sql || !connectionId || !dbName) return;
    result.push({
      id,
      name:
        toTrimmedString(raw.name, `查询-${index + 1}`) || `查询-${index + 1}`,
      sql,
      connectionId,
      dbName,
      createdAt: Number.isFinite(Number(raw.createdAt))
        ? Number(raw.createdAt)
        : Date.now(),
    });
  });
  return result;
};

const sanitizeSqlSnippets = (value: unknown): SqlSnippet[] => {
  if (!Array.isArray(value)) return DEFAULT_SQL_SNIPPETS;
  const result: SqlSnippet[] = [];
  const seenIds = new Set<string>();
  value.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const raw = entry as Record<string, unknown>;
    const prefix = toTrimmedString(raw.prefix)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 20);
    const body = toTrimmedString(raw.body);
    if (!prefix || !body) return;
    const id = toTrimmedString(raw.id, `snippet-${index + 1}`) || `snippet-${index + 1}`;
    if (seenIds.has(id)) return;
    seenIds.add(id);
    result.push({
      id,
      prefix,
      name: toTrimmedString(raw.name, `片段-${index + 1}`) || `片段-${index + 1}`,
      description: toTrimmedString(raw.description) || undefined,
      syntaxHelp: toTrimmedString(raw.syntaxHelp) || undefined,
      body,
      isBuiltin: raw.isBuiltin === true,
      createdAt: Number.isFinite(Number(raw.createdAt))
        ? Number(raw.createdAt)
        : Date.now(),
    });
  });
  return result;
};

const sanitizeExternalSQLDirectories = (
  value: unknown,
): ExternalSQLDirectory[] => {
  if (!Array.isArray(value)) return [];
  const result: ExternalSQLDirectory[] = [];
  const seenPaths = new Set<string>();
  value.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const raw = entry as Record<string, unknown>;
    const path = toTrimmedString(raw.path);
    if (!path) return;
    const normalizedPath = path.replace(/\\/g, "/").toLowerCase();
    if (seenPaths.has(normalizedPath)) return;
    seenPaths.add(normalizedPath);
    const connectionId = toTrimmedString(raw.connectionId);
    const dbName = toTrimmedString(raw.dbName);
    const fallbackName =
      path.split(/[\\/]/).filter(Boolean).pop() || `SQL目录-${index + 1}`;
    result.push({
      id:
        toTrimmedString(
          raw.id,
          buildExternalSQLDirectoryId(connectionId, dbName, path),
        ) || buildExternalSQLDirectoryId(connectionId, dbName, path),
      name: toTrimmedString(raw.name, fallbackName) || fallbackName,
      path,
      ...(connectionId ? { connectionId } : {}),
      ...(dbName ? { dbName } : {}),
      createdAt: Number.isFinite(Number(raw.createdAt))
        ? Number(raw.createdAt)
        : Date.now(),
    });
  });
  return result;
};

const sanitizeQueryTabs = (value: unknown): TabData[] => {
  if (!Array.isArray(value)) return [];
  const result: TabData[] = [];
  const seenIds = new Set<string>();

  value.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const raw = entry as Record<string, unknown>;
    if (raw.type !== "query") return;

    const query = typeof raw.query === "string" ? raw.query.slice(0, MAX_PERSISTED_QUERY_LENGTH) : "";
    const filePath = toTrimmedString(raw.filePath);
    const savedQueryId = toTrimmedString(raw.savedQueryId);
    if (!query.trim() && !filePath && !savedQueryId) return;

    let id = toTrimmedString(raw.id, `query-${index + 1}`) || `query-${index + 1}`;
    if (seenIds.has(id)) {
      id = `${id}-${index + 1}`;
    }
    seenIds.add(id);

    result.push({
      id,
      title: toTrimmedString(raw.title, "新建查询") || "新建查询",
      type: "query",
      connectionId: toTrimmedString(raw.connectionId),
      dbName: toTrimmedString(raw.dbName),
      query,
      resultPanelVisible:
        typeof raw.resultPanelVisible === "boolean"
          ? raw.resultPanelVisible
          : undefined,
      filePath: filePath || undefined,
      savedQueryId: savedQueryId || undefined,
      readOnly: raw.readOnly === true,
    });
  });

  return result.slice(0, MAX_PERSISTED_QUERY_TABS);
};

const sanitizeActiveTabId = (activeTabId: unknown, tabs: TabData[]): string | null => {
  const id = toTrimmedString(activeTabId);
  if (id && tabs.some((tab) => tab.id === id)) {
    return id;
  }
  return tabs[0]?.id || null;
};

const resolveActiveContextFromTab = (
  tab: TabData | null | undefined,
): { connectionId: string; dbName: string } | null => {
  if (!tab) return null;
  const connectionId = toTrimmedString(tab.connectionId);
  if (!connectionId) return null;
  return {
    connectionId,
    dbName: toTrimmedString(tab.dbName),
  };
};

const resolveActiveContextForTabId = (
  tabs: TabData[],
  activeTabId: string | null | undefined,
  fallbackContext: { connectionId: string; dbName: string } | null,
): { connectionId: string; dbName: string } | null => {
  const normalizedActiveTabId = toTrimmedString(activeTabId);
  if (normalizedActiveTabId) {
    const activeTab = tabs.find((tab) => tab.id === normalizedActiveTabId);
    const contextFromTab = resolveActiveContextFromTab(activeTab);
    if (contextFromTab) {
      return contextFromTab;
    }
  }
  return fallbackContext;
};

const sanitizeSqlLogs = (value: unknown, limit = MAX_PERSISTED_SQL_LOGS): SqlLog[] => {
  if (!Array.isArray(value)) return [];
  const result: SqlLog[] = [];
  const seenIds = new Set<string>();

  value.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const raw = entry as Record<string, unknown>;
    const sql = typeof raw.sql === "string" ? raw.sql.slice(0, MAX_PERSISTED_SQL_LOG_LENGTH) : "";
    if (!sql.trim()) return;

    let id = toTrimmedString(raw.id, `log-${index + 1}`) || `log-${index + 1}`;
    if (seenIds.has(id)) {
      id = `${id}-${index + 1}`;
    }
    seenIds.add(id);

    const status = raw.status === "error" ? "error" : "success";
    const timestamp = Number(raw.timestamp);
    const duration = Number(raw.duration);
    const affectedRows = Number(raw.affectedRows);
    const log: SqlLog = {
      id,
      timestamp: Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now(),
      sql,
      status,
      duration: Number.isFinite(duration) && duration >= 0 ? duration : 0,
      dbName: toTrimmedString(raw.dbName) || undefined,
    };

    const message = typeof raw.message === "string"
      ? raw.message.slice(0, MAX_PERSISTED_SQL_LOG_MESSAGE_LENGTH)
      : "";
    if (message) {
      log.message = message;
    }
    if (Number.isFinite(affectedRows)) {
      log.affectedRows = affectedRows;
    }

    result.push(log);
  });

  return result.slice(0, limit);
};

const hasLegacyConnectionSecrets = (
  connections: SavedConnection[],
): boolean => {
  return connections.some((connection) => {
    const config =
      connection?.config && typeof connection.config === "object"
        ? (connection.config as unknown as Record<string, unknown>)
        : {};
    const ssh =
      config.ssh && typeof config.ssh === "object"
        ? (config.ssh as Record<string, unknown>)
        : {};
    const proxy =
      config.proxy && typeof config.proxy === "object"
        ? (config.proxy as Record<string, unknown>)
        : {};
    const httpTunnel =
      config.httpTunnel && typeof config.httpTunnel === "object"
        ? (config.httpTunnel as Record<string, unknown>)
        : {};

    return (
      toTrimmedString(config.password) !== "" ||
      toTrimmedString(ssh.password) !== "" ||
      toTrimmedString(proxy.password) !== "" ||
      toTrimmedString(httpTunnel.password) !== "" ||
      toTrimmedString(config.mysqlReplicaPassword) !== "" ||
      toTrimmedString(config.mongoReplicaPassword) !== "" ||
      toTrimmedString(config.redisSentinelPassword) !== "" ||
      toTrimmedString(config.uri) !== "" ||
      toTrimmedString(config.dsn) !== ""
    );
  });
};

const sanitizeTheme = (value: unknown): "light" | "dark" =>
  value === "dark" ? "dark" : "light";

const sanitizeSqlFormatOptions = (
  value: unknown,
): { keywordCase: "upper" | "lower" } => {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return { keywordCase: raw.keywordCase === "lower" ? "lower" : "upper" };
};

const sanitizeQueryOptions = (value: unknown): QueryOptions => {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const maxRows = Number(raw.maxRows);
  const showColumnComment =
    typeof raw.showColumnComment === "boolean" ? raw.showColumnComment : true;
  const showColumnType =
    typeof raw.showColumnType === "boolean" ? raw.showColumnType : true;
  const showQueryResultsPanel =
    typeof raw.showQueryResultsPanel === "boolean" ? raw.showQueryResultsPanel : false;
  if (!Number.isFinite(maxRows) || maxRows <= 0) {
    return { maxRows: 5000, showColumnComment, showColumnType, showQueryResultsPanel };
  }
  return {
    maxRows: Math.min(50000, Math.trunc(maxRows)),
    showColumnComment,
    showColumnType,
    showQueryResultsPanel,
  };
};

const DATA_EDIT_AUTO_COMMIT_DELAY_OPTIONS = new Set([3000, 5000, 10000, 30000]);
const SQL_EDITOR_AUTO_COMMIT_DELAY_OPTIONS = new Set([0, 3000, 5000, 10000, 30000]);

const sanitizeDataEditTransactionOptions = (
  value: unknown,
): DataEditTransactionOptions => {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const autoCommitDelayMs = Number(raw.autoCommitDelayMs);
  return {
    commitMode: raw.commitMode === "auto" ? "auto" : "manual",
    autoCommitDelayMs: DATA_EDIT_AUTO_COMMIT_DELAY_OPTIONS.has(autoCommitDelayMs)
      ? autoCommitDelayMs
      : 5000,
  };
};

const sanitizeSqlEditorTransactionOptions = (
  value: unknown,
): SqlEditorTransactionOptions => {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const autoCommitDelayMs = Number(raw.autoCommitDelayMs);
  return {
    commitMode: raw.commitMode === "auto" ? "auto" : "manual",
    autoCommitDelayMs: SQL_EDITOR_AUTO_COMMIT_DELAY_OPTIONS.has(autoCommitDelayMs)
      ? autoCommitDelayMs
      : 0,
  };
};

const sanitizeTableAccessCount = (value: unknown): Record<string, number> => {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const result: Record<string, number> = {};
  Object.entries(raw).forEach(([key, count]) => {
    const parsed = Number(count);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    result[key] = Math.trunc(parsed);
  });
  return result;
};

const sanitizeTableSortPreference = (
  value: unknown,
): Record<string, "name" | "frequency"> => {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const result: Record<string, "name" | "frequency"> = {};
  Object.entries(raw).forEach(([key, preference]) => {
    result[key] = preference === "frequency" ? "frequency" : "name";
  });
  return result;
};

const sanitizeTableColumnOrders = (
  value: unknown,
): Record<string, string[]> => {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const result: Record<string, string[]> = {};
  Object.entries(raw).forEach(([key, orderArray]) => {
    if (Array.isArray(orderArray)) {
      result[key] = orderArray.map((col) => String(col));
    }
  });
  return result;
};

const sanitizeTableHiddenColumns = (
  value: unknown,
): Record<string, string[]> => {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const result: Record<string, string[]> = {};
  Object.entries(raw).forEach(([key, hiddenArray]) => {
    if (Array.isArray(hiddenArray)) {
      result[key] = hiddenArray.map((col) => String(col));
    }
  });
  return result;
};

const sanitizePinnedSidebarTables = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => toTrimmedString(entry))
        .filter(Boolean),
    ),
  );
};

const sanitizeAppearance = (
  appearance: Partial<AppearanceSettings> | undefined,
  version: number,
): AppearanceSettings => {
  if (!appearance || typeof appearance !== "object") {
    return { ...DEFAULT_APPEARANCE };
  }
  const dataGridDisplaySettings = sanitizeDataGridDisplaySettings(appearance);
  const nextAppearance = {
    uiVersion:
      appearance.uiVersion === "v2" || appearance.uiVersion === "legacy"
        ? appearance.uiVersion
        : DEFAULT_APPEARANCE.uiVersion,
    enabled:
      typeof appearance.enabled === "boolean"
        ? appearance.enabled
        : DEFAULT_APPEARANCE.enabled,
    opacity:
      typeof appearance.opacity === "number"
        ? appearance.opacity
        : DEFAULT_APPEARANCE.opacity,
    blur:
      typeof appearance.blur === "number"
        ? appearance.blur
        : DEFAULT_APPEARANCE.blur,
    useNativeMacWindowControls:
      typeof appearance.useNativeMacWindowControls === "boolean"
        ? appearance.useNativeMacWindowControls
        : DEFAULT_APPEARANCE.useNativeMacWindowControls,
    v2SidebarSearchMode: sanitizeV2SidebarSearchMode(
      appearance.v2SidebarSearchMode,
    ),
    v2CommandSearchPersistentFilterEnabled:
      typeof appearance.v2CommandSearchPersistentFilterEnabled === "boolean"
        ? appearance.v2CommandSearchPersistentFilterEnabled
        : DEFAULT_APPEARANCE.v2CommandSearchPersistentFilterEnabled,
    v2SidebarPersistedFilter: sanitizeV2SidebarPersistedFilter(
      appearance.v2SidebarPersistedFilter,
    ),
    customUIFontFamily: sanitizeFontFamilyInput(appearance.customUIFontFamily),
    customMonoFontFamily: sanitizeFontFamilyInput(appearance.customMonoFontFamily),
    tabDisplay: sanitizeTabDisplaySettings(appearance.tabDisplay),
    showDataTableVerticalBorders:
      dataGridDisplaySettings.showDataTableVerticalBorders,
    dataTableDensity: dataGridDisplaySettings.dataTableDensity,
    dataTableFontSize: dataGridDisplaySettings.dataTableFontSize,
    dataTableFontSizeFollowGlobal:
      dataGridDisplaySettings.dataTableFontSizeFollowGlobal,
    sidebarTreeFontSize: dataGridDisplaySettings.sidebarTreeFontSize,
    sidebarTreeFontSizeFollowGlobal:
      dataGridDisplaySettings.sidebarTreeFontSizeFollowGlobal,
  };
  if (version < 2 && isLegacyDefaultAppearance(appearance)) {
    return { ...DEFAULT_APPEARANCE };
  }
  return nextAppearance;
};

const sanitizeStartupFullscreen = (value: unknown): boolean => {
  return value === true;
};

const sanitizeUiScale = (value: unknown): number => {
  return normalizeFloatInRange(
    value,
    DEFAULT_UI_SCALE,
    MIN_UI_SCALE,
    MAX_UI_SCALE,
  );
};

const sanitizeFontSize = (value: unknown): number => {
  return normalizeIntegerInRange(
    value,
    DEFAULT_FONT_SIZE,
    MIN_FONT_SIZE,
    MAX_FONT_SIZE,
  );
};

const sanitizeGlobalProxy = (
  value: unknown,
  options: { allowPassword?: boolean } = {},
): GlobalProxyConfig => {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const typeRaw = toTrimmedString(
    raw.type,
    DEFAULT_GLOBAL_PROXY.type,
  ).toLowerCase();
  const type: "socks5" | "http" = typeRaw === "http" ? "http" : "socks5";
  const fallbackPort = type === "http" ? 8080 : 1080;
  const password = toTrimmedString(raw.password);
  return {
    enabled: raw.enabled === true,
    type,
    host: toTrimmedString(raw.host),
    port: normalizePort(raw.port, fallbackPort),
    user: toTrimmedString(raw.user),
    password: options.allowPassword === false ? "" : password,
    hasPassword: raw.hasPassword === true || password !== "",
    secretRef: toTrimmedString(raw.secretRef) || undefined,
  };
};

const sanitizeWindowState = (
  value: unknown,
): "normal" | "fullscreen" | "maximized" => {
  if (value === "fullscreen" || value === "maximized") return value;
  return "normal";
};

const sanitizeSidebarWidth = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 330;
  return Math.max(200, Math.min(600, Math.trunc(parsed)));
};

const sanitizeWindowBounds = (
  value: unknown,
): { width: number; height: number; x: number; y: number } | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const width = Number(raw.width);
  const height = Number(raw.height);
  const x = Number(raw.x);
  const y = Number(raw.y);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  )
    return null;
  if (width < 400 || height < 300) return null;
  return {
    width: Math.trunc(width),
    height: Math.trunc(height),
    x: Math.trunc(x),
    y: Math.trunc(y),
  };
};

const unwrapPersistedAppState = (
  persistedState: unknown,
): Record<string, unknown> => {
  if (!persistedState || typeof persistedState !== "object") {
    return {};
  }
  const raw = persistedState as Record<string, unknown>;
  if (raw.state && typeof raw.state === "object") {
    return raw.state as Record<string, unknown>;
  }
  return raw;
};

let shortcutOptionsExplicitlySet = false;

const readPersistedShortcutOptions = (): ShortcutOptions | null => {
  if (typeof localStorage === "undefined") {
    return null;
  }
  try {
    const payload = localStorage.getItem(PERSIST_STORAGE_KEY);
    if (!payload) {
      return null;
    }
    const state = unwrapPersistedAppState(JSON.parse(payload));
    if (state.shortcutOptions === undefined) {
      return null;
    }
    return sanitizeShortcutOptions(state.shortcutOptions);
  } catch {
    return null;
  }
};

const resolveShortcutOptionsForPersistence = (
  shortcutOptions: ShortcutOptions,
): ShortcutOptions => {
  const safeOptions = sanitizeShortcutOptions(shortcutOptions);
  if (shortcutOptionsExplicitlySet) {
    return safeOptions;
  }
  return readPersistedShortcutOptions() ?? safeOptions;
};

const runWithExplicitShortcutPersistence = (callback: () => void): void => {
  shortcutOptionsExplicitlySet = true;
  try {
    callback();
  } finally {
    shortcutOptionsExplicitlySet = false;
  }
};

export const buildSidebarTablePinKey = (
  connectionId: string,
  dbName: string,
  tableName: string,
  schemaName = "",
): string => {
  const parts = [
    toTrimmedString(connectionId),
    toTrimmedString(dbName),
    toTrimmedString(schemaName),
    toTrimmedString(tableName),
  ];
  return parts[0] && parts[1] && parts[3] ? JSON.stringify(parts) : "";
};

// --- AI 会话文件持久化辅助函数 ---

/** 每个 session 独立防抖定时器（2秒） */
const _persistTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function _debouncedPersistSession(sessionId: string) {
  if (_persistTimers[sessionId]) clearTimeout(_persistTimers[sessionId]);
  _persistTimers[sessionId] = setTimeout(() => {
    delete _persistTimers[sessionId];
    const state = useStore.getState();
    const messages = state.aiChatHistory[sessionId];
    const sessionMeta = state.aiChatSessions.find((s) => s.id === sessionId);
    if (!messages && !sessionMeta) return; // session 已被删除，跳过
    const title = sessionMeta?.title || "新的对话";
    const updatedAt = sessionMeta?.updatedAt || Date.now();
    const messagesJSON = JSON.stringify(messages || []);
    const Service = (window as any).go?.aiservice?.Service;
    Service?.AISaveSession?.(sessionId, title, updatedAt, messagesJSON).catch(
      (e: any) => {
        console.error("[AI Session Persist] 持久化失败:", sessionId, e);
      },
    );
  }, 2000);
}

/** 从后端加载会话列表（仅元数据，不含消息体） */
export async function loadAISessionsFromBackend(): Promise<
  { id: string; title: string; updatedAt: number }[]
> {
  const Service = (window as any).go?.aiservice?.Service;
  if (!Service?.AIGetSessions) return [];
  try {
    const sessions = await Service.AIGetSessions();
    if (Array.isArray(sessions)) {
      useStore.setState({ aiChatSessions: sessions });
      return sessions;
    }
  } catch (e) {
    console.error("[AI Session] 加载会话列表失败:", e);
  }
  return [];
}

/** 从后端加载指定会话的消息数据到内存 */
export async function loadAISessionFromBackend(
  sessionId: string,
): Promise<boolean> {
  const state = useStore.getState();
  // 如果内存中已有消息，跳过重复加载
  if (state.aiChatHistory[sessionId]?.length > 0) return true;

  const Service = (window as any).go?.aiservice?.Service;
  if (!Service?.AILoadSession) return false;
  try {
    const result = await Service.AILoadSession(sessionId);
    if (result?.success) {
      let messages = result.messages;
      // messages 可能是 JSON string 或已解析的数组
      if (typeof messages === "string") {
        try {
          messages = JSON.parse(messages);
        } catch {
          messages = [];
        }
      }
      if (Array.isArray(messages)) {
        useStore.setState((prev) => ({
          aiChatHistory: { ...prev.aiChatHistory, [sessionId]: messages },
        }));
        return true;
      }
    }
  } catch (e) {
    console.error("[AI Session] 加载会话消息失败:", sessionId, e);
  }
  return false;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      connections: [],
      connectionTags: [],
      sidebarRootOrder: [],
      tabs: [],
      activeTabId: null,
      activeContext: null,
      savedQueries: [],
      externalSQLDirectories: [],
      theme: "light",
      appearance: { ...DEFAULT_APPEARANCE },
      uiScale: DEFAULT_UI_SCALE,
      fontSize: DEFAULT_FONT_SIZE,
      startupFullscreen: DEFAULT_STARTUP_FULLSCREEN,
      globalProxy: { ...DEFAULT_GLOBAL_PROXY },
      sqlFormatOptions: { keywordCase: "upper" },
      queryOptions: {
        maxRows: 5000,
        showColumnComment: true,
        showColumnType: true,
        showQueryResultsPanel: false,
      },
      dataEditTransactionOptions: {
        commitMode: "manual",
        autoCommitDelayMs: 5000,
      },
      sqlEditorTransactionOptions: {
        commitMode: "manual",
        autoCommitDelayMs: 0,
      },
      sqlEditorPendingTransactions: {},
      shortcutOptions: cloneShortcutOptions(DEFAULT_SHORTCUT_OPTIONS),
      sqlSnippets: DEFAULT_SQL_SNIPPETS,
      sqlLogs: [],
      tableAccessCount: {},
      tableSortPreference: {},
      tableColumnOrders: {},
      enableColumnOrderMemory: true,
      tableHiddenColumns: {},
      enableHiddenColumnMemory: true,
      pinnedSidebarTables: [],
      windowBounds: null,
      windowState: "normal" as const,
      sidebarWidth: 330,

      // AI 运行状态
      aiPanelVisible: false,
      aiChatHistory: {},
      aiChatSessions: [],
      aiActiveSessionId: null,
      aiContexts: {},
      jvmDiagnosticDrafts: {},
      jvmDiagnosticOutputs: {},

      addConnection: (conn) =>
        set((state) => {
          const sanitized = sanitizeSavedConnection(
            conn,
            state.connections.length,
          );
          if (!sanitized) {
            return { connections: state.connections };
          }
          return { connections: [...state.connections, sanitized] };
        }),
      updateConnection: (conn) =>
        set((state) => {
          const sanitized = sanitizeSavedConnection(
            conn,
            state.connections.length,
          );
          if (!sanitized) {
            return { connections: state.connections };
          }
          return {
            connections: state.connections.map((c) =>
              c.id === conn.id ? sanitized : c,
            ),
          };
        }),
      removeConnection: (id) =>
        set((state) => {
          const nextConnections = state.connections.filter((c) => c.id !== id);
          const nextTags = state.connectionTags.map((tag) => ({
            ...tag,
            connectionIds: tag.connectionIds.filter((cid) => cid !== id),
          }));
          return {
            connections: nextConnections,
            connectionTags: nextTags,
            sidebarRootOrder: resolveSidebarRootOrderTokens(
              state.sidebarRootOrder.filter(
                (token) => token !== buildSidebarRootConnectionToken(id),
              ),
              nextTags,
              nextConnections,
            ),
          };
        }),
      replaceConnections: (connections) =>
        set((state) => {
          const nextConnections = sanitizeConnections(connections);
          return {
            connections: nextConnections,
            sidebarRootOrder: resolveSidebarRootOrderTokens(
              state.sidebarRootOrder,
              state.connectionTags,
              nextConnections,
            ),
            shortcutOptions:
              readPersistedShortcutOptions() ?? state.shortcutOptions,
          };
        }),

      addConnectionTag: (tag) =>
        set((state) => {
          const nextTags = [...state.connectionTags, tag];
          const nextRootOrder = insertSidebarRootTokenBeforeUngrouped(
            resolveSidebarRootOrderTokens(
              state.sidebarRootOrder,
              state.connectionTags,
              state.connections,
            ),
            buildSidebarRootTagToken(tag.id),
          );
          return {
            connectionTags: nextTags,
            sidebarRootOrder: resolveSidebarRootOrderTokens(
              nextRootOrder,
              nextTags,
              state.connections,
            ),
          };
        }),
      updateConnectionTag: (tag) =>
        set((state) => {
          const nextTags = state.connectionTags.map((t) =>
            t.id === tag.id ? tag : t,
          );
          return {
            connectionTags: nextTags,
            sidebarRootOrder: resolveSidebarRootOrderTokens(
              state.sidebarRootOrder,
              nextTags,
              state.connections,
            ),
          };
        }),
      removeConnectionTag: (id) =>
        set((state) => {
          const nextTags = state.connectionTags.filter((t) => t.id !== id);
          return {
            connectionTags: nextTags,
            sidebarRootOrder: resolveSidebarRootOrderTokens(
              state.sidebarRootOrder.filter(
                (token) => token !== buildSidebarRootTagToken(id),
              ),
              nextTags,
              state.connections,
            ),
          };
        }),
      moveConnectionToTag: (connectionId, targetTagId) =>
        set((state) => {
          const newTags = state.connectionTags.map((tag) => {
            //先从所有tag中移除该connection
            const filteredIds = tag.connectionIds.filter(
              (id) => id !== connectionId,
            );
            if (tag.id === targetTagId) {
              return { ...tag, connectionIds: [...filteredIds, connectionId] };
            }
            return { ...tag, connectionIds: filteredIds };
          });
          const nextRootOrder = resolveSidebarRootOrderTokens(
            state.sidebarRootOrder,
            newTags,
            state.connections,
          );
          const connectionToken = buildSidebarRootConnectionToken(connectionId);
          if (targetTagId) {
            return {
              connectionTags: newTags,
              sidebarRootOrder: nextRootOrder.filter(
                (token) => token !== connectionToken,
              ),
            };
          }

          const sourceToken = buildSidebarRootTagToken(
            state.connectionTags.find((tag) =>
              tag.connectionIds.includes(connectionId),
            )?.id || "",
          );
          const insertedRootOrder = sourceToken
            ? insertSidebarRootTokenAfter(nextRootOrder, connectionToken, sourceToken)
            : insertSidebarRootTokenBeforeUngrouped(nextRootOrder, connectionToken);
          return {
            connectionTags: newTags,
            sidebarRootOrder: resolveSidebarRootOrderTokens(
              insertedRootOrder,
              newTags,
              state.connections,
            ),
          };
        }),
      reorderConnections: (
        connectionId,
        targetConnectionId,
        targetTagId,
        insertBefore = false,
      ) =>
        set((state) => {
          if (
            !connectionId ||
            !targetConnectionId ||
            connectionId === targetConnectionId
          ) {
            return {
              connections: state.connections,
              connectionTags: state.connectionTags,
            };
          }

          const normalizeInsertIndex = (
            length: number,
            index: number,
          ): number => Math.max(0, Math.min(length, index));

          const nextTags = state.connectionTags.map((tag) => ({
            ...tag,
            connectionIds: tag.connectionIds.filter((id) => id !== connectionId),
          }));

          if (targetTagId) {
            const updatedTags = nextTags.map((tag) => {
              if (tag.id !== targetTagId) {
                return tag;
              }
              const targetIndex = tag.connectionIds.indexOf(targetConnectionId);
              if (targetIndex === -1) {
                return {
                  ...tag,
                  connectionIds: [...tag.connectionIds, connectionId],
                };
              }
              const insertIndex = normalizeInsertIndex(
                tag.connectionIds.length,
                insertBefore ? targetIndex : targetIndex + 1,
              );
              const nextIds = [...tag.connectionIds];
              nextIds.splice(insertIndex, 0, connectionId);
              return { ...tag, connectionIds: nextIds };
            });
            return {
              connections: state.connections,
              connectionTags: updatedTags,
              sidebarRootOrder: resolveSidebarRootOrderTokens(
                state.sidebarRootOrder,
                updatedTags,
                state.connections,
              ),
            };
          }

          const ungroupedIds = state.connections
            .map((conn) => conn.id)
            .filter((id) => id !== connectionId)
            .filter((id) => !nextTags.some((tag) => tag.connectionIds.includes(id)));
          const targetIndex = ungroupedIds.indexOf(targetConnectionId);
          const insertIndex =
            targetIndex === -1
              ? ungroupedIds.length
              : normalizeInsertIndex(
                  ungroupedIds.length,
                  insertBefore ? targetIndex : targetIndex + 1,
                );
          const nextUngroupedIds = [...ungroupedIds];
          nextUngroupedIds.splice(insertIndex, 0, connectionId);
          const ungroupedOrderMap = new Map(
            nextUngroupedIds.map((id, index) => [id, index]),
          );
          const nextConnections = [...state.connections].sort((a, b) => {
            const indexA = ungroupedOrderMap.get(a.id);
            const indexB = ungroupedOrderMap.get(b.id);
            if (typeof indexA === 'number' && typeof indexB === 'number') {
              return indexA - indexB;
            }
            if (typeof indexA === 'number') {
              return -1;
            }
            if (typeof indexB === 'number') {
              return 1;
            }
            return 0;
          });

          return {
            connections: nextConnections,
            connectionTags: nextTags,
            sidebarRootOrder: resolveSidebarRootOrderTokens(
              state.sidebarRootOrder,
              nextTags,
              nextConnections,
            ),
          };
        }),
      reorderTags: (tagIds) =>
        set((state) => {
          const nextRootOrder = resolveSidebarRootOrderTokens(
            state.sidebarRootOrder,
            state.connectionTags,
            state.connections,
          );
          const orderedRootOrder = [
            ...tagIds.map((id) => buildSidebarRootTagToken(id)),
            ...nextRootOrder.filter((token) => !isSidebarRootTagToken(token)),
          ];
          const newTags = orderConnectionTagsBySidebarRootOrder(
            state.connectionTags,
            orderedRootOrder,
          );
          return {
            connectionTags: newTags,
            sidebarRootOrder: resolveSidebarRootOrderTokens(
              orderedRootOrder,
              newTags,
              state.connections,
            ),
          };
        }),
      reorderSidebarRoot: (sourceToken, targetToken, insertBefore) =>
        set((state) => {
          const nextRootOrder = moveSidebarRootToken(
            resolveSidebarRootOrderTokens(
              state.sidebarRootOrder,
              state.connectionTags,
              state.connections,
            ),
            sourceToken,
            targetToken,
            insertBefore,
          );
          return {
            sidebarRootOrder: resolveSidebarRootOrderTokens(
              nextRootOrder,
              state.connectionTags,
              state.connections,
            ),
            connectionTags: orderConnectionTagsBySidebarRootOrder(
              state.connectionTags,
              nextRootOrder,
            ),
          };
        }),

      addTab: (tab) =>
        set((state) => {
          const incomingTab =
            tab.type === "query" && tab.resultPanelVisible === undefined
              ? {
                  ...tab,
                  resultPanelVisible: state.queryOptions.showQueryResultsPanel,
                }
              : tab;
          const index = state.tabs.findIndex((t) => t.id === incomingTab.id);
          if (index !== -1) {
            // Update existing tab with new data (e.g. switch initialTab)
            const newTabs = [...state.tabs];
            newTabs[index] = { ...newTabs[index], ...incomingTab };
            return {
              tabs: newTabs,
              activeTabId: incomingTab.id,
              activeContext: resolveActiveContextForTabId(
                newTabs,
                incomingTab.id,
                state.activeContext,
              ),
            };
          }
          // 语义去重：对 table/design 类型按 connectionId+dbName+tableName 匹配已有 Tab
          if (
            (incomingTab.type === "table" || incomingTab.type === "design") &&
            incomingTab.tableName &&
            incomingTab.connectionId &&
            incomingTab.dbName
          ) {
            const semanticIndex = state.tabs.findIndex(
              (t) =>
                t.type === incomingTab.type &&
                t.connectionId === incomingTab.connectionId &&
                t.dbName === incomingTab.dbName &&
                t.tableName === incomingTab.tableName,
            );
            if (semanticIndex !== -1) {
              const existingTab = state.tabs[semanticIndex];
              const newTabs = [...state.tabs];
              newTabs[semanticIndex] = {
                ...existingTab,
                ...incomingTab,
                id: existingTab.id,
              };
              return {
                tabs: newTabs,
                activeTabId: existingTab.id,
                activeContext: resolveActiveContextForTabId(
                  newTabs,
                  existingTab.id,
                  state.activeContext,
                ),
              };
            }
          }
          // 语义去重：对 query 类型按 savedQueryId 匹配已有 Tab（避免保存后重复打开）
          if (incomingTab.type === "query" && incomingTab.savedQueryId) {
            const savedQueryIndex = state.tabs.findIndex(
              (t) =>
                t.type === "query" &&
                (t.savedQueryId === incomingTab.savedQueryId ||
                  t.id === incomingTab.savedQueryId),
            );
            if (savedQueryIndex !== -1) {
              const existingTab = state.tabs[savedQueryIndex];
              const newTabs = [...state.tabs];
              newTabs[savedQueryIndex] = {
                ...existingTab,
                ...incomingTab,
                id: existingTab.id,
              };
              return {
                tabs: newTabs,
                activeTabId: existingTab.id,
                activeContext: resolveActiveContextForTabId(
                  newTabs,
                  existingTab.id,
                  state.activeContext,
                ),
              };
            }
          }
          const nextTabs = [...state.tabs, incomingTab];
          return {
            tabs: nextTabs,
            activeTabId: incomingTab.id,
            activeContext: resolveActiveContextForTabId(
              nextTabs,
              incomingTab.id,
              state.activeContext,
            ),
          };
        }),

      updateQueryTabDraft: (id, draft) =>
        set((state) => {
          const tabId = toTrimmedString(id);
          if (!tabId) return state;

          let changed = false;
          const nextTabs = state.tabs.map((tab) => {
            if (tab.id !== tabId || tab.type !== "query") return tab;
            const nextTab: TabData = { ...tab };

            if (draft.query !== undefined) {
              const nextQuery = typeof draft.query === "string" ? draft.query.slice(0, MAX_PERSISTED_QUERY_LENGTH) : "";
              if (nextTab.query !== nextQuery) {
                nextTab.query = nextQuery;
                changed = true;
              }
            }
            if (draft.connectionId !== undefined) {
              const nextConnectionId = toTrimmedString(draft.connectionId);
              if (nextTab.connectionId !== nextConnectionId) {
                nextTab.connectionId = nextConnectionId;
                changed = true;
              }
            }
            if (draft.dbName !== undefined) {
              const nextDbName = toTrimmedString(draft.dbName);
              if ((nextTab.dbName || "") !== nextDbName) {
                nextTab.dbName = nextDbName;
                changed = true;
              }
            }
            if (draft.title !== undefined) {
              const nextTitle = toTrimmedString(draft.title, nextTab.title) || nextTab.title;
              if (nextTab.title !== nextTitle) {
                nextTab.title = nextTitle;
                changed = true;
              }
            }
            if (draft.resultPanelVisible !== undefined) {
              const nextResultPanelVisible = draft.resultPanelVisible === true;
              if (nextTab.resultPanelVisible !== nextResultPanelVisible) {
                nextTab.resultPanelVisible = nextResultPanelVisible;
                changed = true;
              }
            }

            return nextTab;
          });

          return changed ? { tabs: nextTabs } : state;
        }),

      closeTab: (id) =>
        set((state) => {
          const newTabs = state.tabs.filter((t) => t.id !== id);
          let newActiveId = state.activeTabId;
          if (state.activeTabId === id) {
            newActiveId =
              newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
          }
          return {
            tabs: newTabs,
            activeTabId: newActiveId,
            activeContext: resolveActiveContextForTabId(
              newTabs,
              newActiveId,
              state.activeContext,
            ),
          };
        }),

      closeOtherTabs: (id) =>
        set((state) => {
          const keep = state.tabs.find((t) => t.id === id);
          if (!keep) return state;
          return {
            tabs: [keep],
            activeTabId: id,
            activeContext: resolveActiveContextFromTab(keep),
          };
        }),

      closeTabsToLeft: (id) =>
        set((state) => {
          const index = state.tabs.findIndex((t) => t.id === id);
          if (index === -1) return state;
          const newTabs = state.tabs.slice(index);
          const activeStillExists = state.activeTabId
            ? newTabs.some((t) => t.id === state.activeTabId)
            : false;
          return {
            tabs: newTabs,
            activeTabId: activeStillExists ? state.activeTabId : id,
            activeContext: resolveActiveContextForTabId(
              newTabs,
              activeStillExists ? state.activeTabId : id,
              state.activeContext,
            ),
          };
        }),

      closeTabsToRight: (id) =>
        set((state) => {
          const index = state.tabs.findIndex((t) => t.id === id);
          if (index === -1) return state;
          const newTabs = state.tabs.slice(0, index + 1);
          const activeStillExists = state.activeTabId
            ? newTabs.some((t) => t.id === state.activeTabId)
            : false;
          return {
            tabs: newTabs,
            activeTabId: activeStillExists ? state.activeTabId : id,
            activeContext: resolveActiveContextForTabId(
              newTabs,
              activeStillExists ? state.activeTabId : id,
              state.activeContext,
            ),
          };
        }),

      closeTabsByConnection: (connectionId) =>
        set((state) => {
          const targetConnectionId = String(connectionId || "").trim();
          if (!targetConnectionId) return state;
          const newTabs = state.tabs.filter(
            (t) => String(t.connectionId || "").trim() !== targetConnectionId,
          );
          const activeStillExists = state.activeTabId
            ? newTabs.some((t) => t.id === state.activeTabId)
            : false;
          const nextActiveTabId = activeStillExists
            ? state.activeTabId
            : newTabs.length > 0
              ? newTabs[newTabs.length - 1].id
              : null;
          const nextFallbackContext =
            state.activeContext?.connectionId === targetConnectionId
              ? null
              : state.activeContext;
          return {
            tabs: newTabs,
            activeTabId: nextActiveTabId,
            activeContext: resolveActiveContextForTabId(
              newTabs,
              nextActiveTabId,
              nextFallbackContext,
            ),
          };
        }),

      closeTabsByDatabase: (connectionId, dbName) =>
        set((state) => {
          const targetConnectionId = String(connectionId || "").trim();
          const targetDbName = String(dbName || "").trim();
          if (!targetConnectionId || !targetDbName) return state;
          const newTabs = state.tabs.filter((tab) => {
            const sameConnection =
              String(tab.connectionId || "").trim() === targetConnectionId;
            const sameDb = String(tab.dbName || "").trim() === targetDbName;
            return !(sameConnection && sameDb);
          });
          const activeStillExists = state.activeTabId
            ? newTabs.some((t) => t.id === state.activeTabId)
            : false;
          const nextActiveTabId = activeStillExists
            ? state.activeTabId
            : newTabs.length > 0
              ? newTabs[newTabs.length - 1].id
              : null;
          const sameActiveContext =
            state.activeContext &&
            state.activeContext.connectionId === targetConnectionId &&
            state.activeContext.dbName === targetDbName;
          const nextFallbackContext = sameActiveContext
            ? null
            : state.activeContext;
          return {
            tabs: newTabs,
            activeTabId: nextActiveTabId,
            activeContext: resolveActiveContextForTabId(
              newTabs,
              nextActiveTabId,
              nextFallbackContext,
            ),
          };
        }),

      moveTab: (sourceId, targetId) =>
        set((state) => {
          const fromId = String(sourceId || "").trim();
          const toId = String(targetId || "").trim();
          if (!fromId || !toId || fromId === toId) {
            return state;
          }
          const fromIndex = state.tabs.findIndex((tab) => tab.id === fromId);
          const toIndex = state.tabs.findIndex((tab) => tab.id === toId);
          if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
            return state;
          }
          const nextTabs = [...state.tabs];
          const [movingTab] = nextTabs.splice(fromIndex, 1);
          nextTabs.splice(toIndex, 0, movingTab);
          return { tabs: nextTabs };
        }),

      closeAllTabs: () => set(() => ({ tabs: [], activeTabId: null, activeContext: null })),

      setActiveTab: (id) =>
        set((state) => ({
          activeTabId: id,
          activeContext: resolveActiveContextForTabId(
            state.tabs,
            id,
            state.activeContext,
          ),
        })),
      setActiveContext: (context) => set({ activeContext: context }),

      saveQuery: (query) =>
        set((state) => {
          // If query with same ID exists, update it
          const existing = state.savedQueries.find((q) => q.id === query.id);
          if (existing) {
            return {
              savedQueries: state.savedQueries.map((q) =>
                q.id === query.id ? query : q,
              ),
            };
          }
          return { savedQueries: [...state.savedQueries, query] };
        }),

      deleteQuery: (id) =>
        set((state) => ({
          savedQueries: state.savedQueries.filter((q) => q.id !== id),
        })),

      saveExternalSQLDirectory: (directory) =>
        set((state) => {
          const path = toTrimmedString(directory.path);
          if (!path) {
            return state;
          }
          const connectionId = toTrimmedString(directory.connectionId);
          const dbName = toTrimmedString(directory.dbName);
          const nextDirectory: ExternalSQLDirectory = {
            id:
              toTrimmedString(
                directory.id,
                buildExternalSQLDirectoryId(connectionId, dbName, path),
              ) || buildExternalSQLDirectoryId(connectionId, dbName, path),
            name:
              toTrimmedString(
                directory.name,
                path.split(/[\\/]/).filter(Boolean).pop() || "SQL目录",
              ) || "SQL目录",
            path,
            ...(connectionId ? { connectionId } : {}),
            ...(dbName ? { dbName } : {}),
            createdAt: Number.isFinite(Number(directory.createdAt))
              ? Number(directory.createdAt)
              : Date.now(),
          };
          const nextPathKey = path.replace(/\\/g, "/").toLowerCase();
          const existingIndex = state.externalSQLDirectories.findIndex(
            (item) =>
              item.id === nextDirectory.id ||
              item.path.replace(/\\/g, "/").toLowerCase() === nextPathKey,
          );
          if (existingIndex === -1) {
            return {
              externalSQLDirectories: [
                ...state.externalSQLDirectories,
                nextDirectory,
              ],
            };
          }
          return {
            externalSQLDirectories: state.externalSQLDirectories.map(
              (item, index) => (index === existingIndex ? nextDirectory : item),
            ),
          };
        }),

      deleteExternalSQLDirectory: (id) =>
        set((state) => ({
          externalSQLDirectories: state.externalSQLDirectories.filter(
            (item) => item.id !== id,
          ),
        })),

      setTheme: (theme) => set({ theme }),
      setAppearance: (appearance) =>
        set((state) => ({
          appearance: sanitizeAppearance(
            { ...state.appearance, ...appearance },
            PERSIST_VERSION,
          ),
        })),
      setUiScale: (scale) => set({ uiScale: sanitizeUiScale(scale) }),
      setFontSize: (size) => set({ fontSize: sanitizeFontSize(size) }),
      setStartupFullscreen: (enabled) => {
        const nextValue = !!enabled;
        set({ startupFullscreen: nextValue });
        writePersistedStatePatch({ startupFullscreen: nextValue });
      },
      setGlobalProxy: (proxy) =>
        set((state) => ({
          globalProxy: sanitizeGlobalProxy({ ...state.globalProxy, ...proxy }),
        })),
      replaceGlobalProxy: (proxy) =>
        set((state) => ({
          globalProxy: sanitizeGlobalProxy({
            ...DEFAULT_GLOBAL_PROXY,
            ...proxy,
          }),
          shortcutOptions: readPersistedShortcutOptions() ?? state.shortcutOptions,
        })),
      setSqlFormatOptions: (options) => set({ sqlFormatOptions: options }),
      setQueryOptions: (options) =>
        set((state) => ({
          queryOptions: { ...state.queryOptions, ...options },
        })),
      setDataEditTransactionOptions: (options) =>
        set((state) => ({
          dataEditTransactionOptions: sanitizeDataEditTransactionOptions({
            ...state.dataEditTransactionOptions,
            ...options,
          }),
        })),
      setSqlEditorTransactionOptions: (options) =>
        set((state) => ({
          sqlEditorTransactionOptions: sanitizeSqlEditorTransactionOptions({
            ...state.sqlEditorTransactionOptions,
            ...options,
          }),
        })),
      setSqlEditorPendingTransaction: (tabId, transaction) =>
        set((state) => {
          const safeTabId = String(tabId || "").trim();
          if (!safeTabId) {
            return {};
          }
          const next = { ...state.sqlEditorPendingTransactions };
          if (!transaction) {
            delete next[safeTabId];
            return { sqlEditorPendingTransactions: next };
          }
          next[safeTabId] = {
            ...transaction,
            tabId: safeTabId,
          };
          return { sqlEditorPendingTransactions: next };
        }),
      updateShortcut: (action, binding, platform) => {
        runWithExplicitShortcutPersistence(() => {
          const targetPlatform = platform ?? getShortcutPlatform();
          set((state) => ({
            shortcutOptions: {
              ...state.shortcutOptions,
              [action]: {
                ...state.shortcutOptions[action],
                [targetPlatform]: {
                  ...state.shortcutOptions[action][targetPlatform],
                  ...binding,
                },
              },
            },
          }));
        });
      },
      resetShortcutOptions: () => {
        runWithExplicitShortcutPersistence(() => {
          set({
            shortcutOptions: cloneShortcutOptions(DEFAULT_SHORTCUT_OPTIONS),
          });
        });
      },

      saveSqlSnippet: (snippet) =>
        set((state) => {
          const existing = state.sqlSnippets.findIndex((s) => s.id === snippet.id);
          if (existing >= 0) {
            const updated = [...state.sqlSnippets];
            updated[existing] = snippet;
            return { sqlSnippets: updated };
          }
          return { sqlSnippets: [...state.sqlSnippets, snippet] };
        }),
      deleteSqlSnippet: (id) =>
        set((state) => ({
          sqlSnippets: state.sqlSnippets.filter(
            (s) => s.id !== id || s.isBuiltin,
          ),
        })),
      resetBuiltinSqlSnippet: (id) =>
        set((state) => {
          const original = BUILTIN_SNIPPET_MAP[id];
          if (!original) return state;
          return {
            sqlSnippets: state.sqlSnippets.map((s) =>
              s.id === id ? { ...original } : s,
            ),
          };
        }),

      addSqlLog: (log) =>
        set((state) => ({ sqlLogs: sanitizeSqlLogs([log, ...state.sqlLogs], MAX_SQL_LOGS) })),
      clearSqlLogs: () => set({ sqlLogs: [] }),

      recordTableAccess: (connectionId, dbName, tableName) =>
        set((state) => {
          const key = `${connectionId}-${dbName}-${tableName}`;
          const currentCount = state.tableAccessCount[key] || 0;
          return {
            tableAccessCount: {
              ...state.tableAccessCount,
              [key]: currentCount + 1,
            },
          };
        }),

      setTableSortPreference: (connectionId, dbName, sortBy) =>
        set((state) => {
          const key = `${connectionId}-${dbName}`;
          return {
            tableSortPreference: {
              ...state.tableSortPreference,
              [key]: sortBy,
            },
          };
        }),

      setSidebarTablePinned: (connectionId, dbName, tableName, schemaName, pinned) =>
        set((state) => {
          const key = buildSidebarTablePinKey(connectionId, dbName, tableName, schemaName);
          if (!key) return state;
          const current = new Set(state.pinnedSidebarTables);
          if (pinned) {
            current.add(key);
          } else {
            current.delete(key);
          }
          return { pinnedSidebarTables: Array.from(current) };
        }),

      setTableColumnOrder: (connectionId, dbName, tableName, order) =>
        set((state) => {
          const key = `${connectionId}-${dbName}-${tableName}`;
          return {
            tableColumnOrders: {
              ...state.tableColumnOrders,
              [key]: order,
            },
          };
        }),

      clearTableColumnOrder: (connectionId, dbName, tableName) =>
        set((state) => {
          const key = `${connectionId}-${dbName}-${tableName}`;
          const newOrders = { ...state.tableColumnOrders };
          delete newOrders[key];
          return { tableColumnOrders: newOrders };
        }),

      setEnableColumnOrderMemory: (enabled) =>
        set({ enableColumnOrderMemory: !!enabled }),

      setTableHiddenColumns: (connectionId, dbName, tableName, hiddenColumns) =>
        set((state) => {
          const key = `${connectionId}-${dbName}-${tableName}`;
          return {
            tableHiddenColumns: {
              ...state.tableHiddenColumns,
              [key]: hiddenColumns,
            },
          };
        }),

      clearTableHiddenColumns: (connectionId, dbName, tableName) =>
        set((state) => {
          const key = `${connectionId}-${dbName}-${tableName}`;
          const newHidden = { ...state.tableHiddenColumns };
          delete newHidden[key];
          return { tableHiddenColumns: newHidden };
        }),

      setEnableHiddenColumnMemory: (enabled) =>
        set({ enableHiddenColumnMemory: !!enabled }),

      setWindowBounds: (bounds) =>
        set({
          windowBounds: {
            width: Math.max(400, Math.trunc(bounds.width)),
            height: Math.max(300, Math.trunc(bounds.height)),
            x: Math.trunc(bounds.x),
            y: Math.trunc(bounds.y),
          },
        }),

      setWindowState: (state) => set({ windowState: state }),

      setSidebarWidth: (width) =>
        set({ sidebarWidth: Math.max(200, Math.min(600, Math.trunc(width))) }),

      // AI actions
      toggleAIPanel: () =>
        set((state) => ({ aiPanelVisible: !state.aiPanelVisible })),
      setAIPanelVisible: (visible) => set({ aiPanelVisible: visible }),
      addAIChatMessage: (sessionId, message) => {
        set((state) => {
          const history = { ...state.aiChatHistory };
          const messages = history[sessionId] || [];
          history[sessionId] = [...messages, message];

          let newSessions = [...state.aiChatSessions];
          const existingSession = newSessions.find((s) => s.id === sessionId);

          if (!existingSession) {
            let title = message.role === "user" ? message.content : "新的对话";
            if (title.length > 20) {
              title = title.substring(0, 20) + "...";
            }
            newSessions.unshift({
              id: sessionId,
              title,
              updatedAt: Date.now(),
            });
          } else {
            newSessions = newSessions.filter((s) => s.id !== sessionId);
            newSessions.unshift({ ...existingSession, updatedAt: Date.now() });
          }

          return { aiChatHistory: history, aiChatSessions: newSessions };
        });
        // 异步持久化到文件（fire-and-forget，防抖由外层控制）
        _debouncedPersistSession(sessionId);
      },
      updateAIChatMessage: (sessionId, messageId, updates) => {
        set((state) => {
          const messages = state.aiChatHistory[sessionId];
          if (!messages) return state;
          const idx = messages.findIndex((m) => m.id === messageId);
          if (idx < 0) return state;
          const newMessages = [...messages];
          newMessages[idx] = { ...newMessages[idx], ...updates };
          const history = { ...state.aiChatHistory, [sessionId]: newMessages };
          const isContentOnlyUpdate =
            Object.keys(updates).length === 1 && "content" in updates;
          if (!isContentOnlyUpdate) {
            let newSessions = [...state.aiChatSessions];
            const existingSession = newSessions.find((s) => s.id === sessionId);
            if (existingSession) {
              newSessions = newSessions.filter((s) => s.id !== sessionId);
              newSessions.unshift({
                ...existingSession,
                updatedAt: Date.now(),
              });
            }
            return { aiChatHistory: history, aiChatSessions: newSessions };
          }
          return { aiChatHistory: history };
        });
        // 流式打字高频调用，防抖 2 秒后才写磁盘
        _debouncedPersistSession(sessionId);
      },
      deleteAIChatMessage: (sessionId, messageId) => {
        set((state) => {
          const history = { ...state.aiChatHistory };
          if (history[sessionId]) {
            history[sessionId] = history[sessionId].filter(
              (m) => m.id !== messageId,
            );
          }
          return { aiChatHistory: history };
        });
        _debouncedPersistSession(sessionId);
      },
      truncateAIChatMessages: (sessionId, upToMessageId) => {
        set((state) => {
          const history = { ...state.aiChatHistory };
          const messages = history[sessionId];
          if (messages) {
            const idx = messages.findIndex((m) => m.id === upToMessageId);
            if (idx >= 0) {
              history[sessionId] = messages.slice(0, idx + 1);
            }
          }
          return { aiChatHistory: history };
        });
        _debouncedPersistSession(sessionId);
      },
      clearAIChatHistory: (sessionId) => {
        set((state) => {
          const history = { ...state.aiChatHistory };
          delete history[sessionId];
          return { aiChatHistory: history };
        });
        _debouncedPersistSession(sessionId);
      },
      replaceAIChatHistory: (sessionId, messages) => {
        set((state) => {
          const history = { ...state.aiChatHistory };
          history[sessionId] = messages;
          return { aiChatHistory: history };
        });
        _debouncedPersistSession(sessionId);
      },
      deleteAISession: (sessionId) => {
        set((state) => {
          const history = { ...state.aiChatHistory };
          delete history[sessionId];
          const newSessions = state.aiChatSessions.filter(
            (s) => s.id !== sessionId,
          );
          const newActive =
            state.aiActiveSessionId === sessionId
              ? null
              : state.aiActiveSessionId;
          return {
            aiChatHistory: history,
            aiChatSessions: newSessions,
            aiActiveSessionId: newActive,
          };
        });
        // 删除文件
        const Service = (window as any).go?.aiservice?.Service;
        Service?.AIDeleteSession?.(sessionId).catch(() => {});
      },
      createNewAISession: () =>
        set(() => {
          const newId = `session-${Date.now()}`;
          return { aiActiveSessionId: newId };
        }),
      setAIActiveSessionId: (sessionId) =>
        set({ aiActiveSessionId: sessionId }),
      updateAISessionTitle: (sessionId, title) => {
        set((state) => {
          const newSessions = [...state.aiChatSessions];
          const session = newSessions.find((s) => s.id === sessionId);
          if (session) {
            session.title = title;
          }
          return { aiChatSessions: newSessions };
        });
        _debouncedPersistSession(sessionId);
      },
      addAIContext: (connectionKey, context) =>
        set((state) => {
          const contexts = state.aiContexts[connectionKey] || [];
          if (
            contexts.find(
              (c) =>
                c.dbName === context.dbName &&
                c.tableName === context.tableName,
            )
          ) {
            return state;
          }
          return {
            aiContexts: {
              ...state.aiContexts,
              [connectionKey]: [...contexts, context],
            },
          };
        }),
      removeAIContext: (connectionKey, dbName, tableName) =>
        set((state) => {
          const contexts = state.aiContexts[connectionKey] || [];
          return {
            aiContexts: {
              ...state.aiContexts,
              [connectionKey]: contexts.filter(
                (c) => !(c.dbName === dbName && c.tableName === tableName),
              ),
            },
          };
        }),
      clearAIContexts: (connectionKey) =>
        set((state) => {
          const { [connectionKey]: _, ...rest } = state.aiContexts;
          return { aiContexts: rest };
        }),
      setJVMDiagnosticDraft: (tabId, draft) =>
        set((state) => ({
          jvmDiagnosticDrafts: {
            ...state.jvmDiagnosticDrafts,
            [tabId]: {
              command:
                draft.command ??
                state.jvmDiagnosticDrafts[tabId]?.command ??
                "",
              sessionId:
                draft.sessionId ?? state.jvmDiagnosticDrafts[tabId]?.sessionId,
              source: draft.source ?? state.jvmDiagnosticDrafts[tabId]?.source,
              reason: draft.reason ?? state.jvmDiagnosticDrafts[tabId]?.reason,
            },
          },
        })),
      appendJVMDiagnosticOutput: (tabId, chunks) =>
        set((state) => ({
          jvmDiagnosticOutputs: {
            ...state.jvmDiagnosticOutputs,
            [tabId]: [
              ...(state.jvmDiagnosticOutputs[tabId] || []),
              ...chunks,
            ],
          },
        })),
      clearJVMDiagnosticOutput: (tabId) =>
        set((state) => ({
          jvmDiagnosticOutputs: {
            ...state.jvmDiagnosticOutputs,
            [tabId]: [],
          },
        })),
    }),
    {
      name: PERSIST_STORAGE_KEY, // name of the item in the storage (must be unique)
      storage: createDebouncedPersistStorage(() => localStorage),
      version: PERSIST_VERSION,
      migrate: (persistedState: unknown, version: number) => {
        const state = unwrapPersistedAppState(
          persistedState,
        ) as Partial<AppState>;
        const nextState: Partial<AppState> = { ...state };
        nextState.connections = sanitizeConnections(state.connections);
        const safeTabs = sanitizeQueryTabs(state.tabs);
        nextState.tabs = safeTabs;
        nextState.activeTabId = sanitizeActiveTabId(state.activeTabId, safeTabs);
        if (version < 5) {
          nextState.connectionTags = sanitizeConnectionTags(
            state.connectionTags,
          );
        } else {
          nextState.connectionTags = sanitizeConnectionTags(
            state.connectionTags,
          );
        }
        nextState.sidebarRootOrder = resolveSidebarRootOrderTokens(
          state.sidebarRootOrder,
          nextState.connectionTags,
          nextState.connections,
        );
        nextState.savedQueries = sanitizeSavedQueries(state.savedQueries);
        nextState.externalSQLDirectories = sanitizeExternalSQLDirectories(
          state.externalSQLDirectories,
        );
        nextState.theme = sanitizeTheme(state.theme);
        nextState.appearance = sanitizeAppearance(state.appearance, version);
        nextState.uiScale = sanitizeUiScale(state.uiScale);
        nextState.fontSize = sanitizeFontSize(state.fontSize);
        nextState.startupFullscreen = sanitizeStartupFullscreen(
          state.startupFullscreen,
        );
        nextState.globalProxy = sanitizeGlobalProxy(state.globalProxy);
        nextState.sqlFormatOptions = sanitizeSqlFormatOptions(
          state.sqlFormatOptions,
        );
        nextState.queryOptions = sanitizeQueryOptions(state.queryOptions);
        nextState.dataEditTransactionOptions =
          sanitizeDataEditTransactionOptions(state.dataEditTransactionOptions);
        nextState.sqlEditorTransactionOptions =
          sanitizeSqlEditorTransactionOptions(state.sqlEditorTransactionOptions);
        nextState.shortcutOptions = sanitizeShortcutOptions(
          state.shortcutOptions,
        );
        nextState.sqlLogs = sanitizeSqlLogs(state.sqlLogs);
        const existingSnippets = sanitizeSqlSnippets(state.sqlSnippets);
        const existingSnippetIds = new Set(existingSnippets.map((s) => s.id));
        const missingSnippets = DEFAULT_SQL_SNIPPETS.filter(
          (d) => !existingSnippetIds.has(d.id),
        );
        nextState.sqlSnippets =
          missingSnippets.length > 0
            ? [...existingSnippets, ...missingSnippets]
            : existingSnippets;
        nextState.tableAccessCount = sanitizeTableAccessCount(
          state.tableAccessCount,
        );
        nextState.tableSortPreference = sanitizeTableSortPreference(
          state.tableSortPreference,
        );
        // 新增的列排序记忆状态不需要做版本特殊兼容，直接做基本的类型保护
        const safeOrders = sanitizeTableColumnOrders(state.tableColumnOrders);
        nextState.tableColumnOrders = safeOrders;
        nextState.enableColumnOrderMemory =
          state.enableColumnOrderMemory !== false;
        const safeHidden = sanitizeTableHiddenColumns(state.tableHiddenColumns);
        nextState.tableHiddenColumns = safeHidden;
        nextState.enableHiddenColumnMemory =
          state.enableHiddenColumnMemory !== false;
        nextState.pinnedSidebarTables = sanitizePinnedSidebarTables(
          state.pinnedSidebarTables,
        );
        nextState.windowBounds = sanitizeWindowBounds(state.windowBounds);
        nextState.windowState = sanitizeWindowState(state.windowState);
        nextState.sidebarWidth = sanitizeSidebarWidth(state.sidebarWidth);

        // 保留原有的 AI 持久化记录，或者为空（版本兼容）
        nextState.aiChatHistory =
          state.aiChatHistory && typeof state.aiChatHistory === "object"
            ? state.aiChatHistory
            : {};
        nextState.aiChatSessions = Array.isArray(state.aiChatSessions)
          ? state.aiChatSessions
          : [];
        return nextState as AppState;
      },
      merge: (persistedState, currentState) => {
        const state = unwrapPersistedAppState(
          persistedState,
        ) as Partial<AppState>;
        const safeTabs = sanitizeQueryTabs(state.tabs);
        const persistedConnections =
          state.connections === undefined
            ? currentState.connections
            : sanitizeConnections(state.connections);
        const persistedConnectionTags =
          state.connectionTags === undefined
            ? currentState.connectionTags
            : sanitizeConnectionTags(state.connectionTags);
        const persistedSidebarRootOrder =
          state.sidebarRootOrder === undefined
            ? currentState.sidebarRootOrder
            : resolveSidebarRootOrderTokens(
                state.sidebarRootOrder,
                persistedConnectionTags,
                persistedConnections,
              );
        return {
          ...currentState,
          ...state,
          connections: persistedConnections,
          connectionTags: persistedConnectionTags,
          sidebarRootOrder: persistedSidebarRootOrder,
          tabs: safeTabs,
          activeTabId: sanitizeActiveTabId(state.activeTabId, safeTabs),
          savedQueries: sanitizeSavedQueries(state.savedQueries),
          externalSQLDirectories: sanitizeExternalSQLDirectories(
            state.externalSQLDirectories,
          ),
          theme: sanitizeTheme(state.theme),
          appearance: sanitizeAppearance(state.appearance, PERSIST_VERSION),
          uiScale: sanitizeUiScale(state.uiScale),
          fontSize: sanitizeFontSize(state.fontSize),
          startupFullscreen: sanitizeStartupFullscreen(state.startupFullscreen),
          globalProxy: sanitizeGlobalProxy(state.globalProxy),
          tableSortPreference: sanitizeTableSortPreference(
            state.tableSortPreference,
          ),
          tableColumnOrders: sanitizeTableColumnOrders(state.tableColumnOrders),
          enableColumnOrderMemory: state.enableColumnOrderMemory !== false,
          tableHiddenColumns: sanitizeTableHiddenColumns(
            state.tableHiddenColumns,
          ),
          enableHiddenColumnMemory: state.enableHiddenColumnMemory !== false,
          pinnedSidebarTables: sanitizePinnedSidebarTables(
            state.pinnedSidebarTables,
          ),
          windowBounds: sanitizeWindowBounds(state.windowBounds),
          windowState: sanitizeWindowState(state.windowState),
          sidebarWidth: sanitizeSidebarWidth(state.sidebarWidth),

          sqlFormatOptions: sanitizeSqlFormatOptions(state.sqlFormatOptions),
          queryOptions: sanitizeQueryOptions(state.queryOptions),
          dataEditTransactionOptions: sanitizeDataEditTransactionOptions(
            state.dataEditTransactionOptions,
          ),
          sqlEditorTransactionOptions: sanitizeSqlEditorTransactionOptions(
            state.sqlEditorTransactionOptions,
          ),
          shortcutOptions: sanitizeShortcutOptions(state.shortcutOptions),
          sqlLogs: sanitizeSqlLogs(state.sqlLogs),
          sqlSnippets: sanitizeSqlSnippets(state.sqlSnippets),
          tableAccessCount: sanitizeTableAccessCount(state.tableAccessCount),

          // AI 会话数据不再从 localStorage 恢复，改为从后端文件加载
          aiChatHistory: {},
          aiChatSessions: [],
        };
      },
      partialize: (state) => {
        const tabs = sanitizeQueryTabs(state.tabs);
        const partialState: Partial<AppState> = {
          tabs,
          activeTabId: sanitizeActiveTabId(state.activeTabId, tabs),
          connectionTags: state.connectionTags,
          sidebarRootOrder: state.sidebarRootOrder,
          savedQueries: state.savedQueries,
          externalSQLDirectories: state.externalSQLDirectories,
          theme: state.theme,
          appearance: state.appearance,
          uiScale: state.uiScale,
          fontSize: state.fontSize,
          startupFullscreen: state.startupFullscreen,
          globalProxy:
            toTrimmedString(state.globalProxy.password) !== ""
              ? { ...state.globalProxy }
              : toPersistedGlobalProxy(state.globalProxy),
          sqlFormatOptions: state.sqlFormatOptions,
          queryOptions: state.queryOptions,
          dataEditTransactionOptions: state.dataEditTransactionOptions,
          sqlEditorTransactionOptions: state.sqlEditorTransactionOptions,
          shortcutOptions: resolveShortcutOptionsForPersistence(state.shortcutOptions),
          sqlLogs: sanitizeSqlLogs(state.sqlLogs),
          sqlSnippets: state.sqlSnippets,
          tableAccessCount: state.tableAccessCount,
          tableSortPreference: state.tableSortPreference,
          tableColumnOrders: state.tableColumnOrders,
          enableColumnOrderMemory: state.enableColumnOrderMemory,
          tableHiddenColumns: state.tableHiddenColumns,
          enableHiddenColumnMemory: state.enableHiddenColumnMemory,
          pinnedSidebarTables: state.pinnedSidebarTables,
          windowBounds: state.windowBounds,
          windowState: state.windowState,
          sidebarWidth: state.sidebarWidth,
        };

        if (hasLegacyConnectionSecrets(state.connections)) {
          partialState.connections = state.connections;
        }

        // AI 会话数据已迁移到后端文件持久化（~/.gonavi/sessions/），不再写入 localStorage
        return partialState as AppState;
      }, // Don't persist logs
    },
  ),
);
