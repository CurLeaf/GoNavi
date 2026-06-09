import React from 'react';
import { Button } from 'antd';
import { CheckCircleFilled, CopyOutlined, ReloadOutlined } from '@ant-design/icons';

import type { AIMCPClientInstallStatus } from '../../types';
import type { MCPClientKey } from '../../utils/mcpClientInstallStatus';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

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

const hasStatusIssue = (status: AIMCPClientInstallStatus | undefined) =>
  /失败|异常|错误/u.test(String(status?.message || ''));

const getStatusTone = (status: AIMCPClientInstallStatus | undefined, darkMode: boolean) => {
  if (status?.matchesCurrent) {
    return {
      label: '已接入',
      color: '#16a34a',
      bg: darkMode ? 'rgba(34,197,94,0.18)' : 'rgba(34,197,94,0.12)',
    };
  }
  if (status?.installed) {
    return {
      label: '需更新',
      color: '#d97706',
      bg: darkMode ? 'rgba(245,158,11,0.18)' : 'rgba(245,158,11,0.12)',
    };
  }
  if (hasStatusIssue(status)) {
    return {
      label: '状态异常',
      color: '#dc2626',
      bg: darkMode ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.1)',
    };
  }
  return {
    label: '未接入',
    color: darkMode ? 'rgba(255,255,255,0.72)' : '#64748b',
    bg: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(100,116,139,0.08)',
  };
};

const resolveClientCommandName = (status: AIMCPClientInstallStatus | undefined) => {
  const command = String(status?.clientCommand || '').trim();
  if (command) {
    return command;
  }
  return status?.client === 'codex' ? 'codex' : 'claude';
};

const getStatusSummary = (status: AIMCPClientInstallStatus | undefined) => {
  const label = status?.displayName || '这个客户端';
  if (status?.matchesCurrent) {
    return `${label} 已接入当前这份 GoNavi MCP，可直接在这个客户端里调用。`;
  }
  if (status?.installed) {
    return `${label} 里已经有旧的 GoNavi 接入记录，更新后会切到当前这份 GoNavi。`;
  }
  if (hasStatusIssue(status)) {
    return `${label} 的接入状态读取失败，建议先刷新检测。`;
  }
  return `当前还没有把这份 GoNavi MCP 接入 ${label}。`;
};

const getClientOptionSummary = (status: AIMCPClientInstallStatus | undefined) => {
  if (status?.matchesCurrent) {
    return '当前这份 GoNavi MCP 已接入到这个客户端。';
  }
  if (status?.installed) {
    return '检测到旧的 GoNavi 接入记录，建议更新为当前安装路径。';
  }
  if (hasStatusIssue(status)) {
    return '接入状态读取异常，建议先刷新再处理。';
  }
  return '尚未把当前 GoNavi MCP 接入到这里。';
};

const getClientDetectionSummary = (status: AIMCPClientInstallStatus | undefined) => {
  const label = status?.displayName || '这个客户端';
  const commandName = resolveClientCommandName(status);
  if (status?.clientDetected) {
    return `已检测到本机 ${commandName} 命令，接入或更新后重启 ${label} 即可验证。`;
  }
  return `未检测到本机 ${commandName} 命令；如果 CLI 还没加入 PATH，也可以先写入 ${label} 的接入配置，稍后再重启验证。`;
};

const getSelectedClientStateLine = (status: AIMCPClientInstallStatus | undefined) => {
  if (status?.matchesCurrent) {
    return '已接入当前 GoNavi，无需重复操作';
  }
  if (status?.installed) {
    return '已存在旧接入记录，建议更新到当前 GoNavi 路径';
  }
  if (hasStatusIssue(status)) {
    return '状态读取异常，建议先刷新检测';
  }
  return '当前还没有接入 GoNavi MCP';
};

const resolveActionLabel = (status: AIMCPClientInstallStatus | undefined) => {
  const label = status?.displayName || '目标客户端';
  if (status?.matchesCurrent) {
    return `${label} 已接入当前 GoNavi`;
  }
  if (status?.installed) {
    return `更新 ${label} 接入配置`;
  }
  return `接入到 ${label}`;
};

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
}) => (
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
          这里是在把 GoNavi MCP 接入 Claude Code / Codex，不是给 GoNavi 自己安装插件。
        </div>
        <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
          你只需要选中 Claude Code 或 Codex 其中一个目标，GoNavi 就会把“如何启动当前这份 GoNavi MCP”的信息写入那个客户端的用户级配置文件，不会重装 GoNavi，也不会替换 GoNavi 自己的程序文件。
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: overlayTheme.titleText }}>接入外部客户端</div>
        <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
          先选择 1 个目标客户端，再执行接入或更新。GoNavi 会自动把当前安装路径写入它的用户级 MCP 配置文件，不需要你自己找本机 exe，也不需要手动改配置。
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 10,
        }}
      >
        {[
          { step: '1', title: '选择目标客户端', detail: 'Claude Code 和 Codex 二选一即可。' },
          { step: '2', title: '写入接入配置', detail: '只改用户级 MCP 配置，不会重装 GoNavi。' },
          { step: '3', title: '重启目标客户端', detail: '重启后就能在外部 CLI 里调用当前 GoNavi MCP。' },
        ].map((item) => (
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
        <div style={{ fontWeight: 700, fontSize: 13, color: overlayTheme.titleText }}>目标客户端</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {statuses.map((status) => {
            const client = status.client === 'codex' ? 'codex' : 'claude-code';
            const active = selectedClient === client;
            const tone = getStatusTone(status, darkMode);
            return (
              <button
                key={status.client}
                type="button"
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
                  {getClientOptionSummary(status)}
                </div>
                <div style={{ fontSize: 11, color: overlayTheme.mutedText, lineHeight: 1.6 }}>
                  {active ? '当前已选中，将只对这个客户端执行写入或更新。' : '点击后切换到这个客户端。'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

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
              {getStatusSummary(selectedStatus)}
            </div>
            {selectedStatus && (
              <div
                style={{
                  padding: '3px 9px',
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                  color: getStatusTone(selectedStatus, darkMode).color,
                  background: getStatusTone(selectedStatus, darkMode).bg,
                }}
              >
                {getStatusTone(selectedStatus, darkMode).label}
              </div>
            )}
          </div>
        </div>
        <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
          当前状态：{getSelectedClientStateLine(selectedStatus)}
        </div>
        <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
          CLI 检测：{selectedStatus?.clientDetected
            ? `已检测到 ${resolveClientCommandName(selectedStatus)}`
            : `未检测到 ${resolveClientCommandName(selectedStatus)}，仍可先写配置`}
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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.6 }}>
          {getClientDetectionSummary(selectedStatus)}
          {' '}
          已经接入当前这份 GoNavi 时，下面的主按钮会自动禁用，避免重复操作。
        </div>
        <Button
          type={selectedStatus?.matchesCurrent ? 'default' : 'primary'}
          onClick={onInstall}
          loading={loading}
          disabled={Boolean(selectedStatus?.matchesCurrent)}
          style={{ borderRadius: 10, fontWeight: 600, width: 208, maxWidth: '100%', height: 40 }}
        >
          {resolveActionLabel(selectedStatus)}
        </Button>
      </div>
    </div>
  </div>
);

export default AIMCPClientInstallPanel;
