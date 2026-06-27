import React from 'react';
import {
  ApiOutlined,
  AppstoreOutlined,
  ExperimentOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  ToolOutlined,
} from '@ant-design/icons';

import { t as catalogTranslate } from '../../i18n/catalog';
import { useOptionalI18n } from '../../i18n/provider';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

export type AISettingsSectionKey =
  | 'providers'
  | 'safety'
  | 'context'
  | 'mcp'
  | 'skills'
  | 'prompts'
  | 'tools';

const AI_SETTINGS_NAV_ITEMS: Array<{
  key: AISettingsSectionKey;
  titleKey: string;
  descriptionKey: string;
  icon: React.ReactNode;
}> = [
  { key: 'providers', titleKey: 'ai_settings.nav.providers.title', descriptionKey: 'ai_settings.nav.providers.description', icon: <ApiOutlined /> },
  { key: 'safety', titleKey: 'ai_settings.nav.safety.title', descriptionKey: 'ai_settings.nav.safety.description', icon: <SafetyCertificateOutlined /> },
  { key: 'context', titleKey: 'ai_settings.nav.context.title', descriptionKey: 'ai_settings.nav.context.description', icon: <RobotOutlined /> },
  { key: 'mcp', titleKey: 'ai_settings.nav.mcp.title', descriptionKey: 'ai_settings.nav.mcp.description', icon: <AppstoreOutlined /> },
  { key: 'skills', titleKey: 'ai_settings.nav.skills.title', descriptionKey: 'ai_settings.nav.skills.description', icon: <ExperimentOutlined /> },
  { key: 'tools', titleKey: 'ai_settings.nav.tools.title', descriptionKey: 'ai_settings.nav.tools.description', icon: <ToolOutlined /> },
  { key: 'prompts', titleKey: 'ai_settings.nav.prompts.title', descriptionKey: 'ai_settings.nav.prompts.description', icon: <ExperimentOutlined /> },
];

interface AISettingsSidebarProps {
  activeSection: AISettingsSectionKey;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  onSelectSection: (section: AISettingsSectionKey) => void;
}

const AISettingsSidebar: React.FC<AISettingsSidebarProps> = ({
  activeSection,
  darkMode,
  overlayTheme,
  onSelectSection,
}) => {
  const i18n = useOptionalI18n();
  const copy = (key: string) => (i18n?.t ?? ((catalogKey) => catalogTranslate('en-US', catalogKey)))(key);

  return (
    <div style={{ minHeight: 0, height: '100%', overflowY: 'auto', overflowX: 'hidden', padding: '0 6px 28px 12px' }}>
      <div style={{ marginBottom: 12, fontWeight: 600, color: overlayTheme.titleText }}>{copy('ai_settings.nav.title')}</div>
      <div style={{ display: 'grid', gap: 10 }}>
        {AI_SETTINGS_NAV_ITEMS.map((item) => {
          const active = activeSection === item.key;
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={active}
              onClick={() => onSelectSection(item.key)}
              style={{
                textAlign: 'left',
                padding: '12px 14px',
                borderRadius: 12,
                border: `1px solid ${active
                  ? (darkMode ? 'rgba(255,214,102,0.3)' : 'rgba(24,144,255,0.24)')
                  : (darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(16,24,40,0.08)')}`,
                background: active
                  ? (darkMode ? 'linear-gradient(180deg, rgba(255,214,102,0.12) 0%, rgba(255,214,102,0.06) 100%)' : 'linear-gradient(180deg, rgba(24,144,255,0.10) 0%, rgba(24,144,255,0.05) 100%)')
                  : (darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.72)'),
                color: active ? (darkMode ? '#f5f7ff' : '#162033') : (darkMode ? 'rgba(255,255,255,0.82)' : '#3f4b5e'),
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{copy(item.titleKey)}</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.6, color: active ? (darkMode ? 'rgba(255,255,255,0.68)' : 'rgba(22,32,51,0.68)') : 'rgba(128,128,128,0.7)' }}>
                {copy(item.descriptionKey)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default AISettingsSidebar;
