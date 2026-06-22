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
import type { I18nParams } from '../../i18n';
import { executeConnectionWorkspaceSnapshotToolCall } from './aiSnapshotInspectionConnectionToolExecutor';
import { executeDiagnosticsSnapshotToolCall } from './aiSnapshotInspectionDiagnosticsToolExecutor';
import { executeAIConfigSnapshotToolCall } from './aiSnapshotInspectionAIConfigToolExecutor';
import { executeAppHealthSnapshotToolCall } from './aiSnapshotInspectionAppHealthToolExecutor';
import { translateInspectionCopy } from './aiInspectionI18n';
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
  translate?: (key: string, params?: I18nParams) => string;
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
    translate,
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
      translate,
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
      translate,
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
      translate,
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
      translate,
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
      translate,
      runtime,
    });
    if (diagnosticsResult) {
      return diagnosticsResult;
    }

    return null;
  } catch (error: any) {
    const detail = String(error?.message || error);
    const diagnosticsReadError = {
      inspect_app_logs: {
        key: 'ai_chat.inspection.diagnostics.error.read_app_logs_failed',
        fallback: `Failed to read GoNavi app logs: ${detail}`,
      },
      inspect_ai_upstream_logs: {
        key: 'ai_chat.inspection.diagnostics.error.read_ai_upstream_logs_failed',
        fallback: `Failed to read AI upstream request logs: ${detail}`,
      },
      inspect_recent_connection_failures: {
        key: 'ai_chat.inspection.diagnostics.error.read_recent_connection_failures_failed',
        fallback: `Failed to read recent connection failure records: ${detail}`,
      },
    }[toolName];
    if (diagnosticsReadError) {
      return {
        content: translateInspectionCopy(
          translate,
          diagnosticsReadError.key,
          diagnosticsReadError.fallback,
          { detail },
        ),
        success: false,
      };
    }
    if (toolName === 'inspect_sql_risk') {
      return {
        content: translateInspectionCopy(
          translate,
          'ai_chat.inspection.sql_risk.error.inspect_failed',
          `Failed to inspect SQL risk: ${detail}`,
          { detail },
        ),
        success: false,
      };
    }
    const fallbackByToolName: Record<string, string> = {
      inspect_current_connection: `Failed to read current connection: ${detail}`,
      inspect_connection_capabilities: `Failed to read current connection capability matrix: ${detail}`,
      inspect_saved_connections: `Failed to read saved connection list: ${detail}`,
      inspect_redis_topology: `Failed to read Redis topology configuration: ${detail}`,
      inspect_external_sql_directories: `Failed to read external SQL directories: ${detail}`,
      inspect_external_sql_file: `Failed to read external SQL file: ${detail}`,
      inspect_ai_sessions: `Failed to read local AI session list: ${detail}`,
      inspect_active_tab: `Failed to read current active tab: ${detail}`,
      inspect_workspace_tabs: `Failed to read current workspace tabs: ${detail}`,
      inspect_ai_context: `Failed to read current AI context: ${detail}`,
      inspect_recent_sql_logs: `Failed to fetch recent SQL logs: ${detail}`,
      inspect_recent_sql_activity: `Failed to summarize recent SQL activity: ${detail}`,
      inspect_sql_editor_transaction: `Failed to read SQL editor transaction state: ${detail}`,
      inspect_mcp_runtime_failures: `Failed to read MCP runtime failure diagnostics: ${detail}`,
      inspect_ai_last_render_error: `Failed to read the latest AI render error: ${detail}`,
      inspect_ai_message_flow: `Failed to read AI message flow diagnostics: ${detail}`,
      inspect_ai_context_budget: `Failed to read AI context budget diagnostics: ${detail}`,
      inspect_codebase_hotspots: `Failed to read code hotspot diagnostics: ${detail}`,
      inspect_saved_queries: `Failed to read saved queries: ${detail}`,
      inspect_sql_snippets: `Failed to read SQL snippets: ${detail}`,
      inspect_shortcuts: `Failed to read shortcut configuration: ${detail}`,
      inspect_app_health: `Failed to read AI app health overview: ${detail}`,
    };
    const fallback = fallbackByToolName[toolName] || `Failed to read local inspection snapshot: ${detail}`;
    const errorKey = fallbackByToolName[toolName]
      ? `ai_chat.inspection.snapshot.error.${toolName}`
      : 'ai_chat.inspection.snapshot.error.default';
    return {
      content: translateInspectionCopy(
        translate,
        errorKey,
        fallback,
        { detail },
      ),
      success: false,
    };
  }
}
