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

export const getColumnDefinitionName = (column: unknown): string => (
  readStringProperty(column, ['name', 'Name', 'COLUMN_NAME', 'column_name', 'field', 'Field'])
);

export const getColumnDefinitionType = (column: unknown): string => (
  readStringProperty(column, ['type', 'Type', 'DATA_TYPE', 'data_type'])
);

export const getColumnDefinitionKey = (column: unknown): string => (
  readStringProperty(column, ['key', 'Key', 'COLUMN_KEY', 'column_key'])
);

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
