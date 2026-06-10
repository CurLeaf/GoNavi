import type { SqlLog } from '../../store';
import type { SavedConnection, TabData } from '../../types';
import { findSqlStatementRanges } from '../../utils/sqlStatementSelection';
import { shouldUseSqlEditorManagedTransaction } from '../../utils/sqlEditorTransaction';
import type {
  AISqlEditorPendingTransactionRuntimeState,
  AISqlEditorTransactionRuntimeState,
} from './aiSnapshotInspectionToolTypes';

type SqlEditorCommitMode = 'manual' | 'auto';

const DEFAULT_AUTO_COMMIT_DELAY_MS = 5000;
const SQL_PREVIEW_LIMIT = 1200;

const normalizeCommitMode = (value: unknown): SqlEditorCommitMode =>
  String(value || '').trim().toLowerCase() === 'auto' ? 'auto' : 'manual';

const normalizeDelayMs = (value: unknown): number => {
  const delayMs = Number(value);
  return Number.isFinite(delayMs) && delayMs > 0 ? delayMs : DEFAULT_AUTO_COMMIT_DELAY_MS;
};

const splitStatements = (sql: string): string[] =>
  findSqlStatementRanges(String(sql || ''))
    .map((range) => String(range.text || '').trim())
    .filter(Boolean);

const hasTransactionControlStatement = (statement: string): boolean =>
  /^\s*(begin|commit|rollback|savepoint|release)\b/i.test(statement)
  || /^\s*start\s+transaction\b/i.test(statement);

const buildTabSummary = (
  tab: TabData | undefined,
  connections: SavedConnection[],
) => {
  if (!tab) return null;
  const connection = connections.find((item) => item.id === tab.connectionId);
  return {
    id: tab.id,
    title: tab.title,
    type: tab.type,
    connectionId: tab.connectionId,
    connectionName: connection?.name || '',
    connectionType: connection?.config?.type || '',
    dbName: tab.dbName || '',
    filePath: tab.filePath || '',
    resultPanelVisible: tab.resultPanelVisible === true,
    readOnly: tab.readOnly === true,
  };
};

const buildActiveSqlTabSnapshot = (params: {
  tabs?: TabData[];
  activeTabId?: string | null;
  connections: SavedConnection[];
  includeSqlPreview?: boolean;
}) => {
  const { tabs = [], activeTabId = null, connections, includeSqlPreview = true } = params;
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  if (!activeTab) {
    return {
      hasActiveTab: false,
      hasSql: false,
      message: '当前没有活动页签',
    };
  }
  if (activeTab.type !== 'query') {
    return {
      hasActiveTab: true,
      hasSql: false,
      message: '当前活动页签不是 SQL 编辑器页签',
      tab: buildTabSummary(activeTab, connections),
    };
  }

  const sql = String(activeTab.query || '').trim();
  const statements = splitStatements(sql);
  const hasExplicitTransactionControl = statements.some(hasTransactionControlStatement);
  const usesManagedTransaction = shouldUseSqlEditorManagedTransaction(statements);

  return {
    hasActiveTab: true,
    hasSql: sql.length > 0,
    tab: buildTabSummary(activeTab, connections),
    sqlPreview: includeSqlPreview ? sql.slice(0, SQL_PREVIEW_LIMIT) : '',
    sqlCharCount: sql.length,
    sqlTruncated: includeSqlPreview && sql.length > SQL_PREVIEW_LIMIT,
    statementCount: statements.length,
    hasExplicitTransactionControl,
    usesManagedTransaction,
    transactionSemantics: usesManagedTransaction
      ? '执行 INSERT/UPDATE/DELETE/MERGE/REPLACE 等 DML 时会先进入 SQL 编辑器托管事务；提交设置只决定事务执行成功后何时 COMMIT。'
      : hasExplicitTransactionControl
        ? '检测到用户显式事务控制语句，GoNavi 不会再包一层 SQL 编辑器托管事务。'
        : '当前 SQL 不会触发 SQL 编辑器托管事务；只读查询仍走普通查询路径。',
  };
};

const buildPendingTransactionPreview = (params: {
  item: AISqlEditorPendingTransactionRuntimeState;
  tabs?: TabData[];
  connections: SavedConnection[];
  now: number;
}) => {
  const { item, tabs = [], connections, now } = params;
  const tab = tabs.find((candidate) => candidate.id === item.tabId);
  const commitMode = normalizeCommitMode(item.commitMode);
  const dueAt = Number(item.autoCommitDueAt || 0);
  const remainingMs = commitMode === 'auto' && dueAt > 0
    ? Math.max(0, dueAt - now)
    : null;

  return {
    id: item.id,
    tabId: item.tabId,
    tab: buildTabSummary(tab, connections),
    commitMode,
    autoCommitDelayMs: normalizeDelayMs(item.autoCommitDelayMs),
    createdAt: Number(item.createdAt) || 0,
    autoCommitDueAt: dueAt || null,
    autoCommitRemainingMs: remainingMs,
  };
};

