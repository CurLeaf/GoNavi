import type { TabData, TableExportScope, TableExportScopeOption } from '../types';

export const DEFAULT_TABLE_EXPORT_SCOPE_OPTION: TableExportScopeOption = {
  value: 'all',
  label: '全表数据',
  description: '后台重新查询整张表并导出全部数据。',
};

export const buildTableExportHistoryKey = (
  connectionId: string,
  dbName: string | undefined,
  tableName: string | undefined,
): string => {
  return [
    String(connectionId || '').trim(),
    String(dbName || '').trim(),
    String(tableName || '').trim(),
  ].join('::');
};

export const buildExportWorkbenchHistoryKey = (
  input: Pick<TabData, 'connectionId' | 'dbName' | 'tableName' | 'exportWorkbenchMode'>,
): string => {
  const mode = input.exportWorkbenchMode || 'single';
  const connectionId = String(input.connectionId || '').trim();
  const dbName = String(input.dbName || '').trim();
  if (mode === 'batch-tables') {
    return [connectionId, dbName, '__batch_tables__'].join('::');
  }
  if (mode === 'batch-databases') {
    return [connectionId, '__batch_databases__'].join('::');
  }
  return buildTableExportHistoryKey(connectionId, dbName, input.tableName);
};

type BuildTableExportTabInput = {
  connectionId: string;
  dbName?: string;
  tableName: string;
  title?: string;
  objectType?: TabData['objectType'];
  schemaName?: string;
  sidebarLocateKey?: string;
  scopeOptions?: TableExportScopeOption[];
  initialScope?: TableExportScope;
  queryByScope?: Partial<Record<TableExportScope, string>>;
  rowCountByScope?: Partial<Record<TableExportScope, number>>;
};

type BuildBatchTableExportWorkbenchTabInput = {
  connectionId: string;
  dbName?: string;
  title?: string;
};

type BuildBatchDatabaseExportWorkbenchTabInput = {
  connectionId: string;
  title?: string;
};

const normalizeScopeOptions = (
  scopeOptions: TableExportScopeOption[] | undefined,
): TableExportScopeOption[] => {
  if (!Array.isArray(scopeOptions) || scopeOptions.length === 0) {
    return [{ ...DEFAULT_TABLE_EXPORT_SCOPE_OPTION }];
  }
  const seen = new Set<TableExportScope>();
  const normalized = scopeOptions
    .filter((item): item is TableExportScopeOption => !!item && typeof item.value === 'string')
    .map((item) => ({
      value: item.value,
      label: String(item.label || '').trim() || item.value,
      description: typeof item.description === 'string' ? item.description : undefined,
      disabled: item.disabled === true,
    }))
    .filter((item) => {
      if (seen.has(item.value)) return false;
      seen.add(item.value);
      return true;
    });
  return normalized.length > 0 ? normalized : [{ ...DEFAULT_TABLE_EXPORT_SCOPE_OPTION }];
};

const resolveInitialScope = (
  scopeOptions: TableExportScopeOption[],
  initialScope?: TableExportScope,
): TableExportScope => {
  if (initialScope && scopeOptions.some((item) => item.value === initialScope && !item.disabled)) {
    return initialScope;
  }
  return scopeOptions.find((item) => !item.disabled)?.value || 'all';
};

const normalizeQueryByScope = (
  queryByScope: BuildTableExportTabInput['queryByScope'],
): Partial<Record<TableExportScope, string>> | undefined => {
  if (!queryByScope || typeof queryByScope !== 'object') {
    return undefined;
  }
  const next: Partial<Record<TableExportScope, string>> = {};
  (['selected', 'page', 'all', 'filteredAll'] as TableExportScope[]).forEach((scope) => {
    const value = String(queryByScope[scope] || '').trim();
    if (value) {
      next[scope] = value;
    }
  });
  return Object.keys(next).length > 0 ? next : undefined;
};

const normalizeRowCountByScope = (
  rowCountByScope: BuildTableExportTabInput['rowCountByScope'],
): Partial<Record<TableExportScope, number>> | undefined => {
  if (!rowCountByScope || typeof rowCountByScope !== 'object') {
    return undefined;
  }
  const next: Partial<Record<TableExportScope, number>> = {};
  (['selected', 'page', 'all', 'filteredAll'] as TableExportScope[]).forEach((scope) => {
    const value = Number(rowCountByScope[scope]);
    if (Number.isFinite(value) && value >= 0) {
      next[scope] = Math.trunc(value);
    }
  });
  return Object.keys(next).length > 0 ? next : undefined;
};

export const buildTableExportTab = (input: BuildTableExportTabInput): TabData => {
  const connectionId = String(input.connectionId || '').trim();
  const dbName = String(input.dbName || '').trim();
  const tableName = String(input.tableName || '').trim();
  const scopeOptions = normalizeScopeOptions(input.scopeOptions);
  const initialScope = resolveInitialScope(scopeOptions, input.initialScope);
  const objectLabel = tableName || '未命名对象';
  return {
    id: `table-export-${connectionId}-${dbName}-${tableName}`,
    title: String(input.title || `导出 ${objectLabel}`).trim() || `导出 ${objectLabel}`,
    type: 'table-export',
    exportWorkbenchMode: 'single',
    connectionId,
    dbName,
    tableName,
    objectType: input.objectType,
    schemaName: input.schemaName,
    sidebarLocateKey: input.sidebarLocateKey,
    initialTab: 'config',
    tableExportScopeOptions: scopeOptions,
    tableExportInitialScope: initialScope,
    tableExportQueryByScope: normalizeQueryByScope(input.queryByScope),
    tableExportRowCountByScope: normalizeRowCountByScope(input.rowCountByScope),
  };
};

export const buildBatchTableExportWorkbenchTab = (
  input: BuildBatchTableExportWorkbenchTabInput,
): TabData => {
  const connectionId = String(input.connectionId || '').trim();
  const dbName = String(input.dbName || '').trim();
  const scopeSuffix = dbName || 'all';
  return {
    id: `table-export-batch-tables-${connectionId || 'none'}-${scopeSuffix}`,
    title: String(input.title || '批量导出对象').trim() || '批量导出对象',
    type: 'table-export',
    exportWorkbenchMode: 'batch-tables',
    connectionId,
    dbName: dbName || undefined,
    initialTab: 'config',
  };
};

export const buildBatchDatabaseExportWorkbenchTab = (
  input: BuildBatchDatabaseExportWorkbenchTabInput,
): TabData => {
  const connectionId = String(input.connectionId || '').trim();
  return {
    id: `table-export-batch-databases-${connectionId || 'none'}`,
    title: String(input.title || '批量导出库').trim() || '批量导出库',
    type: 'table-export',
    exportWorkbenchMode: 'batch-databases',
    connectionId,
    initialTab: 'config',
  };
};
