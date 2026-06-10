import type {
  AIContextItem,
  AIMCPToolDescriptor,
  AISkillConfig,
  AIUserPromptSettings,
  SavedConnection,
  TabData,
} from '../../types';
import { BUILTIN_AI_TOOL_INFO } from '../../utils/aiToolRegistry';
import { buildAIChatReadinessSnapshot } from './aiChatReadiness';
import { buildAIGuidanceSnapshot } from './aiPromptInsights';
import { buildAIProviderSnapshot } from './aiProviderInsights';
import { buildAIRuntimeSnapshot } from './aiRuntimeInsights';
import { buildAISafetySnapshot } from './aiSafetyInsights';
import { buildMCPAuthoringGuideSnapshot } from './aiMCPAuthoringGuideInsights';
import { buildMCPDraftInspectionSnapshot } from './aiMCPDraftInspectionInsights';
import { buildAISetupHealthSnapshot } from './aiSetupHealthInsights';
import { buildMCPSetupSnapshot } from './aiMCPInsights';
import { buildMCPRemoteAccessSnapshot } from './aiMCPRemoteAccessInsights';
import { buildMCPToolSchemaSnapshot } from './aiMCPToolSchemaInsights';
import type {
  AISnapshotInspectionRuntime,
  AISnapshotInspectionRuntimeState,
  SnapshotInspectionResult,
} from './aiSnapshotInspectionToolTypes';

const BUILTIN_AI_TOOL_NAMES = BUILTIN_AI_TOOL_INFO.map((item) => item.name);

interface ExecuteAIConfigSnapshotToolCallOptions {
  toolName: string;
  args?: Record<string, any>;
  activeContext?: { connectionId: string; dbName: string } | null;
  aiContexts?: Record<string, AIContextItem[]>;
  connections: SavedConnection[];
  tabs?: TabData[];
  activeTabId?: string | null;
  mcpTools: AIMCPToolDescriptor[];
  skills?: AISkillConfig[];
  userPromptSettings?: AIUserPromptSettings;
  dynamicModels?: string[];
  runtime?: AISnapshotInspectionRuntime;
}

const loadRuntimeState = async (
  runtime: AISnapshotInspectionRuntime | undefined,
): Promise<AISnapshotInspectionRuntimeState | undefined> =>
  typeof runtime?.getAIRuntimeState === 'function'
    ? runtime.getAIRuntimeState()
    : undefined;

const loadMCPSetupState = async (runtime: AISnapshotInspectionRuntime | undefined) =>
  Promise.all([
    typeof runtime?.getMCPServers === 'function' ? runtime.getMCPServers() : Promise.resolve(undefined),
    typeof runtime?.getMCPClientInstallStatuses === 'function'
      ? runtime.getMCPClientInstallStatuses()
      : Promise.resolve(undefined),
  ]);

const loadMCPClientInstallStatuses = async (runtime: AISnapshotInspectionRuntime | undefined) =>
  typeof runtime?.getMCPClientInstallStatuses === 'function'
    ? runtime.getMCPClientInstallStatuses()
    : undefined;

