import { describe, expect, it } from 'vitest';

import { resolveProviderSecretDraft } from './providerSecretDraft';

describe('resolveProviderSecretDraft', () => {
  it('clears the stored provider secret when edit form leaves apiKey blank', () => {
    const result = resolveProviderSecretDraft({
      apiKeyInput: '',
    });

    expect(result.mode).toBe('clear');
    expect(result.apiKey).toBe('');
    expect(result.hasSecret).toBe(false);
  });

  it('replaces the provider secret when a new apiKey is entered', () => {
    const result = resolveProviderSecretDraft({
      apiKeyInput: ' sk-new ',
    });

    expect(result.mode).toBe('replace');
    expect(result.apiKey).toBe('sk-new');
    expect(result.hasSecret).toBe(true);
  });
});
