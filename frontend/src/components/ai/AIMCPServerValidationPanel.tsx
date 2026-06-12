import React from 'react';

import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import type { MCPServerDraftIssue, MCPServerDraftValidation } from '../../utils/mcpServerValidation';
import { buildMCPHintStyle, mcpLabelStyle } from './AIMCPHelpBlock';

interface AIMCPServerValidationPanelProps {
  validation: MCPServerDraftValidation;
  cardBorder: string;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
}

const getIssueTone = (issue: MCPServerDraftIssue, darkMode: boolean) => {
  if (issue.severity === 'error') {
    return {
      label: '需修复',
      color: '#dc2626',
      bg: darkMode ? 'rgba(220,38,38,0.18)' : 'rgba(220,38,38,0.10)',
    };
  }
  if (issue.severity === 'warning') {
    return {
      label: '建议检查',
      color: '#b45309',
      bg: darkMode ? 'rgba(245,158,11,0.18)' : 'rgba(245,158,11,0.12)',
    };
  }
  return {
    label: '提示',
    color: '#2563eb',
    bg: darkMode ? 'rgba(59,130,246,0.18)' : 'rgba(59,130,246,0.12)',
  };
};

const AIMCPServerValidationPanel: React.FC<AIMCPServerValidationPanelProps> = ({
  validation,
  cardBorder,
  darkMode,
  overlayTheme,
}) => {
  const hasIssues = validation.issues.length > 0;
  const summaryText = validation.errorCount > 0
    ? `发现 ${validation.errorCount} 个必须修复的问题，修复后才能测试或保存。`
    : validation.warningCount > 0
      ? `发现 ${validation.warningCount} 个建议检查项，仍可测试和保存。`
      : '当前配置可以测试和保存。';

  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 10,
        border: `1px solid ${cardBorder}`,
        background: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.72)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ ...mcpLabelStyle, color: overlayTheme.titleText }}>配置检查</div>
      <div style={buildMCPHintStyle(validation.errorCount > 0 ? '#dc2626' : overlayTheme.mutedText)}>
        {summaryText}
      </div>
      {hasIssues ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {validation.issues.map((issue) => {
            const tone = getIssueTone(issue, darkMode);
            return (
              <div
                key={issue.key}
                style={{
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: `1px solid ${cardBorder}`,
                  background: darkMode ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.78)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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
                  <span style={{ fontSize: 12, fontWeight: 700, color: overlayTheme.titleText }}>{issue.title}</span>
                </div>
                <div style={buildMCPHintStyle(overlayTheme.mutedText)}>{issue.detail}</div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export default AIMCPServerValidationPanel;
