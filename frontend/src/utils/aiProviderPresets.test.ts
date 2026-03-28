import { describe, expect, it } from 'vitest';

import {
  matchQwenPresetKey,
  QWEN_BAILIAN_MODELS_BASE_URL,
  QWEN_CODING_PLAN_ANTHROPIC_BASE_URL,
  QWEN_CODING_PLAN_MODELS,
  resolvePresetBaseURL,
  resolvePresetModelSelection,
  resolvePresetTransport,
} from './aiProviderPresets';

describe('ai provider preset helpers', () => {
  it('maps legacy Bailian compatible-mode URL back to the Bailian preset', () => {
    expect(matchQwenPresetKey({
      type: 'openai',
      baseUrl: QWEN_BAILIAN_MODELS_BASE_URL,
    })).toBe('qwen-bailian');
  });

  it('maps Coding Plan anthropic URL to the dedicated Coding Plan preset', () => {
    expect(matchQwenPresetKey({
      type: 'anthropic',
      baseUrl: QWEN_CODING_PLAN_ANTHROPIC_BASE_URL,
    })).toBe('qwen-coding-plan');
  });

  it('maps Coding Plan Claude CLI config back to the dedicated Coding Plan preset', () => {
    expect(matchQwenPresetKey({
      type: 'custom',
      apiFormat: 'claude-cli',
      baseUrl: QWEN_CODING_PLAN_ANTHROPIC_BASE_URL,
    })).toBe('qwen-coding-plan');
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
