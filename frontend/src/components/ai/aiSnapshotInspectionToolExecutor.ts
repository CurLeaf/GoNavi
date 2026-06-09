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
import { buildAIContextSnapshot } from './aiContextInsights';
import { buildAIChatSessionsSnapshot } from './aiChatSessionInsights';
import { buildConnectionCapabilitiesSnapshot } from './aiConnectionCapabilitiesInsights';
import { buildCurrentConnectionSnapshot } from './aiConnectionInsights';
import {
  buildSavedQueriesSnapshot,
  buildSqlSnippetsSnapshot,
} from './aiSavedSqlInsights';
import { buildSavedConnectionsSnapshot } from './aiSavedConnectionInsights';
import { buildExternalSQLFileSnapshot } from './aiExternalSqlFileInsights';
import { buildExternalSQLDirectoriesSnapshot } from './aiExternalSqlInsights';
import { buildAppLogSnapshot } from './aiAppLogInsights';
import { findBestMatchingExternalSQLDirectory } from './aiExternalSqlPathUtils';
import {
  buildRecentSqlActivitySnapshot,
  buildRecentSqlLogsSnapshot,
} from './aiSqlLogInsights';
import {
  buildActiveTabSnapshot,
  buildWorkspaceTabsSnapshot,
} from './aiWorkspaceInsights';
import { buildShortcutSnapshot } from './aiShortcutInsights';
import { buildAILastRenderErrorSnapshot } from './aiLastRenderErrorInsights';
import { buildRecentConnectionFailureSnapshot } from './aiConnectionFailureInsights';
import { executeAIConfigSnapshotToolCall } from './aiSnapshotInspectionAIConfigToolExecutor';
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
    const aiConfigResult = await executeAIConfigSnapshotToolCall({
      toolName,
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

    switch (toolName) {
      case 'inspect_current_connection':
        return {
          content: JSON.stringify(buildCurrentConnectionSnapshot({
            activeContext,
            tabs,
            activeTabId,
            connections,
          })),
          success: true,
        };
      case 'inspect_connection_capabilities':
        return {
          content: JSON.stringify(buildConnectionCapabilitiesSnapshot({
            connectionId: args.connectionId,
            activeContext,
            tabs,
            activeTabId,
            connections,
          })),
          success: true,
        };
      case 'inspect_saved_connections':
        return {
          content: JSON.stringify(buildSavedConnectionsSnapshot({
            connections,
            keyword: args.keyword,
            type: args.type,
            limit: args.limit,
          })),
          success: true,
        };
      case 'inspect_external_sql_directories':
        return {
          content: JSON.stringify(buildExternalSQLDirectoriesSnapshot({
            externalSQLDirectories,
            connections,
            tabs,
            keyword: args.keyword,
            connectionId: args.connectionId,
            dbName: args.dbName,
            limit: args.limit,
          })),
          success: true,
        };
      case 'inspect_external_sql_file': {
        const requestedFilePath = String(args.filePath || '').trim();
        if (!requestedFilePath) {
          return {
            content: '读取外部 SQL 文件失败: filePath 不能为空',
            success: false,
          };
        }
        if (!findBestMatchingExternalSQLDirectory(requestedFilePath, externalSQLDirectories)) {
          return {
            content: '读取外部 SQL 文件失败: 目标文件不在已配置的外部 SQL 目录中',
            success: false,
          };
        }
        const readResult = typeof runtime?.readSQLFile === 'function'
          ? await runtime.readSQLFile(requestedFilePath)
          : { success: false, message: '当前环境暂不支持读取本地 SQL 文件' };
        if (!readResult?.success) {
          return {
            content: `读取外部 SQL 文件失败: ${readResult?.message || '未知错误'}`,
            success: false,
          };
        }
        return {
          content: JSON.stringify(buildExternalSQLFileSnapshot({
            filePath: requestedFilePath,
            previewCharLimit: args.previewCharLimit,
            readResult: readResult?.data,
            externalSQLDirectories,
            connections,
            tabs,
          })),
          success: true,
        };
      }
      case 'inspect_active_tab':
        return {
          content: JSON.stringify(buildActiveTabSnapshot({
            tabs,
            activeTabId,
            connections,
            includeContent: args.includeContent !== false,
          })),
          success: true,
        };
      case 'inspect_workspace_tabs':
        return {
          content: JSON.stringify(buildWorkspaceTabsSnapshot({
            tabs,
            activeTabId,
            connections,
            includeContent: args.includeContent === true,
            limit: args.limit,
          })),
          success: true,
        };
      case 'inspect_ai_context':
        return {
          content: JSON.stringify(buildAIContextSnapshot({
            activeContext,
            aiContexts,
            connections,
            includeDDL: args.includeDDL === true,
            ddlLimit: args.ddlLimit,
          })),
          success: true,
        };
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
      inspect_sql_risk: '检查 SQL 风险失败',
      inspect_app_logs: '读取 GoNavi 应用日志失败',
      inspect_recent_connection_failures: '汇总最近连接失败记录失败',
      inspect_ai_last_render_error: '读取最近一次 AI 渲染异常失败',
      inspect_saved_queries: '读取已保存查询失败',
      inspect_sql_snippets: '读取 SQL 片段失败',
      inspect_shortcuts: '读取快捷键配置失败',
    }[toolName] || '读取本地探针快照失败';
    return {
      content: `${label}: ${error?.message || error}`,
      success: false,
    };
  }
}
