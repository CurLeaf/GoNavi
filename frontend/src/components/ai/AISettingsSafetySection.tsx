import React from 'react';
import { CheckOutlined } from '@ant-design/icons';

import { t as catalogTranslate } from '../../i18n/catalog';
import { useOptionalI18n } from '../../i18n/provider';
import type { AISafetyLevel } from '../../types';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

const SAFETY_OPTIONS: {
  labelKey: string;
  value: AISafetyLevel;
  descKey: string;
  color: string;
  icon: string;
}[] = [
  { labelKey: 'ai_settings.safety.readonly.label', value: 'readonly', descKey: 'ai_settings.safety.readonly.desc', color: '#22c55e', icon: '🔒' },
  { labelKey: 'ai_settings.safety.readwrite.label', value: 'readwrite', descKey: 'ai_settings.safety.readwrite.desc', color: '#f59e0b', icon: '⚠️' },
  { labelKey: 'ai_settings.safety.full.label', value: 'full', descKey: 'ai_settings.safety.full.desc', color: '#ef4444', icon: '🔓' },
];

interface AISettingsSafetySectionProps {
  safetyLevel: AISafetyLevel;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  cardBg: string;
  cardBorder: string;
  onChange: (level: AISafetyLevel) => void;
}

const AISettingsSafetySection: React.FC<AISettingsSafetySectionProps> = ({
  safetyLevel,
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
        {copy('ai_settings.safety.description')}
      </div>
      {SAFETY_OPTIONS.map((opt) => {
        const active = safetyLevel === opt.value;
        return (
          <div
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              padding: '14px 16px',
              borderRadius: 14,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              border: `1.5px solid ${active ? (opt.color === '#ef4444' ? opt.color : overlayTheme.selectedText) : cardBorder}`,
              background: active ? (opt.color === '#ef4444' ? `${opt.color}15` : overlayTheme.selectedBg) : cardBg,
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
                background: active ? (opt.color === '#ef4444' ? `${opt.color}25` : overlayTheme.iconBg) : (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'),
                color: active ? (opt.color === '#ef4444' ? opt.color : overlayTheme.iconColor) : overlayTheme.mutedText,
                transition: 'all 0.2s ease',
              }}
            >
              {opt.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: overlayTheme.titleText, display: 'flex', alignItems: 'center', gap: 8 }}>
                {copy(opt.labelKey)}
                {active && <CheckOutlined style={{ color: opt.color === '#ef4444' ? opt.color : overlayTheme.iconColor, fontSize: 14 }} />}
              </div>
              <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginTop: 4, lineHeight: '1.5' }}>{copy(opt.descKey)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AISettingsSafetySection;
