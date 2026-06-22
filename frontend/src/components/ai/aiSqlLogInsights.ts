import type { SqlLog } from '../../store';

type SqlLogInsightTranslate = (key: string) => string;
type SqlLogStatusFilter = 'all' | 'success' | 'error';
type SqlActivityKind = 'read' | 'write' | 'ddl' | 'transaction' | 'session' | 'other';
type SqlActivityKindFilter = 'all' | SqlActivityKind;
type SqlStatementType =
  | 'select'
  | 'insert'
  | 'update'
  | 'delete'
  | 'replace'
  | 'merge'
  | 'create'
  | 'alter'
  | 'drop'
  | 'truncate'
  | 'rename'
  | 'show'
  | 'describe'
  | 'explain'
  | 'use'
  | 'set'
  | 'begin'
  | 'commit'
  | 'rollback'
  | 'with'
  | 'other';

const MAX_SQL_LOG_LIMIT = 100;
const DEFAULT_SQL_LOG_LIMIT = 20;
const DEFAULT_SQL_ACTIVITY_LIMIT = 30;

const normalizeSqlLogLimit = (input: unknown, fallback = DEFAULT_SQL_LOG_LIMIT): number => {
  const value = Math.floor(Number(input) || fallback);
  if (value < 1) return 1;
  if (value > MAX_SQL_LOG_LIMIT) return MAX_SQL_LOG_LIMIT;
  return value;
};

const normalizeSqlLogStatus = (input: unknown): SqlLogStatusFilter => {
  const value = String(input || 'all').trim().toLowerCase();
  if (value === 'success' || value === 'error') {
    return value;
  }
  return 'all';
};

const normalizeSqlActivityKind = (input: unknown): SqlActivityKindFilter => {
  const value = String(input || 'all').trim().toLowerCase();
  if (
    value === 'read'
    || value === 'write'
    || value === 'ddl'
    || value === 'transaction'
    || value === 'session'
    || value === 'other'
  ) {
    return value;
  }
  return 'all';
};

const stripLeadingSqlComments = (input: string): string => {
  let text = String(input || '');
  while (true) {
    const trimmedStart = text.trimStart();
    if (!trimmedStart) {
      return '';
    }
    if (trimmedStart.startsWith('--') || trimmedStart.startsWith('#')) {
      const lineEnd = trimmedStart.indexOf('\n');
      text = lineEnd >= 0 ? trimmedStart.slice(lineEnd + 1) : '';
      continue;
    }
    if (trimmedStart.startsWith('/*')) {
      const blockEnd = trimmedStart.indexOf('*/');
      if (blockEnd < 0) {
        return '';
      }
      text = trimmedStart.slice(blockEnd + 2);
      continue;
    }
    return trimmedStart;
  }
};

const resolveWithStatementType = (normalizedSql: string): SqlStatementType => {
  const writePatterns: Array<{ keyword: SqlStatementType; regex: RegExp }> = [
    { keyword: 'insert', regex: /\binsert\s+into\b/u },
    { keyword: 'update', regex: /\bupdate\b/u },
    { keyword: 'delete', regex: /\bdelete\s+from\b/u },
    { keyword: 'replace', regex: /\breplace\s+into\b/u },
    { keyword: 'merge', regex: /\bmerge\s+into\b/u },
  ];
  const ddlPatterns: Array<{ keyword: SqlStatementType; regex: RegExp }> = [
    { keyword: 'create', regex: /\bcreate\s+(table|view|index|schema|database)\b/u },
    { keyword: 'alter', regex: /\balter\s+(table|view|index|schema|database)\b/u },
    { keyword: 'drop', regex: /\bdrop\s+(table|view|index|schema|database)\b/u },
    { keyword: 'truncate', regex: /\btruncate\s+table\b/u },
    { keyword: 'rename', regex: /\brename\s+(table|to)\b/u },
  ];

  const writeMatch = writePatterns.find((item) => item.regex.test(normalizedSql));
  if (writeMatch) {
    return writeMatch.keyword;
  }
  const ddlMatch = ddlPatterns.find((item) => item.regex.test(normalizedSql));
  if (ddlMatch) {
    return ddlMatch.keyword;
  }
  return /\bselect\b/u.test(normalizedSql) ? 'with' : 'other';
};

const classifySqlStatement = (sql: string): { statementType: SqlStatementType; activityKind: SqlActivityKind } => {
  const normalizedSql = stripLeadingSqlComments(sql).toLowerCase();
  if (!normalizedSql) {
    return { statementType: 'other', activityKind: 'other' };
  }

  const firstKeyword = normalizedSql.match(/^[a-z]+/u)?.[0] || 'other';
  const statementType: SqlStatementType = (() => {
    switch (firstKeyword) {
      case 'select':
      case 'insert':
      case 'update':
      case 'delete':
      case 'replace':
      case 'merge':
      case 'create':
      case 'alter':
      case 'drop':
      case 'truncate':
      case 'rename':
      case 'show':
      case 'use':
      case 'set':
      case 'begin':
      case 'commit':
      case 'rollback':
        return firstKeyword;
      case 'desc':
      case 'describe':
        return 'describe';
      case 'explain':
        return 'explain';
      case 'with':
        return resolveWithStatementType(normalizedSql);
      default:
        return 'other';
    }
  })();

  switch (statementType) {
    case 'select':
    case 'show':
    case 'describe':
    case 'explain':
    case 'with':
      return { statementType, activityKind: 'read' };
    case 'insert':
    case 'update':
    case 'delete':
    case 'replace':
    case 'merge':
      return { statementType, activityKind: 'write' };
    case 'create':
    case 'alter':
    case 'drop':
    case 'truncate':
    case 'rename':
      return { statementType, activityKind: 'ddl' };
    case 'begin':
    case 'commit':
    case 'rollback':
      return { statementType, activityKind: 'transaction' };
    case 'use':
    case 'set':
      return { statementType, activityKind: 'session' };
    default:
      return { statementType: 'other', activityKind: 'other' };
  }
};

