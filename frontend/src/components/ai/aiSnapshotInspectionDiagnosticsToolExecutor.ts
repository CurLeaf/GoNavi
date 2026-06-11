import type {
  AIContextItem,
  AIMCPToolDescriptor,
  AIChatMessage,
  AISkillConfig,
  AIUserPromptSettings,
  SavedConnection,
  SavedQuery,
  SqlSnippet,
  TabData,
} from '../../types';
import type { SqlLog } from '../../store';
import {
  buildAIChatSessionsSnapshot,
  buildAIMessageFlowSnapshot,
} from './aiChatSessionInsights';
import { buildAIContextBudgetSnapshot } from './aiContextBudgetInsights';
import {
  buildSavedQueriesSnapshot,
  buildSqlSnippetsSnapshot,
} from './aiSavedSqlInsights';
import { buildAppLogSnapshot } from './aiAppLogInsights';
import { buildAIUpstreamLogSnapshot } from './aiUpstreamLogInsights';
import {
  buildRecentSqlActivitySnapshot,
  buildRecentSqlLogsSnapshot,
} from './aiSqlLogInsights';
import { buildSqlEditorTransactionSnapshot } from './aiSqlEditorTransactionInsights';
import { buildShortcutSnapshot } from './aiShortcutInsights';
import { buildAILastRenderErrorSnapshot } from './aiLastRenderErrorInsights';
import { buildRecentConnectionFailureSnapshot } from './aiConnectionFailureInsights';
import { buildMCPRuntimeFailureSnapshot } from './aiMCPRuntimeFailureInsights';
import type {
  AISnapshotInspectionRuntime,
  SnapshotInspectionResult,
} from './aiSnapshotInspectionToolTypes';

interface ExecuteDiagnosticsSnapshotToolCallOptions {
  toolName: string;
  args: Record<string, any>;
  aiChatHistory?: Record<string, AIChatMessage[]>;
  aiChatSessions?: Array<{ id: string; title: string; updatedAt: number }>;
  activeSessionId?: string | null;
  aiContexts?: Record<string, AIContextItem[]>;
  connections: SavedConnection[];
  tabs?: TabData[];
  activeTabId?: string | null;
  mcpTools: AIMCPToolDescriptor[];
  sqlLogs?: SqlLog[];
  savedQueries?: SavedQuery[];
  sqlSnippets?: SqlSnippet[];
  skills?: AISkillConfig[];
  userPromptSettings?: AIUserPromptSettings;
  runtime?: AISnapshotInspectionRuntime;
}

