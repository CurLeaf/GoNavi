import { t as translateCatalog, type I18nParams } from '../i18n';

type ToolQueryResult = {
  success?: boolean;
  data?: unknown;
  message?: string;
};

type TableSchemaTranslate = (key: string, params?: I18nParams) => string;

type ResolveAITableSchemaToolResultParams = {
  tableName: string;
  fetchDDL: () => Promise<ToolQueryResult>;
  fetchColumns: () => Promise<ToolQueryResult>;
  translate?: TableSchemaTranslate;
};

const stringifyToolData = (data: unknown): string => (
  typeof data === 'string' ? data : JSON.stringify(data)
);

const firstStringValue = (row: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null) {
      return String(value);
    }
  }
  return '';
};

const normalizeAIColumn = (raw: unknown) => {
  const row = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  const keys = Object.keys(row);
  return {
    field: firstStringValue(row, ['Field', 'field', 'COLUMN_NAME', 'column_name', 'Name', 'name']) || (keys.length > 0 ? String(row[keys[0]] ?? '') : ''),
    type: firstStringValue(row, ['Type', 'type', 'DATA_TYPE', 'data_type']) || (keys.length > 1 ? String(row[keys[1]] ?? '') : ''),
    nullable: firstStringValue(row, ['Null', 'null', 'IS_NULLABLE', 'is_nullable', 'Nullable', 'nullable']),
    default: firstStringValue(row, ['Default', 'default', 'COLUMN_DEFAULT', 'column_default', 'DefaultValue']),
    comment: firstStringValue(row, ['Comment', 'comment', 'COLUMN_COMMENT', 'column_comment', 'Description']),
  };
};

const translateTableSchemaCopy = (
  translate: TableSchemaTranslate | undefined,
  key: string,
  fallback: string,
  params?: I18nParams,
): string => {
  const t = translate || ((catalogKey, catalogParams) => translateCatalog(catalogKey, catalogParams, 'en-US'));
  const translated = t(key, params);
  return translated && translated !== key ? translated : fallback;
};

const buildColumnFallbackContent = (
  tableName: string,
  ddlError: string,
  columns: unknown[],
  translate?: TableSchemaTranslate,
): string => {
  const normalizedColumns = columns.map(normalizeAIColumn).filter((column) => column.field.trim());
  const fieldNames = normalizedColumns.map((column) => column.field).join(', ');
  const fieldsText = fieldNames || translateTableSchemaCopy(
    translate,
    'ai_chat.inspection.table_schema.value.none',
    'none',
  );
  const detail = JSON.stringify(normalizedColumns);
  return [
    translateTableSchemaCopy(
      translate,
      'ai_chat.inspection.table_schema.warning.ddl_fallback',
      `DDL fetch failed for table ${tableName}; fell back to column metadata summary.`,
      { tableName },
    ),
    translateTableSchemaCopy(
      translate,
      'ai_chat.inspection.table_schema.warning.ddl_error',
      `DDL error: ${ddlError || 'Unknown error'}`,
      { detail: ddlError || translateTableSchemaCopy(translate, 'ai_chat.inspection.table_schema.error.unknown', 'Unknown error') },
    ),
    translateTableSchemaCopy(
      translate,
      'ai_chat.inspection.table_schema.warning.fallback_limitation',
      'This result does not include complete index, constraint, trigger, or other DDL information; continue analysis from the column list and do not stop solely because DDL permissions failed.',
    ),
    translateTableSchemaCopy(
      translate,
      'ai_chat.inspection.table_schema.warning.available_fields',
      `Available fields: ${fieldsText}`,
      { fields: fieldsText },
    ),
    translateTableSchemaCopy(
      translate,
      'ai_chat.inspection.table_schema.warning.detail',
      `Details: ${detail}`,
      { detail },
    ),
  ].join('\n');
};

export const resolveAITableSchemaToolResult = async ({
  tableName,
  fetchDDL,
  fetchColumns,
  translate,
}: ResolveAITableSchemaToolResultParams): Promise<{ success: boolean; content: string }> => {
  const ddlResult = await fetchDDL();
  if (ddlResult?.success) {
    return { success: true, content: stringifyToolData(ddlResult.data) };
  }

  const ddlError = ddlResult?.message || 'Failed to fetch DDL';
  const columnResult = await fetchColumns();
  if (columnResult?.success && Array.isArray(columnResult.data)) {
    return { success: true, content: buildColumnFallbackContent(tableName, ddlError, columnResult.data, translate) };
  }

  const columnError = columnResult?.message || 'Failed to fetch columns';
  return {
    success: false,
    content: translateTableSchemaCopy(
      translate,
      'ai_chat.inspection.table_schema.error.ddl_and_columns_failed',
      `Failed to fetch table DDL: ${ddlError}; fallback column metadata also failed: ${columnError}`,
      { ddlDetail: ddlError, columnDetail: columnError },
    ),
  };
};
