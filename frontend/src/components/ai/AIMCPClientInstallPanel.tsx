import React from 'react';
import { Button } from 'antd';

import type { AIMCPClientInstallStatus } from '../../types';
import {
  isRemoteMCPClientStatus,
  type MCPClientKey,
} from '../../utils/mcpClientInstallStatus';
import { useOptionalI18n } from '../../i18n/provider';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import AIMCPClientSelectorPanel from './AIMCPClientSelectorPanel';
import AIMCPClientStatusPanel from './AIMCPClientStatusPanel';
import {
  getMCPClientDetectionSummary,
  resolveMCPClientInstallActionLabel,
  translateMCPClientInstallCopy,
} from './mcpClientInstallPanelState';

interface AIMCPClientInstallPanelProps {
  statuses: AIMCPClientInstallStatus[];
  selectedClient: MCPClientKey;
  selectedStatus?: AIMCPClientInstallStatus;
  selectedCommandText: string;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  cardBg: string;
  cardBorder: string;
  loading: boolean;
  statusLoading: boolean;
  onSelectClient: (client: MCPClientKey) => void;
  onRefreshStatus: () => void;
  onCopyConfigPath: () => void;
  onCopyLaunchCommand: () => void;
  onInstall: () => void;
}

const AIMCPClientInstallPanel: React.FC<AIMCPClientInstallPanelProps> = ({
  statuses,
  selectedClient,
  selectedStatus,
  selectedCommandText,
  darkMode,
  overlayTheme,
  cardBg,
  cardBorder,
  loading,
  statusLoading,
  onSelectClient,
  onRefreshStatus,
  onCopyConfigPath,
  onCopyLaunchCommand,
  onInstall,
}) => {
  const i18n = useOptionalI18n();
  const t = i18n?.t;
  const copy = (
    key: string,
    fallback: string,
    params?: Record<string, string | number | boolean | null | undefined>,
  ) => translateMCPClientInstallCopy(t, key, fallback, params);
  const selectedIsRemoteClient = isRemoteMCPClientStatus(selectedStatus);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          padding: '16px',
          borderRadius: 14,
          border: `1px solid ${cardBorder}`,
          background: cardBg,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 12,
            border: `1px solid ${darkMode ? 'rgba(96,165,250,0.16)' : 'rgba(96,165,250,0.18)'}`,
            background: darkMode ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 13, color: overlayTheme.titleText }}>
            {copy(
              'ai_chat.mcp_client.install.intro.title',
              'This connects GoNavi MCP to Claude Code / Codex / OpenClaw / Hermans for external tool calls. It is not installing a plugin into GoNavi itself.',
            )}
          </div>
          <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
            {copy(
              'ai_chat.mcp_client.install.intro.description',
              'Claude Code and Codex write local user-level MCP config. Cloud Agents such as OpenClaw and Hermans use remote connection guidance so database passwords are not copied to the cloud.',
            )}
          </div>
        </div>

        <AIMCPClientSelectorPanel
          statuses={statuses}
          selectedClient={selectedClient}
          darkMode={darkMode}
          overlayTheme={overlayTheme}
          cardBorder={cardBorder}
          statusLoading={statusLoading}
          onSelectClient={onSelectClient}
        />

        <AIMCPClientStatusPanel
          selectedStatus={selectedStatus}
          selectedCommandText={selectedCommandText}
          darkMode={darkMode}
          overlayTheme={overlayTheme}
          cardBorder={cardBorder}
          statusLoading={statusLoading}
          onRefreshStatus={onRefreshStatus}
          onCopyConfigPath={onCopyConfigPath}
          onCopyLaunchCommand={onCopyLaunchCommand}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.6 }}>
            {getMCPClientDetectionSummary(selectedStatus, t)}
            {!selectedIsRemoteClient && (
              <>
                {' '}
                {copy(
                  'ai_chat.mcp_client.install.repeat_avoidance',
                  'When already connected to this GoNavi, the main button is disabled to avoid repeated writes.',
                )}
              </>
            )}
          </div>
          <Button
            type={selectedStatus?.matchesCurrent ? 'default' : 'primary'}
            onClick={onInstall}
            loading={loading}
            disabled={Boolean(selectedStatus?.matchesCurrent)}
            style={{ borderRadius: 10, fontWeight: 600, width: 208, maxWidth: '100%', height: 40 }}
          >
            {resolveMCPClientInstallActionLabel(selectedStatus, t)}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AIMCPClientInstallPanel;
