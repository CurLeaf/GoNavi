import type {
  AIContextLevel,
  AIMCPToolDescriptor,
  AIProviderConfig,
  AISafetyLevel,
  AISkillConfig,
} from '../../types';
import type { AIInspectionTranslator } from './aiInspectionI18n';
import { translateInspectionCopy } from './aiInspectionI18n';

const SAFETY_LEVEL_FALLBACKS: Record<string, string> = {
  readonly: 'Read-only',
  readwrite: 'Read/write',
  full: 'Full access',
};

const CONTEXT_LEVEL_FALLBACKS: Record<string, string> = {
  schema_only: 'Schema only',
  with_samples: 'Schema + samples',
  with_results: 'Schema + results',
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
  translate?: AIInspectionTranslator;
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
    translate,
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
    safetyLabel: translateInspectionCopy(
      translate,
      `ai_chat.inspection.runtime.safety.${normalizedSafetyLevel}`,
      SAFETY_LEVEL_FALLBACKS[normalizedSafetyLevel] || normalizedSafetyLevel,
    ),
    contextLevel: normalizedContextLevel,
    contextLabel: translateInspectionCopy(
      translate,
      `ai_chat.inspection.runtime.context.${normalizedContextLevel}`,
      CONTEXT_LEVEL_FALLBACKS[normalizedContextLevel] || normalizedContextLevel,
    ),
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
      ? translateInspectionCopy(
        translate,
        'ai_chat.inspection.runtime.message.active',
        `AI is using ${activeProvider.name || activeProvider.id} with ${builtinPreview.total + mcpPreview.total} tools available`,
        { provider: activeProvider.name || activeProvider.id, toolCount: builtinPreview.total + mcpPreview.total },
      )
      : translateInspectionCopy(
        translate,
        'ai_chat.inspection.runtime.message.no_provider',
        'No AI provider is currently active',
      ),
  };
};
