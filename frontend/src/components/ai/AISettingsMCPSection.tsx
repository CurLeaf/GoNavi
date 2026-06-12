import React from 'react';
import { Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

import type { AIMCPClientInstallStatus, AIMCPHTTPServerStatus, AIMCPServerConfig, AIMCPToolDescriptor } from '../../types';
import type { MCPClientKey } from '../../utils/mcpClientInstallStatus';
import { MCP_FIELD_GUIDES } from '../../utils/mcpServerGuidance';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import AIMCPClientInstallPanel from './AIMCPClientInstallPanel';
import AIMCPFieldGuideCard from './AIMCPFieldGuideCard';
import AIMCPHTTPServerPanel from './AIMCPHTTPServerPanel';
import type { AIMCPHTTPServerDraft } from './AIMCPHTTPServerPanel';
import AIMCPQuickAddServerPanel from './AIMCPQuickAddServerPanel';
import AIMCPServerCard from './AIMCPServerCard';

export type { MCPClientKey } from '../../utils/mcpClientInstallStatus';

export interface AISettingsMCPSectionProps {
  mcpClientStatuses: AIMCPClientInstallStatus[];
  selectedMCPClient: MCPClientKey;
  selectedMCPClientStatus?: AIMCPClientInstallStatus;
  selectedMCPClientCommandText: string;
  mcpHTTPServerStatus: AIMCPHTTPServerStatus;
  mcpHTTPServerDraft: AIMCPHTTPServerDraft;
  mcpServers: AIMCPServerConfig[];
  mcpTools: AIMCPToolDescriptor[];
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  cardBg: string;
  cardBorder: string;
  inputBg: string;
  loading: boolean;
  mcpClientStatusLoading: boolean;
  mcpHTTPServerLoading: boolean;
  onUpdateHTTPServerDraft: (patch: Partial<AIMCPHTTPServerDraft>) => void;
  onToggleHTTPServer: (checked: boolean) => void;
  onCopyHTTPServerURL: () => void;
  onCopyHTTPServerAuthorization: () => void;
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
  mcpHTTPServerStatus,
  mcpHTTPServerDraft,
  mcpServers,
  mcpTools,
  darkMode,
  overlayTheme,
  cardBg,
  cardBorder,
  inputBg,
  loading,
  mcpClientStatusLoading,
  mcpHTTPServerLoading,
  onUpdateHTTPServerDraft,
  onToggleHTTPServer,
  onCopyHTTPServerURL,
  onCopyHTTPServerAuthorization,
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
    <AIMCPHTTPServerPanel
      status={mcpHTTPServerStatus}
      draft={mcpHTTPServerDraft}
      loading={mcpHTTPServerLoading}
      cardBg={cardBg}
      cardBorder={cardBorder}
      darkMode={darkMode}
      overlayTheme={overlayTheme}
      onDraftChange={onUpdateHTTPServerDraft}
      onToggle={onToggleHTTPServer}
      onCopyURL={onCopyHTTPServerURL}
      onCopyAuthorization={onCopyHTTPServerAuthorization}
    />
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
    <AIMCPQuickAddServerPanel
      cardBg={cardBg}
      cardBorder={cardBorder}
      inputBg={inputBg}
      darkMode={darkMode}
      overlayTheme={overlayTheme}
      onAddServer={onAddServer}
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
      <div style={{ fontWeight: 700, fontSize: 14, color: overlayTheme.titleText }}>新增 MCP 参数速查</div>
      <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
        先确认这几个字段再新增服务：`command` 只填可执行程序，`args` 才放脚本名和 --stdio，`env` 每行一个 KEY=VALUE，`timeout` 控制单次工具发现或调用等待时间。
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        {MCP_FIELD_GUIDES.filter((item) => ['command', 'args', 'env', 'timeout'].includes(item.key)).map((item) => (
          <AIMCPFieldGuideCard
            key={item.key}
            item={item}
            cardBorder={cardBorder}
            darkMode={darkMode}
            overlayTheme={overlayTheme}
            compact
          />
        ))}
      </div>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <div style={{ fontSize: 12, color: overlayTheme.mutedText }}>支持命令、参数、环境变量和超时；不确定怎么填时先看卡片里的“字段速查”，保存后会自动进入 AI 工具列表。</div>
      <Button icon={<PlusOutlined />} onClick={() => onAddServer()} style={{ borderRadius: 10 }}>新增 MCP 服务</Button>
    </div>
    {mcpServers.length === 0 && (
      <div style={{ padding: '18px 16px', borderRadius: 14, border: `1px dashed ${cardBorder}`, background: cardBg, color: overlayTheme.mutedText }}>
        还没有 MCP 服务。常见形式是 `npx -y package --stdio`、`node server.js`、`uvx some-mcp-server`、`python -m server`、`docker run --rm -i image`。
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
