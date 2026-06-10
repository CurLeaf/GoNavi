import React from 'react';
import { Button } from 'antd';
import { CheckCircleFilled, CopyOutlined, ReloadOutlined } from '@ant-design/icons';

import type { AIMCPClientInstallStatus } from '../../types';
import {
  buildRemoteMCPClientQuickStart,
  isMCPClientKey,
  isRemoteMCPClientStatus,
  type MCPClientKey,
} from '../../utils/mcpClientInstallStatus';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import {
  getMCPClientDetectionSummary,
  getMCPClientInstallStateLabel,
  getMCPClientOptionSummary,
  getMCPClientStatusSummary,
  getMCPClientStatusTone,
  getSelectedMCPClientStateLine,
  resolveMCPClientCommandName,
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
  const remoteQuickStart = selectedIsRemoteClient
    ? buildRemoteMCPClientQuickStart(selectedStatus)
    : null;

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
        {[
          { step: '1', title: '选择目标客户端', detail: '本机 Claude/Codex 可自动安装，OpenClaw/Hermans 走远程接入说明。' },
          { step: '2', title: '写入或复制配置', detail: '自动安装只改用户级 MCP 配置；远程 Agent 复制桥接说明。' },
          { step: '3', title: '重启或配置目标端', detail: '本机 CLI 重启后验证；云端 Agent 配置远程 MCP 地址后验证。' },
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
            远程接入边界：数据库连接信息和密码仍保存在 Windows GoNavi；云端 Agent 只通过 MCP 工具读取连接摘要、库表和 DDL。跨机器接入请使用 GoNavi Streamable HTTP 模式，并配合 token、隧道或反向代理。
          </div>
        )}
        {remoteQuickStart && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              border: `1px solid ${darkMode ? 'rgba(56,189,248,0.2)' : 'rgba(14,165,233,0.18)'}`,
              background: darkMode ? 'rgba(14,165,233,0.06)' : 'rgba(240,249,255,0.78)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, color: overlayTheme.titleText }}>
              {remoteQuickStart.displayName} 远程 MCP 快速配置
            </div>
            <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
              下面两段分别给云端 Agent 和 Windows GoNavi 使用。云端只保存 MCP URL 和 Bearer Token，不保存数据库账号密码。
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: `1px solid ${cardBorder}`,
                  background: darkMode ? 'rgba(15,23,42,0.55)' : 'rgba(255,255,255,0.78)',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 12, color: overlayTheme.titleText }}>
                  配置到云端 Agent
                </div>
                <code
                  style={{
                    display: 'block',
                    marginTop: 8,
                    fontFamily: 'var(--gn-font-mono)',
                    fontSize: 11,
                    color: overlayTheme.titleText,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {remoteQuickStart.configJson}
                </code>
              </div>
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: `1px solid ${cardBorder}`,
                  background: darkMode ? 'rgba(15,23,42,0.55)' : 'rgba(255,255,255,0.78)',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 12, color: overlayTheme.titleText }}>
                  Windows 启动 GoNavi MCP HTTP
                </div>
                <code
                  style={{
                    display: 'block',
                    marginTop: 8,
                    fontFamily: 'var(--gn-font-mono)',
                    fontSize: 11,
                    color: overlayTheme.titleText,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {remoteQuickStart.launchCommand}
                </code>
                <div style={{ marginTop: 8, fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.6 }}>
                  独立二进制：{remoteQuickStart.standaloneCommand}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 12, color: overlayTheme.titleText }}>验证顺序</div>
                <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {remoteQuickStart.verificationSteps.map((item) => (
                    <div key={item} style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.6 }}>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 12, color: overlayTheme.titleText }}>安全边界</div>
                <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {remoteQuickStart.securityNotes.map((item) => (
                    <div key={item} style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.6 }}>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
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
