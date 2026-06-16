import React from 'react';
import { CheckOutlined } from '@ant-design/icons';

import type { AIContextLevel } from '../../types';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

const CONTEXT_OPTIONS: { label: string; value: AIContextLevel; desc: string; icon: string }[] = [
  { label: '仅 Schema', value: 'schema_only', desc: '只传递表/列结构信息给 AI', icon: '📋' },
  { label: '含采样数据', value: 'with_samples', desc: '包含少量采样数据帮助 AI 理解数据特征', icon: '📊' },
  { label: '含查询结果', value: 'with_results', desc: '传递最近的查询结果作为上下文', icon: '📑' },
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
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginBottom: 8 }}>
      控制发送给 AI 的数据库上下文信息量
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
              {opt.label}
              {active && <CheckOutlined style={{ color: overlayTheme.iconColor, fontSize: 14 }} />}
            </div>
            <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginTop: 4, lineHeight: '1.5' }}>{opt.desc}</div>
          </div>
        </div>
      );
    })}
  </div>
);

export default AISettingsContextSection;
