import { describe, expect, it } from 'vitest';

import { resolveProviderSecretDraft } from './providerSecretDraft';

describe('resolveProviderSecretDraft', () => {
  it('keeps existing provider secret when edit form leaves apiKey blank', () => {
    const result = resolveProviderSecretDraft({
      hasSecret: true,
      apiKeyInput: '',
      clearSecret: false,
    });

    expect(result.mode).toBe('keep');
    expect(result.apiKey).toBe('');
    expect(result.hasSecret).toBe(true);
  });

  it('replaces the provider secret when a new apiKey is entered', () => {
    const result = resolveProviderSecretDraft({
      hasSecret: true,
      apiKeyInput: ' sk-new ',
      clearSecret: false,
    });

    expect(result.mode).toBe('replace');
    expect(result.apiKey).toBe('sk-new');
    expect(result.hasSecret).toBe(true);
  });

  it('clears the stored provider secret when requested', () => {
    const result = resolveProviderSecretDraft({
      hasSecret: true,
      apiKeyInput: '',
      clearSecret: true,
    });

    expect(result.mode).toBe('clear');
    expect(result.apiKey).toBe('');
    expect(result.hasSecret).toBe(false);
  });
});
