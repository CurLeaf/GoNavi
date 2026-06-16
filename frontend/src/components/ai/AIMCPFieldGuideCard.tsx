import React from 'react';

import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import type { MCPFieldGuide } from '../../utils/mcpServerGuidance';
import { buildMCPFieldTone, buildMCPHintStyle } from './AIMCPHelpBlock';

interface AIMCPFieldGuideCardProps {
  item: MCPFieldGuide;
  cardBorder: string;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  compact?: boolean;
}

const AIMCPFieldGuideCard: React.FC<AIMCPFieldGuideCardProps> = ({
  item,
  cardBorder,
  darkMode,
  overlayTheme,
  compact = false,
}) => {
  const tone = buildMCPFieldTone(item.fieldState, darkMode);
  return (
    <div
      style={{
        padding: compact ? '10px 12px' : '10px 12px',
        borderRadius: compact ? 12 : 10,
        border: `1px solid ${cardBorder}`,
        background: darkMode ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.78)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: overlayTheme.titleText }}>{item.title}</div>
        <span
          style={{
            padding: '2px 8px',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            color: tone.color,
            background: tone.bg,
          }}
        >
          {tone.label}
        </span>
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.6, color: overlayTheme.titleText }}>{item.summary}</div>
      {!compact && <div style={buildMCPHintStyle(overlayTheme.mutedText)}>{item.detail}</div>}
      <div style={buildMCPHintStyle(overlayTheme.mutedText)}>
        <strong>应填：</strong>
        {item.fill}
      </div>
      <div style={buildMCPHintStyle(overlayTheme.mutedText)}>
        <strong>不要填：</strong>
        {item.avoid}
      </div>
      {item.example ? (
        <div style={buildMCPHintStyle(overlayTheme.mutedText)}>
          示例值：
          {' '}
          <code style={{ fontFamily: 'var(--gn-font-mono)' }}>{item.example}</code>
        </div>
      ) : null}
    </div>
  );
};

export default AIMCPFieldGuideCard;
