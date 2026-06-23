import { describe, expect, it } from 'vitest';

import type { AIProviderConfig } from '../../types';
import { buildAIProviderSnapshot } from './aiProviderInsights';

describe('aiProviderInsights', () => {
  it('returns a sanitized provider snapshot with missing-secret and missing-model diagnostics', () => {
    const providers: AIProviderConfig[] = [
      {
        id: 'provider-1',
        type: 'openai',
        name: 'OpenAI 主账号',
        apiKey: '',
        hasSecret: true,
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-5.4',
        models: ['gpt-5.4', 'gpt-4.1'],
        maxTokens: 32000,
        temperature: 0.2,
      },
      {
        id: 'provider-2',
        type: 'custom',
        name: '自建代理',
        apiKey: 'sk-secret',
        hasSecret: false,
        baseUrl: '',
        model: '',
        models: [],
        headers: {
          Authorization: 'Bearer secret-token',
        },
        apiFormat: 'openai',
        maxTokens: 16000,
        temperature: 0.7,
      },
    ];

    const snapshot = buildAIProviderSnapshot({
      providers,
      activeProviderId: 'provider-1',
      dynamicModels: ['gpt-5.4', 'gpt-4.1-mini'],
    });

    expect(snapshot).toMatchObject({
      hasActiveProvider: true,
      providerCount: 2,
      readyProviderCount: 1,
      providersNeedingAttentionCount: 1,
      missingSecretCount: 1,
      missingSelectedModelCount: 1,
      missingBaseUrlCount: 1,
      dynamicModelCount: 2,
    });
    expect(snapshot.activeProvider).toMatchObject({
      id: 'provider-1',
      name: 'OpenAI 主账号',
      baseUrlHost: 'api.openai.com',
      status: 'ready',
    });
    expect(snapshot.providers[1]).toMatchObject({
      id: 'provider-2',
      hasSecret: false,
      hasHeaders: true,
      headerKeys: ['Authorization'],
      issues: ['missing_secret', 'missing_base_url', 'missing_selected_model', 'missing_declared_models'],
      status: 'needs_attention',
    });
    expect(snapshot.message).toContain('正在使用 OpenAI 主账号');
    expect(JSON.stringify(snapshot)).not.toContain('apiKey');
    expect(JSON.stringify(snapshot)).not.toContain('secret-token');
  });

  it('does not flag Cursor Agent for a missing selected model', () => {
    const snapshot = buildAIProviderSnapshot({
      providers: [{
        id: 'provider-cursor',
        type: 'custom',
        name: 'Cursor',
        apiKey: '',
        hasSecret: true,
        baseUrl: 'https://api.cursor.com/v1',
        model: '',
        models: [],
        apiFormat: 'cursor-agent',
        maxTokens: 4096,
        temperature: 0.2,
      }],
      activeProviderId: 'provider-cursor',
    });

    expect(snapshot.missingSelectedModelCount).toBe(0);
    expect(snapshot.providers[0].issues).toEqual(['missing_declared_models']);
  });
});
