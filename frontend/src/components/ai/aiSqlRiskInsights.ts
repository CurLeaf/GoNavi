import type { SavedConnection, TabData } from '../../types';
import { findSqlStatementRanges } from '../../utils/sqlStatementSelection';

type SqlRiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
type SqlActivityKind = 'read' | 'write' | 'ddl' | 'transaction' | 'session' | 'routine' | 'other';

interface SqlSafetyCheckResult {
  allowed?: boolean;
  operationType?: string;
}

const SQL_PREVIEW_LIMIT = 12000;

const READ_TOKENS = new Set(['select', 'show', 'describe', 'desc', 'explain', 'with']);
const WRITE_TOKENS = new Set(['insert', 'update', 'delete', 'merge', 'replace', 'upsert']);
const DDL_TOKENS = new Set(['create', 'alter', 'drop', 'truncate', 'rename']);
const TRANSACTION_TOKENS = new Set(['begin', 'start', 'commit', 'rollback', 'savepoint', 'release']);
const SESSION_TOKENS = new Set(['set', 'use', 'reset']);
const ROUTINE_TOKENS = new Set(['call', 'exec', 'execute']);

const stripCommentsAndLiterals = (sql: string): string => {
  const text = String(sql || '');
  let result = '';
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    const next = index + 1 < text.length ? text[index + 1] : '';

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        result += '\n';
      } else {
        result += ' ';
      }
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        index += 1;
        inBlockComment = false;
      }
      result += ' ';
      continue;
    }
    if (!inSingle && !inDouble && !inBacktick && ch === '-' && next === '-') {
      inLineComment = true;
      result += '  ';
      index += 1;
      continue;
    }
    if (!inSingle && !inDouble && !inBacktick && ch === '/' && next === '*') {
      inBlockComment = true;
      result += '  ';
      index += 1;
      continue;
    }
    if (!inDouble && !inBacktick && ch === "'") {
      inSingle = !inSingle;
      result += ' ';
      continue;
    }
    if (!inSingle && !inBacktick && ch === '"') {
      inDouble = !inDouble;
      result += ' ';
      continue;
    }
    if (!inSingle && !inDouble && ch === '`') {
      inBacktick = !inBacktick;
      result += ' ';
      continue;
    }
    result += (inSingle || inDouble || inBacktick) ? ' ' : ch;
  }

  return result;
};

