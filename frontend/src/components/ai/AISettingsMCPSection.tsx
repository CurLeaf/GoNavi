import React from 'react';
import { Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

import { t as catalogTranslate } from '../../i18n/catalog';
import { useOptionalI18n } from '../../i18n/provider';
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
}) => {
  const i18n = useOptionalI18n();
  const copy = (key: string) => (i18n?.t ?? ((catalogKey) => catalogTranslate('en-US', catalogKey)))(key);

  return (
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
      <div style={{ fontWeight: 700, fontSize: 14, color: overlayTheme.titleText }}>{copy('ai_settings.mcp_server.section.quick_reference.title')}</div>
      <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
        {copy('ai_settings.mcp_server.section.quick_reference.description')}
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
      <div style={{ fontSize: 12, color: overlayTheme.mutedText }}>{copy('ai_settings.mcp_server.section.quick_reference.footer')}</div>
      <Button icon={<PlusOutlined />} onClick={() => onAddServer()} style={{ borderRadius: 10 }}>{copy('ai_settings.mcp_server.section.action.add_server')}</Button>
    </div>
    {mcpServers.length === 0 && (
      <div style={{ padding: '18px 16px', borderRadius: 14, border: `1px dashed ${cardBorder}`, background: cardBg, color: overlayTheme.mutedText }}>
        {copy('ai_settings.mcp_server.section.empty')}
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
};

export default AISettingsMCPSection;
