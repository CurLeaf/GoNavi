import type {
  I18nParams,
} from '../../i18n';
import {
  t as translateCatalog,
} from '../../i18n';
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
  TabData,
} from '../../types';
import { buildAISetupHealthSnapshot } from './aiSetupHealthInsights';
import { buildAppLogSnapshot } from './aiAppLogInsights';
import { buildRecentConnectionFailureSnapshot } from './aiConnectionFailureInsights';
import { buildActiveTabSnapshot, buildWorkspaceTabsSnapshot } from './aiWorkspaceInsights';

type AIAppHealthStatus = 'ready' | 'needs_attention' | 'degraded' | 'blocked';
type AIInspectionTranslator = (key: string, params?: I18nParams) => string;

interface AILastRenderErrorHealthSnapshot {
  hasError: boolean;
  summary: string;
  messageId?: string;
  role?: string;
  recordedAt?: number | null;
  contentPreview?: string;
  errorMessage?: string;
  stackPreview?: string;
  componentStackPreview?: string;
  nextActions?: string[];
}

const DEFAULT_APP_HEALTH_LOG_LIMIT = 120;
const MAX_APP_HEALTH_LOG_LIMIT = 240;

const appendUnique = (items: string[], value: string) => {
  const trimmed = String(value || '').trim();
  if (!trimmed || items.includes(trimmed)) {
    return;
  }
  items.push(trimmed);
};

const translateInspectionCopy = (
  translate: AIInspectionTranslator | undefined,
  key: string,
  fallback: string,
  params?: I18nParams,
): string => {
  const t = translate || ((catalogKey, catalogParams) => translateCatalog(catalogKey, catalogParams, 'en-US'));
  const translated = t(key, params);
  return translated && translated !== key ? translated : fallback;
};

const normalizeAppHealthLogLimit = (value: unknown): number => {
  const normalized = Math.floor(Number(value) || DEFAULT_APP_HEALTH_LOG_LIMIT);
  if (normalized < 1) return 1;
  if (normalized > MAX_APP_HEALTH_LOG_LIMIT) return MAX_APP_HEALTH_LOG_LIMIT;
  return normalized;
};

const resolveActiveContextKey = (activeContext?: { connectionId?: string | null; dbName?: string | null } | null): string =>
  activeContext?.connectionId ? `${activeContext.connectionId}:${activeContext.dbName || ''}` : 'default';

const buildUnreadLogSnapshot = (message: string, lineLimit: number) => ({
  readable: false,
  logPath: '',
  requestedLineLimit: lineLimit,
  returnedLineCount: 0,
  fileWindowTruncated: false,
  matchedLinesTruncated: false,
  levelBreakdown: {
    INFO: 0,
    WARN: 0,
    ERROR: 0,
    OTHER: 0,
  },
  hasWarnings: false,
  hasErrors: false,
  lines: [] as string[],
  linesOmitted: false,
  message,
});

const buildEmptyLastRenderErrorSnapshot = (
  translate?: AIInspectionTranslator,
): AILastRenderErrorHealthSnapshot => ({
  hasError: false,
  summary: translateInspectionCopy(
    translate,
    'ai_chat.inspection.app_health.last_render_error.empty_summary',
    'No AI message render errors have been recorded yet.',
  ),
  nextActions: [],
});

const summarizeAppLogSnapshot = (
  readResult: any,
  options: {
    keyword?: unknown;
    lineLimit: number;
    includeLogLines?: boolean;
    translate?: AIInspectionTranslator;
  },
) => {
  if (!readResult?.success) {
    const detail = readResult?.message || translateInspectionCopy(
      options.translate,
      'ai_chat.inspection.app_health.log_reading_unavailable',
      'The current runtime does not provide log reading capability',
    );
    return buildUnreadLogSnapshot(
      translateInspectionCopy(
        options.translate,
        'ai_chat.inspection.app_health.app_log.unread',
        `GoNavi application logs are not readable: ${detail}`,
        { detail },
      ),
      options.lineLimit,
    );
  }

  const snapshot = buildAppLogSnapshot({
    readResult,
    keyword: options.keyword,
    lineLimit: options.lineLimit,
    translate: options.translate,
  });
  return {
    readable: true,
    ...snapshot,
    lines: options.includeLogLines ? snapshot.lines : [],
    linesOmitted: !options.includeLogLines && snapshot.lines.length > 0,
  };
};

