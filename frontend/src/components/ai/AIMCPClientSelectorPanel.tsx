import React from 'react';
import { CheckCircleFilled } from '@ant-design/icons';

import type { AIMCPClientInstallStatus } from '../../types';
import {
  isMCPClientKey,
  isRemoteMCPClientStatus,
  type MCPClientKey,
} from '../../utils/mcpClientInstallStatus';
import { useOptionalI18n } from '../../i18n/provider';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import {
  getMCPClientInstallStateLabel,
  getMCPClientOptionSummary,
  getMCPClientStatusTone,
  translateMCPClientInstallCopy,
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
  {
    step: '1',
    titleKey: 'ai_chat.mcp_client.install.selector.step.target.title',
    titleFallback: 'Choose target client',
    detailKey: 'ai_chat.mcp_client.install.selector.step.target.detail',
    detailFallback: 'Local Claude/Codex/OpenCode can be installed automatically. OpenClaw/Hermans use remote connection guidance.',
  },
  {
    step: '2',
    titleKey: 'ai_chat.mcp_client.install.selector.step.write.title',
    titleFallback: 'Write or copy config',
    detailKey: 'ai_chat.mcp_client.install.selector.step.write.detail',
    detailFallback: 'Automatic install only changes user-level MCP config. Remote Agents copy bridge guidance.',
  },
  {
    step: '3',
    titleKey: 'ai_chat.mcp_client.install.selector.step.restart.title',
    titleFallback: 'Restart or configure target',
    detailKey: 'ai_chat.mcp_client.install.selector.step.restart.detail',
    detailFallback: 'Restart the local CLI to verify. Cloud Agents verify after configuring the remote MCP URL.',
  },
];

const AIMCPClientSelectorPanel: React.FC<AIMCPClientSelectorPanelProps> = ({
  statuses,
  selectedClient,
  darkMode,
  overlayTheme,
  cardBorder,
  statusLoading,
  onSelectClient,
}) => {
  const i18n = useOptionalI18n();
  const t = i18n?.t;
  const copy = (
    key: string,
    fallback: string,
    params?: Record<string, string | number | boolean | null | undefined>,
  ) => translateMCPClientInstallCopy(t, key, fallback, params);

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: overlayTheme.titleText }}>
        {copy('ai_chat.mcp_client.install.selector.title', 'Connect external client')}
      </div>
      <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
        {copy(
          'ai_chat.mcp_client.install.selector.description',
          'Choose one target client first. Local CLIs can write or update config automatically; remote Agents must access current GoNavi through an MCP bridge or tunnel and should not store database passwords.',
        )}
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
            <div style={{ fontWeight: 700, fontSize: 13, color: overlayTheme.titleText }}>
              {copy(item.titleKey, item.titleFallback)}
            </div>
          </div>
          <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.6 }}>
            {copy(item.detailKey, item.detailFallback)}
          </div>
        </div>
      ))}
    </div>

    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: overlayTheme.titleText }}>
        {copy('ai_chat.mcp_client.install.selector.choice_title', 'Select external client')}
      </div>
      <div
        role="radiogroup"
        aria-label={copy('ai_chat.mcp_client.install.selector.aria_label', 'Select the external client for GoNavi MCP')}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}
      >
        {statuses.map((status) => {
          const client = isMCPClientKey(status.client) ? status.client : 'claude-code';
          const remoteClient = isRemoteMCPClientStatus(status);
          const active = selectedClient === client;
          const tone = getMCPClientStatusTone(status, darkMode, t);
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
                {getMCPClientOptionSummary(status, t)}
              </div>
              <div style={{ fontSize: 12, color: active ? overlayTheme.selectedText : overlayTheme.mutedText, lineHeight: 1.6, fontWeight: 700 }}>
                {getMCPClientInstallStateLabel(status, t)}
              </div>
              <div style={{ fontSize: 11, color: overlayTheme.mutedText, lineHeight: 1.6 }}>
                {active
                  ? (remoteClient
                    ? copy('ai_chat.mcp_client.install.selector.hint.active_remote', 'Selected. The remote connection guide will be copied.')
                    : copy('ai_chat.mcp_client.install.selector.hint.active_local', 'Selected. Only this client will be written or updated.'))
                  : (remoteClient
                    ? copy('ai_chat.mcp_client.install.selector.hint.inactive_remote', 'Click to view the remote connection method.')
                    : copy('ai_chat.mcp_client.install.selector.hint.inactive_local', 'Click to switch to this client.'))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  </>
  );
};

export default AIMCPClientSelectorPanel;
