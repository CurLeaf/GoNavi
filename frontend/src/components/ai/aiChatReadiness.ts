import type { AIContextItem, AIProviderConfig } from '../../types';

export type AIChatReadinessActionKey = 'open-settings' | 'reload-models';

export type AIChatReadinessStatus =
  | 'missing_provider'
  | 'provider_incomplete'
  | 'missing_model'
  | 'loading_models'
  | 'ready';

export type AIChatReadinessIssue =
  | 'missing_secret'
  | 'missing_base_url'
  | 'missing_selected_model';

export interface AIChatReadinessSnapshot {
  status: AIChatReadinessStatus;
  ready: boolean;
  severity: 'success' | 'warning' | 'error' | 'info';
  label: string;
  title: string;
  description: string;
  providerCount: number;
  hasActiveProvider: boolean;
  hasConnectionContext: boolean;
  contextAttachedCount: number;
  selectableModelCount: number;
  issues: AIChatReadinessIssue[];
  action?: {
    key: AIChatReadinessActionKey;
    label: string;
  };
  activeProvider: null | {
    id: string;
    name: string;
    type: string;
    model: string;
    baseUrl: string;
    baseUrlHost: string;
    hasSecret: boolean;
    declaredModelCount: number;
    dynamicModelCount: number;
  };
  message: string;
}

const trimText = (value: unknown): string => String(value || '').trim();

const getProviderHost = (baseUrl: string): string => {
  const normalized = trimText(baseUrl);
  if (!normalized) {
    return '';
  }
  try {
    return new URL(normalized).host;
  } catch {
    return '';
  }
};

const hasProviderSecret = (provider: AIProviderConfig): boolean =>
  provider.hasSecret ?? Boolean(provider.secretRef || provider.apiKey);

const isBaseURLOptionalProvider = (provider: AIProviderConfig): boolean =>
  provider.type === 'custom' && trimText(provider.apiFormat) === 'codebuddy-cli';

const isModelOptionalProvider = (provider: AIProviderConfig): boolean =>
  provider.type === 'custom' && trimText(provider.apiFormat) === 'codebuddy-cli';

const getSelectedProvider = (params: {
  providers?: AIProviderConfig[];
  activeProvider?: AIProviderConfig | null;
  activeProviderId?: string | null;
}): AIProviderConfig | null => {
  if (params.activeProvider) {
    return params.activeProvider;
  }
  const providers = Array.isArray(params.providers) ? params.providers : [];
  const activeProviderId = trimText(params.activeProviderId);
  if (!activeProviderId) {
    return null;
  }
  return providers.find((provider) => provider.id === activeProviderId) || null;
};

export const formatAIChatProviderIssueLabels = (issues: AIChatReadinessIssue[]): string[] => {
  const issueLabels: Record<AIChatReadinessIssue, string> = {
    missing_secret: '密钥',
    missing_base_url: '接口地址',
    missing_selected_model: '模型',
  };
  return issues
    .map((issue) => issueLabels[issue])
    .filter(Boolean);
};

