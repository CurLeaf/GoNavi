import type { AIProviderConfig } from '../types';

export const LEGACY_QWEN_BAILIAN_OPENAI_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
export const LEGACY_QWEN_CODING_PLAN_OPENAI_BASE_URL = 'https://coding.dashscope.aliyuncs.com/v1';
export const QWEN_BAILIAN_ANTHROPIC_BASE_URL = 'https://dashscope.aliyuncs.com/apps/anthropic';
export const QWEN_CODING_PLAN_ANTHROPIC_BASE_URL = 'https://coding.dashscope.aliyuncs.com/apps/anthropic';
export const QWEN_BAILIAN_MODELS_BASE_URL = LEGACY_QWEN_BAILIAN_OPENAI_BASE_URL;

export const QWEN_CODING_PLAN_MODELS = [
  'qwen3-coder-plus',
  'qwen3-coder-480b-a35b-instruct',
  'qwen3-coder-30b-a3b-instruct',
  'qwen3-coder-flash',
  'qwen-plus',
  'qwen-turbo',
];

const CUSTOM_LIKE_PRESET_KEYS = new Set(['custom', 'ollama']);

export interface ResolvePresetModelSelectionInput {
  presetKey: string;
  presetDefaultModel: string;
  presetModels: string[];
  valuesModel?: string;
  customModels?: string[];
}

export interface ResolvePresetModelSelectionResult {
  model: string;
  models: string[];
}

export interface ResolvePresetBaseURLInput {
  presetKey: string;
  presetDefaultBaseUrl: string;
  valuesBaseUrl?: string;
}

export const getProviderHostname = (raw?: string): string => {
  if (!raw) return '';
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return '';
  }
};

export const getProviderFingerprint = (raw?: string): string => {
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const normalizedPath = url.pathname.replace(/\/+$/, '').toLowerCase();
    return `${url.hostname.toLowerCase()}${normalizedPath}`;
  } catch {
    return '';
  }
};

export const matchQwenPresetKey = (provider: Pick<AIProviderConfig, 'type' | 'baseUrl'>): string | null => {
  const fingerprint = getProviderFingerprint(provider.baseUrl);
  const bailianFingerprints = new Set([
    getProviderFingerprint(LEGACY_QWEN_BAILIAN_OPENAI_BASE_URL),
    getProviderFingerprint(QWEN_BAILIAN_ANTHROPIC_BASE_URL),
  ]);
  if (fingerprint !== '' && bailianFingerprints.has(fingerprint)) {
    return 'qwen-bailian';
  }

  const codingPlanFingerprints = new Set([
    getProviderFingerprint(LEGACY_QWEN_CODING_PLAN_OPENAI_BASE_URL),
    getProviderFingerprint(QWEN_CODING_PLAN_ANTHROPIC_BASE_URL),
  ]);
  if (fingerprint !== '' && codingPlanFingerprints.has(fingerprint)) {
    return 'qwen-coding-plan';
  }

  return null;
};

export const resolvePresetModelSelection = ({
  presetKey,
  presetDefaultModel,
  presetModels,
  valuesModel,
  customModels,
}: ResolvePresetModelSelectionInput): ResolvePresetModelSelectionResult => {
  const isCustomLike = CUSTOM_LIKE_PRESET_KEYS.has(presetKey);
  const resolvedModels = isCustomLike ? (customModels || []) : presetModels;
  const fallbackModel = resolvedModels.length > 0 ? resolvedModels[0] : '';
  return {
    models: resolvedModels,
    model: isCustomLike ? (valuesModel || fallbackModel) : (valuesModel || presetDefaultModel),
  };
};

export const resolvePresetBaseURL = ({
  presetKey,
  presetDefaultBaseUrl,
  valuesBaseUrl,
}: ResolvePresetBaseURLInput): string => {
  if (CUSTOM_LIKE_PRESET_KEYS.has(presetKey)) {
    return valuesBaseUrl || presetDefaultBaseUrl;
  }
  return presetDefaultBaseUrl;
};
