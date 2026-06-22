import type { SavedConnection, TabData } from '../../types';
import { buildSqlRiskSnapshot } from './aiSqlRiskInsights';
import type { AIInspectionTranslator } from './aiInspectionI18n';
import type {
  AISnapshotInspectionRuntime,
  SnapshotInspectionResult,
} from './aiSnapshotInspectionToolTypes';

interface ExecuteSqlRiskInspectionToolCallOptions {
  toolName: string;
  args: Record<string, any>;
  connections: SavedConnection[];
  tabs?: TabData[];
  activeTabId?: string | null;
  runtime?: AISnapshotInspectionRuntime;
  translate?: AIInspectionTranslator;
}

export async function executeSqlRiskInspectionToolCall({
  toolName,
  args,
  connections,
  tabs = [],
  activeTabId = null,
  runtime,
  translate,
}: ExecuteSqlRiskInspectionToolCallOptions): Promise<SnapshotInspectionResult | null> {
  if (toolName !== 'inspect_sql_risk') {
    return null;
  }

  const candidateSql = String(args.sql || '').trim();
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const activeTabSql = activeTab?.type === 'query' ? String(activeTab.query || '').trim() : '';
  const sqlForCheck = candidateSql || activeTabSql;
  const safetyCheck = sqlForCheck && typeof runtime?.checkSQL === 'function'
    ? await runtime.checkSQL(sqlForCheck)
    : undefined;

  return {
    content: JSON.stringify(buildSqlRiskSnapshot({
      sql: candidateSql,
      previewCharLimit: args.previewCharLimit,
      tabs,
      activeTabId,
      connections,
      safetyCheck,
      translate,
    })),
    success: true,
  };
}
