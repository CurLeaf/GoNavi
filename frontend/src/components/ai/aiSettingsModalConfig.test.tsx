import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { QWEN_CODING_PLAN_ANTHROPIC_BASE_URL } from '../../utils/aiProviderPresets';
import { t as translateCatalog } from '../../i18n/catalog';
import {
  EMPTY_MCP_SERVER,
  EMPTY_SKILL,
  PROVIDER_PRESETS,
  findPreset,
  localizeProviderPresets,
  matchProviderPreset,
} from './aiSettingsModalConfig';

describe('aiSettingsModalConfig', () => {
  const source = readFileSync(new URL('./aiSettingsModalConfig.tsx', import.meta.url), 'utf8');

  it('finds the matching preset and falls back to custom when the key is unknown', () => {
    expect(findPreset('openai').label).toBe('OpenAI');
    expect(findPreset('missing-preset').key).toBe('custom');
  });

  it('matches an anthropic-compatible provider back to the qwen coding plan preset', () => {
    const preset = matchProviderPreset({
      type: 'custom',
      baseUrl: QWEN_CODING_PLAN_ANTHROPIC_BASE_URL,
      apiFormat: 'claude-cli',
    });

    expect(preset.key).toBe('qwen-coding-plan');
  });

  it('creates MCP server drafts and skill drafts with stable defaults', () => {
    const server = EMPTY_MCP_SERVER({ name: 'Browser', args: ['stdio'] });
    const skill = EMPTY_SKILL();

    expect(server.transport).toBe('stdio');
    expect(server.timeoutSeconds).toBe(20);
    expect(server.args).toEqual(['stdio']);
    expect(skill.enabled).toBe(true);
    expect(skill.scopes).toEqual(['global']);
  });

  it('keeps the provider preset list available for the settings modal', () => {
    expect(PROVIDER_PRESETS.some((item) => item.key === 'codex')).toBe(false);
    expect(PROVIDER_PRESETS.some((item) => item.key === 'openai')).toBe(true);
    expect(PROVIDER_PRESETS.some((item) => item.key === 'custom')).toBe(true);
  });

  it('localizes provider preset card copy through existing catalog keys', () => {
    const localized = localizeProviderPresets(PROVIDER_PRESETS, (key) => translateCatalog('en-US', key));
    const qwen = localized.find((item) => item.key === 'qwen-bailian');
    const custom = localized.find((item) => item.key === 'custom');

    expect(qwen).toMatchObject({
      label: 'Qwen (Bailian General)',
      desc: 'Bailian Anthropic-compatible endpoint / remote model list',
    });
    expect(custom).toMatchObject({
      label: 'Custom',
      desc: 'Custom API endpoint',
    });
    expect(localized.find((item) => item.key === 'minimax')).toMatchObject({
      desc: 'M3 / M2.7 series (Anthropic-compatible)',
    });
  });

  it('keeps provider preset source copy behind catalog keys', () => {
    for (const preset of PROVIDER_PRESETS) {
      expect(preset.labelKey).toMatch(/^ai_settings\.provider_preset\.[a-z0-9_]+\.label$/);
      expect(preset.descKey).toMatch(/^ai_settings\.provider_preset\.[a-z0-9_]+\.desc$/);
      expect(source).toContain(preset.labelKey);
      expect(source).toContain(preset.descKey);
    }

    [
      '通义千问（百炼通用）',
      '百炼 Anthropic 兼容 / 模型从远端拉取',
      '通义千问（Coding Plan）',
      'Claude Code CLI 代理链路 / 使用官方支持模型清单',
      '智谱 GLM',
      'Kimi K2.5 (Anthropic 兼容)',
      'Gemini 3.1 / 2.5 系列',
      '火山方舟',
      'Ark 通用推理 / 豆包模型',
      '火山 Coding Plan',
      '本地部署开源模型',
      '自定义',
      '自定义 API 端点',
    ].forEach((legacyCopy) => {
      expect(source).not.toContain(legacyCopy);
    });
  });
});
