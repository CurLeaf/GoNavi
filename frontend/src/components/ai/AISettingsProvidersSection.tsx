import React from 'react';
import { Button, Form, Input, Popconfirm, Select, Space, Tooltip } from 'antd';
import { ApiOutlined, AppstoreOutlined, CheckOutlined, DeleteOutlined, EditOutlined, KeyOutlined, LinkOutlined, PlusOutlined, RobotOutlined } from '@ant-design/icons';
import type { FormInstance } from 'antd/es/form';

import type { AIProviderConfig } from '../../types';
import { t as catalogTranslate } from '../../i18n/catalog';
import { useOptionalI18n } from '../../i18n/provider';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import {
  PROVIDER_PRESET_CARD_BASE_STYLE,
  PROVIDER_PRESET_CARD_CONTENT_STYLE,
  PROVIDER_PRESET_CARD_DESCRIPTION_STYLE,
  PROVIDER_PRESET_GRID_STYLE,
  PROVIDER_PRESET_CARD_TITLE_STYLE,
} from '../../utils/aiSettingsPresetLayout';

export interface AISettingsProviderPresetOption {
  key: string;
  label: string;
  icon: React.ReactNode;
  desc: string;
  defaultBaseUrl: string;
}

interface MatchedProviderPreset {
  label: string;
  icon: React.ReactNode;
}

interface AISettingsProvidersSectionProps {
  providers: AIProviderConfig[];
  activeProviderId: string;
  editingProvider: AIProviderConfig | null;
  isEditing: boolean;
  form: FormInstance;
  providerPresets: AISettingsProviderPresetOption[];
  watchedPresetKey?: string;
  watchedApiFormat?: string;
  loading: boolean;
  testStatus: 'idle' | 'success' | 'error';
  primaryPasswordVisible: boolean;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  cardBg: string;
  cardBorder: string;
  inputBg: string;
  onPrimaryPasswordVisibleChange: (visible: boolean) => void;
  resolveProviderPreset: (provider: Pick<AIProviderConfig, 'type' | 'baseUrl' | 'apiFormat'>) => MatchedProviderPreset;
  resolvePresetByKey: (presetKey: string) => AISettingsProviderPresetOption;
  onAddProvider: () => void;
  onEditProvider: (provider: AIProviderConfig) => void;
  onDeleteProvider: (id: string) => void;
  onSetActiveProvider: (id: string) => void;
  onCancelEdit: () => void;
  onPresetChange: (presetKey: string) => void;
  onTestProvider: () => void;
  onSaveProvider: () => void;
}

const fieldGroupStyle = (cardBorder: string, cardBg: string): React.CSSProperties => ({
  padding: '14px 16px',
  borderRadius: 12,
  border: `1px solid ${cardBorder}`,
  background: cardBg,
  marginBottom: 12,
});

const fieldLabelStyle = (sectionLabelColor: string): React.CSSProperties => ({
  fontSize: 13,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: sectionLabelColor,
  marginBottom: 10,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
});

