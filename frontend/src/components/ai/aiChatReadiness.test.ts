import { describe, expect, it } from 'vitest';

import { buildAIChatReadinessSnapshot } from './aiChatReadiness';

describe('buildAIChatReadinessSnapshot', () => {
  it('reports missing provider when no active provider is configured', () => {
    const snapshot = buildAIChatReadinessSnapshot({
      providers: [],
      activeProviderId: '',
    });

    expect(snapshot.status).toBe('missing_provider');
    expect(snapshot.ready).toBe(false);
    expect(snapshot.action?.key).toBe('open-settings');
    expect(snapshot.title).toContain('还没有配置 AI 供应商');
  });

  it('reports incomplete provider when secret or base url is missing', () => {
    const snapshot = buildAIChatReadinessSnapshot({
      providers: [{
        id: 'provider-1',
        type: 'custom',
        name: '自建代理',
        apiKey: '',
        hasSecret: false,
        baseUrl: '',
        model: 'gpt-5.5',
        models: ['gpt-5.5'],
        maxTokens: 16000,
        temperature: 0.7,
      }],
      activeProviderId: 'provider-1',
    });

    expect(snapshot.status).toBe('provider_incomplete');
    expect(snapshot.issues).toEqual(['missing_secret', 'missing_base_url']);
    expect(snapshot.action?.label).toContain('修复');
    expect(snapshot.message).toContain('还缺少 密钥、接口地址');
  });

  it('reports missing model and available model count when provider has no selected model', () => {
    const snapshot = buildAIChatReadinessSnapshot({
      providers: [{
        id: 'provider-1',
        type: 'openai',
        name: 'OpenAI 主账号',
        apiKey: '',
        hasSecret: true,
        baseUrl: 'https://api.openai.com/v1',
        model: '',
        models: ['gpt-5.5', 'gpt-4.1'],
        maxTokens: 32000,
        temperature: 0.2,
      }],
      activeProviderId: 'provider-1',
    });

    expect(snapshot.status).toBe('missing_model');
    expect(snapshot.selectableModelCount).toBe(2);
    expect(snapshot.action?.key).toBe('reload-models');
    expect(snapshot.description).toContain('当前已发现 2 个可选模型');
  });

  it('reports ready with context summary when provider and context are already attached', () => {
    const snapshot = buildAIChatReadinessSnapshot({
      providers: [{
        id: 'provider-1',
        type: 'openai',
        name: 'OpenAI 主账号',
        apiKey: '',
        hasSecret: true,
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-5.5',
        models: ['gpt-5.5'],
        maxTokens: 32000,
        temperature: 0.2,
      }],
      activeProviderId: 'provider-1',
      activeContext: {
        connectionId: 'conn-1',
        dbName: 'demo',
      },
      activeContextItems: [{
        dbName: 'demo',
        tableName: 'orders',
        ddl: 'CREATE TABLE orders (...)',
      }],
    });

    expect(snapshot.status).toBe('ready');
    expect(snapshot.ready).toBe(true);
    expect(snapshot.contextAttachedCount).toBe(1);
    expect(snapshot.title).toContain('OpenAI 主账号 / gpt-5.5');
  });

  it('treats CodeBuddy CLI as ready without explicit base url or model', () => {
    const snapshot = buildAIChatReadinessSnapshot({
      providers: [{
        id: 'provider-1',
        type: 'custom',
        name: 'CodeBuddy',
        apiKey: '',
        hasSecret: true,
        baseUrl: '',
        model: '',
        apiFormat: 'codebuddy-cli',
        models: [],
        maxTokens: 4096,
        temperature: 0.2,
      }],
      activeProviderId: 'provider-1',
    });

    expect(snapshot.status).toBe('ready');
    expect(snapshot.ready).toBe(true);
    expect(snapshot.title).toContain('CodeBuddy');
    expect(snapshot.title).toContain('自动选择');
  });
});
