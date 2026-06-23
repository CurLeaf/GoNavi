import React from 'react';
import { CheckOutlined } from '@ant-design/icons';

import type { AISafetyLevel } from '../../types';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

const SAFETY_OPTIONS: { label: string; value: AISafetyLevel; desc: string; color: string; icon: string }[] = [
  { label: '只读模式', value: 'readonly', desc: 'AI 仅可执行 SELECT 等查询操作，最安全', color: '#22c55e', icon: '🔒' },
  { label: '读写模式', value: 'readwrite', desc: 'AI 可执行 INSERT/UPDATE/DELETE，危险操作需二次确认', color: '#f59e0b', icon: '⚠️' },
  { label: '完全模式', value: 'full', desc: 'AI 可执行所有操作（含 DDL/过程调用），高危或未识别操作会告警', color: '#ef4444', icon: '🔓' },
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
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginBottom: 8 }}>
      控制 AI 可执行的 SQL 操作类型，保护数据安全
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
              {opt.label}
              {active && <CheckOutlined style={{ color: opt.color === '#ef4444' ? opt.color : overlayTheme.iconColor, fontSize: 14 }} />}
            </div>
            <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginTop: 4, lineHeight: '1.5' }}>{opt.desc}</div>
          </div>
        </div>
      );
    })}
  </div>
);

export default AISettingsSafetySection;
