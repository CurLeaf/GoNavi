import { describe, expect, it } from 'vitest';
import type { AIProviderType } from '../types';
import {
  LEGACY_QWEN_CODING_PLAN_OPENAI_BASE_URL,
  QWEN_BAILIAN_ANTHROPIC_BASE_URL,
  QWEN_BAILIAN_MODELS_BASE_URL,
  QWEN_CODING_PLAN_ANTHROPIC_BASE_URL,
  QWEN_CODING_PLAN_MODELS,
  matchQwenPresetKey,
  resolvePresetBaseURL,
  resolvePresetModelSelection,
  resolvePresetTransport,
  resolveProviderPresetKey,
} from './aiProviderPresets';

type PresetMatcher = {
  key: string;
  backendType: AIProviderType;
  defaultBaseUrl: string;
  fixedApiFormat?: string;
};

const PRESETS: PresetMatcher[] = [
  { key: 'openai', backendType: 'openai', defaultBaseUrl: 'https://api.openai.com/v1' },
  { key: 'qwen-bailian', backendType: 'anthropic', defaultBaseUrl: QWEN_BAILIAN_ANTHROPIC_BASE_URL },
  {
    key: 'qwen-coding-plan',
    backendType: 'custom',
    defaultBaseUrl: QWEN_CODING_PLAN_ANTHROPIC_BASE_URL,
    fixedApiFormat: 'claude-cli',
  },
  { key: 'custom', backendType: 'custom', defaultBaseUrl: '' },
];

describe('ai provider preset helpers', () => {
  it('maps legacy Bailian compatible-mode URL back to the Bailian preset', () => {
    expect(matchQwenPresetKey({
      type: 'openai',
      baseUrl: QWEN_BAILIAN_MODELS_BASE_URL,
    })).toBe('qwen-bailian');
  });

  it('maps Coding Plan Claude CLI config back to the dedicated Coding Plan preset', () => {
    expect(matchQwenPresetKey({
      type: 'custom',
      apiFormat: 'claude-cli',
      baseUrl: QWEN_CODING_PLAN_ANTHROPIC_BASE_URL,
    })).toBe('qwen-coding-plan');
  });

  it('maps legacy Coding Plan OpenAI config back to the dedicated Coding Plan preset', () => {
    expect(matchQwenPresetKey({
      type: 'openai',
      baseUrl: LEGACY_QWEN_CODING_PLAN_OPENAI_BASE_URL,
    })).toBe('qwen-coding-plan');
  });

  it('does not treat a custom OpenAI endpoint as the built-in Coding Plan preset', () => {
    expect(matchQwenPresetKey({
      type: 'custom',
      apiFormat: 'openai',
      baseUrl: LEGACY_QWEN_CODING_PLAN_OPENAI_BASE_URL,
    })).toBeNull();
  });

  it('does not keep a baked-in model list for the Coding Plan preset', () => {
    expect(QWEN_CODING_PLAN_MODELS).toEqual([
      'qwen3.5-plus',
      'kimi-k2.5',
      'glm-5',
      'MiniMax-M2.5',
      'qwen3-max-2026-01-23',
      'qwen3-coder-next',
      'qwen3-coder-plus',
      'glm-4.7',
    ]);
  });

  it('keeps built-in preset model empty when the preset intentionally requires an explicit selection', () => {
    expect(resolvePresetModelSelection({
      presetKey: 'qwen-coding-plan',
      presetDefaultModel: '',
      presetModels: QWEN_CODING_PLAN_MODELS,
      valuesModel: '',
      customModels: [],
    })).toEqual({
      model: '',
      models: QWEN_CODING_PLAN_MODELS,
    });
  });

  it('still falls back to the first configured model for custom-like presets', () => {
    expect(resolvePresetModelSelection({
      presetKey: 'custom',
      presetDefaultModel: '',
      presetModels: [],
      valuesModel: '',
      customModels: ['foo-model', 'bar-model'],
    })).toEqual({
      model: 'foo-model',
      models: ['foo-model', 'bar-model'],
    });
  });

  it('forces built-in presets back to their standard base URL when saving or testing', () => {
    expect(resolvePresetBaseURL({
      presetKey: 'qwen-bailian',
      presetDefaultBaseUrl: 'https://dashscope.aliyuncs.com/apps/anthropic',
      valuesBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    })).toBe('https://dashscope.aliyuncs.com/apps/anthropic');
  });

  it('keeps the user-entered base URL for custom-like presets', () => {
    expect(resolvePresetBaseURL({
      presetKey: 'custom',
      presetDefaultBaseUrl: '',
      valuesBaseUrl: 'https://example-proxy.internal/v1',
    })).toBe('https://example-proxy.internal/v1');
  });

  it('forces qwen coding plan to save as custom plus claude-cli', () => {
    expect(resolvePresetTransport({
      presetBackendType: 'custom',
      presetFixedApiFormat: 'claude-cli',
      valuesApiFormat: 'anthropic',
    })).toEqual({
      type: 'custom',
      apiFormat: 'claude-cli',
    });
  });

  it('keeps custom preset transport editable', () => {
    expect(resolvePresetTransport({
      presetBackendType: 'custom',
      valuesApiFormat: 'gemini',
    })).toEqual({
      type: 'custom',
      apiFormat: 'gemini',
    });
  });
});

describe('resolveProviderPresetKey', () => {
  it('不会把自定义 OpenAI 端点误识别成千问 Coding Plan', () => {
    const key = resolveProviderPresetKey(
      {
        type: 'custom',
        apiFormat: 'openai',
        baseUrl: LEGACY_QWEN_CODING_PLAN_OPENAI_BASE_URL,
      },
      PRESETS,
      'custom',
    );

    expect(key).toBe('custom');
  });

  it('仍然能识别当前内置的千问 Coding Plan 预设', () => {
    const key = resolveProviderPresetKey(
      {
        type: 'custom',
        apiFormat: 'claude-cli',
        baseUrl: QWEN_CODING_PLAN_ANTHROPIC_BASE_URL,
      },
      PRESETS,
      'custom',
    );

    expect(key).toBe('qwen-coding-plan');
  });

  it('仍然能识别当前内置的千问百炼预设', () => {
    const key = resolveProviderPresetKey(
      {
        type: 'anthropic',
        apiFormat: undefined,
        baseUrl: QWEN_BAILIAN_ANTHROPIC_BASE_URL,
      },
      PRESETS,
      'custom',
    );

    expect(key).toBe('qwen-bailian');
  });
});
