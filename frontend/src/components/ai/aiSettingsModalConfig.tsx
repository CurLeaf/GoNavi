import React from 'react';
import {
  ApiOutlined,
  AppstoreOutlined,
  CloudOutlined,
  ExperimentOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';

import type {
  AIMCPServerConfig,
  AIProviderConfig,
  AIProviderType,
  AISkillConfig,
  AIUserPromptSettings,
} from '../../types';
import {
  QWEN_BAILIAN_ANTHROPIC_BASE_URL,
  QWEN_CODING_PLAN_ANTHROPIC_BASE_URL,
  QWEN_CODING_PLAN_MODELS,
  resolveProviderPresetKey,
} from '../../utils/aiProviderPresets';

export interface ProviderPreset {
  key: string;
  label: string;
  icon: React.ReactNode;
  desc: string;
  color: string;
  backendType: AIProviderType;
  fixedApiFormat?: string;
  defaultBaseUrl: string;
  defaultModel: string;
  models: string[];
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  { key: 'openai', label: 'OpenAI', icon: <ApiOutlined />, desc: 'GPT-5.4 / 5.3 系列', color: '#10b981', backendType: 'openai', defaultBaseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o', models: [] },
  { key: 'deepseek', label: 'DeepSeek', icon: <ThunderboltOutlined />, desc: 'DeepSeek-V4 / R1', color: '#3b82f6', backendType: 'openai', defaultBaseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat', models: [] },
  { key: 'qwen-bailian', label: '通义千问（百炼通用）', icon: <CloudOutlined />, desc: '百炼 Anthropic 兼容 / 模型从远端拉取', color: '#6366f1', backendType: 'anthropic', defaultBaseUrl: QWEN_BAILIAN_ANTHROPIC_BASE_URL, defaultModel: '', models: [] },
  { key: 'qwen-coding-plan', label: '通义千问（Coding Plan）', icon: <CloudOutlined />, desc: 'Claude Code CLI 代理链路 / 使用官方支持模型清单', color: '#4f46e5', backendType: 'custom', fixedApiFormat: 'claude-cli', defaultBaseUrl: QWEN_CODING_PLAN_ANTHROPIC_BASE_URL, defaultModel: '', models: QWEN_CODING_PLAN_MODELS },
  { key: 'zhipu', label: '智谱 GLM', icon: <ExperimentOutlined />, desc: 'GLM-5 / GLM-5-Turbo', color: '#0ea5e9', backendType: 'openai', defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-4', models: [] },
  { key: 'moonshot', label: 'Kimi', icon: <ExperimentOutlined />, desc: 'Kimi K2.5 (Anthropic 兼容)', color: '#0d9488', backendType: 'anthropic', defaultBaseUrl: 'https://api.moonshot.cn/anthropic', defaultModel: 'moonshot-v1-8k', models: [] },
  { key: 'anthropic', label: 'Claude', icon: <ExperimentOutlined />, desc: 'Claude Opus/Sonnet', color: '#d97706', backendType: 'anthropic', defaultBaseUrl: 'https://api.anthropic.com', defaultModel: 'claude-3-5-sonnet-20241022', models: [] },
  { key: 'gemini', label: 'Gemini', icon: <CloudOutlined />, desc: 'Gemini 3.1 / 2.5 系列', color: '#059669', backendType: 'gemini', defaultBaseUrl: 'https://generativelanguage.googleapis.com', defaultModel: 'gemini-2.5-flash', models: [] },
  { key: 'volcengine-ark', label: '火山方舟', icon: <CloudOutlined />, desc: 'Ark 通用推理 / 豆包模型', color: '#0ea5e9', backendType: 'openai', defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3', defaultModel: '', models: [] },
  { key: 'volcengine-coding', label: '火山 Coding Plan', icon: <CloudOutlined />, desc: 'Ark Code / Coding Plan', color: '#0284c7', backendType: 'openai', defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/coding/v3', defaultModel: '', models: [] },
  { key: 'minimax', label: 'MiniMax', icon: <ExperimentOutlined />, desc: 'M3 / M2.7 系列 (Anthropic 兼容)', color: '#e11d48', backendType: 'anthropic', defaultBaseUrl: 'https://api.minimaxi.com/anthropic', defaultModel: 'MiniMax-M3', models: ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed'] },
  { key: 'codebuddy', label: 'CodeBuddy', icon: <ApiOutlined />, desc: '本地 CodeBuddy CLI / 官方登录态', color: '#2563eb', backendType: 'custom', fixedApiFormat: 'codebuddy-cli', defaultBaseUrl: '', defaultModel: '', models: [] },
  { key: 'ollama', label: 'Ollama', icon: <AppstoreOutlined />, desc: '本地部署开源模型', color: '#78716c', backendType: 'openai', defaultBaseUrl: 'http://localhost:11434/v1', defaultModel: 'llama3', models: [] },
  { key: 'custom', label: '自定义', icon: <AppstoreOutlined />, desc: '自定义 API 端点', color: '#64748b', backendType: 'custom', defaultBaseUrl: '', defaultModel: '', models: [] },
];

export const findPreset = (key: string): ProviderPreset =>
  PROVIDER_PRESETS.find((preset) => preset.key === key) || PROVIDER_PRESETS[PROVIDER_PRESETS.length - 1];

export const matchProviderPreset = (
  provider: Pick<AIProviderConfig, 'type' | 'baseUrl' | 'apiFormat'>,
): ProviderPreset => {
  const presetKey = resolveProviderPresetKey(provider, PROVIDER_PRESETS, 'custom');
  return findPreset(presetKey);
};

export const EMPTY_AI_USER_PROMPT_SETTINGS: AIUserPromptSettings = {
  global: '',
  database: '',
  jvm: '',
  jvmDiagnostic: '',
};

export const EMPTY_MCP_SERVER = (seed?: Partial<AIMCPServerConfig>): AIMCPServerConfig => {
  const base: AIMCPServerConfig = {
    id: `mcp-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    transport: 'stdio',
    command: '',
    args: [],
    env: {},
    enabled: true,
    timeoutSeconds: 20,
  };
  return {
    ...base,
    ...seed,
    transport: seed?.transport || base.transport,
    args: Array.isArray(seed?.args) ? seed.args : base.args,
    env: seed?.env || base.env,
    enabled: seed?.enabled ?? base.enabled,
    timeoutSeconds: seed?.timeoutSeconds || base.timeoutSeconds,
  };
};

const waitFor = (delayMs: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, delayMs);
});

const readAIService = () => (window as any).go?.aiservice?.Service;

export const waitForAIService = async (attempts = 6, delayMs = 80) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const service = readAIService();
    if (service) {
      return service;
    }
    if (attempt < attempts - 1) {
      await waitFor(delayMs);
    }
  }
  return readAIService();
};

export const EMPTY_SKILL = (): AISkillConfig => ({
  id: `skill-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name: '',
  description: '',
  systemPrompt: '',
  enabled: true,
  scopes: ['global'],
  requiredTools: [],
});
