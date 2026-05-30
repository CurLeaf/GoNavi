export type ProviderSecretDraftMode = 'replace' | 'clear';

export interface ProviderSecretDraftInput {
  apiKeyInput?: string;
}

export interface ProviderSecretDraftResult {
  mode: ProviderSecretDraftMode;
  apiKey: string;
  hasSecret: boolean;
}

export function resolveProviderSecretDraft(input: ProviderSecretDraftInput): ProviderSecretDraftResult {
  const apiKey = String(input.apiKeyInput || '').trim();

  if (apiKey) {
    return {
      mode: 'replace',
      apiKey,
      hasSecret: true,
    };
  }

  return {
    mode: 'clear',
    apiKey: '',
    hasSecret: false,
  };
}
