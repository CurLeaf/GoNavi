export type QueryResultTableRef = {
  tableName: string;
  metadataDbName: string;
  metadataTableName: string;
};

const stripIdentifierQuotes = (part: string): string => {
  const text = String(part || '').trim();
  if (!text) return '';
  if ((text.startsWith('`') && text.endsWith('`')) || (text.startsWith('"') && text.endsWith('"'))) {
    return text.slice(1, -1).trim();
  }
  if (text.startsWith('[') && text.endsWith(']')) {
    return text.slice(1, -1).trim();
  }
  return text;
};

const isOracleLikeDialect = (dialect: string): boolean => {
  const normalized = String(dialect || '').trim().toLowerCase();
  return normalized === 'oracle' || normalized === 'dameng' || normalized === 'dm' || normalized === 'dm8';
};

const keepsQualifiedTableNameForMetadata = (dialect: string): boolean => {
  const normalized = String(dialect || '').trim().toLowerCase();
  return normalized === 'duckdb';
};

const isQuotedIdentifier = (part: string): boolean => {
  const text = String(part || '').trim();
  if (!text) return false;
  return (text.startsWith('`') && text.endsWith('`'))
    || (text.startsWith('"') && text.endsWith('"'))
    || (text.startsWith('[') && text.endsWith(']'));
};

const normalizeIdentifierPart = (part: string, dialect: string): string => {
  const text = String(part || '').trim();
  const value = stripIdentifierQuotes(text);
  if (!value) return '';
  if (isOracleLikeDialect(dialect) && !isQuotedIdentifier(text)) {
    return value.toUpperCase();
  }
  return value;
};

const normalizeCurrentDbName = (currentDb: string, dialect: string): string => {
  const value = String(currentDb || '').trim();
  if (!value) return '';
  return isOracleLikeDialect(dialect) ? value.toUpperCase() : value;
};

const normalizeQualifiedNameParts = (raw: string, dialect: string): string[] => (
  String(raw || '')
    .split('.')
    .map((part) => normalizeIdentifierPart(part, dialect))
    .filter(Boolean)
);

export const extractQueryResultTableRef = (
  sql: string,
  dialect: string,
  currentDb: string,
  defaultSchema = '',
): QueryResultTableRef | undefined => {
  const text = String(sql || '').trim();
  if (!text) return undefined;
  if (/\b(JOIN|UNION|INTERSECT|EXCEPT|MINUS)\b/i.test(text)) return undefined;
  if (/^\s*SELECT\s+DISTINCT\b/i.test(text)) return undefined;
  if (/\bGROUP\s+BY\b|\bHAVING\b/i.test(text)) return undefined;

  const tableMatch = text.match(/^\s*SELECT\s+.+?\s+FROM\s+((?:[`"\[]?\w+[`"\]]?)(?:\s*\.\s*(?:[`"\[]?\w+[`"\]]?)){0,2})\s*(?:$|[\s;])/im);
  if (!tableMatch) return undefined;

  const parts = normalizeQualifiedNameParts(tableMatch[1], dialect);
  if (parts.length === 0) return undefined;
  const metadataTableName = parts[parts.length - 1] || '';
  if (!metadataTableName) return undefined;

  const owner = parts.length >= 2 ? parts[parts.length - 2] : '';
  const defaultOracleSchema = isOracleLikeDialect(dialect)
    ? normalizeCurrentDbName(defaultSchema, dialect)
    : '';
  const fallbackSchema = isOracleLikeDialect(dialect)
    ? defaultOracleSchema || normalizeCurrentDbName(currentDb, dialect)
    : normalizeCurrentDbName(currentDb, dialect);
  const metadataDbName = owner || fallbackSchema;
  const tableName = isOracleLikeDialect(dialect) && owner
    ? `${owner}.${metadataTableName}`
    : (keepsQualifiedTableNameForMetadata(dialect) && owner ? `${owner}.${metadataTableName}` : metadataTableName);
  const resolvedMetadataTableName = keepsQualifiedTableNameForMetadata(dialect) && owner
    ? `${owner}.${metadataTableName}`
    : metadataTableName;

  return {
    tableName,
    metadataDbName,
    metadataTableName: resolvedMetadataTableName,
  };
};