const summarizeConnectionFailures = (
  readResult: any,
  options: {
    keyword?: unknown;
    lineLimit: number;
    translate?: AIInspectionTranslator;
  },
) => {
  if (!readResult?.success) {
    const detail = readResult?.message || translateInspectionCopy(
      options.translate,
      'ai_chat.inspection.app_health.log_reading_unavailable',
      'The current runtime does not provide log reading capability',
    );
    return {
      readable: false,
      logPath: '',
      keyword: String(options.keyword || '').trim(),
      requestedLineLimit: options.lineLimit,
      returnedLineCount: 0,
      fileWindowTruncated: false,
      matchedLinesTruncated: false,
      failureEventCount: 0,
      hasRecentFailures: false,
      primaryCategory: '',
      primaryCategoryLabel: '',
      cooldownHitCount: 0,
      validationFailureCount: 0,
      sshFailureCount: 0,
      categorySummary: [],
      addresses: [],
      latestFailureAt: '',
      latestFailure: null,
      recentFailures: [],
      nextActions: [] as string[],
      message: translateInspectionCopy(
        options.translate,
        'ai_chat.inspection.app_health.connection_failures.unread',
        `Connection failure logs are not readable: ${detail}`,
        { detail },
      ),
    };
  }

  return {
    readable: true,
    ...buildRecentConnectionFailureSnapshot({
      readResult,
      keyword: options.keyword,
      lineLimit: options.lineLimit,
      translate: options.translate,
    }),
  };
};

