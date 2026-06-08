import type { SqlLog } from '../../store';
import type { AIChatMessage, AIContextItem } from '../../types';
import type { AIToolContextEntry } from './aiLocalToolExecutor';
import type { AIChatInlineHistorySession, AIChatInsightItem, AIChatPanelMode } from './AIChatPanelModeContent';

interface InferAIChatConnectionContextArgs {
  activeConnectionId?: string;
  activeDbName?: string;
  messages: AIChatMessage[];
  toolContextEntries: Iterable<AIToolContextEntry>;
}

interface CollectAIChatContextTableNamesArgs {
  aiContexts: Record<string, AIContextItem[]>;
  activeConnectionId?: string;
  activeDbName?: string;
}

interface BuildAIChatInsightsArgs {
  contextTableNames: string[];
  sqlLogs: SqlLog[];
}

export const inferAIChatConnectionContext = ({
  activeConnectionId,
  activeDbName,
  messages,
  toolContextEntries,
}: InferAIChatConnectionContextArgs) => {
  let inferredConnectionId = activeConnectionId;
  let inferredDbName = activeDbName;

  if (!inferredConnectionId || !inferredDbName) {
    const allMsgText = messages.map((item) => item.content || '').join(' ');
    let bestMatch: { connectionId: string; dbName: string } | null = null;
    let bestScore = 0;

    for (const entry of toolContextEntries) {
      let score = 0;
      for (const table of entry.tables) {
        if (allMsgText.includes(table)) {
          score += 1;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = { connectionId: entry.connectionId, dbName: entry.dbName };
      }
    }

    if (bestMatch) {
      if (!inferredConnectionId) {
        inferredConnectionId = bestMatch.connectionId;
      }
      if (!inferredDbName) {
        inferredDbName = bestMatch.dbName;
      }
    }
  }

  return {
    inferredConnectionId,
    inferredDbName,
  };
};

export const calculateAIContextUsageChars = (messages: AIChatMessage[]) =>
  messages.reduce(
    (sum, item) =>
      sum
      + (item.content?.length || 0)
      + (item.reasoning_content?.length || 0)
      + JSON.stringify(item.tool_calls || []).length,
    0,
  );

export const collectAIChatContextTableNames = ({
  aiContexts,
  activeConnectionId,
  activeDbName,
}: CollectAIChatContextTableNamesArgs) => {
  const contextKey = activeConnectionId ? `${activeConnectionId}:${activeDbName || ''}` : 'default';
  return (aiContexts[contextKey] || []).map((item) => `${item.dbName}.${item.tableName}`);
};

export const buildAIChatInsights = ({
  contextTableNames,
  sqlLogs,
}: BuildAIChatInsightsArgs): AIChatInsightItem[] => {
  const recentLogs = sqlLogs.slice(0, 24);
  const slowest = recentLogs
    .filter((log) => log.status === 'success')
    .sort((left, right) => right.duration - left.duration)[0];
  const errors = recentLogs.filter((log) => log.status === 'error');
  const writeCount = recentLogs.filter((log) => /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i.test(log.sql)).length;
  const contextCount = contextTableNames.length;

  return [
    {
      tone: 'info',
      title: contextCount > 0 ? `已关联 ${contextCount} 张表` : '尚未关联表结构',
      body: contextCount > 0
        ? `当前对话会带上 ${contextTableNames.slice(0, 3).join('、')}${contextCount > 3 ? ' 等表' : ''} 的结构上下文。`
        : '在表页打开 AI 后会自动关联当前表，也可以在输入框上方手动添加上下文。',
    },
    {
      tone: slowest && slowest.duration > 1000 ? 'warn' : 'accent',
      title: slowest ? `最近最慢查询 ${Math.round(slowest.duration).toLocaleString()}ms` : '暂无查询耗时样本',
      body: slowest ? slowest.sql.slice(0, 140) : '执行查询后这里会显示可用于优化分析的 SQL 线索。',
    },
    {
      tone: errors.length > 0 ? 'warn' : 'info',
      title: errors.length > 0 ? `${errors.length} 条最近查询失败` : '最近查询状态正常',
      body: errors[0]?.message || (recentLogs.length > 0 ? `已记录 ${recentLogs.length} 条最近 SQL，可直接让 AI 解释或优化。` : '暂无 SQL 日志。'),
    },
    {
      tone: writeCount > 0 ? 'warn' : 'accent',
      title: writeCount > 0 ? `检测到 ${writeCount} 条写操作` : '当前以只读分析为主',
      body: writeCount > 0 ? '涉及写入的 SQL 建议先生成预览与回滚语句，再执行提交。' : 'AI 默认优先解释、生成 SELECT、分析 Schema 与优化索引。',
    },
  ];
};

export const buildAIChatInlineHistorySessions = (
  sessions: AIChatInlineHistorySession[],
  limit = 8,
) => sessions.slice(0, limit);

export const resolveAIChatPanelMode = (
  isV2Ui: boolean,
  activePanelMode: AIChatPanelMode,
): AIChatPanelMode => (isV2Ui ? activePanelMode : 'chat');
