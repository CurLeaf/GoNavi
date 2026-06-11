import React from 'react';
import { Button } from 'antd';

import type { AIMCPClientInstallStatus } from '../../types';
import {
  isRemoteMCPClientStatus,
  type MCPClientKey,
} from '../../utils/mcpClientInstallStatus';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import AIMCPClientSelectorPanel from './AIMCPClientSelectorPanel';
import AIMCPClientStatusPanel from './AIMCPClientStatusPanel';
import {
  getMCPClientDetectionSummary,
  resolveMCPClientInstallActionLabel,
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
            这里是在把 GoNavi MCP 接入 Claude Code / Codex / OpenClaw / Hermans，给外部工具调用，不是给 GoNavi 自己安装插件。
          </div>
          <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
            Claude Code 和 Codex 会写入本机用户级 MCP 配置；OpenClaw、Hermans 这类云端 Agent 会提供远程接入说明，避免把数据库密码复制到云端。
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
            {getMCPClientDetectionSummary(selectedStatus)}
            {!selectedIsRemoteClient && (
              <>
                {' '}
                已经接入当前这份 GoNavi 时，下面的主按钮会自动禁用，避免重复写入。
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
            {resolveMCPClientInstallActionLabel(selectedStatus)}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AIMCPClientInstallPanel;
