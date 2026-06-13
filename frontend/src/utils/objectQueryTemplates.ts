import { quoteQualifiedIdent } from './sql';

export const buildTableSelectQuery = (dbType: string, tableName: string): string => {
  const normalizedTableName = String(tableName || '').trim();
  if (!normalizedTableName) {
    return 'SELECT * FROM ';
  }
  if (String(dbType || '').trim().toLowerCase() === 'kafka') {
    return `SELECT * FROM ${quoteQualifiedIdent(dbType, normalizedTableName)} LIMIT 100;`;
  }
  return `SELECT * FROM ${quoteQualifiedIdent(dbType, normalizedTableName)};`;
};
