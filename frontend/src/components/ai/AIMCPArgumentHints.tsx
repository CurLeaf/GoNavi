import React from 'react';

import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import { buildMCPArgumentHintProfile } from '../../utils/mcpArgumentHints';
import { buildMCPHintStyle, mcpLabelStyle } from './AIMCPHelpBlock';

interface AIMCPArgumentHintsProps {
  command: string;
  args?: string[];
  cardBorder: string;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
}

const AIMCPArgumentHints: React.FC<AIMCPArgumentHintsProps> = ({
  command,
  args,
  cardBorder,
  darkMode,
  overlayTheme,
}) => {
  const profile = buildMCPArgumentHintProfile(command, args);
  if (!profile) {
    return null;
  }

  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 10,
        border: `1px dashed ${cardBorder}`,
        background: darkMode ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.7)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ ...mcpLabelStyle, color: overlayTheme.titleText }}>
        当前命令 {profile.commandName} 的参数提示
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: overlayTheme.titleText }}>
        {profile.title}
      </div>
      <div style={buildMCPHintStyle(overlayTheme.mutedText)}>{profile.summary}</div>
      <div style={buildMCPHintStyle(overlayTheme.mutedText)}>{profile.orderHint}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {profile.steps.map((step) => (
          <span
            key={step.key}
            style={{
              padding: '4px 9px',
              borderRadius: 999,
              fontSize: 12,
              border: `1px solid ${cardBorder}`,
              color: step.satisfied ? '#16a34a' : (step.required ? '#b45309' : overlayTheme.mutedText),
              background: step.satisfied
                ? (darkMode ? 'rgba(34,197,94,0.14)' : 'rgba(34,197,94,0.10)')
                : (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.82)'),
            }}
            title={step.detail}
          >
            {step.label}: <code style={{ fontFamily: 'var(--gn-font-mono)' }}>{step.example}</code>
            {step.required ? ' *' : ''}
          </span>
        ))}
      </div>
      {profile.nextActions.length > 0 ? (
        <div style={buildMCPHintStyle('#b45309')}>
          下一步：{profile.nextActions.join('；')}
        </div>
      ) : (
        <div style={buildMCPHintStyle(overlayTheme.mutedText)}>
          必填参数看起来已经齐了，测试失败时再对照 README 检查业务参数和环境变量。
        </div>
      )}
    </div>
  );
};

export default AIMCPArgumentHints;
