import React from 'react';

import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import { buildMCPEnvHintProfile } from '../../utils/mcpEnvHints';
import { buildMCPHintStyle, mcpLabelStyle } from './AIMCPHelpBlock';

interface AIMCPEnvHintsProps {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cardBorder: string;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
}

const categoryLabel = {
  secret: '密钥',
  endpoint: '地址',
  proxy: '代理',
  path: '路径',
  runtime: '运行时',
  generic: '自定义',
};

const categoryColor = {
  secret: '#b45309',
  endpoint: '#2563eb',
  proxy: '#0f766e',
  path: '#7c3aed',
  runtime: '#475569',
  generic: '#64748b',
};

const AIMCPEnvHints: React.FC<AIMCPEnvHintsProps> = ({
  command,
  args,
  env,
  cardBorder,
  darkMode,
  overlayTheme,
}) => {
  const profile = buildMCPEnvHintProfile(command, args, env);
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
      <div style={{ ...mcpLabelStyle, color: overlayTheme.titleText }}>环境变量用途提示</div>
      <div style={buildMCPHintStyle(overlayTheme.mutedText)}>
        已识别 {profile.envVarCount} 个变量，其中 {profile.secretLikeCount} 个像密钥；这里只解释 key 的用途和风险，不会显示 value。
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
        {profile.items.map((item) => (
          <div
            key={item.key}
            style={{
              padding: '8px 10px',
              borderRadius: 10,
              border: `1px solid ${cardBorder}`,
              background: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.82)',
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <code style={{ fontFamily: 'var(--gn-font-mono)', fontSize: 12, color: overlayTheme.titleText }}>{item.key}</code>
              <span
                style={{
                  padding: '1px 7px',
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                  color: categoryColor[item.category],
                  background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)',
                }}
              >
                {categoryLabel[item.category]}
              </span>
              {item.known ? <span style={buildMCPHintStyle('#16a34a')}>已识别</span> : null}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: overlayTheme.titleText }}>{item.label}</div>
            <div style={buildMCPHintStyle(overlayTheme.mutedText)}>{item.detail}</div>
            <div style={buildMCPHintStyle(item.empty || item.placeholder ? '#b45309' : overlayTheme.mutedText)}>
              应填：{item.valueHint}
              {item.empty ? ' 当前值为空。' : ''}
              {item.placeholder ? ' 当前像示例占位值。' : ''}
            </div>
          </div>
        ))}
      </div>
      {profile.warnings.length > 0 ? (
        <div style={buildMCPHintStyle('#b45309')}>
          注意：{profile.warnings.join('；')}
        </div>
      ) : null}
      <div style={buildMCPHintStyle(overlayTheme.mutedText)}>
        下一步：{profile.nextActions.join('；')}
      </div>
    </div>
  );
};

export default AIMCPEnvHints;
