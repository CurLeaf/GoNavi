import React from 'react';
import { CheckOutlined } from '@ant-design/icons';

import { t as catalogTranslate } from '../../i18n/catalog';
import { useOptionalI18n } from '../../i18n/provider';
import type { AIChatOpenMode } from '../../store';
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

const OPEN_MODE_OPTIONS: {
  labelKey: string;
  value: AIChatOpenMode;
  descKey: string;
  icon: string;
}[] = [
  { labelKey: 'ai_settings.open_mode.dock.label', value: 'dock', descKey: 'ai_settings.open_mode.dock.desc', icon: '📎' },
  { labelKey: 'ai_settings.open_mode.detached.label', value: 'detached', descKey: 'ai_settings.open_mode.detached.desc', icon: '🪟' },
];

interface AISettingsContextSectionProps {
  contextLevel: AIContextLevel;
  openMode: AIChatOpenMode;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  cardBg: string;
  cardBorder: string;
  onChange: (level: AIContextLevel) => void;
  onOpenModeChange: (mode: AIChatOpenMode) => void;
}

const ChoiceCard = ({
  active,
  icon,
  title,
  description,
  darkMode,
  overlayTheme,
  cardBg,
  cardBorder,
  onClick,
}: {
  active: boolean;
  icon: string;
  title: string;
  description: string;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  cardBg: string;
  cardBorder: string;
  onClick: () => void;
}) => (
  <div
    onClick={onClick}
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
      {icon}
    </div>
    <div style={{ flex: 1 }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: overlayTheme.titleText, display: 'flex', alignItems: 'center', gap: 8 }}>
        {title}
        {active && <CheckOutlined style={{ color: overlayTheme.iconColor, fontSize: 14 }} />}
      </div>
      <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginTop: 4, lineHeight: '1.5' }}>{description}</div>
    </div>
  </div>
);

const AISettingsContextSection: React.FC<AISettingsContextSectionProps> = ({
  contextLevel,
  openMode,
  darkMode,
  overlayTheme,
  cardBg,
  cardBorder,
  onChange,
  onOpenModeChange,
}) => {
  const i18n = useOptionalI18n();
  const copy = (key: string) => (i18n?.t ?? ((catalogKey) => catalogTranslate('en-US', catalogKey)))(key);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: overlayTheme.titleText, marginBottom: 2 }}>
        {copy('ai_settings.open_mode.title')}
      </div>
      <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginBottom: 8 }}>
        {copy('ai_settings.open_mode.description')}
      </div>
      {OPEN_MODE_OPTIONS.map((opt) => (
        <ChoiceCard
          key={opt.value}
          active={openMode === opt.value}
          icon={opt.icon}
          title={copy(opt.labelKey)}
          description={copy(opt.descKey)}
          darkMode={darkMode}
          overlayTheme={overlayTheme}
          cardBg={cardBg}
          cardBorder={cardBorder}
          onClick={() => onOpenModeChange(opt.value)}
        />
      ))}

      <div style={{ fontSize: 13, fontWeight: 700, color: overlayTheme.titleText, margin: '16px 0 2px' }}>
        {copy('ai_settings.context.section_title')}
      </div>
      <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginBottom: 8 }}>
        {copy('ai_settings.context.description')}
      </div>
      {CONTEXT_OPTIONS.map((opt) => (
        <ChoiceCard
          key={opt.value}
          active={contextLevel === opt.value}
          icon={opt.icon}
          title={copy(opt.labelKey)}
          description={copy(opt.descKey)}
          darkMode={darkMode}
          overlayTheme={overlayTheme}
          cardBg={cardBg}
          cardBorder={cardBorder}
          onClick={() => onChange(opt.value)}
        />
      ))}
    </div>
  );
};

export default AISettingsContextSection;
