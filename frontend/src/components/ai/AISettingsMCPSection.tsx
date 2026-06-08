import React from 'react';
import { Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

import type { AIMCPClientInstallStatus, AIMCPServerConfig, AIMCPToolDescriptor } from '../../types';
import { MCP_SERVER_DRAFT_TEMPLATES } from '../../utils/mcpServerTemplates';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import AIMCPClientInstallPanel from './AIMCPClientInstallPanel';
import AIMCPServerCard from './AIMCPServerCard';

export type MCPClientKey = 'claude-code' | 'codex';

interface AISettingsMCPSectionProps {
  mcpClientStatuses: AIMCPClientInstallStatus[];
  selectedMCPClient: MCPClientKey;
  selectedMCPClientStatus?: AIMCPClientInstallStatus;
  selectedMCPClientCommandText: string;
  mcpServers: AIMCPServerConfig[];
  mcpTools: AIMCPToolDescriptor[];
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  cardBg: string;
  cardBorder: string;
  inputBg: string;
  loading: boolean;
  mcpClientStatusLoading: boolean;
  onSelectClient: (client: MCPClientKey) => void;
  onRefreshStatus: () => void;
  onCopyConfigPath: () => void;
  onCopyLaunchCommand: () => void;
  onInstallSelectedClient: () => void;
  onAddServer: (seed?: Partial<AIMCPServerConfig>) => void;
  onUpdateServerDraft: (id: string, patch: Partial<AIMCPServerConfig>) => void;
  onTestServer: (server: AIMCPServerConfig) => void;
  onSaveServer: (server: AIMCPServerConfig) => void;
  onDeleteServer: (id: string) => void;
}

const AISettingsMCPSection: React.FC<AISettingsMCPSectionProps> = ({
  mcpClientStatuses,
  selectedMCPClient,
  selectedMCPClientStatus,
  selectedMCPClientCommandText,
  mcpServers,
  mcpTools,
  darkMode,
  overlayTheme,
  cardBg,
  cardBorder,
  inputBg,
  loading,
  mcpClientStatusLoading,
  onSelectClient,
  onRefreshStatus,
  onCopyConfigPath,
  onCopyLaunchCommand,
  onInstallSelectedClient,
  onAddServer,
  onUpdateServerDraft,
  onTestServer,
  onSaveServer,
  onDeleteServer,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <AIMCPClientInstallPanel
      statuses={mcpClientStatuses}
      selectedClient={selectedMCPClient}
      selectedStatus={selectedMCPClientStatus}
      selectedCommandText={selectedMCPClientCommandText}
      darkMode={darkMode}
      overlayTheme={overlayTheme}
      cardBg={cardBg}
      cardBorder={cardBorder}
      loading={loading}
      statusLoading={mcpClientStatusLoading}
      onSelectClient={onSelectClient}
      onRefreshStatus={onRefreshStatus}
      onCopyConfigPath={onCopyConfigPath}
      onCopyLaunchCommand={onCopyLaunchCommand}
      onInstall={onInstallSelectedClient}
    />
    <div
      style={{
        padding: '14px 16px',
        borderRadius: 14,
        border: `1px solid ${cardBorder}`,
        background: cardBg,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14, color: overlayTheme.titleText }}>常见启动方式模板</div>
      <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
        不确定命令和参数怎么拆时，先选一个最接近的启动方式。GoNavi 会自动带入示例值，你再改成自己的脚本名、模块名或 exe 路径即可。
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        {MCP_SERVER_DRAFT_TEMPLATES.map((template) => (
          <button
            key={template.key}
            type="button"
            onClick={() => onAddServer(template.seed)}
            style={{
              textAlign: 'left',
              padding: '12px 13px',
              borderRadius: 12,
              border: `1px solid ${cardBorder}`,
              background: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.72)',
              color: overlayTheme.titleText,
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700 }}>{template.title}</div>
            <div style={{ marginTop: 4, fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.6 }}>{template.description}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.6 }}>{template.detail}</div>
          </button>
        ))}
      </div>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <div style={{ fontSize: 12, color: overlayTheme.mutedText }}>支持命令、参数、环境变量和超时，保存后会自动进入 AI 工具列表。</div>
      <Button icon={<PlusOutlined />} onClick={() => onAddServer()} style={{ borderRadius: 10 }}>新增 MCP 服务</Button>
    </div>
    {mcpServers.length === 0 && (
      <div style={{ padding: '18px 16px', borderRadius: 14, border: `1px dashed ${cardBorder}`, background: cardBg, color: overlayTheme.mutedText }}>
        还没有 MCP 服务。常见形式是 `node server.js`、`uvx some-mcp-server`、`python -m server`。
      </div>
    )}
    {mcpServers.map((server) => (
      <AIMCPServerCard
        key={server.id}
        server={server}
        serverTools={mcpTools.filter((tool) => tool.serverId === server.id)}
        cardBg={cardBg}
        cardBorder={cardBorder}
        inputBg={inputBg}
        darkMode={darkMode}
        overlayTheme={overlayTheme}
        loading={loading}
        onChange={(patch) => onUpdateServerDraft(server.id, patch)}
        onTest={() => onTestServer(server)}
        onSave={() => onSaveServer(server)}
        onDelete={() => onDeleteServer(server.id)}
      />
    ))}
  </div>
);

export default AISettingsMCPSection;
