import React from 'react';
import { CheckOutlined } from '@ant-design/icons';

import { t as catalogTranslate } from '../../i18n/catalog';
import { useOptionalI18n } from '../../i18n/provider';
import type { AIContextLevel } from '../../types';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

const CONTEXT_OPTIONS: {
  labelKey: string;
  value: AIContextLevel;
  descKey: string;
  icon: string;
}[] = [
  { labelKey: 'ai_settings.context.schema_only.label', value: 'schema_only', descKey: 'ai_settings.context.schema_only.desc', icon: '📋' },
  { labelKey: 'ai_settings.context.with_samples.label', value: 'with_samples', descKey: 'ai_settings.context.with_samples.desc', icon: '📊' },
  { labelKey: 'ai_settings.context.with_results.label', value: 'with_results', descKey: 'ai_settings.context.with_results.desc', icon: '📑' },
];

interface AISettingsContextSectionProps {
  contextLevel: AIContextLevel;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  cardBg: string;
  cardBorder: string;
  onChange: (level: AIContextLevel) => void;
}

const AISettingsContextSection: React.FC<AISettingsContextSectionProps> = ({
  contextLevel,
  darkMode,
  overlayTheme,
  cardBg,
  cardBorder,
  onChange,
}) => {
  const i18n = useOptionalI18n();
  const copy = (key: string) => (i18n?.t ?? ((catalogKey) => catalogTranslate('en-US', catalogKey)))(key);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginBottom: 8 }}>
        {copy('ai_settings.context.description')}
      </div>
      {CONTEXT_OPTIONS.map((opt) => {
        const active = contextLevel === opt.value;
        return (
          <div
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              padding: '14px 16px',
              borderRadius: 14,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              border: `1.5px solid ${active ? overlayTheme.selectedText : cardBorder}`,
              background: active ? overlayTheme.selectedBg : cardBg,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 14,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                display: 'grid',
                placeItems: 'center',
                fontSize: 18,
                flexShrink: 0,
                background: active ? overlayTheme.iconBg : (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'),
                color: active ? overlayTheme.iconColor : overlayTheme.mutedText,
                transition: 'all 0.2s ease',
              }}
            >
              {opt.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: overlayTheme.titleText, display: 'flex', alignItems: 'center', gap: 8 }}>
                {copy(opt.labelKey)}
                {active && <CheckOutlined style={{ color: overlayTheme.iconColor, fontSize: 14 }} />}
              </div>
              <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginTop: 4, lineHeight: '1.5' }}>{copy(opt.descKey)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AISettingsContextSection;
