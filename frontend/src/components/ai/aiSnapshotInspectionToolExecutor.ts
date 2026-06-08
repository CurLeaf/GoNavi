import type {
  AIContextItem,
  AIMCPClientInstallStatus,
  AIMCPServerConfig,
  AIMCPToolDescriptor,
  AIProviderConfig,
  AISafetyLevel,
  AISkillConfig,
  AIUserPromptSettings,
  SavedConnection,
  SavedQuery,
  SqlSnippet,
  TabData,
} from '../../types';
import type { SqlLog } from '../../store';
import { BUILTIN_AI_TOOL_INFO } from '../../utils/aiToolRegistry';
import { buildAIContextSnapshot } from './aiContextInsights';
import { buildCurrentConnectionSnapshot } from './aiConnectionInsights';
import { buildMCPSetupSnapshot } from './aiMCPInsights';
import { buildAIGuidanceSnapshot } from './aiPromptInsights';
import { buildAIChatReadinessSnapshot } from './aiChatReadiness';
import { buildAIProviderSnapshot } from './aiProviderInsights';
import { buildAIRuntimeSnapshot } from './aiRuntimeInsights';
import {
  buildSavedQueriesSnapshot,
  buildSqlSnippetsSnapshot,
} from './aiSavedSqlInsights';
import {
  buildActiveTabSnapshot,
  buildRecentSqlLogsSnapshot,
  buildWorkspaceTabsSnapshot,
} from './aiWorkspaceInsights';

export interface AISnapshotInspectionRuntimeState {
  providers?: AIProviderConfig[];
  activeProviderId?: string;
  safetyLevel?: AISafetyLevel | string;
  contextLevel?: string;
}

export interface AISnapshotInspectionRuntime {
  getAIRuntimeState?: () => Promise<AISnapshotInspectionRuntimeState | undefined>;
  getMCPServers?: () => Promise<AIMCPServerConfig[] | undefined>;
  getMCPClientInstallStatuses?: () => Promise<AIMCPClientInstallStatus[] | undefined>;
}

interface ExecuteSnapshotInspectionToolCallOptions {
  toolName: string;
  args: Record<string, any>;
  activeContext?: { connectionId: string; dbName: string } | null;
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
  dynamicModels?: string[];
  runtime?: AISnapshotInspectionRuntime;
}

interface SnapshotInspectionResult {
  content: string;
  success: boolean;
}

const BUILTIN_AI_TOOL_NAMES = BUILTIN_AI_TOOL_INFO.map((item) => item.name);

export async function executeSnapshotInspectionToolCall(
  options: ExecuteSnapshotInspectionToolCallOptions,
): Promise<SnapshotInspectionResult | null> {
  const {
    toolName,
    args,
    activeContext = null,
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
    dynamicModels = [],
    runtime,
  } = options;

  try {
    switch (toolName) {
      case 'inspect_ai_runtime': {
        const runtimeState = typeof runtime?.getAIRuntimeState === 'function'
          ? await runtime.getAIRuntimeState()
          : undefined;
        return {
          content: JSON.stringify(buildAIRuntimeSnapshot({
            providers: Array.isArray(runtimeState?.providers) ? runtimeState.providers : [],
            activeProviderId: runtimeState?.activeProviderId || '',
            safetyLevel: runtimeState?.safetyLevel,
            contextLevel: runtimeState?.contextLevel,
            skills,
            mcpTools,
            dynamicModels,
            builtinToolNames: BUILTIN_AI_TOOL_NAMES,
          })),
          success: true,
        };
      }
      case 'inspect_ai_providers': {
        const runtimeState = typeof runtime?.getAIRuntimeState === 'function'
          ? await runtime.getAIRuntimeState()
          : undefined;
        return {
          content: JSON.stringify(buildAIProviderSnapshot({
            providers: Array.isArray(runtimeState?.providers) ? runtimeState.providers : [],
            activeProviderId: runtimeState?.activeProviderId || '',
            dynamicModels,
          })),
          success: true,
        };
      }
      case 'inspect_ai_chat_readiness': {
        const runtimeState = typeof runtime?.getAIRuntimeState === 'function'
          ? await runtime.getAIRuntimeState()
          : undefined;
        const activeContextKey = activeContext?.connectionId
          ? `${activeContext.connectionId}:${activeContext.dbName || ''}`
          : 'default';
        return {
          content: JSON.stringify(buildAIChatReadinessSnapshot({
            providers: Array.isArray(runtimeState?.providers) ? runtimeState.providers : [],
            activeProviderId: runtimeState?.activeProviderId || '',
            dynamicModels,
            activeContext,
            activeContextItems: aiContexts[activeContextKey] || [],
          })),
          success: true,
        };
      }
      case 'inspect_mcp_setup': {
        const [mcpServers, mcpClientInstallStatuses] = await Promise.all([
          typeof runtime?.getMCPServers === 'function' ? runtime.getMCPServers() : Promise.resolve(undefined),
          typeof runtime?.getMCPClientInstallStatuses === 'function' ? runtime.getMCPClientInstallStatuses() : Promise.resolve(undefined),
        ]);
        return {
          content: JSON.stringify(buildMCPSetupSnapshot({
            mcpServers: Array.isArray(mcpServers) ? mcpServers : [],
            mcpClientStatuses: Array.isArray(mcpClientInstallStatuses) ? mcpClientInstallStatuses : [],
            mcpTools,
          })),
          success: true,
        };
      }
      case 'inspect_ai_guidance':
        return {
          content: JSON.stringify(buildAIGuidanceSnapshot({
            userPromptSettings,
            skills,
          })),
          success: true,
        };
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
      case 'inspect_recent_sql_logs':
        return {
          content: JSON.stringify(buildRecentSqlLogsSnapshot({
            sqlLogs,
            limit: args.limit,
            status: args.status,
          })),
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
      default:
        return null;
    }
  } catch (error: any) {
    const label = {
      inspect_ai_runtime: '读取当前 AI 运行状态失败',
      inspect_ai_providers: '读取当前 AI 供应商配置失败',
      inspect_ai_chat_readiness: '读取 AI 聊天发送前置状态失败',
      inspect_mcp_setup: '读取 MCP 配置状态失败',
      inspect_ai_guidance: '读取当前 AI 提示与技能配置失败',
      inspect_current_connection: '读取当前连接失败',
      inspect_active_tab: '读取当前活动页签失败',
      inspect_workspace_tabs: '读取当前工作区页签失败',
      inspect_ai_context: '读取当前 AI 上下文失败',
      inspect_recent_sql_logs: '获取最近 SQL 日志失败',
      inspect_saved_queries: '读取已保存查询失败',
      inspect_sql_snippets: '读取 SQL 片段失败',
    }[toolName] || '读取本地探针快照失败';
    return {
      content: `${label}: ${error?.message || error}`,
      success: false,
    };
  }
}
