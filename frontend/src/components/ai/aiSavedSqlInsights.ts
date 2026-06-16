import type { SavedConnection, SavedQuery, SqlSnippet } from '../../types';

const SAVED_QUERY_SQL_PREVIEW_LIMIT = 4000;
const SQL_SNIPPET_BODY_PREVIEW_LIMIT = 2000;

const normalizeLimit = (input: unknown, fallback: number, max: number): number => {
  const value = Math.floor(Number(input) || fallback);
  if (value < 1) return 1;
  if (value > max) return max;
  return value;
};

const normalizeKeyword = (input: unknown): string => String(input || '').trim().toLowerCase();

const matchesKeyword = (keyword: string, fields: Array<string | undefined>): boolean => {
  if (!keyword) {
    return true;
  }
  return fields.some((field) => String(field || '').toLowerCase().includes(keyword));
};

export const buildSavedQueriesSnapshot = (params: {
  savedQueries?: SavedQuery[];
  connections: SavedConnection[];
  keyword?: unknown;
  connectionId?: unknown;
  dbName?: unknown;
  limit?: unknown;
  includeSql?: unknown;
}) => {
  const {
    savedQueries = [],
    connections,
    keyword,
    connectionId,
    dbName,
    limit,
    includeSql = true,
  } = params;
  const safeKeyword = normalizeKeyword(keyword);
  const safeConnectionId = String(connectionId || '').trim();
  const safeDbName = String(dbName || '').trim();
  const safeLimit = normalizeLimit(limit, 12, 50);
  const shouldIncludeSql = includeSql !== false;

  const filteredQueries = [...savedQueries]
    .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0))
    .filter((query) => {
      if (safeConnectionId && query.connectionId !== safeConnectionId) {
        return false;
      }
      if (safeDbName && query.dbName !== safeDbName) {
        return false;
      }
      const connection = connections.find((item) => item.id === query.connectionId);
      return matchesKeyword(safeKeyword, [
        query.name,
        query.sql,
        query.dbName,
        connection?.name,
        connection?.config?.type,
      ]);
    });

  const visibleQueries = filteredQueries.slice(0, safeLimit).map((query) => {
    const connection = connections.find((item) => item.id === query.connectionId);
    const sqlText = String(query.sql || '').trim();
    const sqlPreview = shouldIncludeSql ? sqlText.slice(0, SAVED_QUERY_SQL_PREVIEW_LIMIT) : '';

    return {
      id: query.id,
      name: query.name,
      connectionId: query.connectionId,
      connectionName: connection?.name || '',
      connectionType: connection?.config?.type || '',
      dbName: query.dbName || '',
      createdAt: Number(query.createdAt || 0),
      sqlCharCount: sqlText.length,
      sqlTruncated: shouldIncludeSql && sqlText.length > sqlPreview.length,
      sqlPreview,
    };
  });

  return {
    keyword: safeKeyword,
    connectionId: safeConnectionId,
    dbName: safeDbName,
    includeSql: shouldIncludeSql,
    limit: safeLimit,
    totalMatched: filteredQueries.length,
    returnedQueries: visibleQueries.length,
    truncated: filteredQueries.length > visibleQueries.length,
    queries: visibleQueries,
  };
};

export const buildSqlSnippetsSnapshot = (params: {
  sqlSnippets?: SqlSnippet[];
  keyword?: unknown;
  limit?: unknown;
  includeBody?: unknown;
}) => {
  const {
    sqlSnippets = [],
    keyword,
    limit,
    includeBody = true,
  } = params;
  const safeKeyword = normalizeKeyword(keyword);
  const safeLimit = normalizeLimit(limit, 20, 80);
  const shouldIncludeBody = includeBody !== false;

  const filteredSnippets = [...sqlSnippets]
    .sort((left, right) => left.prefix.localeCompare(right.prefix))
    .filter((snippet) =>
      matchesKeyword(safeKeyword, [
        snippet.prefix,
        snippet.name,
        snippet.description,
        snippet.body,
      ]));

  const visibleSnippets = filteredSnippets.slice(0, safeLimit).map((snippet) => {
    const bodyText = String(snippet.body || '').trim();
    const bodyPreview = shouldIncludeBody ? bodyText.slice(0, SQL_SNIPPET_BODY_PREVIEW_LIMIT) : '';

    return {
      id: snippet.id,
      prefix: snippet.prefix,
      name: snippet.name,
      description: snippet.description || '',
      isBuiltin: snippet.isBuiltin === true,
      createdAt: Number(snippet.createdAt || 0),
      bodyCharCount: bodyText.length,
      bodyTruncated: shouldIncludeBody && bodyText.length > bodyPreview.length,
      bodyPreview,
    };
  });

  return {
    keyword: safeKeyword,
    includeBody: shouldIncludeBody,
    limit: safeLimit,
    totalMatched: filteredSnippets.length,
    returnedSnippets: visibleSnippets.length,
    truncated: filteredSnippets.length > visibleSnippets.length,
    builtinCount: visibleSnippets.filter((snippet) => snippet.isBuiltin).length,
    customCount: visibleSnippets.filter((snippet) => !snippet.isBuiltin).length,
    snippets: visibleSnippets,
  };
};
