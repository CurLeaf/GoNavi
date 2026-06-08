import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import AISettingsMCPSection from './AISettingsMCPSection';
import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

const flattenElementText = (node: any): string => {
  if (node == null || typeof node === 'boolean') {
    return '';
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map((item) => flattenElementText(item)).join('');
  }
  return flattenElementText(node.props?.children);
};

const findElement = (node: any, predicate: (element: any) => boolean): any => {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return null;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const match = findElement(item, predicate);
      if (match) {
        return match;
      }
    }
    return null;
  }
  if (predicate(node)) {
    return node;
  }
  return findElement(node.props?.children, predicate);
};

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

    expect(markup).toContain('安装到外部 AI 客户端');
    expect(markup).toContain('常见启动方式模板');
    expect(markup).toContain('Node 脚本');
    expect(markup).toContain('新增 MCP 服务');
    expect(markup).toContain('还没有 MCP 服务');
  });

  it('seeds a new draft when a launch template is selected', () => {
    const onAddServer = vi.fn();
    const tree = AISettingsMCPSection({
      mcpClientStatuses: [],
      selectedMCPClient: 'claude-code',
      selectedMCPClientStatus: undefined,
      selectedMCPClientCommandText: '',
      mcpServers: [],
      mcpTools: [],
      darkMode: false,
      overlayTheme: buildOverlayWorkbenchTheme(false),
      cardBg: '#fff',
      cardBorder: 'rgba(0,0,0,0.08)',
      inputBg: '#fff',
      loading: false,
      mcpClientStatusLoading: false,
      onSelectClient: () => {},
      onRefreshStatus: () => {},
      onCopyConfigPath: () => {},
      onCopyLaunchCommand: () => {},
      onInstallSelectedClient: () => {},
      onAddServer,
      onUpdateServerDraft: () => {},
      onTestServer: () => {},
      onSaveServer: () => {},
      onDeleteServer: () => {},
    });

    const nodeTemplateButton = findElement(
      tree,
      (node) => node.type === 'button' && flattenElementText(node.props?.children).includes('Node 脚本'),
    );
    expect(nodeTemplateButton).toBeTruthy();
    nodeTemplateButton.props.onClick();

    expect(onAddServer).toHaveBeenCalledWith(expect.objectContaining({
      command: 'node',
      args: ['server.js', '--stdio'],
    }));
  });
});
