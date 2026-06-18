import { describe, expect, it } from 'vitest';

import { QWEN_CODING_PLAN_ANTHROPIC_BASE_URL } from '../../utils/aiProviderPresets';
import {
  EMPTY_MCP_SERVER,
  EMPTY_SKILL,
  PROVIDER_PRESETS,
  findPreset,
  matchProviderPreset,
} from './aiSettingsModalConfig';

describe('aiSettingsModalConfig', () => {
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

  it('matches a CodeBuddy CLI provider back to the dedicated preset', () => {
    const preset = matchProviderPreset({
      type: 'custom',
      baseUrl: '',
      apiFormat: 'codebuddy-cli',
    });

    expect(preset.key).toBe('codebuddy');
  });

  it('matches a Cursor Agent provider back to the dedicated preset', () => {
    const preset = matchProviderPreset({
      type: 'custom',
      baseUrl: 'https://api.cursor.com/v1',
      apiFormat: 'cursor-agent',
    });

    expect(preset.key).toBe('cursor');
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
    expect(PROVIDER_PRESETS.some((item) => item.key === 'codebuddy')).toBe(true);
    expect(PROVIDER_PRESETS.some((item) => item.key === 'cursor')).toBe(true);
    expect(PROVIDER_PRESETS.some((item) => item.key === 'openai')).toBe(true);
    expect(PROVIDER_PRESETS.some((item) => item.key === 'custom')).toBe(true);
  });
});