const isRelevantSqlEditorTransactionLog = (log: SqlLog): boolean => {
  const sql = String(log.sql || '');
  const statements = splitStatements(sql);
  if (shouldUseSqlEditorManagedTransaction(statements)) return true;
  if (statements.some(hasTransactionControlStatement)) return true;
  return /\b(transaction|commit|rollback)\b/i.test(sql)
    || /事务|提交|回滚|transaction|commit|rollback/i.test(String(log.message || ''));
};

const buildRecentLogPreview = (log: SqlLog) => ({
  id: log.id,
  timestamp: log.timestamp,
  status: log.status,
  duration: log.duration,
  dbName: log.dbName || '',
  affectedRows: typeof log.affectedRows === 'number' ? log.affectedRows : null,
  sqlPreview: String(log.sql || '').trim().slice(0, 1000),
  message: log.message || '',
});

export const buildSqlEditorTransactionSnapshot = (params: {
  transactionState?: AISqlEditorTransactionRuntimeState;
  tabs?: TabData[];
  activeTabId?: string | null;
  connections: SavedConnection[];
  sqlLogs?: SqlLog[];
  includeSqlPreview?: boolean;
  now?: number;
}) => {
  const {
    transactionState,
    tabs = [],
    activeTabId = null,
    connections,
    sqlLogs = [],
    includeSqlPreview = true,
    now = Date.now(),
  } = params;
  const commitMode = normalizeCommitMode(transactionState?.commitMode);
  const autoCommitDelayMs = normalizeDelayMs(transactionState?.autoCommitDelayMs);
  const pendingTransactions = Object.values(transactionState?.pendingTransactions || {})
    .map((item) => buildPendingTransactionPreview({ item, tabs, connections, now }))
    .sort((left, right) => right.createdAt - left.createdAt);
  const activePendingTransaction = pendingTransactions.find((item) => item.tabId === activeTabId) || null;
  const activeSqlTab = buildActiveSqlTabSnapshot({
    tabs,
    activeTabId,
    connections,
    includeSqlPreview,
  });
  const activeUsesManagedTransaction = activeSqlTab.hasActiveTab
    && activeSqlTab.hasSql
    && 'usesManagedTransaction' in activeSqlTab
    && activeSqlTab.usesManagedTransaction === true;
  const activeHasExplicitTransactionControl = activeSqlTab.hasActiveTab
    && activeSqlTab.hasSql
    && 'hasExplicitTransactionControl' in activeSqlTab
    && activeSqlTab.hasExplicitTransactionControl === true;
  const recentRelevantLogs = sqlLogs
    .filter(isRelevantSqlEditorTransactionLog)
    .slice(0, 8)
    .map(buildRecentLogPreview);

  const warnings: string[] = [];
  if (pendingTransactions.length > 0) {
    warnings.push(`当前有 ${pendingTransactions.length} 个 SQL 编辑器托管事务待提交或回滚`);
  }
  if (activePendingTransaction) {
    warnings.push('当前活动 SQL 页签已有待处理事务，继续执行新的 DML 前应先提交或回滚');
  }
  if (activeUsesManagedTransaction && commitMode === 'auto') {
    warnings.push('当前设置为自动提交，但 DML 仍会先进入托管事务，只是在延迟到期后自动 COMMIT');
  }
  if (activeHasExplicitTransactionControl) {
    warnings.push('当前 SQL 已包含显式事务控制，SQL 编辑器不会再接管提交/回滚');
  }

  const nextActions: string[] = [];
  if (activePendingTransaction) {
    nextActions.push('先让用户在结果区事务条点击“提交”或“回滚”，或等待自动提交倒计时结束');
  } else if (pendingTransactions.length > 0) {
    nextActions.push('如要继续执行 DML，先切回对应 SQL 页签处理待提交事务');
  }
  if (activeUsesManagedTransaction) {
    nextActions.push(commitMode === 'auto'
      ? `说明当前 DML 会先开启托管事务，执行成功后约 ${Math.round(autoCommitDelayMs / 1000)} 秒自动提交`
      : '说明当前 DML 会先开启托管事务，执行成功后需要手动点击提交或回滚');
  }
  if (!activeSqlTab.hasActiveTab || !activeSqlTab.hasSql) {
    nextActions.push('先切换到包含 SQL 草稿的查询页签，或让用户贴出要执行的 SQL');
  }
  if (recentRelevantLogs.length > 0) {
    nextActions.push('结合 recentRelevantLogs 回看最近写入/事务执行结果，必要时再调用 inspect_recent_sql_activity 下钻');
  }

  return {
    commitPolicy: {
      commitMode,
      autoCommitDelayMs,
      transactionAlwaysOnForDML: true,
      semantics: 'SQL 编辑器执行 INSERT/UPDATE/DELETE/MERGE/REPLACE 等 DML 时始终先进入托管事务；“手动/自动”只控制执行成功后的 COMMIT 时机，不控制是否开启事务。',
    },
    activeSqlTab,
    pendingTransactionCount: pendingTransactions.length,
    activePendingTransaction,
    pendingTransactions,
    recentRelevantLogs,
    warnings,
    nextActions,
  };
};
