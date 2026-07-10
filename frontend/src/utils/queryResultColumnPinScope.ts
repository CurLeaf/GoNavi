export type QueryResultColumnPinScopeInput = {
  sql: string;
  sourceStatementIndex?: number;
  statementResultIndex?: number;
};

const normalizeResultIndex = (value: number | undefined): number => {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const hashQueryResultIdentity = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

export const buildQueryResultColumnPinScope = ({
  sql,
  sourceStatementIndex,
  statementResultIndex,
}: QueryResultColumnPinScopeInput): string => {
  const identity = [
    normalizeResultIndex(sourceStatementIndex),
    normalizeResultIndex(statementResultIndex),
    String(sql || ''),
  ].join('\u0000');
  return `query-result:${hashQueryResultIdentity(identity)}`;
};
