import React from 'react';
import { Button } from 'antd';
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons';

import type { AIMCPClientInstallStatus } from '../../types';
import {
  buildRemoteMCPClientQuickStart,
  isRemoteMCPClientStatus,
} from '../../utils/mcpClientInstallStatus';
import { useOptionalI18n } from '../../i18n/provider';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import AIMCPRemoteQuickStartPanel from './AIMCPRemoteQuickStartPanel';
import {
  getMCPClientStatusSummary,
  getMCPClientStatusTone,
  getSelectedMCPClientStateLine,
  resolveMCPClientCommandName,
  translateMCPClientInstallCopy,
} from './mcpClientInstallPanelState';

interface AIMCPClientStatusPanelProps {
  selectedStatus?: AIMCPClientInstallStatus;
  selectedCommandText: string;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  cardBorder: string;
  statusLoading: boolean;
  onRefreshStatus: () => void;
  onCopyConfigPath: () => void;
  onCopyLaunchCommand: () => void;
}

const AIMCPClientStatusPanel: React.FC<AIMCPClientStatusPanelProps> = ({
  selectedStatus,
  selectedCommandText,
  darkMode,
  overlayTheme,
  cardBorder,
  statusLoading,
  onRefreshStatus,
  onCopyConfigPath,
  onCopyLaunchCommand,
}) => {
  const i18n = useOptionalI18n();
  const t = i18n?.t;
  const copy = (
    key: string,
    fallback: string,
    params?: Record<string, string | number | boolean | null | undefined>,
  ) => translateMCPClientInstallCopy(t, key, fallback, params);
  const selectedIsRemoteClient = isRemoteMCPClientStatus(selectedStatus);
  const remoteQuickStart = selectedIsRemoteClient
    ? buildRemoteMCPClientQuickStart(selectedStatus, t)
    : null;

  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: 12,
        border: `1px solid ${cardBorder}`,
        background: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.78)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: overlayTheme.titleText }}>
          {copy('ai_chat.mcp_client.install.status.title', 'Selected client status')}
        </div>
        <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
          {copy(
            selectedStatus?.displayName
              ? 'ai_chat.mcp_client.install.status.current_target'
              : 'ai_chat.mcp_client.install.status.no_client',
            selectedStatus?.displayName ? 'Current target client: {{label}}' : 'No client selected',
            { label: selectedStatus?.displayName || '' },
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: overlayTheme.titleText }}>
            {getMCPClientStatusSummary(selectedStatus, t)}
          </div>
          {selectedStatus && (
            (() => {
              const tone = getMCPClientStatusTone(selectedStatus, darkMode, t);
              return (
            <div
              style={{
                padding: '3px 9px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                color: tone.color,
                background: tone.bg,
              }}
            >
              {tone.label}
            </div>
              );
            })()
          )}
        </div>
      </div>
      <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
        {copy('ai_chat.mcp_client.install.status.current_state', 'Current status: {{status}}', {
          status: getSelectedMCPClientStateLine(selectedStatus, t),
        })}
      </div>
      {selectedIsRemoteClient && (
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 10,
            border: `1px solid ${darkMode ? 'rgba(56,189,248,0.22)' : 'rgba(14,165,233,0.18)'}`,
            background: darkMode ? 'rgba(14,165,233,0.08)' : 'rgba(14,165,233,0.06)',
            fontSize: 12,
            color: overlayTheme.mutedText,
            lineHeight: 1.7,
          }}
        >
          {copy(
            'ai_chat.mcp_client.install.status.remote_boundary',
            'Remote connection boundary: database connection info and passwords stay in Windows GoNavi. Cloud Agents read connection summaries, object lists, tables, views, and DDL through schema-only MCP tools by default, and execute_sql is not registered. For cross-machine access, use GoNavi Streamable HTTP mode with a token, tunnel, or reverse proxy.',
          )}
        </div>
      )}
      {remoteQuickStart && (
        <AIMCPRemoteQuickStartPanel
          quickStart={remoteQuickStart}
          darkMode={darkMode}
          overlayTheme={overlayTheme}
          cardBorder={cardBorder}
        />
      )}
      <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
        {copy('ai_chat.mcp_client.install.status.cli_prefix', 'CLI detection: {{status}}', {
          status: selectedIsRemoteClient
            ? copy('ai_chat.mcp_client.install.status.cli.remote', 'Remote Agent does not need local {{command}} command detection', { command: resolveMCPClientCommandName(selectedStatus) })
          : selectedStatus?.clientDetected
            ? copy('ai_chat.mcp_client.install.status.cli.detected', 'Detected {{command}}', { command: resolveMCPClientCommandName(selectedStatus) })
            : copy('ai_chat.mcp_client.install.status.cli.not_detected', '{{command}} was not detected; config can still be written first', { command: resolveMCPClientCommandName(selectedStatus) }),
        })}
      </div>
      {selectedStatus?.clientPath && (
        <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.6, fontFamily: 'var(--gn-font-mono)' }}>
          {copy('ai_chat.mcp_client.install.status.command_path', 'Command path: {{path}}', { path: selectedStatus.clientPath })}
        </div>
      )}
      <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
        {copy('ai_chat.mcp_client.install.status.detection_result', 'Detection result: {{message}}', {
          message: selectedStatus?.message || copy('ai_chat.mcp_client.install.status.detection_missing', 'No connection status detected'),
        })}
      </div>
      {selectedStatus?.configPath && (
        <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.6, fontFamily: 'var(--gn-font-mono)' }}>
          {copy('ai_chat.mcp_client.install.status.config_file', 'Config file: {{path}}', { path: selectedStatus.configPath })}
        </div>
      )}
      {selectedCommandText && (
        <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.6, fontFamily: 'var(--gn-font-mono)' }}>
          {copy('ai_chat.mcp_client.install.status.launch_command', 'Launch command: {{command}}', { command: selectedCommandText })}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button
          size="small"
          icon={<ReloadOutlined />}
          loading={statusLoading}
          onClick={onRefreshStatus}
          style={{ borderRadius: 8 }}
        >
          {copy('ai_chat.mcp_client.install.status.refresh', 'Refresh status')}
        </Button>
        <Button
          size="small"
          icon={<CopyOutlined />}
          disabled={!selectedStatus?.configPath}
          onClick={onCopyConfigPath}
          style={{ borderRadius: 8 }}
        >
          {copy('ai_chat.mcp_client.install.status.copy_config', 'Copy config path')}
        </Button>
        <Button
          size="small"
          icon={<CopyOutlined />}
          disabled={!selectedCommandText}
          onClick={onCopyLaunchCommand}
          style={{ borderRadius: 8 }}
        >
          {copy('ai_chat.mcp_client.install.status.copy_command', 'Copy launch command')}
        </Button>
      </div>
    </div>
  );
};

export default AIMCPClientStatusPanel;