export async function executeAIConfigSnapshotToolCall(
  options: ExecuteAIConfigSnapshotToolCallOptions,
): Promise<SnapshotInspectionResult | null> {
  const {
    toolName,
    args = {},
    activeContext = null,
    aiContexts = {},
    connections,
    tabs = [],
    activeTabId = null,
    mcpTools,
    skills = [],
    userPromptSettings,
    dynamicModels = [],
    runtime,
  } = options;

  try {
    switch (toolName) {
      case 'inspect_ai_setup_health': {
        const runtimeState = await loadRuntimeState(runtime);
        const [mcpServers, mcpClientInstallStatuses] = await loadMCPSetupState(runtime);
        const activeContextKey = activeContext?.connectionId
          ? `${activeContext.connectionId}:${activeContext.dbName || ''}`
          : 'default';
        return {
          content: JSON.stringify(buildAISetupHealthSnapshot({
            providers: Array.isArray(runtimeState?.providers) ? runtimeState.providers : [],
            activeProviderId: runtimeState?.activeProviderId || '',
            safetyLevel: runtimeState?.safetyLevel,
            contextLevel: runtimeState?.contextLevel,
            skills,
            mcpServers: Array.isArray(mcpServers) ? mcpServers : [],
            mcpClientStatuses: Array.isArray(mcpClientInstallStatuses) ? mcpClientInstallStatuses : [],
            mcpTools,
            dynamicModels,
            builtinToolNames: BUILTIN_AI_TOOL_NAMES,
            userPromptSettings,
            activeContext,
            activeContextItems: aiContexts[activeContextKey] || [],
          })),
          success: true,
        };
      }
      case 'inspect_ai_runtime': {
        const runtimeState = await loadRuntimeState(runtime);
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
      case 'inspect_ai_safety': {
        const runtimeState = await loadRuntimeState(runtime);
        return {
          content: JSON.stringify(buildAISafetySnapshot({
            safetyLevel: runtimeState?.safetyLevel,
            activeContext,
            tabs,
            activeTabId,
            connections,
          })),
          success: true,
        };
      }
      case 'inspect_ai_providers': {
        const runtimeState = await loadRuntimeState(runtime);
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
        const runtimeState = await loadRuntimeState(runtime);
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
        const [mcpServers, mcpClientInstallStatuses] = await loadMCPSetupState(runtime);
        return {
          content: JSON.stringify(buildMCPSetupSnapshot({
            mcpServers: Array.isArray(mcpServers) ? mcpServers : [],
            mcpClientStatuses: Array.isArray(mcpClientInstallStatuses) ? mcpClientInstallStatuses : [],
            mcpTools,
          })),
          success: true,
        };
      }
      case 'inspect_mcp_remote_access': {
        const mcpClientInstallStatuses = await loadMCPClientInstallStatuses(runtime);
        return {
          content: JSON.stringify(buildMCPRemoteAccessSnapshot({
            mcpClientStatuses: Array.isArray(mcpClientInstallStatuses) ? mcpClientInstallStatuses : [],
            publicUrl: args.publicUrl,
            localAddr: args.localAddr,
            path: args.path,
            exposeStrategy: args.exposeStrategy,
            tokenConfigured: args.tokenConfigured,
          })),
          success: true,
        };
      }
      case 'inspect_mcp_authoring_guide':
        return {
          content: JSON.stringify(buildMCPAuthoringGuideSnapshot()),
          success: true,
        };
      case 'inspect_mcp_draft':
        return {
          content: JSON.stringify(buildMCPDraftInspectionSnapshot(args)),
          success: true,
        };
      case 'inspect_mcp_tool_schema':
        return {
          content: JSON.stringify(buildMCPToolSchemaSnapshot({
            mcpTools,
            alias: args.alias,
            serverId: args.serverId,
            keyword: args.keyword,
            includeSchema: args.includeSchema === true,
            limit: args.limit,
          })),
          success: true,
        };
      case 'inspect_ai_guidance':
        return {
          content: JSON.stringify(buildAIGuidanceSnapshot({
            userPromptSettings,
            skills,
          })),
          success: true,
        };
      default:
        return null;
    }
  } catch (error: any) {
    const label = {
      inspect_ai_setup_health: '体检当前 AI 配置失败',
      inspect_ai_runtime: '读取当前 AI 运行状态失败',
      inspect_ai_safety: '读取当前 AI 安全边界失败',
      inspect_ai_providers: '读取当前 AI 供应商配置失败',
      inspect_ai_chat_readiness: '读取 AI 聊天发送前置状态失败',
      inspect_mcp_setup: '读取 MCP 配置状态失败',
      inspect_mcp_remote_access: '读取 MCP 远程接入指引失败',
      inspect_mcp_authoring_guide: '读取 MCP 新增填写指引失败',
      inspect_mcp_draft: '校验 MCP 新增草稿失败',
      inspect_mcp_tool_schema: '读取 MCP 工具参数 schema 失败',
      inspect_ai_guidance: '读取当前 AI 提示与技能配置失败',
    }[toolName] || '读取 AI 配置探针失败';
    return {
      content: `${label}: ${error?.message || error}`,
      success: false,
    };
  }
}
