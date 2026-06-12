import type { AIProviderConfig } from '../../types';

const DECLARED_MODEL_PREVIEW_LIMIT = 12;
const DYNAMIC_MODEL_PREVIEW_LIMIT = 20;

const sliceList = <T,>(items: T[], limit: number) => {
  const list = Array.isArray(items) ? items : [];
  return {
    items: list.slice(0, limit),
    truncated: list.length > limit,
    total: list.length,
  };
};

const trimText = (value: unknown): string => String(value || '').trim();

const hasProviderSecret = (provider: AIProviderConfig): boolean =>
  provider.hasSecret ?? Boolean(provider.secretRef || provider.apiKey);

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

const buildProviderIssues = (provider: AIProviderConfig): string[] => {
  const issues: string[] = [];
  const hasSecret = hasProviderSecret(provider);
  const baseUrl = trimText(provider.baseUrl);
  const model = trimText(provider.model);
  const declaredModels = Array.isArray(provider.models)
    ? provider.models.map((item) => trimText(item)).filter(Boolean)
    : [];

  if (!hasSecret) {
    issues.push('missing_secret');
  }
  if (!baseUrl) {
    issues.push('missing_base_url');
  }
  if (!model) {
    issues.push('missing_selected_model');
  }
  if (declaredModels.length === 0) {
    issues.push('missing_declared_models');
  }

  return issues;
};

export const buildAIProviderSnapshot = (params: {
  providers?: AIProviderConfig[];
  activeProviderId?: string | null;
  dynamicModels?: string[];
}) => {
  const providers = Array.isArray(params.providers) ? params.providers : [];
  const activeProviderId = trimText(params.activeProviderId);
  const dynamicModelPreview = sliceList(
    (Array.isArray(params.dynamicModels) ? params.dynamicModels : [])
      .map((item) => trimText(item))
      .filter(Boolean),
    DYNAMIC_MODEL_PREVIEW_LIMIT,
  );

  const providerSummaries = providers.map((provider) => {
    const declaredModelPreview = sliceList(
      (Array.isArray(provider.models) ? provider.models : [])
        .map((item) => trimText(item))
        .filter(Boolean),
      DECLARED_MODEL_PREVIEW_LIMIT,
    );
    const headerKeys = Object.keys(provider.headers || {})
      .map((item) => trimText(item))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
    const issues = buildProviderIssues(provider);

    return {
      id: provider.id,
      name: trimText(provider.name),
      type: provider.type,
      apiFormat: trimText(provider.apiFormat) || 'openai',
      active: provider.id === activeProviderId,
      baseUrl: trimText(provider.baseUrl),
      baseUrlHost: getProviderHost(provider.baseUrl),
      model: trimText(provider.model),
      declaredModelCount: declaredModelPreview.total,
      declaredModels: declaredModelPreview.items,
      declaredModelsTruncated: declaredModelPreview.truncated,
      hasSecret: hasProviderSecret(provider),
      hasHeaders: headerKeys.length > 0,
      headerKeys,
      maxTokens: Number(provider.maxTokens) || 0,
      temperature: Number(provider.temperature) || 0,
      issues,
      issueCount: issues.length,
      status: issues.length === 0 ? 'ready' : 'needs_attention',
    };
  });

  const activeProvider = providerSummaries.find((provider) => provider.active) || null;
  const providersNeedingAttention = providerSummaries.filter((provider) => provider.issueCount > 0);
  const providerHosts = Array.from(
    new Set(
      providerSummaries
        .map((provider) => provider.baseUrlHost)
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));

  return {
    hasActiveProvider: Boolean(activeProvider),
    activeProviderId,
    activeProvider,
    providerCount: providerSummaries.length,
    readyProviderCount: providerSummaries.length - providersNeedingAttention.length,
    providersNeedingAttentionCount: providersNeedingAttention.length,
    missingSecretCount: providerSummaries.filter((provider) => provider.issues.includes('missing_secret')).length,
    missingSelectedModelCount: providerSummaries.filter((provider) => provider.issues.includes('missing_selected_model')).length,
    missingBaseUrlCount: providerSummaries.filter((provider) => provider.issues.includes('missing_base_url')).length,
    providers: providerSummaries,
    providerHosts,
    dynamicModelCount: dynamicModelPreview.total,
    dynamicModels: dynamicModelPreview.items,
    dynamicModelsTruncated: dynamicModelPreview.truncated,
    message: providerSummaries.length === 0
      ? '当前没有配置 AI 供应商'
      : activeProvider
        ? activeProvider.issueCount > 0
          ? `当前正在使用 ${activeProvider.name || activeProvider.id}，但还有 ${activeProvider.issueCount} 项待检查`
          : `当前共配置 ${providerSummaries.length} 个供应商，正在使用 ${activeProvider.name || activeProvider.id}`
        : `当前已配置 ${providerSummaries.length} 个供应商，但尚未选择活动供应商`,
  };
};
