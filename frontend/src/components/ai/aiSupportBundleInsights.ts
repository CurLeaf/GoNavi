import type {
  AIChatMessage,
  AIContextItem,
  AIMCPClientInstallStatus,
  AIMCPServerConfig,
  AIMCPToolDescriptor,
  AIProviderConfig,
  AISafetyLevel,
  AISkillConfig,
  AIUserPromptSettings,
  SavedConnection,
  TabData,
} from '../../types';
import type { AIBuiltinToolInfo } from '../../utils/aiBuiltinToolInfo.types';
import { buildAIAppHealthSnapshot } from './aiAppHealthInsights';
import { buildAIMessageFlowSnapshot } from './aiChatSessionInsights';
import { buildAIContextBudgetSnapshot } from './aiContextBudgetInsights';
import { buildMCPRemoteAccessSnapshot } from './aiMCPRemoteAccessInsights';
import { buildAIToolCatalogSnapshot } from './aiToolCatalogInsights';

const appendUnique = (items: string[], value: string) => {
  const trimmed = String(value || '').trim();
  if (!trimmed || items.includes(trimmed)) {
    return;
  }
  items.push(trimmed);
};

export const buildAISupportBundleSnapshot = (params: {
  providers?: AIProviderConfig[];
  activeProviderId?: string | null;
  safetyLevel?: AISafetyLevel | string;
  contextLevel?: string;
  skills?: AISkillConfig[];
  mcpServers?: AIMCPServerConfig[];
  mcpClientStatuses?: AIMCPClientInstallStatus[];
  mcpTools?: AIMCPToolDescriptor[];
  dynamicModels?: string[];
  builtinTools?: AIBuiltinToolInfo[];
  builtinToolNames?: string[];
  userPromptSettings?: AIUserPromptSettings;
  activeContext?: { connectionId?: string | null; dbName?: string | null } | null;
  aiContexts?: Record<string, AIContextItem[]>;
  aiChatHistory?: Record<string, AIChatMessage[]>;
  aiChatSessions?: Array<{ id: string; title: string; updatedAt: number }>;
  activeSessionId?: string | null;
  sessionId?: unknown;
  connections?: SavedConnection[];
  tabs?: TabData[];
  activeTabId?: string | null;
  appLogReadResult?: any;
  connectionFailureReadResult?: any;
  lastRenderErrorSnapshot?: any;
  keyword?: unknown;
  connectionKeyword?: unknown;
  lineLimit?: unknown;
  includeLogLines?: boolean;
  includeMessageContent?: boolean;
  includeDetails?: boolean;
  publicUrl?: string;
  localAddr?: string;
  path?: string;
  exposeStrategy?: string;
  tokenConfigured?: boolean;
}) => {
  const aiChatHistory = params.aiChatHistory || {};
  const aiChatSessions = params.aiChatSessions || [];
  const requestedSessionId = String(params.sessionId || params.activeSessionId || '').trim();
  const appHealth = buildAIAppHealthSnapshot({
    providers: params.providers,
    activeProviderId: params.activeProviderId,
    safetyLevel: params.safetyLevel,
    contextLevel: params.contextLevel,
    skills: params.skills,
    mcpServers: params.mcpServers,
    mcpClientStatuses: params.mcpClientStatuses,
    mcpTools: params.mcpTools,
    dynamicModels: params.dynamicModels,
    builtinToolNames: params.builtinToolNames,
    userPromptSettings: params.userPromptSettings,
    activeContext: params.activeContext,
    aiContexts: params.aiContexts,
    connections: params.connections,
    tabs: params.tabs,
    activeTabId: params.activeTabId,
    appLogReadResult: params.appLogReadResult,
    connectionFailureReadResult: params.connectionFailureReadResult,
    lastRenderErrorSnapshot: params.lastRenderErrorSnapshot,
    keyword: params.keyword,
    connectionKeyword: params.connectionKeyword,
    lineLimit: params.lineLimit,
    includeLogLines: params.includeLogLines === true,
  });
  const messageFlow = buildAIMessageFlowSnapshot({
    aiChatSessions,
    aiChatHistory,
    activeSessionId: params.activeSessionId,
    sessionId: requestedSessionId,
    limit: 32,
    includeContent: params.includeMessageContent === true,
    previewLimit: 240,
  });
  const contextBudget = buildAIContextBudgetSnapshot({
    aiContexts: params.aiContexts,
    aiChatHistory,
    aiChatSessions,
    activeSessionId: params.activeSessionId,
    sessionId: requestedSessionId,
    messageLimit: 50,
    includeDetails: params.includeDetails === true,
    mcpTools: params.mcpTools,
    skills: params.skills,
    userPromptSettings: params.userPromptSettings,
  });
  const remoteAccess = buildMCPRemoteAccessSnapshot({
    mcpClientStatuses: params.mcpClientStatuses,
    publicUrl: params.publicUrl,
    localAddr: params.localAddr,
    path: params.path,
    exposeStrategy: params.exposeStrategy,
    tokenConfigured: params.tokenConfigured,
  });
  const toolCatalog = buildAIToolCatalogSnapshot({
    builtinTools: params.builtinTools || [],
    mcpTools: params.mcpTools,
    keyword: String(params.keyword || 'ai mcp 日志 连接 上下文').trim(),
    includeMCPTools: true,
    limit: 10,
  });

  const warnings: string[] = [];
  const nextActions: string[] = [];
  appHealth.warnings.forEach((item) => appendUnique(warnings, item));
  contextBudget.warnings.forEach((item) => appendUnique(warnings, item));
  messageFlow.warnings.forEach((item) => appendUnique(warnings, item));
  remoteAccess.warnings.forEach((item) => appendUnique(warnings, item));
  appHealth.nextActions.forEach((item) => appendUnique(nextActions, item));
  contextBudget.nextActions.forEach((item) => appendUnique(nextActions, item));
  messageFlow.nextActions.forEach((item) => appendUnique(nextActions, item));
  remoteAccess.nextActions.forEach((item) => appendUnique(nextActions, item));

  return {
    kind: 'ai_support_bundle',
    message: '已生成 GoNavi AI 支持包快照，可用于排查 AI、MCP、日志、连接和上下文体量问题',
    privacy: {
      databasePasswordsIncluded: false,
      providerSecretsIncluded: false,
      mcpEnvValuesIncluded: false,
      logLinesIncluded: params.includeLogLines === true,
      messageContentIncluded: params.includeMessageContent === true,
      note: '默认只返回摘要和结构化计数；只有显式开启 includeLogLines/includeMessageContent 时才附带日志或消息内容预览。',
    },
    summary: {
      appHealthStatus: appHealth.status,
      appHealthReady: appHealth.ready,
      aiSetupStatus: appHealth.summary.aiSetupStatus,
      chatReady: appHealth.summary.chatReady,
      contextRiskLevel: contextBudget.riskLevel,
      estimatedInputChars: contextBudget.estimatedInputChars,
      messageFlowWarningCount: messageFlow.warnings.length,
      unresolvedToolCallCount: messageFlow.unresolvedToolCallCount,
      consecutiveAssistantPairCount: messageFlow.consecutiveAssistantPairCount,
      appLogErrorCount: appHealth.summary.appLogErrorCount,
      appLogWarnCount: appHealth.summary.appLogWarnCount,
      recentConnectionFailureCount: appHealth.summary.recentConnectionFailureCount,
      mcpServerCount: appHealth.summary.mcpServerCount,
      discoveredMCPToolCount: appHealth.summary.discoveredMCPToolCount,
      remoteMCPPublicUrl: remoteAccess.endpoint.publicUrl,
      toolCatalogReturned: toolCatalog.returned,
    },
    warnings,
    nextActions,
    appHealth,
    messageFlow,
    contextBudget,
    remoteAccess,
    toolCatalog,
  };
};
