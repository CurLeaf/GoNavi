import React from 'react';

import {
  REMOTE_MCP_PARAMETER_GUIDES,
  type RemoteMCPClientQuickStart,
} from '../../utils/mcpClientInstallStatus';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

interface AIMCPRemoteQuickStartPanelProps {
  quickStart: RemoteMCPClientQuickStart;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  cardBorder: string;
}

interface RemoteCommandCardProps {
  title: string;
  children: React.ReactNode;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  cardBorder: string;
}

const remoteCodeStyle = (overlayTheme: OverlayWorkbenchTheme): React.CSSProperties => ({
  display: 'block',
  marginTop: 8,
  fontFamily: 'var(--gn-font-mono)',
  fontSize: 11,
  color: overlayTheme.titleText,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
});

const RemoteCommandCard: React.FC<RemoteCommandCardProps> = ({
  title,
  children,
  darkMode,
  overlayTheme,
  cardBorder,
}) => (
  <div
    style={{
      padding: '10px 12px',
      borderRadius: 10,
      border: `1px solid ${cardBorder}`,
      background: darkMode ? 'rgba(15,23,42,0.55)' : 'rgba(255,255,255,0.78)',
    }}
  >
    <div style={{ fontWeight: 700, fontSize: 12, color: overlayTheme.titleText }}>
      {title}
    </div>
    {children}
  </div>
);

const AIMCPRemoteQuickStartPanel: React.FC<AIMCPRemoteQuickStartPanelProps> = ({
  quickStart,
  darkMode,
  overlayTheme,
  cardBorder,
}) => (
  <div
    style={{
      padding: '12px 14px',
      borderRadius: 12,
      border: `1px solid ${darkMode ? 'rgba(56,189,248,0.2)' : 'rgba(14,165,233,0.18)'}`,
      background: darkMode ? 'rgba(14,165,233,0.06)' : 'rgba(240,249,255,0.78)',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}
  >
    <div style={{ fontWeight: 700, fontSize: 13, color: overlayTheme.titleText }}>
      {quickStart.displayName} 远程 MCP 快速配置
    </div>
    <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
      下面分别给云端 Agent、无 GUI/CLI 场景和 Windows GoNavi 使用。云端只保存 MCP URL 和 Bearer Token，不保存数据库账号密码；默认 schema-only 只暴露结构工具。
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
      {REMOTE_MCP_PARAMETER_GUIDES.map((item) => (
        <div
          key={item.key}
          style={{
            padding: '10px 12px',
            borderRadius: 10,
            border: `1px solid ${cardBorder}`,
            background: darkMode ? 'rgba(15,23,42,0.42)' : 'rgba(255,255,255,0.72)',
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: overlayTheme.titleText }}>
              {item.title}
            </div>
            <span
              style={{
                padding: '2px 7px',
                borderRadius: 999,
                fontSize: 11,
                color: item.required ? '#dc2626' : overlayTheme.mutedText,
                background: item.required
                  ? (darkMode ? 'rgba(248,113,113,0.12)' : 'rgba(254,226,226,0.7)')
                  : (darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)'),
              }}
            >
              {item.required ? '必填' : '可选'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: overlayTheme.titleText, lineHeight: 1.6 }}>
            应填：{item.fill}
          </div>
          <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.6 }}>
            示例：<code style={{ fontFamily: 'var(--gn-font-mono)' }}>{item.example}</code>
          </div>
          <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.6 }}>
            避免：{item.avoid}
          </div>
        </div>
      ))}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
      <RemoteCommandCard title="配置到云端 Agent" darkMode={darkMode} overlayTheme={overlayTheme} cardBorder={cardBorder}>
        <code style={remoteCodeStyle(overlayTheme)}>
          {quickStart.configJson}
        </code>
      </RemoteCommandCard>
      <RemoteCommandCard title="无 GUI / CLI 生成配置" darkMode={darkMode} overlayTheme={overlayTheme} cardBorder={cardBorder}>
        <code style={remoteCodeStyle(overlayTheme)}>
          {quickStart.configCommand}
        </code>
        <div style={{ marginTop: 8, fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.6 }}>
          用于生成可粘贴到 {quickStart.displayName} 的远程 MCP 配置，不会读取或输出数据库密码。
        </div>
      </RemoteCommandCard>
      <RemoteCommandCard title="Windows 启动 GoNavi MCP HTTP" darkMode={darkMode} overlayTheme={overlayTheme} cardBorder={cardBorder}>
        <code style={remoteCodeStyle(overlayTheme)}>
          {quickStart.launchCommand}
        </code>
        <div style={{ marginTop: 8, fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.6 }}>
          独立二进制：{quickStart.standaloneCommand}
        </div>
      </RemoteCommandCard>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 12, color: overlayTheme.titleText }}>验证顺序</div>
        <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {quickStart.verificationSteps.map((item) => (
            <div key={item} style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.6 }}>
              {item}
            </div>
          ))}
        </div>
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 12, color: overlayTheme.titleText }}>安全边界</div>
        <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {quickStart.securityNotes.map((item) => (
            <div key={item} style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.6 }}>
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

export default AIMCPRemoteQuickStartPanel;
