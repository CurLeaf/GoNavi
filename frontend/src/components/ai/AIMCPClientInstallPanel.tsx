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

const getStatusTone = (status: AIMCPClientInstallStatus | undefined, darkMode: boolean) => {
  const messageText = String(status?.message || '');
  if (status?.matchesCurrent) {
    return {
      label: '已安装当前',
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
  if (messageText.includes('失败') || messageText.includes('异常')) {
    return {
      label: '读取异常',
      color: '#dc2626',
      bg: darkMode ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.1)',
    };
  }
  return {
    label: '未安装',
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

const getClientDetectionTone = (status: AIMCPClientInstallStatus | undefined, darkMode: boolean) => {
  if (status?.clientDetected) {
    return {
      label: 'CLI 已检测',
      color: '#16a34a',
      bg: darkMode ? 'rgba(34,197,94,0.18)' : 'rgba(34,197,94,0.12)',
    };
  }
  return {
    label: 'CLI 未检测',
    color: '#d97706',
    bg: darkMode ? 'rgba(245,158,11,0.18)' : 'rgba(245,158,11,0.12)',
  };
};

const getStatusSummary = (status: AIMCPClientInstallStatus | undefined) => {
  const label = status?.displayName || '这个客户端';
  const messageText = String(status?.message || '');
  if (status?.matchesCurrent) {
    return `${label} 已安装当前 GoNavi MCP，可直接在这个客户端里调用。`;
  }
  if (status?.installed) {
    return `${label} 已检测到旧的 GoNavi 安装路径，更新后会切到当前这份 GoNavi。`;
  }
  if (messageText.includes('失败') || messageText.includes('异常')) {
    return `${label} 的安装状态读取失败，建议先刷新检测。`;
  }
  return `${label} 还没有安装 GoNavi MCP。`;
};

const getClientOptionSummary = (status: AIMCPClientInstallStatus | undefined) => {
  if (status?.matchesCurrent) {
    return '当前 GoNavi 已安装到这个客户端。';
  }
  if (status?.installed) {
    return '已发现旧配置，建议更新到当前安装路径。';
  }
  if (String(status?.message || '').includes('失败') || String(status?.message || '').includes('异常')) {
    return '安装状态读取异常，建议先刷新再处理。';
  }
  return '尚未安装到这个客户端。';
};

const getClientDetectionSummary = (status: AIMCPClientInstallStatus | undefined) => {
  const label = status?.displayName || '这个客户端';
  const commandName = resolveClientCommandName(status);
  if (status?.clientDetected) {
    return `已检测到本机 ${commandName} 命令，安装后重启 ${label} 即可验证。`;
  }
  return `未检测到本机 ${commandName} 命令；如果 CLI 还没加入 PATH，也可以先安装到 ${label}，稍后再重启验证。`;
};

const resolveActionLabel = (status: AIMCPClientInstallStatus | undefined) => {
  const label = status?.displayName || '客户端';
  if (status?.matchesCurrent) {
    return `已安装到 ${label}`;
  }
  if (status?.installed) {
    return `更新到 ${label}`;
  }
  return `安装到 ${label}`;
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
        padding: '14px 16px',
        borderRadius: 14,
        border: `1px solid ${cardBorder}`,
        background: darkMode ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.06)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14, color: overlayTheme.titleText }}>安装到外部客户端</div>
      <div style={{ fontSize: 12, color: overlayTheme.titleText, lineHeight: 1.7 }}>
        这里的“安装”不是给 GoNavi 自己再装一个 MCP，而是把 GoNavi 的 MCP Server 配置写入 Claude Code、Codex 这类外部 AI 客户端。
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[
          '只写入用户级 MCP 配置',
          '不会下载安装 Claude Code / Codex',
          '不会重装 GoNavi 程序',
        ].map((item) => (
          <div
            key={item}
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              color: darkMode ? '#bfdbfe' : '#1d4ed8',
              background: darkMode ? 'rgba(96,165,250,0.14)' : 'rgba(191,219,254,0.7)',
            }}
          >
            {item}
          </div>
        ))}
      </div>
    </div>

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: overlayTheme.titleText }}>把 GoNavi MCP 接入外部 AI 客户端</div>
          <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
            先选 1 个安装目标，再执行安装或更新。GoNavi 会自动写入当前安装路径，不需要你自己找本机 exe，也不用手改配置。
          </div>
        </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: overlayTheme.titleText }}>第 1 步：选择安装目标</div>
          <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.6 }}>
            这里只会处理你当前选中的 1 个外部客户端，并显示它是否已经安装过、是否需要更新。
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {statuses.map((status) => {
            const client = status.client === 'codex' ? 'codex' : 'claude-code';
            const active = selectedClient === client;
            const tone = getStatusTone(status, darkMode);
            const detectionTone = getClientDetectionTone(status, darkMode);
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
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 14,
                  textAlign: 'left',
                  minHeight: 92,
                  transition: 'all 0.2s ease',
                  opacity: statusLoading ? 0.72 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 auto' }}>
                  <div
                    aria-hidden
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      border: `1.5px solid ${active ? overlayTheme.selectedText : darkMode ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)'}`,
                      background: active ? overlayTheme.selectedText : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {active ? <CheckCircleFilled style={{ color: '#fff', fontSize: 12 }} /> : null}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0, flex: '1 1 auto' }}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 14, color: overlayTheme.titleText }}>
                        {status.displayName}
                      </div>
                      <div
                        style={{
                          padding: '4px 10px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                          color: tone.color,
                          background: tone.bg,
                          minWidth: 76,
                          textAlign: 'center',
                        }}
                      >
                        {tone.label}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: overlayTheme.titleText, lineHeight: 1.6 }}>
                      {getClientOptionSummary(status)}
                    </div>
                    <div
                      style={{
                        padding: '4px 10px',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 700,
                        color: detectionTone.color,
                        background: detectionTone.bg,
                        whiteSpace: 'nowrap',
                        alignSelf: 'flex-start',
                        minWidth: 76,
                        textAlign: 'center',
                      }}
                    >
                      {detectionTone.label}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: overlayTheme.mutedText, lineHeight: 1.6, maxWidth: 300 }}>
                  {active ? '当前已选中这个客户端。' : '点击切换到这个客户端。'}
                  {' '}
                  {getClientDetectionSummary(status)}
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
            第 2 步：确认并安装
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: overlayTheme.titleText }}>
              当前目标：{selectedStatus?.displayName || '客户端'}
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
        <div style={{ fontSize: 12, color: overlayTheme.titleText, lineHeight: 1.7 }}>
          {getStatusSummary(selectedStatus)}
        </div>
        <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
          本机命令状态：{selectedStatus?.clientDetected
            ? `已检测到 ${resolveClientCommandName(selectedStatus)}`
            : `未检测到 ${resolveClientCommandName(selectedStatus)}，仍可先写配置`}
        </div>
        {selectedStatus?.clientPath && (
          <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.6, fontFamily: 'var(--gn-font-mono)' }}>
            命令路径：{selectedStatus.clientPath}
          </div>
        )}
        <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
          检测结果：{selectedStatus?.message || '未检测到安装状态'}
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
          命令未检测到时也可以先安装到目标客户端；后续装好 CLI 或把命令加入 PATH 后，重启对应客户端即可生效。已经是当前配置时按钮会自动禁用，避免重复安装。
        </div>
        <Button
          type={selectedStatus?.matchesCurrent ? 'default' : 'primary'}
          onClick={onInstall}
          loading={loading}
          disabled={Boolean(selectedStatus?.matchesCurrent)}
          style={{ borderRadius: 10, fontWeight: 600, minWidth: 180, height: 40 }}
        >
          {resolveActionLabel(selectedStatus)}
        </Button>
      </div>
    </div>
  </div>
);

export default AIMCPClientInstallPanel;
