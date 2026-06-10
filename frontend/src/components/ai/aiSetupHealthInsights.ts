import type {
  AIContextItem,
  AIMCPClientInstallStatus,
  AIMCPServerConfig,
  AIMCPToolDescriptor,
  AIProviderConfig,
  AISafetyLevel,
  AISkillConfig,
  AIUserPromptSettings,
} from '../../types';
import { buildAIChatReadinessSnapshot } from './aiChatReadiness';
import { buildAIGuidanceSnapshot } from './aiPromptInsights';
import { buildAIProviderSnapshot } from './aiProviderInsights';
import { buildAIRuntimeSnapshot } from './aiRuntimeInsights';
import { buildMCPSetupSnapshot } from './aiMCPInsights';

type AISetupHealthStatus = 'ready' | 'needs_attention' | 'blocked';

const appendUnique = (items: string[], value: string) => {
  const trimmed = String(value || '').trim();
  if (!trimmed || items.includes(trimmed)) {
    return;
  }
  items.push(trimmed);
};

const summarizeSkillNames = (skills: Array<{ name?: string }>) =>
  skills
    .map((skill) => String(skill?.name || '').trim())
    .filter(Boolean)
    .slice(0, 6);

export const buildAISetupHealthSnapshot = (params: {
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
  activeContextItems?: AIContextItem[];
}) => {
  const activeContextItems = Array.isArray(params.activeContextItems) ? params.activeContextItems : [];
  const runtimeSnapshot = buildAIRuntimeSnapshot({
    providers: params.providers,
    activeProviderId: params.activeProviderId,
    safetyLevel: params.safetyLevel,
    contextLevel: params.contextLevel,
    skills: params.skills,
    mcpTools: params.mcpTools,
    dynamicModels: params.dynamicModels,
    builtinToolNames: params.builtinToolNames,
  });
  const providerSnapshot = buildAIProviderSnapshot({
    providers: params.providers,
    activeProviderId: params.activeProviderId,
    dynamicModels: params.dynamicModels,
  });
  const chatReadiness = buildAIChatReadinessSnapshot({
    providers: params.providers,
    activeProviderId: params.activeProviderId,
    dynamicModels: params.dynamicModels,
    activeContext: params.activeContext,
    activeContextItems,
  });
  const mcpSnapshot = buildMCPSetupSnapshot({
    mcpServers: params.mcpServers,
    mcpClientStatuses: params.mcpClientStatuses,
    mcpTools: params.mcpTools,
  });
  const guidanceSnapshot = buildAIGuidanceSnapshot({
    userPromptSettings: params.userPromptSettings,
    skills: params.skills,
  });

  const blockers: string[] = [];
  const warnings: string[] = [];
  const nextActions: string[] = [];

  if (!providerSnapshot.hasActiveProvider) {
    appendUnique(blockers, '当前没有活动 AI 供应商');
    appendUnique(nextActions, '先在 AI 设置里添加并选中一个活动供应商');
  }

  const activeProviderIssues = providerSnapshot.activeProvider?.issues || [];
  if (activeProviderIssues.includes('missing_secret')) {
    appendUnique(blockers, '当前活动供应商缺少 API Key / Secret');
    appendUnique(nextActions, '补齐当前活动供应商的密钥');
  }
  if (activeProviderIssues.includes('missing_base_url')) {
    appendUnique(blockers, '当前活动供应商缺少接口地址');
    appendUnique(nextActions, '补齐当前活动供应商的 baseUrl');
  }
  if (activeProviderIssues.includes('missing_selected_model') || chatReadiness.status === 'missing_model') {
    appendUnique(blockers, '当前活动供应商还没有选中模型');
    appendUnique(nextActions, '为当前活动供应商选择一个可用模型');
  }
  if (chatReadiness.status === 'loading_models') {
    appendUnique(warnings, '当前正在加载模型列表，模型选择尚未完成');
    appendUnique(nextActions, '等待模型列表加载完成后重新确认活动模型');
  }

  if (mcpSnapshot.serverCount === 0) {
    appendUnique(warnings, '当前还没有配置任何 MCP 服务');
    appendUnique(nextActions, '如需扩展 AI 工具能力，可新增并测试至少 1 个 MCP 服务');
  }
  mcpSnapshot.warnings.forEach((warning) => appendUnique(warnings, warning));
  mcpSnapshot.nextActions.forEach((action) => appendUnique(nextActions, action));
  if (mcpSnapshot.currentClientCount === 0) {
    appendUnique(warnings, 'Claude Code / Codex 还没有本机客户端接入当前 GoNavi MCP，OpenClaw/Hermans 需要远程桥接');
    appendUnique(nextActions, '如需让外部 Agent 使用 GoNavi MCP，本机客户端可接入 Claude Code/Codex，云端 Agent 先配置远程 MCP 桥接');
  }
  if (mcpSnapshot.enabledServerCount > 0 && runtimeSnapshot.mcpToolCount === 0) {
    appendUnique(warnings, '已启用 MCP 服务，但当前还没有发现可用 MCP 工具');
    appendUnique(nextActions, '逐条测试已启用的 MCP 服务，确认命令、参数和环境变量能正确发现工具');
  }
  if (guidanceSnapshot.customPromptCount === 0 && guidanceSnapshot.enabledSkillCount === 0) {
    appendUnique(warnings, '当前没有自定义提示词或 Skills');
    appendUnique(nextActions, '如需固定回答风格或工作流，可补充自定义提示词或启用 Skills');
  }
  if (chatReadiness.ready && params.activeContext?.connectionId && activeContextItems.length === 0) {
    appendUnique(warnings, '当前聊天已就绪，但还没有挂载任何表结构上下文');
    appendUnique(nextActions, '如需更准的 SQL / 结构建议，可先把目标表结构关联到 AI 上下文');
  }

  const status: AISetupHealthStatus = blockers.length > 0
    ? 'blocked'
    : warnings.length > 0
      ? 'needs_attention'
      : 'ready';

  const message = status === 'ready'
    ? '当前 AI 配置体检通过，供应商、聊天前置和 MCP 运行链路都处于可用状态'
    : status === 'blocked'
      ? `当前 AI 配置存在 ${blockers.length} 个阻塞项，优先修复活动供应商和聊天前置条件`
      : `当前 AI 配置整体可用，但还有 ${warnings.length} 个建议项可以继续优化`;

  return {
    status,
    ready: status === 'ready',
    message,
    blockers,
    warnings,
    nextActions,
    summary: {
      providerCount: providerSnapshot.providerCount,
      readyProviderCount: providerSnapshot.readyProviderCount,
      hasActiveProvider: providerSnapshot.hasActiveProvider,
      activeProviderName: providerSnapshot.activeProvider?.name || providerSnapshot.activeProvider?.id || '',
      chatStatus: chatReadiness.status,
      chatReady: chatReadiness.ready,
      safetyLevel: runtimeSnapshot.safetyLevel,
      safetyLabel: runtimeSnapshot.safetyLabel,
      contextLevel: runtimeSnapshot.contextLevel,
      contextLabel: runtimeSnapshot.contextLabel,
      enabledSkillCount: guidanceSnapshot.enabledSkillCount,
      customPromptCount: guidanceSnapshot.customPromptCount,
      mcpServerCount: mcpSnapshot.serverCount,
      enabledMCPServerCount: mcpSnapshot.enabledServerCount,
      mcpServerConfigurationIssueCount: mcpSnapshot.serverConfigurationIssueCount,
      mcpServersWithConfigurationErrors: mcpSnapshot.serversWithConfigurationErrors,
      installedExternalClientCount: mcpSnapshot.installedClientCount,
      currentExternalClientCount: mcpSnapshot.currentClientCount,
      discoveredMCPToolCount: mcpSnapshot.discoveredMCPToolCount,
      totalAvailableToolCount: runtimeSnapshot.totalAvailableToolCount,
      contextAttachedCount: chatReadiness.contextAttachedCount,
    },
    runtime: runtimeSnapshot,
    provider: providerSnapshot,
    chatReadiness,
    mcp: mcpSnapshot,
    guidance: {
      ...guidanceSnapshot,
      enabledSkillPreview: summarizeSkillNames(guidanceSnapshot.enabledSkills),
    },
  };
};
