import { normalizeOceanBaseProtocol } from './oceanBaseProtocol';
import { splitQualifiedNameLast } from './qualifiedName';
import { resolveSqlDialect } from './sqlDialect';

const escapeSQLLiteral = (raw: string): string => String(raw || '').replace(/'/g, "''");
const escapeBacktickIdentifier = (raw: string): string => String(raw || '').replace(/`/g, '``');

const normalizeSidebarConnectionDialect = (type: string, driver: string, oceanBaseProtocol?: string): string => {
  const normalizedType = String(type || '').trim().toLowerCase();
  if (normalizedType === 'custom') {
    const normalizedDriver = String(driver || '').trim().toLowerCase();
    if (normalizedDriver === 'postgresql' || normalizedDriver === 'postgres' || normalizedDriver === 'pg') return 'postgres';
    if (normalizedDriver === 'opengauss' || normalizedDriver === 'open_gauss' || normalizedDriver === 'open-gauss') return 'opengauss';
    if (normalizedDriver === 'gaussdb' || normalizedDriver === 'gauss_db' || normalizedDriver === 'gauss-db') return 'gaussdb';
    if (normalizedDriver === 'dameng' || normalizedDriver === 'dm' || normalizedDriver === 'dm8') return 'dm';
    if (normalizedDriver === 'oceanbase') {
      return normalizeOceanBaseProtocol(oceanBaseProtocol) === 'oracle' ? 'oracle' : 'mysql';
    }
    if (normalizedDriver.includes('oracle')) return 'oracle';
    return normalizedDriver;
  }
  if (normalizedType === 'oceanbase') {
    return normalizeOceanBaseProtocol(oceanBaseProtocol) === 'oracle' ? 'oracle' : 'mysql';
  }
  if (normalizedType === 'open_gauss' || normalizedType === 'open-gauss') return 'opengauss';
  if (normalizedType === 'gauss_db' || normalizedType === 'gauss-db') return 'gaussdb';
  if (normalizedType === 'dameng') return 'dm';
  return normalizedType;
};

export const resolveSidebarMetadataDialect = (type: string, driver = '', oceanBaseProtocol?: unknown): string => {
  const dialect = String(resolveSqlDialect(type, driver, { oceanBaseProtocol })).trim().toLowerCase();
  if (dialect === 'diros' || dialect === 'sphinx' || dialect === 'mariadb' || dialect === 'oceanbase') {
    return 'mysql';
  }
  if (dialect === 'dameng') return 'dm';
  return dialect;
};

export const normalizeSidebarViewName = (dialect: string, dbName: string, schemaName: string, viewName: string): string => {
  const normalizedDialect = String(dialect || '').trim().toLowerCase();
  const normalizedDbName = String(dbName || '').trim();
  const normalizedSchemaName = String(schemaName || '').trim();
  const normalizedViewName = String(viewName || '').trim();

  if (!normalizedViewName) {
    return '';
  }

  if (normalizedDialect === 'mysql') {
    const parsed = splitQualifiedNameLast(normalizedViewName);
    if (parsed.objectName) {
      return parsed.objectName;
    }
    return normalizedViewName;
  }

  if (!normalizedSchemaName || normalizedViewName.includes('.')) {
    return normalizedViewName;
  }

  return `${normalizedSchemaName}.${normalizedViewName}`;
};

export interface SidebarViewMetadataEntry {
  viewName: string;
  schemaName: string;
}

export const normalizeSidebarViewMetadataEntry = (
  dialect: string,
  dbName: string,
  schemaName: string,
  viewName: string,
): SidebarViewMetadataEntry | null => {
  const normalizedViewName = normalizeSidebarViewName(dialect, dbName, schemaName, viewName);
  if (!normalizedViewName) return null;

  const parsedViewName = splitQualifiedNameLast(viewName);
  const parsedNormalizedViewName = splitQualifiedNameLast(normalizedViewName);
  return {
    viewName: normalizedViewName,
    schemaName: String(schemaName || parsedNormalizedViewName.parentPath || parsedViewName.parentPath || '').trim(),
  };
};

export const isSidebarViewTableType = (tableType: unknown): boolean => {
  const normalizedType = String(tableType ?? '').trim().toUpperCase();
  if (!normalizedType) return true;
  return normalizedType.includes('VIEW') && !normalizedType.includes('MATERIALIZED');
};

export const buildMySQLCompatibleViewMetadataSqls = (dbName: string): string[] => {
  const safeDbName = escapeSQLLiteral(dbName);
  const dbIdent = escapeBacktickIdentifier(dbName).trim();
  return [
    safeDbName
      ? `SELECT TABLE_NAME AS view_name, TABLE_SCHEMA AS schema_name FROM information_schema.views WHERE table_schema = '${safeDbName}' ORDER BY TABLE_NAME`
      : '',
    safeDbName
      ? `SELECT TABLE_NAME AS view_name, TABLE_SCHEMA AS schema_name, TABLE_TYPE AS table_type FROM information_schema.tables WHERE table_schema = '${safeDbName}' AND UPPER(TABLE_TYPE) LIKE '%VIEW%' ORDER BY TABLE_NAME`
      : '',
    dbIdent ? `SHOW FULL TABLES FROM \`${dbIdent}\` WHERE Table_type = 'VIEW'` : '',
    dbIdent ? `SHOW FULL TABLES FROM \`${dbIdent}\`` : '',
    `SHOW FULL TABLES WHERE Table_type = 'VIEW'`,
    `SHOW FULL TABLES`,
  ].filter(Boolean);
};

export const resolveSidebarRuntimeDatabase = (
  type: string,
  driver: string,
  savedDatabase: string,
  overrideDatabase?: string,
  clearDatabase: boolean = false,
  oceanBaseProtocol?: string,
): string => {
  if (clearDatabase) return '';

  const normalizedSavedDatabase = String(savedDatabase || '').trim();
  const normalizedOverrideDatabase = String(overrideDatabase || '').trim();
  if (!normalizedOverrideDatabase) {
    return normalizedSavedDatabase;
  }

  const dialect = normalizeSidebarConnectionDialect(type, driver, oceanBaseProtocol);
  if (dialect === 'oracle' || dialect === 'dm') {
    return normalizedSavedDatabase || normalizedOverrideDatabase;
  }

  return normalizedOverrideDatabase;
};
