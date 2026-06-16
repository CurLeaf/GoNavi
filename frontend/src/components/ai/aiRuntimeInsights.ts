import type {
  AIContextLevel,
  AIMCPToolDescriptor,
  AIProviderConfig,
  AISafetyLevel,
  AISkillConfig,
} from '../../types';

const SAFETY_LEVEL_LABELS: Record<string, string> = {
  readonly: '只读',
  readwrite: '读写',
  full: '完全开放',
};

const CONTEXT_LEVEL_LABELS: Record<string, string> = {
  schema_only: '仅结构',
  with_samples: '结构+样例',
  with_results: '结构+结果',
};

const BUILTIN_TOOL_PREVIEW_LIMIT = 30;
const MCP_TOOL_PREVIEW_LIMIT = 40;
const DYNAMIC_MODEL_PREVIEW_LIMIT = 20;

const sliceList = <T,>(items: T[], limit: number) => {
  const list = Array.isArray(items) ? items : [];
  return {
    items: list.slice(0, limit),
    truncated: list.length > limit,
    total: list.length,
  };
};

const normalizeSafetyLevel = (value: AISafetyLevel | string | undefined): string =>
  String(value || 'unknown').trim() || 'unknown';

const normalizeContextLevel = (value: AIContextLevel | string | undefined): string =>
  String(value || 'unknown').trim() || 'unknown';

export const buildAIRuntimeSnapshot = (params: {
  providers?: AIProviderConfig[];
  activeProviderId?: string | null;
  safetyLevel?: AISafetyLevel | string;
  contextLevel?: AIContextLevel | string;
  skills?: AISkillConfig[];
  mcpTools?: AIMCPToolDescriptor[];
  dynamicModels?: string[];
  builtinToolNames?: string[];
}) => {
  const {
    providers = [],
    activeProviderId = '',
    safetyLevel,
    contextLevel,
    skills = [],
    mcpTools = [],
    dynamicModels = [],
    builtinToolNames = [],
  } = params;

  const activeProvider = providers.find((provider) => provider.id === activeProviderId) || null;
  const enabledSkills = skills.filter((skill) => skill?.enabled);
  const builtinPreview = sliceList(
    builtinToolNames
      .map((name) => String(name || '').trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right)),
    BUILTIN_TOOL_PREVIEW_LIMIT,
  );
  const mcpPreview = sliceList(
    mcpTools.map((tool) => ({
      alias: tool.alias,
      title: tool.title || tool.originalName || tool.alias,
      serverName: tool.serverName,
    })),
    MCP_TOOL_PREVIEW_LIMIT,
  );
  const dynamicModelPreview = sliceList(
    dynamicModels
      .map((model) => String(model || '').trim())
      .filter(Boolean),
    DYNAMIC_MODEL_PREVIEW_LIMIT,
  );
  const normalizedSafetyLevel = normalizeSafetyLevel(safetyLevel);
  const normalizedContextLevel = normalizeContextLevel(contextLevel);

  return {
    hasActiveProvider: Boolean(activeProvider),
    activeProvider: activeProvider ? {
      id: activeProvider.id,
      name: activeProvider.name,
      type: activeProvider.type,
      apiFormat: activeProvider.apiFormat || 'openai',
      model: activeProvider.model || '',
      baseUrl: activeProvider.baseUrl || '',
      hasSecret: activeProvider.hasSecret ?? Boolean(activeProvider.secretRef || activeProvider.apiKey),
      declaredModelCount: Array.isArray(activeProvider.models) ? activeProvider.models.length : 0,
    } : null,
    providerCount: providers.length,
    providers: providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      type: provider.type,
      active: provider.id === activeProviderId,
      model: provider.model || '',
    })),
    safetyLevel: normalizedSafetyLevel,
    safetyLabel: SAFETY_LEVEL_LABELS[normalizedSafetyLevel] || normalizedSafetyLevel,
    contextLevel: normalizedContextLevel,
    contextLabel: CONTEXT_LEVEL_LABELS[normalizedContextLevel] || normalizedContextLevel,
    dynamicModelCount: dynamicModelPreview.total,
    dynamicModels: dynamicModelPreview.items,
    dynamicModelsTruncated: dynamicModelPreview.truncated,
    enabledSkillCount: enabledSkills.length,
    enabledSkills: enabledSkills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      scopes: Array.isArray(skill.scopes) ? skill.scopes : [],
      requiredTools: Array.isArray(skill.requiredTools) ? skill.requiredTools : [],
    })),
    builtinToolCount: builtinPreview.total,
    builtinTools: builtinPreview.items,
    builtinToolsTruncated: builtinPreview.truncated,
    mcpToolCount: mcpPreview.total,
    mcpTools: mcpPreview.items,
    mcpToolsTruncated: mcpPreview.truncated,
    totalAvailableToolCount: builtinPreview.total + mcpPreview.total,
    capabilities: {
      canWriteData: normalizedSafetyLevel !== 'readonly',
      canUseSampleContext: normalizedContextLevel === 'with_samples' || normalizedContextLevel === 'with_results',
      canUseResultContext: normalizedContextLevel === 'with_results',
      hasExternalMCPTools: mcpPreview.total > 0,
      hasCustomSkills: enabledSkills.length > 0,
      hasDynamicModelsLoaded: dynamicModelPreview.total > 0,
    },
    message: activeProvider
      ? `当前 AI 正在使用 ${activeProvider.name || activeProvider.id}，共暴露 ${builtinPreview.total + mcpPreview.total} 个工具`
      : '当前未启用 AI 供应商',
  };
};