const buildCountBreakdown = (items: string[]): Record<string, number> =>
  Object.fromEntries(
    Array.from(
      items.reduce((map, item) => {
        const key = String(item || 'unknown').trim() || 'unknown';
        map.set(key, (map.get(key) || 0) + 1);
        return map;
      }, new Map<string, number>()).entries(),
    ).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])),
  );

const buildLogPreview = (log: SqlLog) => {
  const classification = classifySqlStatement(log.sql);
  return {
    id: log.id,
    timestamp: log.timestamp,
    status: log.status,
    duration: log.duration,
    dbName: log.dbName || '',
    affectedRows: typeof log.affectedRows === 'number' ? log.affectedRows : null,
    statementType: classification.statementType,
    activityKind: classification.activityKind,
    sql: log.sql,
    message: log.message || '',
  };
};

export const buildRecentSqlLogsSnapshot = (params: {
  sqlLogs?: SqlLog[];
  limit?: unknown;
  status?: unknown;
}) => {
  const { sqlLogs = [], limit, status } = params;
  const safeStatus = normalizeSqlLogStatus(status);
  const safeLimit = normalizeSqlLogLimit(limit);
  const filteredLogs = sqlLogs.filter((log) => safeStatus === 'all' || log.status === safeStatus);

  return {
    status: safeStatus,
    limit: safeLimit,
    totalMatched: filteredLogs.length,
    successCount: filteredLogs.filter((log) => log.status === 'success').length,
    errorCount: filteredLogs.filter((log) => log.status === 'error').length,
    logs: filteredLogs.slice(0, safeLimit).map(buildLogPreview),
  };
};

export const buildRecentSqlActivitySnapshot = (params: {
  sqlLogs?: SqlLog[];
  limit?: unknown;
  status?: unknown;
  keyword?: unknown;
  dbName?: unknown;
  activityKind?: unknown;
  translate?: SqlLogInsightTranslate;
}) => {
  const { sqlLogs = [], limit, status, keyword, dbName, activityKind, translate } = params;
  const unspecifiedDatabaseLabel = translate
    ? translate('ai_chat.inspection.sql_log.unspecified_database')
    : '(Unspecified database)';
  const safeLimit = normalizeSqlLogLimit(limit, DEFAULT_SQL_ACTIVITY_LIMIT);
  const safeStatus = normalizeSqlLogStatus(status);
  const safeKeyword = String(keyword || '').trim().toLowerCase();
  const safeDbName = String(dbName || '').trim().toLowerCase();
  const safeActivityKind = normalizeSqlActivityKind(activityKind);

  const enrichedLogs = sqlLogs.map(buildLogPreview);
  const filteredLogs = enrichedLogs.filter((log) => {
    if (safeStatus !== 'all' && log.status !== safeStatus) {
      return false;
    }
    if (safeActivityKind !== 'all' && log.activityKind !== safeActivityKind) {
      return false;
    }
    if (safeDbName && !String(log.dbName || '').toLowerCase().includes(safeDbName)) {
      return false;
    }
    if (safeKeyword) {
      const haystack = [
        log.dbName,
        log.statementType,
        log.activityKind,
        log.sql,
        log.message,
      ].join('\n').toLowerCase();
      if (!haystack.includes(safeKeyword)) {
        return false;
      }
    }
    return true;
  });

  const statementTypeBreakdown = buildCountBreakdown(filteredLogs.map((log) => log.statementType));
  const dbBreakdown = buildCountBreakdown(filteredLogs.map((log) => log.dbName || unspecifiedDatabaseLabel));
  const errorMessageBreakdown = buildCountBreakdown(
    filteredLogs
      .filter((log) => log.status === 'error' && String(log.message || '').trim())
      .map((log) => String(log.message || '').trim()),
  );

  const recentExamples = filteredLogs.slice(0, safeLimit);
  const recentMutations = filteredLogs
    .filter((log) => log.activityKind === 'write' || log.activityKind === 'ddl')
    .slice(0, 5);
  const recentErrors = filteredLogs
    .filter((log) => log.status === 'error')
    .slice(0, 5);
  const slowestStatements = [...filteredLogs]
    .sort((left, right) => right.duration - left.duration || right.timestamp - left.timestamp)
    .slice(0, 5);

  return {
    status: safeStatus,
    activityKind: safeActivityKind,
    keyword: safeKeyword,
    dbName: safeDbName,
    limit: safeLimit,
    totalMatched: filteredLogs.length,
    successCount: filteredLogs.filter((log) => log.status === 'success').length,
    errorCount: filteredLogs.filter((log) => log.status === 'error').length,
    readCount: filteredLogs.filter((log) => log.activityKind === 'read').length,
    writeCount: filteredLogs.filter((log) => log.activityKind === 'write').length,
    ddlCount: filteredLogs.filter((log) => log.activityKind === 'ddl').length,
    transactionCount: filteredLogs.filter((log) => log.activityKind === 'transaction').length,
    sessionCount: filteredLogs.filter((log) => log.activityKind === 'session').length,
    otherCount: filteredLogs.filter((log) => log.activityKind === 'other').length,
    statementTypeBreakdown,
    dbBreakdown,
    topErrorMessages: Object.entries(errorMessageBreakdown)
      .slice(0, 5)
      .map(([message, count]) => ({ message, count })),
    recentMutations,
    recentErrors,
    slowestStatements,
    recentExamples,
  };
};
