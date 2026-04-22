import type { ConnectionConfig } from '../types';

const DEFAULT_JMX_PORT = 9010;
const DEFAULT_TIMEOUT_SECONDS = 30;
const DEFAULT_ENVIRONMENT = 'dev';
const JVM_MODES = ['jmx', 'endpoint', 'agent'] as const;

type JVMMode = typeof JVM_MODES[number];
type JVMEnvironment = 'dev' | 'uat' | 'prod';
type JVMConnectionFormValues = Record<string, unknown>;

const isJVMMode = (value: string): value is JVMMode => JVM_MODES.includes(value as JVMMode);

const toStringValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return '';
};

const toInteger = (value: unknown, fallback: number): number => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const intValue = Math.trunc(parsed);
  return intValue > 0 ? intValue : fallback;
};

const normalizeModes = (value: unknown): JVMMode[] => {
  if (!Array.isArray(value)) {
    return ['jmx'];
  }

  const result: JVMMode[] = [];
  const seen = new Set<JVMMode>();
  for (const item of value) {
    const mode = toStringValue(item).toLowerCase();
    if (!isJVMMode(mode) || seen.has(mode)) {
      continue;
    }
    seen.add(mode);
    result.push(mode);
  }
  return result.length > 0 ? result : ['jmx'];
};

const normalizePreferredMode = (value: unknown, allowedModes: JVMMode[]): JVMMode => {
  const preferred = toStringValue(value).toLowerCase();
  if (isJVMMode(preferred) && allowedModes.includes(preferred)) {
    return preferred;
  }
  return allowedModes[0];
};

const normalizeEnvironment = (value: unknown): JVMEnvironment => {
  const env = toStringValue(value).toLowerCase();
  if (env === 'uat' || env === 'prod') {
    return env;
  }
  return DEFAULT_ENVIRONMENT;
};

const normalizeReadOnly = (value: unknown): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  return true;
};

export const buildDefaultJVMConnectionValues = () => ({
  type: 'jvm',
  host: 'localhost',
  port: DEFAULT_JMX_PORT,
  jvmReadOnly: true,
  jvmAllowedModes: ['jmx'],
  jvmPreferredMode: 'jmx',
  jvmEnvironment: DEFAULT_ENVIRONMENT,
  jvmEndpointEnabled: false,
  jvmEndpointBaseUrl: '',
  jvmEndpointApiKey: '',
});

export const buildJVMConnectionConfig = (values: JVMConnectionFormValues): ConnectionConfig => {
  const allowedModes = normalizeModes(values.jvmAllowedModes);
  const preferredMode = normalizePreferredMode(values.jvmPreferredMode, allowedModes);
  const port = toInteger(values.port, DEFAULT_JMX_PORT);
  const timeout = toInteger(values.timeout, DEFAULT_TIMEOUT_SECONDS);

  return {
    type: 'jvm',
    host: toStringValue(values.host),
    port,
    user: '',
    password: '',
    timeout,
    jvm: {
      environment: normalizeEnvironment(values.jvmEnvironment),
      readOnly: normalizeReadOnly(values.jvmReadOnly),
      allowedModes,
      preferredMode,
      jmx: {
        enabled: allowedModes.includes('jmx'),
        host: toStringValue(values.jvmJmxHost) || toStringValue(values.host),
        port: toInteger(values.jvmJmxPort, port),
        username: toStringValue(values.jvmJmxUsername),
        password: toStringValue(values.jvmJmxPassword),
      },
      endpoint: {
        enabled: values.jvmEndpointEnabled === true,
        baseUrl: toStringValue(values.jvmEndpointBaseUrl),
        apiKey: toStringValue(values.jvmEndpointApiKey),
        timeoutSeconds: toInteger(values.jvmEndpointTimeoutSeconds, timeout),
      },
    },
  };
};
