import React from 'react';
import { Form } from 'antd';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { AIProviderConfig } from '../../types';
import { t as catalogTranslate } from '../../i18n/catalog';
import { I18nProvider } from '../../i18n/provider';
import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import AISettingsProvidersSection from './AISettingsProvidersSection';

const REQUIRED_KEYS = [
  'ai_settings.provider.config_list',
  'ai_settings.provider.add_config',
  'ai_settings.provider.edit_config',
  'ai_settings.provider.empty_configs',
  'ai_settings.provider.builtin',
  'ai_settings.provider.partners',
  'ai_settings.provider.partners_empty',
  'ai_settings.form.config_name',
  'ai_settings.form.provider',
  'ai_settings.form.custom_headers',
  'ai_settings.form.max_output_tokens',
  'ai_settings.form.context_window',
  'ai_settings.action.apply',
  'ai_settings.action.back_list',
  'ai_settings.action.test',
  'common.edit',
  'common.cancel',
] as const;

const providerPresets: React.ComponentProps<typeof AISettingsProvidersSection>['providerPresets'] = [
  { key: 'openai', backendType: 'openai', label: 'OpenAI', icon: <span>O</span>, desc: 'GPT', defaultBaseUrl: 'https://api.openai.com/v1' },
  { key: 'deepseek', backendType: 'openai', label: 'DeepSeek', icon: <span>D</span>, desc: 'DeepSeek', defaultBaseUrl: 'https://api.deepseek.com', defaultApiFormat: 'openai-responses' },
  { key: 'codex', backendType: 'custom', fixedApiFormat: 'codex-cli', label: 'Codex Subscription', icon: <span>X</span>, desc: 'Codex CLI', defaultBaseUrl: '', authMode: 'local-cli' },
  { key: 'anthropic', backendType: 'anthropic', label: 'Claude', icon: <span>A</span>, desc: 'Claude', defaultBaseUrl: 'https://api.anthropic.com' },
  { key: 'custom', backendType: 'custom', label: 'Custom', icon: <span>C</span>, desc: 'Custom API', defaultBaseUrl: '' },
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

const wrap = (props: Partial<React.ComponentProps<typeof AISettingsProvidersSection>> = {}) => {
  const Wrap = () => {
    const [form] = Form.useForm();
    return (
      <I18nProvider preference="en-US" systemLanguages={['en-US']} onPreferenceChange={() => {}}>
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
          resolveProviderPreset={() => ({ key: 'openai', label: 'OpenAI', icon: <span>O</span> })}
          resolvePresetByKey={(key) => providerPresets.find((item) => item.key === key) || providerPresets[0]}
          onAddProvider={() => {}}
          onEditProvider={() => {}}
          onDeleteProvider={() => {}}
          onSetActiveProvider={() => {}}
          onCancelEdit={() => {}}
          onPresetChange={() => {}}
          onTestProvider={() => {}}
          onSaveProvider={() => {}}
          {...props}
        />
      </I18nProvider>
    );
  };
  return renderToStaticMarkup(<Wrap />);
};

describe('AISettingsProvidersSection', () => {
  it('uses catalog keys for the list/edit chrome', () => {
    for (const key of REQUIRED_KEYS) {
      expect(catalogTranslate('en-US', key)).not.toBe(key);
      expect(catalogTranslate('zh-CN', key)).not.toBe(key);
    }
  });

  it('renders configuration cards instead of chips or the catalog', () => {
    const markup = wrap();
    expect(markup).toContain('AI configurations');
    expect(markup).toContain('Add configuration');
    expect(markup).toContain('gonavi-ai-provider-config-card is-default');
    expect(markup).toContain('gonavi-ai-provider-config-card-name');
    expect(markup).toContain('Default');
    expect(markup).not.toContain('gonavi-ai-provider-chips');
    expect(markup).not.toContain('Provider catalog');
    expect(markup).not.toContain('gonavi-ai-provider-add-preset-select');
  });

  it('renders an empty dashed state when there are no configurations', () => {
    const markup = wrap({ providers: [] });
    expect(markup).toContain('gonavi-ai-provider-config-empty');
    expect(markup).toContain('No AI configurations yet');
  });

  it('renders the connected tree node as the same list', () => {
    const markup = wrap({ treeHostedView: 'connected' });
    expect(markup).toContain('AI configurations');
    expect(markup).toContain('gonavi-ai-provider-config-card');
    expect(markup).not.toContain('gonavi-ai-provider-chips');
  });

  it('renders the left-label edit form with apply/cancel/test', () => {
    const markup = wrap({ isEditing: true, editingProvider: provider, watchedPresetKey: 'openai', watchedApiFormat: 'openai' });
    expect(markup).toContain('Edit configuration');
    expect(markup).toContain('Configuration name');
    expect(markup).toContain('Provider');
    expect(markup).toContain('Custom headers');
    expect(markup).toContain('Max output tokens');
    expect(markup).toContain('Context window');
    expect(markup).toContain('Test connection');
    expect(markup).toContain('Apply');
    expect(markup).toContain('Back');
    expect(markup).toContain('ant-form-horizontal');
    expect(markup).toContain('0 0 12em');
    expect(markup).toContain('1 1 0%');
    expect(markup).not.toContain('gonavi-ai-provider-connection-fields is-inline');
    expect(markup).not.toContain('Connection field layout');
  });

  it('keeps a single API format as a read-only input', () => {
    const markup = wrap({
      isEditing: true,
      editingProvider: provider,
      watchedPresetKey: 'anthropic',
      watchedApiFormat: 'anthropic',
      resolveProviderPreset: () => ({ key: 'anthropic', label: 'Claude', icon: <span>A</span> }),
    });
    expect(markup).toContain('gonavi-ai-provider-fixed-value');
    expect(markup).toContain('Authentication');
  });
});
