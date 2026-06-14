import { quoteQualifiedIdent } from './sql';

export const buildTableSelectQuery = (dbType: string, tableName: string): string => {
  const normalizedTableName = String(tableName || '').trim();
  if (!normalizedTableName) {
    return 'SELECT * FROM ';
  }
  if (['kafka', 'rabbitmq'].includes(String(dbType || '').trim().toLowerCase())) {
    return `SELECT * FROM ${quoteQualifiedIdent(dbType, normalizedTableName)} LIMIT 100;`;
  }
  return `SELECT * FROM ${quoteQualifiedIdent(dbType, normalizedTableName)};`;
};