const resolveFirstToken = (sql: string): string => {
  const stripped = stripCommentsAndLiterals(sql).trim();
  const match = stripped.match(/^[A-Za-z_][A-Za-z0-9_$#]*/);
  return match?.[0]?.toLowerCase() || '';
};

const classifySqlActivity = (token: string): SqlActivityKind => {
  if (READ_TOKENS.has(token)) return 'read';
  if (WRITE_TOKENS.has(token)) return 'write';
  if (DDL_TOKENS.has(token)) return 'ddl';
  if (TRANSACTION_TOKENS.has(token)) return 'transaction';
  if (SESSION_TOKENS.has(token)) return 'session';
  if (ROUTINE_TOKENS.has(token)) return 'routine';
  return 'other';
};

const escalateRisk = (current: SqlRiskLevel, next: SqlRiskLevel): SqlRiskLevel => {
  const order: SqlRiskLevel[] = ['none', 'low', 'medium', 'high', 'critical'];
  return order.indexOf(next) > order.indexOf(current) ? next : current;
};

const hasWhereClause = (statement: string): boolean =>
  /\bwhere\b/i.test(stripCommentsAndLiterals(statement));

const normalizeLimit = (limit: unknown): number => {
  const value = Math.floor(Number(limit) || SQL_PREVIEW_LIMIT);
  if (value < 200) return 200;
  if (value > 40000) return 40000;
  return value;
};

const buildStatementRisk = (statement: string) => {
  const token = resolveFirstToken(statement);
  const activityKind = classifySqlActivity(token);
  const normalized = stripCommentsAndLiterals(statement);
  const warnings: string[] = [];
  let riskLevel: SqlRiskLevel = 'low';

  if (!token) {
    riskLevel = 'none';
    warnings.push('未识别到有效 SQL 操作关键字');
  }
  if (activityKind === 'write') {
    riskLevel = escalateRisk(riskLevel, 'high');
    warnings.push('该语句会修改数据，执行前应确认目标库、条件和影响范围');
  }
  if (activityKind === 'ddl') {
    riskLevel = escalateRisk(riskLevel, 'high');
    warnings.push('该语句会修改数据库结构或对象，建议先备份并确认回滚方案');
  }
  if (activityKind === 'routine') {
    riskLevel = escalateRisk(riskLevel, 'medium');
    warnings.push('该语句会调用例程或过程，可能存在隐式写入或副作用');
  }
  if (/^\s*delete\b/i.test(normalized) && !hasWhereClause(statement)) {
    riskLevel = escalateRisk(riskLevel, 'critical');
    warnings.push('DELETE 缺少 WHERE 条件，可能删除整表数据');
  }
  if (/^\s*update\b/i.test(normalized) && !hasWhereClause(statement)) {
    riskLevel = escalateRisk(riskLevel, 'critical');
    warnings.push('UPDATE 缺少 WHERE 条件，可能更新整表数据');
  }
  if (/\btruncate\s+(?:table\s+)?[A-Za-z0-9_`"[\].]+/i.test(normalized)) {
    riskLevel = escalateRisk(riskLevel, 'critical');
    warnings.push('TRUNCATE 会快速清空表数据，通常不可按行回滚');
  }
  if (/\bdrop\s+(database|schema|table|view|materialized\s+view)\b/i.test(normalized)) {
    riskLevel = escalateRisk(riskLevel, 'critical');
    warnings.push('DROP 会删除数据库对象，执行前必须确认对象和备份');
  }
  if (/\bgrant\b|\brevoke\b/i.test(normalized)) {
    riskLevel = escalateRisk(riskLevel, 'high');
    warnings.push('GRANT / REVOKE 会改变权限边界，应确认授权对象和范围');
  }

  return {
    token,
    activityKind,
    riskLevel,
    warnings,
    preview: statement.trim().slice(0, 1000),
    charCount: statement.trim().length,
  };
};

const resolveActiveSqlSource = (params: {
  sql?: string;
  tabs?: TabData[];
  activeTabId?: string | null;
}) => {
  const explicitSql = String(params.sql || '').trim();
  if (explicitSql) {
    return {
      source: 'argument' as const,
      sql: explicitSql,
      activeTab: null as TabData | null,
    };
  }

  const activeTab = (params.tabs || []).find((tab) => tab.id === params.activeTabId) || null;
  const tabSql = activeTab?.type === 'query' ? String(activeTab.query || '').trim() : '';
  return {
    source: activeTab ? 'active_tab' as const : 'none' as const,
    sql: tabSql,
    activeTab,
  };
};

export const buildSqlRiskSnapshot = (params: {
  sql?: string;
  previewCharLimit?: unknown;
  tabs?: TabData[];
  activeTabId?: string | null;
  connections: SavedConnection[];
  safetyCheck?: SqlSafetyCheckResult;
}) => {
  const { source, sql, activeTab } = resolveActiveSqlSource({
    sql: params.sql,
    tabs: params.tabs,
    activeTabId: params.activeTabId,
  });
  const previewLimit = normalizeLimit(params.previewCharLimit);
  const connection = activeTab
    ? params.connections.find((item) => item.id === activeTab.connectionId)
    : undefined;

  if (!sql) {
    return {
      hasSql: false,
      source,
      message: activeTab
        ? '当前活动页签不是 SQL 查询页签，或编辑区没有 SQL 内容'
        : '未传入 SQL，且当前没有可读取的活动 SQL 查询页签',
      activeTab: activeTab ? {
        id: activeTab.id,
        title: activeTab.title,
        type: activeTab.type,
      } : null,
      safetyCheck: params.safetyCheck || null,
      riskLevel: 'none' as SqlRiskLevel,
      warnings: [],
      nextActions: ['先传入 sql 参数，或切换到包含 SQL 草稿的查询页签'],
    };
  }

  const statements = findSqlStatementRanges(sql).map((range) => range.text.trim()).filter(Boolean);
  const statementRisks = statements.map(buildStatementRisk);
  let riskLevel: SqlRiskLevel = statements.length > 0 ? 'low' : 'none';
  const warnings: string[] = [];

  if (statements.length > 1) {
    riskLevel = escalateRisk(riskLevel, 'medium');
    warnings.push(`检测到 ${statements.length} 条 SQL 语句，批量执行前应逐条确认影响范围`);
  }

  for (const statementRisk of statementRisks) {
    riskLevel = escalateRisk(riskLevel, statementRisk.riskLevel);
    for (const warning of statementRisk.warnings) {
      if (!warnings.includes(warning)) warnings.push(warning);
    }
  }

  if (params.safetyCheck?.allowed === false) {
    riskLevel = escalateRisk(riskLevel, 'high');
    warnings.push(`当前 AI 安全策略不允许执行 ${params.safetyCheck.operationType || '该'} 类型 SQL`);
  }

  const activityKinds = Array.from(new Set(statementRisks.map((item) => item.activityKind)));
  const requiresUserConfirmation = activityKinds.some((kind) => kind === 'write' || kind === 'ddl' || kind === 'routine')
    || riskLevel === 'critical';

  return {
    hasSql: true,
    source,
    sqlPreview: sql.slice(0, previewLimit),
    sqlCharCount: sql.length,
    sqlTruncated: sql.length > previewLimit,
    statementCount: statements.length,
    activityKinds,
    riskLevel,
    requiresUserConfirmation,
    safetyCheck: params.safetyCheck || null,
    activeTab: activeTab ? {
      id: activeTab.id,
      title: activeTab.title,
      type: activeTab.type,
      connectionId: activeTab.connectionId,
      connectionName: connection?.name || '',
      connectionType: connection?.config?.type || '',
      dbName: activeTab.dbName || '',
      filePath: activeTab.filePath || '',
      readOnly: activeTab.readOnly === true,
    } : null,
    statements: statementRisks,
    warnings,
    nextActions: warnings.length > 0
      ? ['先向用户说明风险点，再要求用户确认是否继续', '写入或 DDL 语句应先确认 WHERE、备份、目标库和影响范围']
      : ['只读查询风险较低，仍建议先核对目标连接和库名'],
  };
};
