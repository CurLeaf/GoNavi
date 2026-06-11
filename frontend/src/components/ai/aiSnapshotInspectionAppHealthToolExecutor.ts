import type {
  AIChatMessage,
  AIContextItem,
  AIMCPToolDescriptor,
  AISkillConfig,
  AIUserPromptSettings,
  SavedConnection,
  TabData,
} from '../../types';
import { BUILTIN_AI_TOOL_INFO } from '../../utils/aiToolRegistry';
import { buildAIAppHealthSnapshot } from './aiAppHealthInsights';
import { buildAILastRenderErrorSnapshot } from './aiLastRenderErrorInsights';
import { buildAISupportBundleSnapshot } from './aiSupportBundleInsights';
import type {
  AISnapshotInspectionRuntime,
  AISnapshotInspectionRuntimeState,
  SnapshotInspectionResult,
} from './aiSnapshotInspectionToolTypes';

const BUILTIN_AI_TOOL_NAMES = BUILTIN_AI_TOOL_INFO.map((item) => item.name);
const DEFAULT_APP_HEALTH_LOG_LIMIT = 120;
const MAX_APP_HEALTH_LOG_LIMIT = 240;

interface ExecuteAppHealthSnapshotToolCallOptions {
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

const readLogTail = async (
  runtime: AISnapshotInspectionRuntime | undefined,
  lineLimit: number,
  keyword: string,
) => {
  if (typeof runtime?.readAppLogTail !== 'function') {
    return { success: false, message: '当前环境暂不支持读取 GoNavi 应用日志' };
  }
  return runtime.readAppLogTail(lineLimit, keyword);
};

const normalizeLineLimit = (value: unknown): number => {
  const normalized = Math.floor(Number(value) || DEFAULT_APP_HEALTH_LOG_LIMIT);
  if (normalized < 1) return 1;
  if (normalized > MAX_APP_HEALTH_LOG_LIMIT) return MAX_APP_HEALTH_LOG_LIMIT;
  return normalized;
};

export async function executeAppHealthSnapshotToolCall(
  options: ExecuteAppHealthSnapshotToolCallOptions,
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
    skills = [],
    userPromptSettings,
    dynamicModels = [],
    runtime,
  } = options;

  if (toolName !== 'inspect_app_health' && toolName !== 'inspect_ai_support_bundle') {
    return null;
  }

  try {
    const lineLimit = normalizeLineLimit(args.lineLimit);
    const keyword = String(args.keyword || '').trim();
    const connectionKeyword = String(args.connectionKeyword ?? args.keyword ?? '').trim();
    const [runtimeState, mcpState, appLogReadResult, connectionFailureReadResult] = await Promise.all([
      loadRuntimeState(runtime),
      loadMCPSetupState(runtime),
      readLogTail(runtime, lineLimit, keyword),
      readLogTail(runtime, lineLimit, connectionKeyword),
    ]);
    const [mcpServers, mcpClientInstallStatuses] = mcpState;

    if (toolName === 'inspect_ai_support_bundle') {
      return {
        content: JSON.stringify(buildAISupportBundleSnapshot({
          providers: Array.isArray(runtimeState?.providers) ? runtimeState.providers : [],
          activeProviderId: runtimeState?.activeProviderId || '',
          safetyLevel: runtimeState?.safetyLevel,
          contextLevel: runtimeState?.contextLevel,
          skills,
          mcpServers: Array.isArray(mcpServers) ? mcpServers : [],
          mcpClientStatuses: Array.isArray(mcpClientInstallStatuses) ? mcpClientInstallStatuses : [],
          mcpTools,
          dynamicModels,
          builtinTools: BUILTIN_AI_TOOL_INFO,
          builtinToolNames: BUILTIN_AI_TOOL_NAMES,
          userPromptSettings,
          activeContext,
          aiContexts,
          aiChatHistory,
          aiChatSessions,
          activeSessionId,
          sessionId: args.sessionId,
          connections,
          tabs,
          activeTabId,
          appLogReadResult,
          connectionFailureReadResult,
          lastRenderErrorSnapshot: buildAILastRenderErrorSnapshot(),
          keyword,
          connectionKeyword,
          lineLimit,
          includeLogLines: args.includeLogLines === true,
          includeMessageContent: args.includeMessageContent === true,
          includeDetails: args.includeDetails === true,
          publicUrl: args.publicUrl,
          localAddr: args.localAddr,
          path: args.path,
          exposeStrategy: args.exposeStrategy,
          tokenConfigured: args.tokenConfigured,
        })),
        success: true,
      };
    }

    return {
      content: JSON.stringify(buildAIAppHealthSnapshot({
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
        aiContexts,
        connections,
        tabs,
        activeTabId,
        appLogReadResult,
        connectionFailureReadResult,
        lastRenderErrorSnapshot: buildAILastRenderErrorSnapshot(),
        keyword,
        connectionKeyword,
        lineLimit,
        includeLogLines: args.includeLogLines === true,
      })),
      success: true,
    };
  } catch (error: any) {
    return {
      content: `${toolName === 'inspect_ai_support_bundle' ? '生成 AI 支持包失败' : '读取 AI 应用健康总览失败'}: ${error?.message || error}`,
      success: false,
    };
  }
}