export const buildAIChatReadinessSnapshot = (params: {
  providers?: AIProviderConfig[];
  activeProvider?: AIProviderConfig | null;
  activeProviderId?: string | null;
  dynamicModels?: string[];
  loadingModels?: boolean;
  activeContext?: { connectionId?: string | null; dbName?: string | null } | null;
  activeContextItems?: AIContextItem[];
}): AIChatReadinessSnapshot => {
  const providers = Array.isArray(params.providers) ? params.providers : [];
  const activeProvider = getSelectedProvider(params);
  const providerCount = providers.length > 0 ? providers.length : (activeProvider ? 1 : 0);
  const dynamicModels = (Array.isArray(params.dynamicModels) ? params.dynamicModels : [])
    .map((item) => trimText(item))
    .filter(Boolean);
  const activeContextItems = Array.isArray(params.activeContextItems) ? params.activeContextItems : [];
  const declaredModels = activeProvider?.models?.map((item) => trimText(item)).filter(Boolean) || [];
  const selectableModelCount = dynamicModels.length > 0 ? dynamicModels.length : declaredModels.length;
  const hasConnectionContext = Boolean(trimText(params.activeContext?.connectionId));
  const contextAttachedCount = activeContextItems.length;

  if (!activeProvider) {
    const title = providers.length > 0
      ? '已配置供应商，但当前没有选中生效项'
      : '还没有配置 AI 供应商';
    const description = providers.length > 0
      ? '先在 AI 设置里选中一个活动供应商，然后再发送。'
      : '先在 AI 设置里添加并启用一个模型供应商。';
    return {
      status: 'missing_provider',
      ready: false,
      severity: 'warning',
      label: '未就绪',
      title,
      description,
      providerCount,
      hasActiveProvider: false,
      hasConnectionContext,
      contextAttachedCount,
      selectableModelCount: 0,
      issues: [],
      action: {
        key: 'open-settings',
        label: '打开 AI 设置',
      },
      activeProvider: null,
      message: `${title}。${description}`,
    };
  }

  const issues: AIChatReadinessIssue[] = [];
  if (!hasProviderSecret(activeProvider)) {
    issues.push('missing_secret');
  }
  if (!isBaseURLOptionalProvider(activeProvider) && !trimText(activeProvider.baseUrl)) {
    issues.push('missing_base_url');
  }
  if (!isModelOptionalProvider(activeProvider) && !trimText(activeProvider.model)) {
    issues.push('missing_selected_model');
  }

  const providerSummary = {
    id: activeProvider.id,
    name: trimText(activeProvider.name),
    type: activeProvider.type,
    model: trimText(activeProvider.model),
    baseUrl: trimText(activeProvider.baseUrl),
    baseUrlHost: getProviderHost(activeProvider.baseUrl),
    hasSecret: hasProviderSecret(activeProvider),
    declaredModelCount: declaredModels.length,
    dynamicModelCount: dynamicModels.length,
  };

  const blockingProviderIssues = issues.filter((issue) => issue !== 'missing_selected_model');
  if (blockingProviderIssues.length > 0) {
    const missingLabels = formatAIChatProviderIssueLabels(blockingProviderIssues);
    const title = `${providerSummary.name || providerSummary.id || '当前供应商'} 还缺少 ${missingLabels.join('、')}`;
    const description = '先补全供应商配置再发送，避免请求直接失败。';
    return {
      status: 'provider_incomplete',
      ready: false,
      severity: 'error',
      label: '需修复',
      title,
      description,
      providerCount,
      hasActiveProvider: true,
      hasConnectionContext,
      contextAttachedCount,
      selectableModelCount,
      issues,
      action: {
        key: 'open-settings',
        label: '修复供应商配置',
      },
      activeProvider: providerSummary,
      message: `${title}。${description}`,
    };
  }

  if (!providerSummary.model && !isModelOptionalProvider(activeProvider)) {
    const title = params.loadingModels
      ? `正在加载 ${providerSummary.name || providerSummary.id || '当前供应商'} 的模型列表`
      : `先为 ${providerSummary.name || providerSummary.id || '当前供应商'} 选择一个模型`;
    const description = selectableModelCount > 0
      ? `当前已发现 ${selectableModelCount} 个可选模型，选中后即可发送。`
      : '如果列表为空，请检查供应商入口、密钥和模型权限。';
    return {
      status: params.loadingModels ? 'loading_models' : 'missing_model',
      ready: false,
      severity: params.loadingModels ? 'info' : 'warning',
      label: params.loadingModels ? '加载中' : '未选模型',
      title,
      description,
      providerCount,
      hasActiveProvider: true,
      hasConnectionContext,
      contextAttachedCount,
      selectableModelCount,
      issues,
      action: {
        key: 'reload-models',
        label: '重新加载模型',
      },
      activeProvider: providerSummary,
      message: `${title}。${description}`,
    };
  }

  const resolvedProviderLabel = providerSummary.name || providerSummary.id;
  const resolvedModelLabel = providerSummary.model || (isModelOptionalProvider(activeProvider) ? '自动选择' : '');
  const title = resolvedModelLabel
    ? `AI 已就绪：${resolvedProviderLabel} / ${resolvedModelLabel}`
    : `AI 已就绪：${resolvedProviderLabel}`;
  const description = contextAttachedCount > 0
    ? `当前已关联 ${contextAttachedCount} 张表结构上下文，可直接发送。`
    : hasConnectionContext
      ? '已选中当前连接；如需更准的数据库语义，建议再关联表结构上下文。'
      : '可直接发送；如需更准的数据库语义，建议先选中连接或关联表结构。';

  return {
    status: 'ready',
    ready: true,
    severity: 'success',
    label: '已就绪',
    title,
    description,
    providerCount,
    hasActiveProvider: true,
    hasConnectionContext,
    contextAttachedCount,
    selectableModelCount,
    issues: [],
    activeProvider: providerSummary,
    message: `${title}。${description}`,
  };
};
