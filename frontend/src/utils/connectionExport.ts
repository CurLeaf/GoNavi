import type { ConnectionConfig, SavedConnection } from '../types';

export type ConnectionImportKind = 'encrypted-package' | 'legacy-json' | 'invalid';
export type ConnectionPackageDialogSnapshot = {
  open: boolean;
  mode: 'export' | 'import';
  password: string;
  error: string;
  confirmLoading: boolean;
};
export type ConnectionPackageDialogUpdater = (
  current: ConnectionPackageDialogSnapshot,
) => ConnectionPackageDialogSnapshot;

export type ConnectionPackageExportResult =
  | { kind: 'canceled'; nextDialog: ConnectionPackageDialogUpdater }
  | { kind: 'succeeded' }
  | { kind: 'failed'; error: string };

type JsonObject = Record<string, unknown>;

const CONNECTION_PACKAGE_KIND = 'gonavi_connection_package';
const CANCELED_MESSAGE = '已取消';

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

export const isConnectionPackageExportCanceled = (result: unknown): boolean => (
  isJsonObject(result)
  && result.success === false
  && result.message === CANCELED_MESSAGE
);

export const resolveConnectionPackageExportResult = (
  _currentDialog: ConnectionPackageDialogSnapshot,
  result: unknown,
): ConnectionPackageExportResult => {
  if (isConnectionPackageExportCanceled(result)) {
    return {
      kind: 'canceled',
      nextDialog: (current) => ({
        ...current,
        confirmLoading: false,
        error: '',
      }),
    };
  }

  if (isJsonObject(result) && result.success === true) {
    return { kind: 'succeeded' };
  }

  return {
    kind: 'failed',
    error: isJsonObject(result) && typeof result.message === 'string' && result.message.trim()
      ? result.message
      : '导出失败',
  };
};

const legacyExportRemovedError = (): never => {
  throw new Error('Legacy connection JSON export has been removed. Use the recovery package flow instead.');
};

export const sanitizeConnectionConfigForExport = (_config: ConnectionConfig): never => legacyExportRemovedError();

export const buildExportableConnections = (_connections: SavedConnection[]): never => legacyExportRemovedError();
