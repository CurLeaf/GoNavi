import type {
  AIChatMessage,
  AIContextItem,
  AIMCPToolDescriptor,
  AISkillConfig,
  AIUserPromptSettings,
  SavedConnection,
  TabData,
} from '../../types';
import type { I18nParams } from '../../i18n';
import { BUILTIN_AI_TOOL_INFO, localizeBuiltinAIToolInfo } from '../../utils/aiToolRegistry';
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
  translate?: (key: string, params?: I18nParams) => string;
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
  translate: ((key: string, params?: I18nParams) => string) | undefined,
) => {
  if (typeof runtime?.readAppLogTail !== 'function') {
    return {
      success: false,
      message: translate?.('ai_chat.inspection.app_health.log_reading_unavailable')
        || 'The current runtime does not support reading GoNavi application logs',
    };
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
    translate,
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
      readLogTail(runtime, lineLimit, keyword, translate),
      readLogTail(runtime, lineLimit, connectionKeyword, translate),
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
          builtinTools: localizeBuiltinAIToolInfo(translate),
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
          lastRenderErrorSnapshot: buildAILastRenderErrorSnapshot(translate),
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
          translate,
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
        lastRenderErrorSnapshot: buildAILastRenderErrorSnapshot(translate),
        keyword,
        connectionKeyword,
        lineLimit,
        includeLogLines: args.includeLogLines === true,
        translate,
      })),
      success: true,
    };
  } catch (error: any) {
    const errorLabel = translate?.(
      toolName === 'inspect_ai_support_bundle'
        ? 'ai_chat.inspection.app_health.error.support_bundle_failed'
        : 'ai_chat.inspection.app_health.error.app_health_failed',
    ) || (toolName === 'inspect_ai_support_bundle'
      ? 'Failed to generate AI support bundle'
      : 'Failed to read AI application health overview');
    return {
      content: `${errorLabel}: ${error?.message || error}`,
      success: false,
    };
  }
}
