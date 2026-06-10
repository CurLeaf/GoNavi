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

const buildEmptyLastRenderErrorSnapshot = (): AILastRenderErrorHealthSnapshot => ({
  hasError: false,
  summary: '当前还没有记录到 AI 消息渲染异常。',
  nextActions: [],
});

const summarizeAppLogSnapshot = (
  readResult: any,
  options: {
    keyword?: unknown;
    lineLimit: number;
    includeLogLines?: boolean;
  },
) => {
  if (!readResult?.success) {
    return buildUnreadLogSnapshot(
      `GoNavi 应用日志暂不可读: ${readResult?.message || '当前环境未提供日志读取能力'}`,
      options.lineLimit,
    );
  }

  const snapshot = buildAppLogSnapshot({
    readResult,
    keyword: options.keyword,
    lineLimit: options.lineLimit,
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
  },
) => {
  if (!readResult?.success) {
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
      message: `连接失败日志暂不可读: ${readResult?.message || '当前环境未提供日志读取能力'}`,
    };
  }

  return {
    readable: true,
    ...buildRecentConnectionFailureSnapshot({
      readResult,
      keyword: options.keyword,
      lineLimit: options.lineLimit,
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
}) => {
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
  });
  const lastRenderError = params.lastRenderErrorSnapshot || buildEmptyLastRenderErrorSnapshot();
  const connectionFailures = summarizeConnectionFailures(params.connectionFailureReadResult, {
    keyword: params.connectionKeyword ?? params.keyword,
    lineLimit,
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
    appendUnique(warnings, '当前无法读取 GoNavi 应用日志，启动异常和 MCP/连接错误缺少日志证据');
    appendUnique(nextActions, '确认当前运行环境支持读取 gonavi.log 后，再调用 inspect_app_logs 下钻日志细节');
  } else {
    const errorCount = Number(appLog.levelBreakdown.ERROR) || 0;
    const warnCount = Number(appLog.levelBreakdown.WARN) || 0;
    if (errorCount > 0) {
      appendUnique(warnings, `最近应用日志里有 ${errorCount} 条 ERROR，需要优先查看 inspect_app_logs`);
      appendUnique(nextActions, '调用 inspect_app_logs 查看最近 ERROR/WARN 原文，确认是否影响 AI、MCP 或数据库连接');
    } else if (warnCount > 0) {
      appendUnique(warnings, `最近应用日志里有 ${warnCount} 条 WARN，建议确认是否为已知可忽略警告`);
      appendUnique(nextActions, '如用户反馈不稳定，先调用 inspect_app_logs 查看 WARN 是否集中在 AI/MCP/连接链路');
    }
  }

  if (!connectionFailures.readable) {
    appendUnique(warnings, '当前无法读取连接失败日志，数据库连接冷却和验证失败缺少结构化证据');
  } else if (connectionFailures.failureEventCount > 0) {
    appendUnique(warnings, `最近识别到 ${connectionFailures.failureEventCount} 条连接失败/冷却记录`);
    appendUnique(nextActions, '调用 inspect_recent_connection_failures 查看最新连接失败根因，再决定是否检查当前连接或保存连接配置');
    connectionFailures.nextActions.forEach((action: string) => appendUnique(nextActions, action));
  }

  if (workspace.totalTabs === 0) {
    appendUnique(warnings, '当前工作区没有打开任何页签，AI 缺少可直接读取的活动编辑器上下文');
    appendUnique(nextActions, '如果要分析当前 SQL，先打开或选中目标 SQL 页签，再调用 inspect_active_tab');
  }

  if (lastRenderError.hasError) {
    appendUnique(warnings, '最近记录到 AI 消息渲染异常，可能影响回复气泡展示或 Markdown 渲染');
    appendUnique(nextActions, '调用 inspect_ai_last_render_error 查看最近一次气泡渲染异常的 messageId、内容预览和组件栈');
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
    ? '当前 AI 应用健康总览通过，AI 配置、日志、连接失败和工作区上下文都没有明显异常'
    : status === 'blocked'
      ? `当前 AI 应用健康存在 ${blockers.length} 个阻塞项，优先修复供应商和发送前置条件`
      : status === 'degraded'
        ? '当前 AI 应用健康存在运行期异常信号，建议先下钻日志或连接失败记录'
        : `当前 AI 应用健康整体可用，但还有 ${warnings.length} 个建议项`;

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
