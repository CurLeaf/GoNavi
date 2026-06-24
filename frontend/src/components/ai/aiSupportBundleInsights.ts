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
import type { I18nParams } from '../../i18n';
import { buildAIAppHealthSnapshot } from './aiAppHealthInsights';
import { buildAIMessageFlowSnapshot } from './aiChatSessionInsights';
import { buildAIContextBudgetSnapshot } from './aiContextBudgetInsights';
import { translateInspectionCopy } from './aiInspectionI18n';
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
  translate?: (key: string, params?: I18nParams) => string;
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
    translate: params.translate,
  });
  const messageFlow = buildAIMessageFlowSnapshot({
    aiChatSessions,
    aiChatHistory,
    activeSessionId: params.activeSessionId,
    sessionId: requestedSessionId,
    limit: 32,
    includeContent: params.includeMessageContent === true,
    previewLimit: 240,
    translate: params.translate,
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
    translate: params.translate,
  });
  const remoteAccess = buildMCPRemoteAccessSnapshot({
    mcpClientStatuses: params.mcpClientStatuses,
    publicUrl: params.publicUrl,
    localAddr: params.localAddr,
    path: params.path,
    exposeStrategy: params.exposeStrategy,
    tokenConfigured: params.tokenConfigured,
    translate: params.translate,
  });
  const toolCatalog = buildAIToolCatalogSnapshot({
    builtinTools: params.builtinTools || [],
    mcpTools: params.mcpTools,
    keyword: String(params.keyword || 'ai mcp logs connections context').trim(),
    includeMCPTools: true,
    limit: 10,
    translate: params.translate,
  });
  const supportBundleMessage = translateInspectionCopy(
    params.translate,
    'ai_chat.inspection.support_bundle.message.ready',
    'Generated a GoNavi AI support bundle snapshot for diagnosing AI, MCP, logs, connections, and context size issues',
  );
  const privacyNote = translateInspectionCopy(
    params.translate,
    'ai_chat.inspection.support_bundle.privacy.note',
    'By default, only summaries and structured counts are returned; log lines or message previews are included only when includeLogLines/includeMessageContent is explicitly enabled.',
  );

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
    message: supportBundleMessage,
    privacy: {
      databasePasswordsIncluded: false,
      providerSecretsIncluded: false,
      mcpEnvValuesIncluded: false,
      logLinesIncluded: params.includeLogLines === true,
      messageContentIncluded: params.includeMessageContent === true,
      note: privacyNote,
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