export async function executeDiagnosticsSnapshotToolCall({
  toolName,
  args,
  aiChatHistory = {},
  aiChatSessions = [],
  activeSessionId = null,
  aiContexts = {},
  connections,
  tabs = [],
  activeTabId = null,
  mcpTools,
  sqlLogs = [],
  savedQueries = [],
  sqlSnippets = [],
  skills = [],
  userPromptSettings,
  runtime,
}: ExecuteDiagnosticsSnapshotToolCallOptions): Promise<SnapshotInspectionResult | null> {
  switch (toolName) {
    case 'inspect_ai_sessions':
      return {
        content: JSON.stringify(buildAIChatSessionsSnapshot({
          aiChatSessions,
          aiChatHistory,
          activeSessionId,
          keyword: args.keyword,
          limit: args.limit,
          includePreview: args.includePreview !== false,
        })),
        success: true,
      };
    case 'inspect_ai_message_flow':
      return {
        content: JSON.stringify(buildAIMessageFlowSnapshot({
          aiChatSessions,
          aiChatHistory,
          activeSessionId,
          sessionId: args.sessionId,
          limit: args.limit,
          includeContent: args.includeContent !== false,
          previewLimit: args.previewLimit,
        })),
        success: true,
      };
    case 'inspect_ai_context_budget':
      return {
        content: JSON.stringify(buildAIContextBudgetSnapshot({
          aiContexts,
          aiChatHistory,
          aiChatSessions,
          activeSessionId,
          sessionId: args.sessionId,
          messageLimit: args.messageLimit,
          includeDetails: args.includeDetails,
          mcpTools,
          skills,
          userPromptSettings,
        })),
        success: true,
      };
    case 'inspect_recent_sql_logs':
      return {
        content: JSON.stringify(buildRecentSqlLogsSnapshot({
          sqlLogs,
          limit: args.limit,
          status: args.status,
        })),
        success: true,
      };
    case 'inspect_recent_sql_activity':
      return {
        content: JSON.stringify(buildRecentSqlActivitySnapshot({
          sqlLogs,
          limit: args.limit,
          status: args.status,
          keyword: args.keyword,
          dbName: args.dbName,
          activityKind: args.activityKind,
        })),
        success: true,
      };
    case 'inspect_sql_editor_transaction': {
      const transactionState = typeof runtime?.getSqlEditorTransactionState === 'function'
        ? await runtime.getSqlEditorTransactionState()
        : undefined;
      return {
        content: JSON.stringify(buildSqlEditorTransactionSnapshot({
          transactionState,
          tabs,
          activeTabId,
          connections,
          sqlLogs,
          includeSqlPreview: args.includeSqlPreview !== false,
        })),
        success: true,
      };
    }
    case 'inspect_app_logs': {
      const readResult = typeof runtime?.readAppLogTail === 'function'
        ? await runtime.readAppLogTail(Number(args.lineLimit) || 80, String(args.keyword || ''))
        : { success: false, message: '当前环境暂不支持读取 GoNavi 应用日志' };
      if (!readResult?.success) {
        return {
          content: `读取 GoNavi 应用日志失败: ${readResult?.message || '未知错误'}`,
          success: false,
        };
      }
      return {
        content: JSON.stringify(buildAppLogSnapshot({
          readResult,
          keyword: args.keyword,
          lineLimit: args.lineLimit,
        })),
        success: true,
      };
    }
    case 'inspect_ai_upstream_logs': {
      const keyword = String(args.requestId || args.provider || args.keyword || 'AI 上游请求').trim();
      const readResult = typeof runtime?.readAppLogTail === 'function'
        ? await runtime.readAppLogTail(Number(args.lineLimit) || 160, keyword)
        : { success: false, message: '当前环境暂不支持读取 GoNavi 应用日志' };
      if (!readResult?.success) {
        return {
          content: `读取 AI 上游请求日志失败: ${readResult?.message || '未知错误'}`,
          success: false,
        };
      }
      return {
        content: JSON.stringify(buildAIUpstreamLogSnapshot({
          readResult,
          provider: args.provider,
          requestId: args.requestId,
          keyword: args.keyword,
          lineLimit: args.lineLimit,
          requestLimit: args.requestLimit,
          includeBody: args.includeBody !== false,
          includeLines: args.includeLines === true,
          bodyPreviewLimit: args.bodyPreviewLimit,
          includePayloadSummary: args.includePayloadSummary !== false,
        })),
        success: true,
      };
    }
    case 'inspect_recent_connection_failures': {
      const readResult = typeof runtime?.readAppLogTail === 'function'
        ? await runtime.readAppLogTail(Number(args.lineLimit) || 120, String(args.keyword || ''))
        : { success: false, message: '当前环境暂不支持读取 GoNavi 应用日志' };
      if (!readResult?.success) {
        return {
          content: `读取最近连接失败记录失败: ${readResult?.message || '未知错误'}`,
          success: false,
        };
      }
      return {
        content: JSON.stringify(buildRecentConnectionFailureSnapshot({
          readResult,
          keyword: args.keyword,
          lineLimit: args.lineLimit,
        })),
        success: true,
      };
    }
    case 'inspect_mcp_runtime_failures': {
      const keyword = String(args.serverName || args.keyword || 'MCP').trim();
      const readResult = typeof runtime?.readAppLogTail === 'function'
        ? await runtime.readAppLogTail(Number(args.lineLimit) || 160, keyword)
        : { success: false, message: '当前环境暂不支持读取 GoNavi 应用日志' };
      if (!readResult?.success) {
        return {
          content: `读取 MCP 运行期失败日志失败: ${readResult?.message || '未知错误'}`,
          success: false,
        };
      }
      const mcpServers = typeof runtime?.getMCPServers === 'function'
        ? await runtime.getMCPServers().catch(() => undefined)
        : undefined;
      return {
        content: JSON.stringify(buildMCPRuntimeFailureSnapshot({
          readResult,
          mcpServers: Array.isArray(mcpServers) ? mcpServers : [],
          mcpTools,
          keyword: args.keyword,
          serverName: args.serverName,
          lineLimit: args.lineLimit,
          includeLines: args.includeLines === true,
        })),
        success: true,
      };
    }
    case 'inspect_ai_last_render_error':
      return {
        content: JSON.stringify(buildAILastRenderErrorSnapshot()),
        success: true,
      };
    case 'inspect_saved_queries':
      return {
        content: JSON.stringify(buildSavedQueriesSnapshot({
          savedQueries,
          connections,
          keyword: args.keyword,
          connectionId: args.connectionId,
          dbName: args.dbName,
          limit: args.limit,
          includeSql: args.includeSql !== false,
        })),
        success: true,
      };
    case 'inspect_sql_snippets':
      return {
        content: JSON.stringify(buildSqlSnippetsSnapshot({
          sqlSnippets,
          keyword: args.keyword,
          limit: args.limit,
          includeBody: args.includeBody !== false,
        })),
        success: true,
      };
    case 'inspect_shortcuts': {
      const [shortcutOptions, currentPlatform] = await Promise.all([
        typeof runtime?.getShortcutOptions === 'function'
          ? runtime.getShortcutOptions()
          : Promise.resolve(undefined),
        typeof runtime?.getShortcutPlatform === 'function'
          ? runtime.getShortcutPlatform()
          : Promise.resolve(undefined),
      ]);
      return {
        content: JSON.stringify(buildShortcutSnapshot({
          shortcutOptions,
          currentPlatform,
          action: args.action,
          keyword: args.keyword,
          includeDisabled: args.includeDisabled !== false,
          includeAllPlatforms: args.includeAllPlatforms !== false,
        })),
        success: true,
      };
    }
    default:
      return null;
  }
}
