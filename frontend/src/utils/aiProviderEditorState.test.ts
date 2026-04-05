import { describe, expect, it } from 'vitest';

import {
  buildAddProviderEditorSession,
  buildClosedProviderEditorSession,
  buildEditProviderEditorSession,
} from './aiProviderEditorState';

describe('aiProviderEditorState', () => {
  it('resets clearProviderSecret when starting add flow', () => {
    const session = buildAddProviderEditorSession({
      previousClearProviderSecret: true,
      presetBackendType: 'openai',
      presetBaseUrl: 'https://api.openai.com/v1',
      presetModel: 'gpt-4.1',
    });

    expect(session.clearProviderSecret).toBe(false);
    expect(session.isEditing).toBe(true);
    expect(session.testStatus).toBe('idle');
  });

  it('resets clearProviderSecret when starting edit flow', () => {
    const session = buildEditProviderEditorSession({
      previousClearProviderSecret: true,
      provider: {
        id: 'provider-1',
        type: 'openai',
        name: 'OpenAI',
        apiKey: '',
        hasSecret: true,
      },
    });

    expect(session.clearProviderSecret).toBe(false);
    expect(session.isEditing).toBe(true);
    expect(session.editingProvider?.id).toBe('provider-1');
  });

  it('resets clearProviderSecret when the modal closes', () => {
    const session = buildClosedProviderEditorSession({
      previousClearProviderSecret: true,
    });

    expect(session.clearProviderSecret).toBe(false);
    expect(session.isEditing).toBe(false);
    expect(session.editingProvider).toBeNull();
  });
});
