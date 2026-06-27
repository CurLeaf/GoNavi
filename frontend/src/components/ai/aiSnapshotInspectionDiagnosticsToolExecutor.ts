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
import { buildCodebaseHotspotSnapshot } from './aiCodebaseHotspotInsights';
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
import { translateInspectionCopy } from './aiInspectionI18n';
import type {
  AISnapshotInspectionRuntime,
  SnapshotInspectionResult,
} from './aiSnapshotInspectionToolTypes';
import type { I18nParams } from '../../i18n';

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
  translate?: (key: string, params?: I18nParams) => string;
  runtime?: AISnapshotInspectionRuntime;
}

const translateDiagnosticsCopy = (
  translate: ExecuteDiagnosticsSnapshotToolCallOptions['translate'],
  key: string,
  fallback: string,
  params?: I18nParams,
): string => (
  translate
    ? translateInspectionCopy(translate, key, fallback, params)
    : fallback
);

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
  translate,
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
          translate,
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
          translate,
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
          translate,
        })),
        success: true,
      };
    case 'inspect_codebase_hotspots':
      return {
        content: JSON.stringify(buildCodebaseHotspotSnapshot({
          keyword: args.keyword,
          minLines: args.minLines,
          limit: args.limit,
          includeRecommendations: args.includeRecommendations !== false,
          translate,
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
          translate,
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
          translate,
        })),
        success: true,
      };
    }
    case 'inspect_app_logs': {
      const readResult = typeof runtime?.readAppLogTail === 'function'
        ? await runtime.readAppLogTail(Number(args.lineLimit) || 80, String(args.keyword || ''))
        : {
          success: false,
          message: translateDiagnosticsCopy(
            translate,
            'ai_chat.inspection.diagnostics.error.read_app_logs_unsupported',
            'The current environment does not support reading GoNavi app logs',
          ),
        };
      if (!readResult?.success) {
        const detail = String(readResult?.message || translateDiagnosticsCopy(
          translate,
          'ai_chat.inspection.diagnostics.error.unknown',
          'unknown error',
        ));
        return {
          content: translateDiagnosticsCopy(
            translate,
            'ai_chat.inspection.diagnostics.error.read_app_logs_failed',
            `Failed to read GoNavi app logs: ${detail}`,
            { detail },
          ),
          success: false,
        };
      }
      return {
        content: JSON.stringify(buildAppLogSnapshot({
          readResult,
          keyword: args.keyword,
          lineLimit: args.lineLimit,
          translate,
        })),
        success: true,
      };
    }
    case 'inspect_ai_upstream_logs': {
      const keyword = String(args.requestId || args.provider || args.keyword || '').trim();
      const readKeyword = keyword || 'requestId=';
      const readResult = typeof runtime?.readAppLogTail === 'function'
        ? await runtime.readAppLogTail(Number(args.lineLimit) || 160, readKeyword)
        : {
          success: false,
          message: translateDiagnosticsCopy(
            translate,
            'ai_chat.inspection.diagnostics.error.read_app_logs_unsupported',
            'The current environment does not support reading GoNavi app logs',
          ),
        };
      if (!readResult?.success) {
        const detail = String(readResult?.message || translateDiagnosticsCopy(
          translate,
          'ai_chat.inspection.diagnostics.error.unknown',
          'unknown error',
        ));
        return {
          content: translateDiagnosticsCopy(
            translate,
            'ai_chat.inspection.diagnostics.error.read_ai_upstream_logs_failed',
            `Failed to read AI upstream request logs: ${detail}`,
            { detail },
          ),
          success: false,
        };
      }
      const snapshotReadResult = keyword || !readResult?.data || typeof readResult.data !== 'object'
        ? readResult
        : {
          ...readResult,
          data: {
            ...readResult.data,
            keyword,
          },
        };
      return {
        content: JSON.stringify(buildAIUpstreamLogSnapshot({
          readResult: snapshotReadResult,
          provider: args.provider,
          requestId: args.requestId,
          keyword: args.keyword,
          lineLimit: args.lineLimit,
          requestLimit: args.requestLimit,
          includeBody: args.includeBody !== false,
          includeLines: args.includeLines === true,
          bodyPreviewLimit: args.bodyPreviewLimit,
          includePayloadSummary: args.includePayloadSummary !== false,
          translate,
        })),
        success: true,
      };
    }
    case 'inspect_recent_connection_failures': {
      const readResult = typeof runtime?.readAppLogTail === 'function'
        ? await runtime.readAppLogTail(Number(args.lineLimit) || 120, String(args.keyword || ''))
        : {
          success: false,
          message: translateDiagnosticsCopy(
            translate,
            'ai_chat.inspection.diagnostics.error.read_app_logs_unsupported',
            'The current environment does not support reading GoNavi app logs',
          ),
        };
      if (!readResult?.success) {
        const detail = String(readResult?.message || translateDiagnosticsCopy(
          translate,
          'ai_chat.inspection.diagnostics.error.unknown',
          'unknown error',
        ));
        return {
          content: translateDiagnosticsCopy(
            translate,
            'ai_chat.inspection.diagnostics.error.read_recent_connection_failures_failed',
            `Failed to read recent connection failure records: ${detail}`,
            { detail },
          ),
          success: false,
        };
      }
      return {
        content: JSON.stringify(buildRecentConnectionFailureSnapshot({
          readResult,
          keyword: args.keyword,
          lineLimit: args.lineLimit,
          translate,
        })),
        success: true,
      };
    }
    case 'inspect_mcp_runtime_failures': {
      const keyword = String(args.serverName || args.keyword || 'MCP').trim();
      const readResult = typeof runtime?.readAppLogTail === 'function'
        ? await runtime.readAppLogTail(Number(args.lineLimit) || 160, keyword)
        : {
          success: false,
          message: translateDiagnosticsCopy(
            translate,
            'ai_chat.inspection.mcp_runtime.error.read_logs_unsupported',
            'The current environment does not support reading GoNavi app logs',
          ),
        };
      if (!readResult?.success) {
        const detail = String(readResult?.message || 'unknown error');
        return {
          content: translateDiagnosticsCopy(
            translate,
            'ai_chat.inspection.mcp_runtime.error.read_logs_failed',
            `Failed to read MCP runtime failure logs: ${detail}`,
            { detail },
          ),
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
          translate,
        })),
        success: true,
      };
    }
    case 'inspect_ai_last_render_error':
      return {
        content: JSON.stringify(buildAILastRenderErrorSnapshot(translate)),
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
