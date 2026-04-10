import type { ConnectionConfig, SavedConnection } from '../types';

export type ConnectionImportKind = 'encrypted-package' | 'legacy-json' | 'invalid';

type JsonObject = Record<string, unknown>;

const CONNECTION_PACKAGE_KIND = 'gonavi_connection_package';

const isJsonObject = (value: unknown): value is JsonObject => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isConnectionPackageKDF = (value: unknown): value is JsonObject => (
  isJsonObject(value)
  && typeof value.name === 'string'
  && typeof value.memoryKiB === 'number'
  && typeof value.timeCost === 'number'
  && typeof value.parallelism === 'number'
  && typeof value.salt === 'string'
);

const isConnectionPackageEnvelope = (value: unknown): value is JsonObject => (
  isJsonObject(value)
  && typeof value.schemaVersion === 'number'
  && value.kind === CONNECTION_PACKAGE_KIND
  && typeof value.cipher === 'string'
  && isConnectionPackageKDF(value.kdf)
  && typeof value.nonce === 'string'
  && typeof value.payload === 'string'
);

const isLegacyConnectionConfig = (value: unknown): value is JsonObject => (
  isJsonObject(value)
  && typeof value.type === 'string'
);

const isLegacyConnectionItem = (value: unknown): value is JsonObject => (
  isJsonObject(value)
  && typeof value.id === 'string'
  && typeof value.name === 'string'
  && isLegacyConnectionConfig(value.config)
);

const parseConnectionImportRaw = (raw: unknown): unknown => {
  if (typeof raw !== 'string') {
    return raw;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

export const detectConnectionImportKind = (raw: unknown): ConnectionImportKind => {
  const parsed = parseConnectionImportRaw(raw);

  if (Array.isArray(parsed) && parsed.every((item) => isLegacyConnectionItem(item))) {
    return 'legacy-json';
  }

  if (isConnectionPackageEnvelope(parsed)) {
    return 'encrypted-package';
  }

  return 'invalid';
};

export const normalizeConnectionPackagePassword = (value: string): string => value.trim();

const legacyExportRemovedError = (): never => {
  throw new Error('Legacy connection JSON export has been removed. Use the recovery package flow instead.');
};

export const sanitizeConnectionConfigForExport = (_config: ConnectionConfig): never => legacyExportRemovedError();

export const buildExportableConnections = (_connections: SavedConnection[]): never => legacyExportRemovedError();