export const buildAIAppHealthSnapshot = (params: {
  providers?: AIProviderConfig[];
  activeProviderId?: string | null;
  safetyLevel?: AISafetyLevel | string;
  contextLevel?: string;
  skills?: AISkillConfig[];
  mcpServers?: AIMCPServerConfig[];
  mcpClientStatuses?: AIMCPClientInstallStatus[];
  mcpTools?: AIMCPToolDescriptor[];
  dynamicModels?: string[];
  builtinToolNames?: string[];
  userPromptSettings?: AIUserPromptSettings;
  activeContext?: { connectionId?: string | null; dbName?: string | null } | null;
  aiContexts?: Record<string, AIContextItem[]>;
  connections?: SavedConnection[];
  tabs?: TabData[];
  activeTabId?: string | null;
  appLogReadResult?: any;
  connectionFailureReadResult?: any;
  lastRenderErrorSnapshot?: AILastRenderErrorHealthSnapshot;
  keyword?: unknown;
  connectionKeyword?: unknown;
  lineLimit?: unknown;
  includeLogLines?: boolean;
  translate?: AIInspectionTranslator;
}) => {
  const translate = params.translate;
  const connections = Array.isArray(params.connections) ? params.connections : [];
  const tabs = Array.isArray(params.tabs) ? params.tabs : [];
  const lineLimit = normalizeAppHealthLogLimit(params.lineLimit);
  const activeContextKey = resolveActiveContextKey(params.activeContext);
  const activeContextItems = params.aiContexts?.[activeContextKey] || [];
  const setupHealth = buildAISetupHealthSnapshot({
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
    activeContextItems,
  });
  const appLog = summarizeAppLogSnapshot(params.appLogReadResult, {
    keyword: params.keyword,
    lineLimit,
    includeLogLines: params.includeLogLines === true,
    translate,
  });
  const lastRenderError = params.lastRenderErrorSnapshot || buildEmptyLastRenderErrorSnapshot(translate);
  const connectionFailures = summarizeConnectionFailures(params.connectionFailureReadResult, {
    keyword: params.connectionKeyword ?? params.keyword,
    lineLimit,
    translate,
  });
  const workspace = buildWorkspaceTabsSnapshot({
    tabs,
    activeTabId: params.activeTabId,
    connections,
    includeContent: false,
    limit: 8,
  });
  const activeTab = buildActiveTabSnapshot({
    tabs,
    activeTabId: params.activeTabId,
    connections,
    includeContent: false,
  });
  const activeTabTitle = activeTab.hasActiveTab && 'title' in activeTab ? activeTab.title : '';
  const activeTabType = activeTab.hasActiveTab && 'type' in activeTab ? activeTab.type : '';

  const blockers = [...setupHealth.blockers];
  const warnings = [...setupHealth.warnings];
  const nextActions = [...setupHealth.nextActions];

  if (!appLog.readable) {
    appendUnique(warnings, translateInspectionCopy(
      translate,
      'ai_chat.inspection.app_health.warning.app_log_unread',
      'GoNavi application logs cannot be read, so startup exceptions and MCP/connection errors lack log evidence',
    ));
    appendUnique(nextActions, translateInspectionCopy(
      translate,
      'ai_chat.inspection.app_health.next_action.enable_app_log_reading',
      'Confirm the current runtime can read gonavi.log, then call inspect_app_logs for log details',
    ));
  } else {
    const errorCount = Number(appLog.levelBreakdown.ERROR) || 0;
    const warnCount = Number(appLog.levelBreakdown.WARN) || 0;
    if (errorCount > 0) {
      appendUnique(warnings, translateInspectionCopy(
        translate,
        'ai_chat.inspection.app_health.warning.app_log_errors',
        `Recent application logs contain ${errorCount} ERROR entries; inspect_app_logs should be checked first`,
        { count: errorCount },
      ));
      appendUnique(nextActions, translateInspectionCopy(
        translate,
        'ai_chat.inspection.app_health.next_action.inspect_app_log_errors',
        'Call inspect_app_logs to review recent raw ERROR/WARN lines and confirm whether they affect AI, MCP, or database connections',
      ));
    } else if (warnCount > 0) {
      appendUnique(warnings, translateInspectionCopy(
        translate,
        'ai_chat.inspection.app_health.warning.app_log_warnings',
        `Recent application logs contain ${warnCount} WARN entries; confirm whether they are known ignorable warnings`,
        { count: warnCount },
      ));
      appendUnique(nextActions, translateInspectionCopy(
        translate,
        'ai_chat.inspection.app_health.next_action.inspect_app_log_warnings',
        'If the user reports instability, call inspect_app_logs first to see whether WARN lines cluster around AI/MCP/connection paths',
      ));
    }
  }

  if (!connectionFailures.readable) {
    appendUnique(warnings, translateInspectionCopy(
      translate,
      'ai_chat.inspection.app_health.warning.connection_failures_unread',
      'Connection failure logs cannot be read, so database connection cooldown and validation failures lack structured evidence',
    ));
  } else if (connectionFailures.failureEventCount > 0) {
    appendUnique(warnings, translateInspectionCopy(
      translate,
      'ai_chat.inspection.app_health.warning.connection_failures_recent',
      `Recently detected ${connectionFailures.failureEventCount} connection failure/cooldown records`,
      { count: connectionFailures.failureEventCount },
    ));
    appendUnique(nextActions, translateInspectionCopy(
      translate,
      'ai_chat.inspection.app_health.next_action.inspect_recent_connection_failures',
      'Call inspect_recent_connection_failures to review the latest connection failure cause, then decide whether to inspect the current connection or saved connection config',
    ));
    connectionFailures.nextActions.forEach((action: string) => appendUnique(nextActions, action));
  }

  if (workspace.totalTabs === 0) {
    appendUnique(warnings, translateInspectionCopy(
      translate,
      'ai_chat.inspection.app_health.warning.no_workspace_tabs',
      'No tabs are open in the current workspace, so AI has no active editor context to read directly',
    ));
    appendUnique(nextActions, translateInspectionCopy(
      translate,
      'ai_chat.inspection.app_health.next_action.open_sql_tab',
      'To analyze the current SQL, open or select the target SQL tab first, then call inspect_active_tab',
    ));
  }

  if (lastRenderError.hasError) {
    appendUnique(warnings, translateInspectionCopy(
      translate,
      'ai_chat.inspection.app_health.warning.last_render_error',
      'A recent AI message render error was recorded and may affect reply bubble display or Markdown rendering',
    ));
    appendUnique(nextActions, translateInspectionCopy(
      translate,
      'ai_chat.inspection.app_health.next_action.inspect_last_render_error',
      'Call inspect_ai_last_render_error to review the latest bubble render error messageId, content preview, and component stack',
    ));
    (lastRenderError.nextActions || []).forEach((action) => appendUnique(nextActions, action));
  }

  const status: AIAppHealthStatus = blockers.length > 0
    ? 'blocked'
    : connectionFailures.failureEventCount > 0 || Number(appLog.levelBreakdown.ERROR) > 0 || lastRenderError.hasError
      ? 'degraded'
      : warnings.length > 0
        ? 'needs_attention'
        : 'ready';

  const message = status === 'ready'
    ? translateInspectionCopy(
      translate,
      'ai_chat.inspection.app_health.message.ready',
      'The AI application health overview passed; AI configuration, logs, connection failures, and workspace context show no obvious issues',
    )
    : status === 'blocked'
      ? translateInspectionCopy(
        translate,
        'ai_chat.inspection.app_health.message.blocked',
        `AI application health has ${blockers.length} blockers; fix provider and send prerequisites first`,
        { count: blockers.length },
      )
      : status === 'degraded'
        ? translateInspectionCopy(
          translate,
          'ai_chat.inspection.app_health.message.degraded',
          'AI application health has runtime anomaly signals; drill into logs or connection failure records first',
        )
        : translateInspectionCopy(
          translate,
          'ai_chat.inspection.app_health.message.needs_attention',
          `AI application health is usable overall, but still has ${warnings.length} recommendations`,
          { count: warnings.length },
        );

  return {
    status,
    ready: status === 'ready',
    message,
    blockers,
    warnings,
    nextActions,
    summary: {
      aiSetupStatus: setupHealth.status,
      chatReady: setupHealth.summary.chatReady,
      hasActiveProvider: setupHealth.summary.hasActiveProvider,
      activeProviderName: setupHealth.summary.activeProviderName,
      safetyLevel: setupHealth.summary.safetyLevel,
      contextLevel: setupHealth.summary.contextLevel,
      providerCount: setupHealth.summary.providerCount,
      enabledSkillCount: setupHealth.summary.enabledSkillCount,
      customPromptCount: setupHealth.summary.customPromptCount,
      mcpServerCount: setupHealth.summary.mcpServerCount,
      enabledMCPServerCount: setupHealth.summary.enabledMCPServerCount,
      discoveredMCPToolCount: setupHealth.summary.discoveredMCPToolCount,
      totalAvailableToolCount: setupHealth.summary.totalAvailableToolCount,
      connectionCount: connections.length,
      activeContextConnectionId: params.activeContext?.connectionId || '',
      activeContextDbName: params.activeContext?.dbName || '',
      workspaceTabCount: workspace.totalTabs,
      activeTabId: params.activeTabId || '',
      activeTabTitle,
      activeTabType,
      appLogReadable: appLog.readable,
      appLogErrorCount: Number(appLog.levelBreakdown.ERROR) || 0,
      appLogWarnCount: Number(appLog.levelBreakdown.WARN) || 0,
      recentConnectionFailureCount: connectionFailures.failureEventCount,
      primaryConnectionFailureLabel: connectionFailures.primaryCategoryLabel,
      hasLastAIMessageRenderError: lastRenderError.hasError,
      lastAIMessageRenderErrorId: lastRenderError.messageId || '',
    },
    aiSetup: {
      status: setupHealth.status,
      ready: setupHealth.ready,
      message: setupHealth.message,
      blockers: setupHealth.blockers,
      warnings: setupHealth.warnings,
      nextActions: setupHealth.nextActions,
      summary: setupHealth.summary,
    },
    appLog,
    lastRenderError,
    connectionFailures,
    workspace,
    activeTab,
  };
};
