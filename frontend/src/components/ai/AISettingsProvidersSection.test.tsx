import React from 'react';
import { readFileSync } from 'node:fs';
import { Form } from 'antd';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { AIProviderConfig } from '../../types';
import { t as catalogTranslate } from '../../i18n/catalog';
import { I18nProvider } from '../../i18n/provider';
import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import AISettingsProvidersSection from './AISettingsProvidersSection';

const providerSectionSource = readFileSync(new URL('./AISettingsProvidersSection.tsx', import.meta.url), 'utf8');

const REQUIRED_PROVIDER_KEYS = [
  'ai_settings.provider.empty.title',
  'ai_settings.provider.empty.description',
  'ai_settings.provider.no_model',
  'ai_settings.provider.action.add',
  'ai_settings.provider.action.edit',
  'ai_settings.provider.action.delete',
  'ai_settings.provider.confirm_delete',
  'ai_settings.provider.editor.add_title',
  'ai_settings.provider.editor.edit_title',
  'common.cancel',
] as const;

const REQUIRED_PROVIDER_FORM_KEYS = [
  'ai_settings.form.section.service_type',
  'ai_settings.form.section.basic',
  'ai_settings.form.section.auth_connection',
  'ai_settings.form.provider_name',
  'ai_settings.form.provider_name_required',
  'ai_settings.form.provider_name_placeholder',
  'ai_settings.form.api_format',
  'ai_settings.form.model_list',
  'ai_settings.form.model_list_placeholder',
  'ai_settings.form.api_key',
  'ai_settings.form.api_key_required',
  'ai_settings.form.api_key_placeholder',
  'ai_settings.form.api_endpoint',
  'ai_settings.form.api_endpoint_required',
  'ai_settings.action.back',
  'ai_settings.action.save',
  'ai_settings.action.test',
  'ai_settings.action.retest',
  'ai_settings.action.connection_ok',
] as const;

const providerPresets = [
  { key: 'openai', label: 'OpenAI', icon: <span>O</span>, desc: 'GPT', defaultBaseUrl: 'https://api.openai.com/v1' },
  { key: 'custom', label: '自定义', icon: <span>C</span>, desc: '自定义接口', defaultBaseUrl: 'https://example.com' },
];

const provider: AIProviderConfig = {
  id: 'provider-1',
  name: 'OpenAI',
  type: 'openai',
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o',
  maxTokens: 4096,
  temperature: 0.7,
};

const overlayTheme = buildOverlayWorkbenchTheme(false);

describe('AISettingsProvidersSection', () => {
  it('renders provider cards in list mode', () => {
    const Wrap = () => {
      const [form] = Form.useForm();
      return (
        <I18nProvider preference="en-US" systemLanguages={['en-US']} onPreferenceChange={() => {}}>
          <AISettingsProvidersSection
            providers={[{ ...provider, model: '' }]}
            activeProviderId="provider-1"
            editingProvider={null}
            isEditing={false}
            form={form}
            providerPresets={providerPresets}
            loading={false}
            testStatus="idle"
            primaryPasswordVisible={false}
            darkMode={false}
            overlayTheme={overlayTheme}
            cardBg="#fff"
            cardBorder="rgba(0,0,0,0.08)"
            inputBg="#fff"
            onPrimaryPasswordVisibleChange={() => {}}
            resolveProviderPreset={() => ({ label: 'OpenAI', icon: <span>O</span> })}
            resolvePresetByKey={(key) => providerPresets.find((item) => item.key === key) || providerPresets[0]}
            onAddProvider={() => {}}
            onEditProvider={() => {}}
            onDeleteProvider={() => {}}
            onSetActiveProvider={() => {}}
            onCancelEdit={() => {}}
            onPresetChange={() => {}}
            onTestProvider={() => {}}
            onSaveProvider={() => {}}
          />
        </I18nProvider>
      );
    };

    const markup = renderToStaticMarkup(<Wrap />);
    expect(markup).toContain('OpenAI');
    expect(markup).toContain('No model selected');
    expect(markup).toContain('Add model provider');
  });

  it('renders provider form in editing mode', () => {
    const Wrap = () => {
      const [form] = Form.useForm();
      return (
        <I18nProvider preference="en-US" systemLanguages={['en-US']} onPreferenceChange={() => {}}>
          <AISettingsProvidersSection
            providers={[provider]}
            activeProviderId="provider-1"
            editingProvider={provider}
            isEditing
            form={form}
            providerPresets={providerPresets}
            watchedPresetKey="custom"
            watchedApiFormat="openai"
            loading={false}
            testStatus="idle"
            primaryPasswordVisible={false}
            darkMode={false}
            overlayTheme={overlayTheme}
            cardBg="#fff"
            cardBorder="rgba(0,0,0,0.08)"
            inputBg="#fff"
            onPrimaryPasswordVisibleChange={() => {}}
            resolveProviderPreset={() => ({ label: 'OpenAI', icon: <span>O</span> })}
            resolvePresetByKey={(key) => providerPresets.find((item) => item.key === key) || providerPresets[0]}
            onAddProvider={() => {}}
            onEditProvider={() => {}}
            onDeleteProvider={() => {}}
            onSetActiveProvider={() => {}}
            onCancelEdit={() => {}}
            onPresetChange={() => {}}
            onTestProvider={() => {}}
            onSaveProvider={() => {}}
          />
        </I18nProvider>
      );
    };

    const markup = renderToStaticMarkup(<Wrap />);
    expect(markup).toContain('Edit model provider');
    expect(markup).toContain('Provider name');
    expect(markup).toContain('API Endpoint (URL)');
    expect(markup).toContain('Test connection');
  });

  it('uses catalog keys for provider list and form chrome', () => {
    for (const key of [...REQUIRED_PROVIDER_KEYS, ...REQUIRED_PROVIDER_FORM_KEYS]) {
      expect(catalogTranslate('en-US', key)).not.toBe(key);
      expect(catalogTranslate('zh-CN', key)).not.toBe(key);
      expect(providerSectionSource).toContain(key);
    }

    for (const oldCopy of [
      '暂未配置模型供应商',
      '添加一个以开始使用 AI 助手',
      '未选择模型',
      '确认删除？',
      '添加模型供应商',
      '编辑模型供应商',
      'title="编辑"',
      'okText="删除"',
      'cancelText="取消"',
      '← 返回',
      '服务类型',
      '基本信息',
      '供应商名称',
      '请输入名称',
      '例如：我的自建 OpenAI / 专属大模型',
      'API 格式',
      '可用模型列表（可选配置）',
      '配置指定的模型ID，留空则默认去服务端拉取',
      '认证 & 连接',
      '请输入 API Key',
      '你的 API Key',
      '请输入有效的接口地址',
      '连接正常',
      '重新测试',
      '测试连接',
      '保存',
    ]) {
      expect(providerSectionSource).not.toContain(oldCopy);
    }
  });
});
