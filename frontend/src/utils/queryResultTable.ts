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

const normalizeQualifiedName = (raw: string): string => (
  String(raw || '')
    .split('.')
    .map((part) => stripIdentifierQuotes(part.trim()))
    .filter(Boolean)
    .join('.')
);

const isOracleLikeDialect = (dialect: string): boolean => {
  const normalized = String(dialect || '').trim().toLowerCase();
  return normalized === 'oracle' || normalized === 'dameng' || normalized === 'dm' || normalized === 'dm8';
};

export const extractQueryResultTableRef = (
  sql: string,
  dialect: string,
  currentDb: string,
): QueryResultTableRef | undefined => {
  const text = String(sql || '').trim();
  if (!text) return undefined;
  if (/\b(JOIN|UNION|INTERSECT|EXCEPT|MINUS)\b/i.test(text)) return undefined;
  if (/^\s*SELECT\s+DISTINCT\b/i.test(text)) return undefined;
  if (/\bGROUP\s+BY\b|\bHAVING\b/i.test(text)) return undefined;

  const tableMatch = text.match(/^\s*SELECT\s+.+?\s+FROM\s+((?:[`"\[]?\w+[`"\]]?)(?:\s*\.\s*(?:[`"\[]?\w+[`"\]]?)){0,2})\s*(?:$|[\s;])/im);
  if (!tableMatch) return undefined;

  const qualifiedName = normalizeQualifiedName(tableMatch[1]);
  if (!qualifiedName) return undefined;

  const parts = qualifiedName.split('.').filter(Boolean);
  const metadataTableName = parts[parts.length - 1] || '';
  if (!metadataTableName) return undefined;

  const owner = parts.length >= 2 ? parts[parts.length - 2] : '';
  const metadataDbName = owner || currentDb || '';
  const tableName = isOracleLikeDialect(dialect) && owner
    ? `${owner}.${metadataTableName}`
    : metadataTableName;

  return {
    tableName,
    metadataDbName,
    metadataTableName,
  };
};
