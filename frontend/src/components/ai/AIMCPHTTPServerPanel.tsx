import React from 'react';
import { Button, Input, Switch, Tag } from 'antd';
import { CopyOutlined } from '@ant-design/icons';

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
            <div style={{ fontWeight: 800, fontSize: 14, color: overlayTheme.titleText }}>GoNavi MCP HTTP 服务</div>
            <Tag color={running ? 'success' : 'default'} style={{ marginInlineEnd: 0 }}>
              {running ? '已启动' : '未启动'}
            </Tag>
            <Tag color="blue" style={{ marginInlineEnd: 0 }}>
              schema-only
            </Tag>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
            给 OpenClaw、Hermans 等远程 Agent 使用。打开后监听本机地址，只开放连接、库表、字段和 DDL 等结构读取工具。
          </div>
        </div>
        <Switch
          checked={running}
          loading={loading}
          onChange={onToggle}
          checkedChildren="开"
          unCheckedChildren="关"
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
            <span style={{ fontSize: 11, fontWeight: 700, color: overlayTheme.mutedText }}>监听地址 / 端口</span>
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
              placeholder="Bearer gnv_xxx（留空自动生成）"
              autoComplete="off"
              onChange={(event) => onDraftChange({ authorizationHeader: event.target.value })}
              style={inputStyle}
            />
          </div>
        </div>
        <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
          {running
            ? status.message || '服务运行中，可把 URL 和 Authorization Header 配置到远程 MCP 客户端。'
            : '可自定义本机监听端口和 Bearer Token；留空 Authorization 时启动会自动生成随机 Token。'}
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
            复制 URL
          </Button>
          <Button
            size="small"
            icon={<CopyOutlined />}
            disabled={!running || !authorizationHeader}
            onClick={onCopyAuthorization}
          >
            复制 Authorization
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AIMCPHTTPServerPanel;
