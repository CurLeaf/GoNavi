import React from 'react';
import { Button } from 'antd';
import { CheckCircleFilled, CopyOutlined, ReloadOutlined } from '@ant-design/icons';

import type { AIMCPClientInstallStatus } from '../../types';
import type { MCPClientKey } from '../../utils/mcpClientInstallStatus';
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
          这里是在把 GoNavi MCP 接入 Claude Code / Codex，给外部工具调用，不是给 GoNavi 自己安装插件。
        </div>
        <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
          这里的“安装”只会写入外部 CLI 的用户级 MCP 配置，让它知道如何启动当前这份 GoNavi MCP；不会重装 GoNavi，也不会替换 GoNavi 自己的程序文件。
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: overlayTheme.titleText }}>接入外部客户端</div>
        <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
          先在 Claude Code 和 Codex 中选择 1 个目标客户端，再执行安装或更新。每个选项会直接显示是否已接入当前 GoNavi，已接入时主按钮会禁用，避免重复写入。
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
        <div style={{ fontWeight: 700, fontSize: 13, color: overlayTheme.titleText }}>选择外部客户端（二选一）</div>
        <div
          role="radiogroup"
          aria-label="选择要安装 GoNavi MCP 的外部客户端"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}
        >
          {statuses.map((status) => {
            const client = status.client === 'codex' ? 'codex' : 'claude-code';
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
        <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
          CLI 检测：{selectedStatus?.clientDetected
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
          {' '}
          已经接入当前这份 GoNavi 时，下面的主按钮会自动禁用，避免重复写入。
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

export default AIMCPClientInstallPanel;
