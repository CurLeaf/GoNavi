import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import AISettingsMCPSection from './AISettingsMCPSection';
import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

describe('AISettingsMCPSection', () => {
  it('renders the extracted MCP client installer and server management entry point', () => {
    const markup = renderToStaticMarkup(
      <AISettingsMCPSection
        mcpClientStatuses={[
          {
            client: 'claude-code',
            displayName: 'Claude Code',
            installed: false,
            matchesCurrent: false,
            message: '未安装到 Claude Code 用户级配置',
          },
          {
            client: 'codex',
            displayName: 'Codex',
            installed: false,
            matchesCurrent: false,
            message: '未安装到 Codex 用户级配置',
          },
        ]}
        selectedMCPClient="claude-code"
        selectedMCPClientStatus={{
          client: 'claude-code',
          displayName: 'Claude Code',
          installed: false,
          matchesCurrent: false,
          message: '未安装到 Claude Code 用户级配置',
        }}
        selectedMCPClientCommandText=""
        mcpServers={[]}
        mcpTools={[]}
        darkMode={false}
        overlayTheme={buildOverlayWorkbenchTheme(false)}
        cardBg="#fff"
        cardBorder="rgba(0,0,0,0.08)"
        inputBg="#fff"
        loading={false}
        mcpClientStatusLoading={false}
        onSelectClient={() => {}}
        onRefreshStatus={() => {}}
        onCopyConfigPath={() => {}}
        onCopyLaunchCommand={() => {}}
        onInstallSelectedClient={() => {}}
        onAddServer={() => {}}
        onUpdateServerDraft={() => {}}
        onTestServer={() => {}}
        onSaveServer={() => {}}
        onDeleteServer={() => {}}
      />,
    );

    expect(markup).toContain('接入外部客户端');
    expect(markup).toContain('新增 MCP 服务');
    expect(markup).toContain('还没有 MCP 服务');
  });
});
