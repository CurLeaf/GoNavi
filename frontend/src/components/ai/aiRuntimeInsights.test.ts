import { describe, expect, it } from 'vitest';

import type { AIMCPToolDescriptor, AIProviderConfig, AISkillConfig } from '../../types';
import { buildAIRuntimeSnapshot } from './aiRuntimeInsights';

const providers: AIProviderConfig[] = [{
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
}];

const skills: AISkillConfig[] = [
  {
    id: 'skill-1',
    name: '结构审查',
    systemPrompt: '先核对字段。',
    enabled: true,
    scopes: ['database'],
    requiredTools: ['get_columns'],
  },
  {
    id: 'skill-2',
    name: '已禁用技能',
    systemPrompt: 'ignore',
    enabled: false,
    scopes: ['global'],
  },
];

const mcpTools: AIMCPToolDescriptor[] = [{
  alias: 'browser_open',
  originalName: 'browser_open',
  serverId: 'server-1',
  serverName: 'browser',
  title: '打开浏览器',
  description: '打开目标页面',
}];

describe('buildAIRuntimeSnapshot', () => {
  it('returns a sanitized runtime snapshot for the active provider, tools, and skills', () => {
    const snapshot = buildAIRuntimeSnapshot({
      providers,
      activeProviderId: 'provider-1',
      safetyLevel: 'readonly',
      contextLevel: 'with_samples',
      skills,
      mcpTools,
      dynamicModels: ['gpt-5.4', 'gpt-4.1-mini'],
      builtinToolNames: ['inspect_ai_runtime', 'get_columns', 'inspect_current_connection'],
    });

    expect(snapshot).toMatchObject({
      hasActiveProvider: true,
      providerCount: 1,
      safetyLevel: 'readonly',
      safetyLabel: '只读',
      contextLevel: 'with_samples',
      contextLabel: '结构+样例',
      dynamicModelCount: 2,
      enabledSkillCount: 1,
      builtinToolCount: 3,
      mcpToolCount: 1,
      totalAvailableToolCount: 4,
      capabilities: {
        canWriteData: false,
        canUseSampleContext: true,
        hasExternalMCPTools: true,
        hasCustomSkills: true,
      },
    });
    expect(snapshot.activeProvider).toMatchObject({
      id: 'provider-1',
      name: 'OpenAI 主账号',
      model: 'gpt-5.4',
      hasSecret: true,
    });
    expect(JSON.stringify(snapshot)).not.toContain('apiKey');
    expect(snapshot.enabledSkills).toEqual([
      {
        id: 'skill-1',
        name: '结构审查',
        scopes: ['database'],
        requiredTools: ['get_columns'],
      },
    ]);
    expect(snapshot.mcpTools).toEqual([
      {
        alias: 'browser_open',
        title: '打开浏览器',
        serverName: 'browser',
      },
    ]);
  });

  it('returns a clear empty state when no provider is active', () => {
    const snapshot = buildAIRuntimeSnapshot({
      providers: [],
      activeProviderId: '',
      safetyLevel: 'readonly',
      contextLevel: 'schema_only',
      skills: [],
      mcpTools: [],
      builtinToolNames: [],
    });

    expect(snapshot).toMatchObject({
      hasActiveProvider: false,
      activeProvider: null,
      message: '当前未启用 AI 供应商',
    });
  });
});
