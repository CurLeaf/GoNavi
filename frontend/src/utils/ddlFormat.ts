import { format, type SqlLanguage } from 'sql-formatter';

const resolveDdlFormatterLanguage = (dbType: string): SqlLanguage => {
  const normalized = String(dbType || '').trim().toLowerCase();
  switch (normalized) {
    case 'duckdb':
      return 'duckdb';
    case 'sqlite':
      return 'sqlite';
    case 'postgres':
    case 'postgresql':
    case 'kingbase':
    case 'highgo':
    case 'opengauss':
    case 'gaussdb':
    case 'vastbase':
      return 'postgresql';
    case 'mariadb':
      return 'mariadb';
    case 'mysql':
    case 'sphinx':
      return 'mysql';
    case 'sqlserver':
      return 'transactsql';
    case 'oracle':
    case 'dameng':
    case 'oceanbase':
      return 'plsql';
    case 'clickhouse':
      return 'clickhouse';
    default:
      return 'sql';
  }
};

export const formatDdlForDisplay = (ddlText: unknown, dbType: string): string => {
  const raw = String(ddlText ?? '').trim();
  if (!raw) {
    return '';
  }
  const language = resolveDdlFormatterLanguage(dbType);
  try {
    return format(raw, {
      language,
      keywordCase: 'upper',
      linesBetweenQueries: 1,
    });
  } catch {
    return raw;
  }
};
