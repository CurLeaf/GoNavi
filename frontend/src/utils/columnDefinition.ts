import type { ColumnDefinition } from '../types';

const readStringProperty = (value: unknown, keys: string[]): string => {
  const source = value as Record<string, unknown> | null | undefined;
  if (!source || typeof source !== 'object') return '';

  for (const key of keys) {
    const raw = source[key];
    if (raw !== undefined && raw !== null) {
      return String(raw).trim();
    }
  }

  for (const [sourceKey, raw] of Object.entries(source)) {
    if (keys.some((key) => sourceKey.toLowerCase() === key.toLowerCase())) {
      return raw === undefined || raw === null ? '' : String(raw).trim();
    }
  }

  return '';
};

const readProperty = (value: unknown, keys: string[]): unknown => {
  const source = value as Record<string, unknown> | null | undefined;
  if (!source || typeof source !== 'object') return undefined;

  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }

  for (const [sourceKey, raw] of Object.entries(source)) {
    if (keys.some((key) => sourceKey.toLowerCase() === key.toLowerCase())) {
      return raw;
    }
  }

  return undefined;
};

const readBooleanProperty = (value: unknown, keys: string[]): boolean => {
  const raw = readProperty(value, keys);
  if (raw === undefined || raw === null) return false;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  const text = String(raw).trim().toLowerCase();
  return text === '1' || text === 't' || text === 'true' || text === 'y' || text === 'yes' || text === 'pri' || text === 'primary';
};

export const getColumnDefinitionName = (column: unknown): string => (
  readStringProperty(column, ['name', 'Name', 'COLUMN_NAME', 'column_name', 'field', 'Field'])
);

export const getColumnDefinitionType = (column: unknown): string => (
  readStringProperty(column, ['type', 'Type', 'DATA_TYPE', 'data_type'])
);

export const getColumnDefinitionKey = (column: unknown): string => {
  const key = readStringProperty(column, ['key', 'Key', 'COLUMN_KEY', 'column_key']);
  if (key) {
    const normalized = key.trim();
    const lowered = normalized.toLowerCase();
    if (lowered === 'pri' || lowered === 'primary' || lowered === 'primary key') return 'PRI';
    if (lowered === 'uni' || lowered === 'unique') return 'UNI';
    if (lowered === 'mul' || lowered === 'multiple') return 'MUL';
    return normalized;
  }
  if (readBooleanProperty(column, ['primaryKey', 'primary_key', 'isPrimary', 'is_primary', 'IS_PRIMARY', 'pk', 'PK'])) {
    return 'PRI';
  }
  if (readBooleanProperty(column, ['unique', 'isUnique', 'is_unique', 'UNIQUE', 'IS_UNIQUE'])) {
    return 'UNI';
  }
  return '';
};

export const getColumnDefinitionExtra = (column: unknown): string => (
  readStringProperty(column, ['extra', 'Extra'])
);

export const getColumnDefinitionComment = (column: unknown): string => (
  readStringProperty(column, ['comment', 'Comment', 'COMMENTS', 'comments', 'COLUMN_COMMENT', 'column_comment'])
);

export const normalizeColumnDefinition = (column: unknown): ColumnDefinition => {
  const source = (column && typeof column === 'object' ? column : {}) as Partial<ColumnDefinition>;
  return {
    ...source,
    name: getColumnDefinitionName(column),
    type: getColumnDefinitionType(column),
    nullable: readStringProperty(column, ['nullable', 'Nullable', 'NULLABLE', 'is_nullable']),
    key: getColumnDefinitionKey(column),
    default: source.default,
    extra: getColumnDefinitionExtra(column),
    comment: getColumnDefinitionComment(column),
  };
};

export const normalizeColumnDefinitions = (columns: unknown): ColumnDefinition[] => (
  Array.isArray(columns) ? columns.map(normalizeColumnDefinition) : []
);
