import React from 'react';
import { Form } from 'antd';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { AIProviderConfig } from '../../types';
import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import AISettingsProvidersSection from './AISettingsProvidersSection';

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
        <AISettingsProvidersSection
          providers={[provider]}
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
      );
    };

    const markup = renderToStaticMarkup(<Wrap />);
    expect(markup).toContain('OpenAI');
    expect(markup).toContain('gpt-4o');
    expect(markup).toContain('添加模型供应商');
  });

  it('renders provider form in editing mode', () => {
    const Wrap = () => {
      const [form] = Form.useForm();
      return (
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
      );
    };

    const markup = renderToStaticMarkup(<Wrap />);
    expect(markup).toContain('编辑模型供应商');
    expect(markup).toContain('供应商名称');
    expect(markup).toContain('API Endpoint (URL)');
    expect(markup).toContain('测试连接');
  });
});
