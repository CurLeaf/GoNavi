import type {
  AIContextItem,
  AIMCPToolDescriptor,
  AISkillConfig,
  AIUserPromptSettings,
  SavedConnection,
  TabData,
} from '../../types';
import { t as translateCatalog, type I18nParams } from '../../i18n';
import { BUILTIN_AI_TOOL_INFO, localizeBuiltinAIToolInfo } from '../../utils/aiToolRegistry';
import { buildAIChatReadinessSnapshot } from './aiChatReadiness';
import { buildAIGuidanceSnapshot } from './aiPromptInsights';
import { buildAIProviderSnapshot } from './aiProviderInsights';
import { buildAIRuntimeSnapshot } from './aiRuntimeInsights';
import { buildAISafetySnapshot } from './aiSafetyInsights';
import { buildAIToolCatalogSnapshot } from './aiToolCatalogInsights';
import { buildMCPAuthoringGuideSnapshot } from './aiMCPAuthoringGuideInsights';
import { buildMCPDraftInspectionSnapshot } from './aiMCPDraftInspectionInsights';
import { buildMCPDockerSetupSnapshot } from './aiMCPDockerInsights';
import { buildAISetupHealthSnapshot } from './aiSetupHealthInsights';
import { buildMCPSetupSnapshot } from './aiMCPInsights';
import { buildMCPRemoteAccessSnapshot } from './aiMCPRemoteAccessInsights';
import { buildMCPToolSchemaSnapshot } from './aiMCPToolSchemaInsights';
import { translateInspectionCopy } from './aiInspectionI18n';
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
  translate?: (key: string, params?: I18nParams) => string;
  runtime?: AISnapshotInspectionRuntime;
}

const translateInspectionZhCN = (
  key: string,
  params?: I18nParams,
) => translateCatalog(key, params, 'zh-CN');

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

const loadMCPServers = async (runtime: AISnapshotInspectionRuntime | undefined) =>
  typeof runtime?.getMCPServers === 'function'
    ? runtime.getMCPServers()
    : undefined;

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
    translate,
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
            translate,
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
            translate,
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
            translate,
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
            translate,
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
            translate,
          })),
          success: true,
        };
      }
      case 'inspect_ai_tool_catalog':
        return {
          content: JSON.stringify(buildAIToolCatalogSnapshot({
            builtinTools: localizeBuiltinAIToolInfo(translate),
            mcpTools,
            keyword: args.keyword,
            toolName: args.toolName,
            includeMCPTools: args.includeMCPTools !== false,
            limit: args.limit,
            translate,
          })),
          success: true,
        };
      case 'inspect_mcp_setup': {
        const [mcpServers, mcpClientInstallStatuses] = await loadMCPSetupState(runtime);
        return {
          content: JSON.stringify(buildMCPSetupSnapshot({
            mcpServers: Array.isArray(mcpServers) ? mcpServers : [],
            mcpClientStatuses: Array.isArray(mcpClientInstallStatuses) ? mcpClientInstallStatuses : [],
            mcpTools,
            translate,
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
            translate,
          })),
          success: true,
        };
      }
      case 'inspect_mcp_authoring_guide':
        return {
          content: JSON.stringify(buildMCPAuthoringGuideSnapshot(translate)),
          success: true,
        };
      case 'inspect_mcp_draft':
        return {
          content: JSON.stringify(buildMCPDraftInspectionSnapshot({
            ...args,
            translate: translate || translateInspectionZhCN,
          })),
          success: true,
        };
      case 'inspect_mcp_docker_setup': {
        const mcpServers = await loadMCPServers(runtime);
        return {
          content: JSON.stringify(buildMCPDockerSetupSnapshot({
            mcpServers: Array.isArray(mcpServers) ? mcpServers : [],
            mcpTools,
            serverId: args.serverId,
            includeDisabled: args.includeDisabled !== false,
            translate,
          })),
          success: true,
        };
      }
      case 'inspect_mcp_tool_schema':
        return {
          content: JSON.stringify(buildMCPToolSchemaSnapshot({
            mcpTools,
            alias: args.alias,
            serverId: args.serverId,
            keyword: args.keyword,
            includeSchema: args.includeSchema === true,
            limit: args.limit,
            translate,
          })),
          success: true,
        };
      case 'inspect_ai_guidance':
        return {
          content: JSON.stringify(buildAIGuidanceSnapshot({
            userPromptSettings,
            skills,
            translate,
          })),
          success: true,
        };
      default:
        return null;
    }
  } catch (error: any) {
    const label = translateInspectionCopy(
      translate,
      `ai_chat.inspection.ai_config.error.${toolName}`,
      {
        inspect_ai_setup_health: 'Failed to inspect current AI setup',
        inspect_ai_runtime: 'Failed to read current AI runtime state',
        inspect_ai_safety: 'Failed to read current AI safety boundary',
        inspect_ai_providers: 'Failed to read current AI provider configuration',
        inspect_ai_chat_readiness: 'Failed to read AI chat prerequisites',
        inspect_ai_tool_catalog: 'Failed to read AI tool catalog',
        inspect_mcp_setup: 'Failed to read MCP setup state',
        inspect_mcp_remote_access: 'Failed to read MCP remote access guidance',
        inspect_mcp_authoring_guide: 'Failed to read MCP authoring guide',
        inspect_mcp_draft: 'Failed to validate MCP draft',
        inspect_mcp_docker_setup: 'Failed to inspect Docker MCP setup',
        inspect_mcp_tool_schema: 'Failed to read MCP tool parameter schema',
        inspect_ai_guidance: 'Failed to read current AI prompts and Skills configuration',
      }[toolName] || 'Failed to read AI configuration inspection',
    );
    return {
      content: `${label}: ${error?.message || error}`,
      success: false,
    };
  }
}
