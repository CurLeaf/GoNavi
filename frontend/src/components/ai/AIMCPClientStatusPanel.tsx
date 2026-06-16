import React from 'react';
import { Button } from 'antd';
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons';

import type { AIMCPClientInstallStatus } from '../../types';
import {
  buildRemoteMCPClientQuickStart,
  isRemoteMCPClientStatus,
} from '../../utils/mcpClientInstallStatus';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import AIMCPRemoteQuickStartPanel from './AIMCPRemoteQuickStartPanel';
import {
  getMCPClientStatusSummary,
  getMCPClientStatusTone,
  getSelectedMCPClientStateLine,
  resolveMCPClientCommandName,
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
  const selectedIsRemoteClient = isRemoteMCPClientStatus(selectedStatus);
  const remoteQuickStart = selectedIsRemoteClient
    ? buildRemoteMCPClientQuickStart(selectedStatus)
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
          已选客户端状态
        </div>
        <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
          当前目标客户端：{selectedStatus?.displayName || '未选择客户端'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: overlayTheme.titleText }}>
            {getMCPClientStatusSummary(selectedStatus)}
          </div>
          {selectedStatus && (
            <div
              style={{
                padding: '3px 9px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                color: getMCPClientStatusTone(selectedStatus, darkMode).color,
                background: getMCPClientStatusTone(selectedStatus, darkMode).bg,
              }}
            >
              {getMCPClientStatusTone(selectedStatus, darkMode).label}
            </div>
          )}
        </div>
      </div>
      <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
        当前状态：{getSelectedMCPClientStateLine(selectedStatus)}
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
          远程接入边界：数据库连接信息和密码仍保存在 Windows GoNavi；云端 Agent 默认通过 schema-only MCP 工具读取连接摘要、库表和 DDL，不注册 execute_sql。跨机器接入请使用 GoNavi Streamable HTTP 模式，并配合 token、隧道或反向代理。
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
        CLI 检测：{selectedIsRemoteClient
          ? `远程 Agent 不需要检测本机 ${resolveMCPClientCommandName(selectedStatus)} 命令`
          : selectedStatus?.clientDetected
            ? `已检测到 ${resolveMCPClientCommandName(selectedStatus)}`
            : `未检测到 ${resolveMCPClientCommandName(selectedStatus)}，仍可先写配置`}
      </div>
      {selectedStatus?.clientPath && (
        <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.6, fontFamily: 'var(--gn-font-mono)' }}>
          命令路径：{selectedStatus.clientPath}
        </div>
      )}
      <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
        检测结果：{selectedStatus?.message || '未检测到接入状态'}
      </div>
      {selectedStatus?.configPath && (
        <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.6, fontFamily: 'var(--gn-font-mono)' }}>
          配置文件：{selectedStatus.configPath}
        </div>
      )}
      {selectedCommandText && (
        <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.6, fontFamily: 'var(--gn-font-mono)' }}>
          启动命令：{selectedCommandText}
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
          刷新状态
        </Button>
        <Button
          size="small"
          icon={<CopyOutlined />}
          disabled={!selectedStatus?.configPath}
          onClick={onCopyConfigPath}
          style={{ borderRadius: 8 }}
        >
          复制配置路径
        </Button>
        <Button
          size="small"
          icon={<CopyOutlined />}
          disabled={!selectedCommandText}
          onClick={onCopyLaunchCommand}
          style={{ borderRadius: 8 }}
        >
          复制启动命令
        </Button>
      </div>
    </div>
  );
};

export default AIMCPClientStatusPanel;
