import React from 'react';
import { CheckCircleFilled } from '@ant-design/icons';

import type { AIMCPClientInstallStatus } from '../../types';
import {
  isMCPClientKey,
  isRemoteMCPClientStatus,
  type MCPClientKey,
} from '../../utils/mcpClientInstallStatus';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import {
  getMCPClientInstallStateLabel,
  getMCPClientOptionSummary,
  getMCPClientStatusTone,
} from './mcpClientInstallPanelState';

interface AIMCPClientSelectorPanelProps {
  statuses: AIMCPClientInstallStatus[];
  selectedClient: MCPClientKey;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  cardBorder: string;
  statusLoading: boolean;
  onSelectClient: (client: MCPClientKey) => void;
}

const MCP_CLIENT_INSTALL_STEPS = [
  { step: '1', title: '选择目标客户端', detail: '本机 Claude/Codex 可自动安装，OpenClaw/Hermans 走远程接入说明。' },
  { step: '2', title: '写入或复制配置', detail: '自动安装只改用户级 MCP 配置；远程 Agent 复制桥接说明。' },
  { step: '3', title: '重启或配置目标端', detail: '本机 CLI 重启后验证；云端 Agent 配置远程 MCP 地址后验证。' },
];

const AIMCPClientSelectorPanel: React.FC<AIMCPClientSelectorPanelProps> = ({
  statuses,
  selectedClient,
  darkMode,
  overlayTheme,
  cardBorder,
  statusLoading,
  onSelectClient,
}) => (
  <>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: overlayTheme.titleText }}>接入外部客户端</div>
      <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
        先选择 1 个目标客户端。本机 CLI 可自动写入或更新配置；远程 Agent 需要通过 MCP 桥接/隧道访问当前 GoNavi，不应保存数据库连接密码。
      </div>
    </div>
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 10,
      }}
    >
      {MCP_CLIENT_INSTALL_STEPS.map((item) => (
        <div
          key={item.step}
          style={{
            padding: '12px 14px',
            borderRadius: 12,
            border: `1px solid ${cardBorder}`,
            background: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.76)',
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                background: overlayTheme.selectedText,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {item.step}
            </div>
            <div style={{ fontWeight: 700, fontSize: 13, color: overlayTheme.titleText }}>{item.title}</div>
          </div>
          <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.6 }}>{item.detail}</div>
        </div>
      ))}
    </div>

    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: overlayTheme.titleText }}>选择外部客户端</div>
      <div
        role="radiogroup"
        aria-label="选择要安装 GoNavi MCP 的外部客户端"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}
      >
        {statuses.map((status) => {
          const client = isMCPClientKey(status.client) ? status.client : 'claude-code';
          const remoteClient = isRemoteMCPClientStatus(status);
          const active = selectedClient === client;
          const tone = getMCPClientStatusTone(status, darkMode);
          return (
            <button
              key={status.client}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelectClient(client)}
              style={{
                padding: '14px 16px',
                borderRadius: 12,
                border: `1.5px solid ${active ? overlayTheme.selectedText : cardBorder}`,
                background: active ? overlayTheme.selectedBg : (darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.7)'),
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 10,
                textAlign: 'left',
                minHeight: 98,
                transition: 'all 0.2s ease',
                opacity: statusLoading ? 0.72 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div
                    aria-hidden
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      border: `1.5px solid ${active ? overlayTheme.selectedText : darkMode ? 'rgba(255,255,255,0.16)' : 'rgba(15,23,42,0.16)'}`,
                      background: active ? overlayTheme.selectedText : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {active ? <CheckCircleFilled style={{ color: '#fff', fontSize: 12 }} /> : null}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: overlayTheme.titleText, minWidth: 0 }}>
                    {status.displayName}
                  </div>
                </div>
                <div
                  style={{
                    padding: '4px 10px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    color: tone.color,
                    background: tone.bg,
                    width: 80,
                    textAlign: 'center',
                    flexShrink: 0,
                  }}
                >
                  {tone.label}
                </div>
              </div>
              <div style={{ fontSize: 12, color: overlayTheme.titleText, lineHeight: 1.7 }}>
                {getMCPClientOptionSummary(status)}
              </div>
              <div style={{ fontSize: 12, color: active ? overlayTheme.selectedText : overlayTheme.mutedText, lineHeight: 1.6, fontWeight: 700 }}>
                {getMCPClientInstallStateLabel(status)}
              </div>
              <div style={{ fontSize: 11, color: overlayTheme.mutedText, lineHeight: 1.6 }}>
                {active
                  ? (remoteClient ? '当前已选中，将复制远程接入说明。' : '当前已选中，将只对这个客户端执行写入或更新。')
                  : (remoteClient ? '点击后查看远程接入方式。' : '点击后切换到这个客户端。')}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  </>
);

export default AIMCPClientSelectorPanel;
