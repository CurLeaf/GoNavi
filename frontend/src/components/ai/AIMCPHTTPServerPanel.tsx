import React from 'react';
import { Button, Input, Switch, Tag } from 'antd';
import { CopyOutlined } from '@ant-design/icons';

import { t as catalogTranslate } from '../../i18n/catalog';
import { useOptionalI18n } from '../../i18n/provider';
import type { AIMCPHTTPServerStatus } from '../../types';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

export interface AIMCPHTTPServerDraft {
  addr: string;
  path: string;
  authorizationHeader: string;
}

export interface AIMCPHTTPServerPanelProps {
  status: AIMCPHTTPServerStatus;
  draft: AIMCPHTTPServerDraft;
  loading: boolean;
  cardBg: string;
  cardBorder: string;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  onDraftChange: (patch: Partial<AIMCPHTTPServerDraft>) => void;
  onToggle: (checked: boolean) => void;
  onCopyURL: () => void;
  onCopyAuthorization: () => void;
}

const AIMCPHTTPServerPanel: React.FC<AIMCPHTTPServerPanelProps> = ({
  status,
  draft,
  loading,
  cardBg,
  cardBorder,
  darkMode,
  overlayTheme,
  onDraftChange,
  onToggle,
  onCopyURL,
  onCopyAuthorization,
}) => {
  const i18n = useOptionalI18n();
  const copy = (key: string) => (i18n?.t ?? ((catalogKey) => catalogTranslate('en-US', catalogKey)))(key);
  const running = status?.running === true;
  const url = String(status?.url || '').trim();
  const authorizationHeader = String(status?.authorizationHeader || '').trim();
  const inputStyle: React.CSSProperties = {
    borderRadius: 10,
    background: darkMode ? 'rgba(15,23,42,0.82)' : '#fff',
  };

  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: 14,
        border: `1px solid ${cardBorder}`,
        background: cardBg,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: overlayTheme.titleText }}>
              {copy('ai_settings.mcp_http.panel.title')}
            </div>
            <Tag color={running ? 'success' : 'default'} style={{ marginInlineEnd: 0 }}>
              {copy(running ? 'ai_settings.mcp_http.panel.status.running' : 'ai_settings.mcp_http.panel.status.stopped')}
            </Tag>
            <Tag color="blue" style={{ marginInlineEnd: 0 }}>
              schema-only
            </Tag>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
            {copy('ai_settings.mcp_http.panel.description')}
          </div>
        </div>
        <Switch
          checked={running}
          loading={loading}
          onChange={onToggle}
          checkedChildren={copy('ai_settings.mcp_http.panel.switch.on')}
          unCheckedChildren={copy('ai_settings.mcp_http.panel.switch.off')}
        />
      </div>
      <div
        style={{
          borderRadius: 12,
          border: `1px solid ${cardBorder}`,
          background: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.72)',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: overlayTheme.mutedText }}>
              {copy('ai_settings.mcp_http.panel.addr_label')}
            </span>
            <Input
              size="small"
              value={draft.addr}
              disabled={running || loading}
              placeholder="127.0.0.1:8765"
              onChange={(event) => onDraftChange({ addr: event.target.value })}
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: overlayTheme.mutedText }}>Authorization</span>
            <Input.Password
              size="small"
              value={draft.authorizationHeader}
              disabled={loading}
              readOnly={running || loading}
              placeholder={copy('ai_settings.mcp_http.panel.authorization_placeholder')}
              autoComplete="off"
              onChange={(event) => onDraftChange({ authorizationHeader: event.target.value })}
              style={inputStyle}
            />
          </div>
        </div>
        <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
          {running
            ? status.message || copy('ai_settings.mcp_http.panel.running_hint')
            : copy('ai_settings.mcp_http.panel.stopped_hint')}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <code
            style={{
              fontSize: 12,
              color: overlayTheme.titleText,
              background: darkMode ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.04)',
              borderRadius: 8,
              padding: '4px 7px',
            }}
          >
            {url || 'http://127.0.0.1:8765/mcp'}
          </code>
          <Button size="small" icon={<CopyOutlined />} disabled={!running || !url} onClick={onCopyURL}>
            {copy('ai_settings.mcp_http.panel.copy_url')}
          </Button>
          <Button
            size="small"
            icon={<CopyOutlined />}
            disabled={!running || !authorizationHeader}
            onClick={onCopyAuthorization}
          >
            {copy('ai_settings.mcp_http.panel.copy_authorization')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AIMCPHTTPServerPanel;
