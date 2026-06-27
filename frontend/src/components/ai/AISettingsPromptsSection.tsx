import React from 'react';
import { Button, Input } from 'antd';
import { RobotOutlined } from '@ant-design/icons';

import { t as catalogTranslate } from '../../i18n/catalog';
import type { I18nParams } from '../../i18n';
import { useOptionalI18n } from '../../i18n/provider';
import type { AIUserPromptSettings } from '../../types';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

interface AISettingsPromptsSectionProps {
  builtinPrompts: Record<string, string>;
  userPromptSettings: AIUserPromptSettings;
  overlayTheme: OverlayWorkbenchTheme;
  cardBg: string;
  cardBorder: string;
  inputBg: string;
  darkMode: boolean;
  loading: boolean;
  onChangeUserPrompt: (key: keyof AIUserPromptSettings, value: string) => void;
  onSave: () => void;
}

const USER_PROMPT_FIELDS: Array<{
  key: keyof AIUserPromptSettings;
  titleKey: string;
  descKey: string;
  rows: number;
}> = [
  {
    key: 'global',
    titleKey: 'ai_settings.prompts.field.global.title',
    descKey: 'ai_settings.prompts.field.global.description',
    rows: 4,
  },
  {
    key: 'database',
    titleKey: 'ai_settings.prompts.field.database.title',
    descKey: 'ai_settings.prompts.field.database.description',
    rows: 5,
  },
  {
    key: 'jvm',
    titleKey: 'ai_settings.prompts.field.jvm.title',
    descKey: 'ai_settings.prompts.field.jvm.description',
    rows: 4,
  },
  {
    key: 'jvmDiagnostic',
    titleKey: 'ai_settings.prompts.field.jvm_diagnostic.title',
    descKey: 'ai_settings.prompts.field.jvm_diagnostic.description',
    rows: 4,
  },
];

const AISettingsPromptsSection: React.FC<AISettingsPromptsSectionProps> = ({
  builtinPrompts,
  userPromptSettings,
  overlayTheme,
  cardBg,
  cardBorder,
  inputBg,
  darkMode,
  loading,
  onChangeUserPrompt,
  onSave,
}) => {
  const i18n = useOptionalI18n();
  const copy = (key: string, params?: I18nParams) => {
    const translate = i18n?.t ?? ((key: string, params?: I18nParams) =>
      catalogTranslate('en-US', key, params));
    return translate(key, params);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          padding: '14px 16px',
          borderRadius: 14,
          border: `1px solid ${cardBorder}`,
          background: cardBg,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14, color: overlayTheme.titleText, marginBottom: 6 }}>
          {copy('ai_settings.prompts.user.title')}
        </div>
        <div style={{ fontSize: 13, color: overlayTheme.mutedText, lineHeight: 1.6, marginBottom: 14 }}>
          {copy('ai_settings.prompts.user.description')}
        </div>

        {USER_PROMPT_FIELDS.map((item) => (
          <div key={item.key} style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: overlayTheme.titleText, marginBottom: 4 }}>
              {copy(item.titleKey)}
            </div>
            <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.6, marginBottom: 8 }}>
              {copy(item.descKey)}
            </div>
            <Input.TextArea
              rows={item.rows}
              value={userPromptSettings[item.key]}
              onChange={(event) => onChangeUserPrompt(item.key, event.target.value)}
              placeholder={copy('ai_settings.prompts.placeholder.empty')}
              style={{
                borderRadius: 10,
                background: inputBg,
                border: `1px solid ${cardBorder}`,
                fontFamily: 'var(--gn-font-mono)',
                resize: 'vertical',
              }}
            />
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <Button type="primary" onClick={onSave} loading={loading} style={{ borderRadius: 10, fontWeight: 600 }}>
            {copy('ai_settings.prompts.action.save')}
          </Button>
        </div>
      </div>

      <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginBottom: 4 }}>
        {copy('ai_settings.prompts.builtin.description')}
      </div>
      {Object.entries(builtinPrompts).map(([title, promptText]) => (
        <div
          key={title}
          style={{
            padding: '12px',
            borderRadius: 12,
            border: `1px solid ${cardBorder}`,
            background: cardBg,
          }}
        >
          <div
            style={{
              fontWeight: 700,
              fontSize: 14,
              color: overlayTheme.titleText,
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <RobotOutlined style={{ color: overlayTheme.iconColor }} /> {title}
          </div>
          <div
            style={{
              background: darkMode ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.8)',
              padding: '10px 12px',
              borderRadius: 8,
              fontSize: 13,
              color: overlayTheme.mutedText,
              whiteSpace: 'pre-wrap',
              fontFamily: 'var(--gn-font-mono)',
              lineHeight: 1.5,
              userSelect: 'text',
              border: darkMode ? '1px solid rgba(255,255,255,0.03)' : '1px solid rgba(0,0,0,0.02)',
            }}
          >
            {promptText}
          </div>
        </div>
      ))}
    </div>
  );
};

export default AISettingsPromptsSection;
