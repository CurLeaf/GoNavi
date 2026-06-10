import { normalizeOceanBaseProtocol } from './oceanBaseProtocol';
import { splitQualifiedNameLast } from './qualifiedName';
import { resolveSqlDialect } from './sqlDialect';

const normalizeSidebarConnectionDialect = (type: string, driver: string, oceanBaseProtocol?: string): string => {
  const normalizedType = String(type || '').trim().toLowerCase();
  if (normalizedType === 'custom') {
    const normalizedDriver = String(driver || '').trim().toLowerCase();
    if (normalizedDriver === 'postgresql' || normalizedDriver === 'postgres' || normalizedDriver === 'pg') return 'postgres';
    if (normalizedDriver === 'opengauss' || normalizedDriver === 'open_gauss' || normalizedDriver === 'open-gauss') return 'opengauss';
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

export const isSidebarViewTableType = (tableType: unknown): boolean => {
  const normalizedType = String(tableType ?? '').trim().toUpperCase();
  if (!normalizedType) return true;
  return normalizedType.includes('VIEW') && !normalizedType.includes('MATERIALIZED');
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