const AISettingsProvidersSection: React.FC<AISettingsProvidersSectionProps> = ({
  providers,
  activeProviderId,
  editingProvider,
  isEditing,
  form,
  providerPresets,
  watchedPresetKey,
  watchedApiFormat,
  loading,
  testStatus,
  primaryPasswordVisible,
  darkMode,
  overlayTheme,
  cardBg,
  cardBorder,
  inputBg,
  onPrimaryPasswordVisibleChange,
  resolveProviderPreset,
  resolvePresetByKey,
  onAddProvider,
  onEditProvider,
  onDeleteProvider,
  onSetActiveProvider,
  onCancelEdit,
  onPresetChange,
  onTestProvider,
  onSaveProvider,
}) => {
  const i18n = useOptionalI18n();
  const copy = (key: string) => (i18n?.t ?? ((catalogKey) => catalogTranslate('en-US', catalogKey)))(key);
  const presetKeyFromForm = watchedPresetKey || (editingProvider as (AIProviderConfig & { presetKey?: string }) | null)?.presetKey || 'openai';
  const supportsAdvancedEndpoint = presetKeyFromForm === 'custom' || presetKeyFromForm === 'ollama' || presetKeyFromForm === 'codebuddy' || presetKeyFromForm === 'cursor';
  const codeBuddyUsesOptionalSecret = presetKeyFromForm === 'codebuddy';
  const cursorUsesOptionalModel = presetKeyFromForm === 'cursor';
  const sectionLabelColor = darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)';
  const currentFieldGroupStyle = fieldGroupStyle(cardBorder, cardBg);
  const currentFieldLabelStyle = fieldLabelStyle(sectionLabelColor);

  if (!isEditing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {providers.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '36px 20px',
            color: overlayTheme.mutedText,
            fontSize: 14,
            border: `1px dashed ${cardBorder}`,
            borderRadius: 14,
            background: cardBg,
          }}>
            <RobotOutlined style={{ fontSize: 32, marginBottom: 12, opacity: 0.3, display: 'block' }} />
            {copy('ai_settings.provider.empty.title')}
            <br />
            <span style={{ fontSize: 13, opacity: 0.6 }}>{copy('ai_settings.provider.empty.description')}</span>
          </div>
        )}
        {providers.map((provider) => {
          const matchedPreset = resolveProviderPreset(provider);
          const isActive = provider.id === activeProviderId;
          const modelLabel = provider.model
            || (provider.apiFormat === 'codebuddy-cli' || provider.apiFormat === 'cursor-agent'
              ? copy('ai_settings.provider.auto_model')
              : copy('ai_settings.provider.no_model'));
          return (
            <div
              key={provider.id}
              onClick={() => onSetActiveProvider(provider.id)}
              style={{
                padding: '14px 16px',
                borderRadius: 14,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                border: `1.5px solid ${isActive ? overlayTheme.selectedText : cardBorder}`,
                background: isActive ? overlayTheme.selectedBg : cardBg,
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                display: 'grid',
                placeItems: 'center',
                background: isActive ? overlayTheme.iconBg : (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'),
                color: isActive ? overlayTheme.iconColor : overlayTheme.mutedText,
                fontSize: 18,
                flexShrink: 0,
                transition: 'all 0.2s ease',
              }}>
                {matchedPreset.icon || <ApiOutlined />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: overlayTheme.titleText, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {provider.name || provider.type}
                  {isActive && <CheckOutlined style={{ color: overlayTheme.iconColor, fontSize: 13 }} />}
                </div>
                <div style={{ fontSize: 12, color: overlayTheme.mutedText, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{matchedPreset.label}</span>
                  <span style={{ opacity: 0.4 }}>·</span>
                  <span style={{ fontFamily: 'var(--gn-font-mono)', fontSize: 12 }}>{modelLabel}</span>
                </div>
              </div>
              <Space size={2}>
                <Tooltip title={copy('ai_settings.provider.action.edit')}>
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={(event) => {
                      event.stopPropagation();
                      onEditProvider(provider);
                    }}
                    style={{ color: overlayTheme.mutedText }}
                  />
                </Tooltip>
                <Popconfirm
                  title={copy('ai_settings.provider.confirm_delete')}
                  onConfirm={() => onDeleteProvider(provider.id)}
                  okButtonProps={{ danger: true }}
                  okText={copy('ai_settings.provider.action.delete')}
                  cancelText={copy('common.cancel')}
                >
                  <Button
                    type="text"
                    size="small"
                    icon={<DeleteOutlined />}
                    danger
                    onClick={(event) => event.stopPropagation()}
                  />
                </Popconfirm>
              </Space>
            </div>
          );
        })}
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={onAddProvider}
          style={{ borderRadius: 12, height: 42, borderColor: darkMode ? 'rgba(255,255,255,0.12)' : undefined }}
        >
          {copy('ai_settings.provider.action.add')}
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Button size="small" onClick={onCancelEdit} style={{ borderRadius: 8 }}>{copy('ai_settings.action.back')}</Button>
        <span style={{ fontWeight: 700, fontSize: 16, color: overlayTheme.titleText }}>
          {copy(editingProvider?.id ? 'ai_settings.provider.editor.edit_title' : 'ai_settings.provider.editor.add_title')}
        </span>
      </div>

      <Form form={form} layout="vertical" size="small">
        <div style={currentFieldGroupStyle}>
          <div style={currentFieldLabelStyle}>
            <AppstoreOutlined style={{ fontSize: 14 }} /> {copy('ai_settings.form.section.service_type')}
          </div>
          <Form.Item name="presetKey" noStyle>
            <div style={PROVIDER_PRESET_GRID_STYLE}>
              {providerPresets.map((preset) => (
                <div
                  key={preset.key}
                  onClick={() => {
                    form.setFieldValue('presetKey', preset.key);
                    onPresetChange(preset.key);
                  }}
                  style={{
                    ...PROVIDER_PRESET_CARD_BASE_STYLE,
                    border: `1.5px solid ${presetKeyFromForm === preset.key ? overlayTheme.selectedText : 'transparent'}`,
                    background: presetKeyFromForm === preset.key ? overlayTheme.selectedBg : (darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.72)'),
                    boxShadow: presetKeyFromForm === preset.key ? 'none' : (darkMode ? 'inset 0 0 0 1px rgba(255,255,255,0.028)' : 'inset 0 0 0 1px rgba(16,24,40,0.03)'),
                  }}
                >
                  <div style={{
                    color: presetKeyFromForm === preset.key ? overlayTheme.iconColor : overlayTheme.mutedText,
                    fontSize: 18,
                    marginTop: 2,
                    transition: 'all 0.2s ease',
                    flexShrink: 0,
                  }}>
                    {preset.icon}
                  </div>
                  <div style={PROVIDER_PRESET_CARD_CONTENT_STYLE}>
                    <div style={{ ...PROVIDER_PRESET_CARD_TITLE_STYLE, fontSize: 13, fontWeight: 700, color: overlayTheme.titleText, lineHeight: 1.3 }}>{preset.label}</div>
                    <div style={{ ...PROVIDER_PRESET_CARD_DESCRIPTION_STYLE, fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.4 }}>{preset.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </Form.Item>
          <Form.Item name="type" hidden><Input /></Form.Item>
        </div>

        {supportsAdvancedEndpoint && (
          <div style={{ ...currentFieldGroupStyle, marginTop: 16 }}>
            <div style={currentFieldLabelStyle}>
              <RobotOutlined style={{ fontSize: 14 }} /> {copy('ai_settings.form.section.basic')}
            </div>

            {presetKeyFromForm === 'custom' && (
              <Form.Item label={<span style={{ fontWeight: 500, color: overlayTheme.titleText }}>{copy('ai_settings.form.provider_name')}</span>} name="name" rules={[{ required: true, message: copy('ai_settings.form.provider_name_required') }]} style={{ marginBottom: 16 }}>
                <Input
                  placeholder={copy('ai_settings.form.provider_name_placeholder')}
                  size="middle"
                  style={{ borderRadius: 8, background: inputBg, border: `1px solid ${cardBorder}` }}
                />
              </Form.Item>
            )}

            {presetKeyFromForm === 'custom' && (
              <Form.Item label={<span style={{ fontWeight: 500, color: overlayTheme.titleText }}>{copy('ai_settings.form.api_format')}</span>} name="apiFormat" style={{ marginBottom: 16 }}>
                <div style={{
                  display: 'inline-flex',
                  padding: 4,
                  background: darkMode ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.04)',
                  borderRadius: 8,
                  gap: 4,
                }}>
                  {[{ value: 'openai', label: 'OpenAI' }, { value: 'anthropic', label: 'Anthropic' }, { value: 'gemini', label: 'Gemini' }, { value: 'cursor-agent', label: 'Cursor Agent' }, { value: 'claude-cli', label: 'Claude CLI' }].map((format) => (
                    <div
                      key={format.value}
                      onClick={() => form.setFieldsValue({ apiFormat: format.value })}
                      style={{
                        padding: '6px 16px',
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: watchedApiFormat === format.value ? 600 : 500,
                        cursor: 'pointer',
                        background: watchedApiFormat === format.value ? (darkMode ? '#374151' : '#ffffff') : 'transparent',
                        color: watchedApiFormat === format.value ? overlayTheme.titleText : overlayTheme.mutedText,
                        boxShadow: watchedApiFormat === format.value ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {format.label}
                    </div>
                  ))}
                </div>
              </Form.Item>
            )}

            <Form.Item label={<span style={{ fontWeight: 500, color: overlayTheme.titleText }}>{copy('ai_settings.form.model_list')}</span>} name="models" style={{ marginBottom: 0 }}>
              <Select
                mode="tags"
                size="middle"
                placeholder={codeBuddyUsesOptionalSecret
                  ? copy('ai_settings.form.model_list_placeholder.codebuddy')
                  : cursorUsesOptionalModel
                    ? copy('ai_settings.form.model_list_placeholder.cursor')
                    : copy('ai_settings.form.model_list_placeholder')}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </div>
        )}
        <Form.Item name="model" hidden><Input /></Form.Item>
        <Form.Item name="name" hidden><Input /></Form.Item>

        <div style={{ ...currentFieldGroupStyle, marginTop: 16 }}>
          <div style={currentFieldLabelStyle}>
            <KeyOutlined style={{ fontSize: 14 }} /> {copy('ai_settings.form.section.auth_connection')}
          </div>
          <Form.Item
            label={<span style={{ fontWeight: 500, color: overlayTheme.titleText }}>{codeBuddyUsesOptionalSecret ? copy('ai_settings.form.api_key.codebuddy_optional') : copy('ai_settings.form.api_key')}</span>}
            name="apiKey"
            rules={[{
              validator: (_, value) => {
                const apiKey = String(value || '').trim();
                if (apiKey || editingProvider?.id || codeBuddyUsesOptionalSecret) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error(copy('ai_settings.form.api_key_required')));
              },
            }]}
            extra={codeBuddyUsesOptionalSecret ? copy('ai_settings.form.api_key.codebuddy_hint') : undefined}
            style={{ marginBottom: 16 }}
          >
            <Input.Password
              placeholder={codeBuddyUsesOptionalSecret ? copy('ai_settings.form.api_key_placeholder.codebuddy') : copy('ai_settings.form.api_key_placeholder')}
              size="middle"
              visibilityToggle={{
                visible: primaryPasswordVisible,
                onVisibleChange: onPrimaryPasswordVisibleChange,
              }}
              style={{ borderRadius: 8, background: inputBg, border: `1px solid ${cardBorder}` }}
            />
          </Form.Item>

          {supportsAdvancedEndpoint && (
            <Form.Item
              label={<span style={{ fontWeight: 500, color: overlayTheme.titleText }}>{copy('ai_settings.form.api_endpoint')}</span>}
              name="baseUrl"
              rules={presetKeyFromForm === 'codebuddy' ? [] : [{ required: true, message: copy('ai_settings.form.api_endpoint_required') }]}
              style={{ marginBottom: 0 }}
            >
              <Input
                placeholder={presetKeyFromForm === 'codebuddy' ? copy('ai_settings.form.api_endpoint_placeholder.codebuddy') : (resolvePresetByKey(presetKeyFromForm).defaultBaseUrl || 'https://...')}
                size="middle"
                suffix={<LinkOutlined style={{ color: overlayTheme.mutedText }} />}
                style={{ borderRadius: 8, background: inputBg, border: `1px solid ${cardBorder}` }}
              />
            </Form.Item>
          )}
        </div>

        <div style={{
          display: 'flex',
          gap: 8,
          justifyContent: 'flex-end',
          marginTop: 12,
          paddingTop: 16,
          borderTop: `1px solid ${cardBorder}`,
          paddingBottom: 24,
        }}>
          <Button
            onClick={onTestProvider}
            loading={loading}
            style={{ borderRadius: 10 }}
            icon={testStatus === 'success' ? <CheckOutlined style={{ color: '#22c55e' }} /> : undefined}
          >
            {testStatus === 'success' ? copy('ai_settings.action.connection_ok') : testStatus === 'error' ? copy('ai_settings.action.retest') : copy('ai_settings.action.test')}
          </Button>
          <Button type="primary" onClick={onSaveProvider} loading={loading} style={{ borderRadius: 10, fontWeight: 600 }}>
            {copy('ai_settings.action.save')}
          </Button>
        </div>
      </Form>
    </div>
  );
};

export default AISettingsProvidersSection;
