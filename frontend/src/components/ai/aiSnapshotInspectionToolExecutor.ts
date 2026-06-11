import type {
  AIContextItem,
  AIMCPToolDescriptor,
  AIChatMessage,
  AISkillConfig,
  AIUserPromptSettings,
  ExternalSQLDirectory,
  SavedConnection,
  SavedQuery,
  SqlSnippet,
  TabData,
} from '../../types';
import type { SqlLog } from '../../store';
import { executeConnectionWorkspaceSnapshotToolCall } from './aiSnapshotInspectionConnectionToolExecutor';
import { executeDiagnosticsSnapshotToolCall } from './aiSnapshotInspectionDiagnosticsToolExecutor';
import { executeAIConfigSnapshotToolCall } from './aiSnapshotInspectionAIConfigToolExecutor';
import { executeAppHealthSnapshotToolCall } from './aiSnapshotInspectionAppHealthToolExecutor';
import type {
  AISnapshotInspectionRuntime,
  SnapshotInspectionResult,
} from './aiSnapshotInspectionToolTypes';
import { executeSqlRiskInspectionToolCall } from './aiSnapshotInspectionSqlRiskToolExecutor';

interface ExecuteSnapshotInspectionToolCallOptions {
  toolName: string;
  args: Record<string, any>;
  activeContext?: { connectionId: string; dbName: string } | null;
  aiContexts?: Record<string, AIContextItem[]>;
  aiChatHistory?: Record<string, AIChatMessage[]>;
  aiChatSessions?: Array<{ id: string; title: string; updatedAt: number }>;
  activeSessionId?: string | null;
  connections: SavedConnection[];
  tabs?: TabData[];
  activeTabId?: string | null;
  mcpTools: AIMCPToolDescriptor[];
  sqlLogs?: SqlLog[];
  savedQueries?: SavedQuery[];
  sqlSnippets?: SqlSnippet[];
  externalSQLDirectories?: ExternalSQLDirectory[];
  skills?: AISkillConfig[];
  userPromptSettings?: AIUserPromptSettings;
  dynamicModels?: string[];
  runtime?: AISnapshotInspectionRuntime;
}

export async function executeSnapshotInspectionToolCall(
  options: ExecuteSnapshotInspectionToolCallOptions,
): Promise<SnapshotInspectionResult | null> {
  const {
    toolName,
    args,
    activeContext = null,
    aiContexts = {},
    aiChatHistory = {},
    aiChatSessions = [],
    activeSessionId = null,
    connections,
    tabs = [],
    activeTabId = null,
    mcpTools,
    sqlLogs = [],
    savedQueries = [],
    sqlSnippets = [],
    externalSQLDirectories = [],
    skills = [],
    userPromptSettings,
    dynamicModels = [],
    runtime,
  } = options;

  try {
    const appHealthResult = await executeAppHealthSnapshotToolCall({
      toolName,
      args,
      activeContext,
      aiContexts,
      aiChatHistory,
      aiChatSessions,
      activeSessionId,
      connections,
      tabs,
      activeTabId,
      mcpTools,
      skills,
      userPromptSettings,
      dynamicModels,
      runtime,
    });
    if (appHealthResult) {
      return appHealthResult;
    }

    const aiConfigResult = await executeAIConfigSnapshotToolCall({
      toolName,
      args,
      activeContext,
      aiContexts,
      connections,
      tabs,
      activeTabId,
      mcpTools,
      skills,
      userPromptSettings,
      dynamicModels,
      runtime,
    });
    if (aiConfigResult) {
      return aiConfigResult;
    }

    const sqlRiskResult = await executeSqlRiskInspectionToolCall({
      toolName,
      args,
      connections,
      tabs,
      activeTabId,
      runtime,
    });
    if (sqlRiskResult) {
      return sqlRiskResult;
    }

    const connectionWorkspaceResult = await executeConnectionWorkspaceSnapshotToolCall({
      toolName,
      args,
      activeContext,
      aiContexts,
      connections,
      tabs,
      activeTabId,
      externalSQLDirectories,
      runtime,
    });
    if (connectionWorkspaceResult) {
      return connectionWorkspaceResult;
    }

    const diagnosticsResult = await executeDiagnosticsSnapshotToolCall({
      toolName,
      args,
      aiChatHistory,
      aiChatSessions,
      activeSessionId,
      aiContexts,
      connections,
      tabs,
      activeTabId,
      mcpTools,
      sqlLogs,
      savedQueries,
      sqlSnippets,
      skills,
      userPromptSettings,
      runtime,
    });
    if (diagnosticsResult) {
      return diagnosticsResult;
    }

    return null;
  } catch (error: any) {
    const label = {
      inspect_current_connection: '读取当前连接失败',
      inspect_connection_capabilities: '读取当前连接能力矩阵失败',
      inspect_saved_connections: '读取本地连接清单失败',
      inspect_external_sql_directories: '读取外部 SQL 目录失败',
      inspect_external_sql_file: '读取外部 SQL 文件失败',
      inspect_ai_sessions: '读取本地 AI 会话清单失败',
      inspect_active_tab: '读取当前活动页签失败',
      inspect_workspace_tabs: '读取当前工作区页签失败',
      inspect_ai_context: '读取当前 AI 上下文失败',
      inspect_recent_sql_logs: '获取最近 SQL 日志失败',
      inspect_recent_sql_activity: '汇总最近 SQL 活动失败',
      inspect_sql_editor_transaction: '读取 SQL 编辑器事务状态失败',
      inspect_sql_risk: '检查 SQL 风险失败',
      inspect_app_logs: '读取 GoNavi 应用日志失败',
      inspect_ai_upstream_logs: '读取 AI 上游请求日志失败',
      inspect_recent_connection_failures: '汇总最近连接失败记录失败',
      inspect_ai_last_render_error: '读取最近一次 AI 渲染异常失败',
      inspect_ai_message_flow: '读取 AI 消息流诊断失败',
      inspect_ai_context_budget: '读取 AI 上下文体量诊断失败',
      inspect_saved_queries: '读取已保存查询失败',
      inspect_sql_snippets: '读取 SQL 片段失败',
      inspect_shortcuts: '读取快捷键配置失败',
      inspect_app_health: '读取 AI 应用健康总览失败',
    }[toolName] || '读取本地探针快照失败';
    return {
      content: `${label}: ${error?.message || error}`,
      success: false,
    };
  }
}
