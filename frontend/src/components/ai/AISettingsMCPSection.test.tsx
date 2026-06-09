import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import AISettingsMCPSection from './AISettingsMCPSection';
import type { AISettingsMCPSectionProps } from './AISettingsMCPSection';
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

const buildMCPSectionProps = (patch: Partial<AISettingsMCPSectionProps> = {}): AISettingsMCPSectionProps => ({
  mcpClientStatuses: [
    {
      client: 'claude-code',
      displayName: 'Claude Code',
      installed: false,
      matchesCurrent: false,
      clientDetected: false,
      clientCommand: 'claude',
      message: '未检测到 Claude Code 用户级 GoNavi MCP 配置',
    },
    {
      client: 'codex',
      displayName: 'Codex',
      installed: false,
      matchesCurrent: false,
      clientDetected: true,
      clientCommand: 'codex',
      clientPath: 'C:/Users/mock/AppData/Roaming/npm/codex.cmd',
      message: '未检测到 Codex 用户级 GoNavi MCP 配置',
    },
  ],
  selectedMCPClient: 'claude-code',
  selectedMCPClientStatus: {
    client: 'claude-code',
    displayName: 'Claude Code',
    installed: false,
    matchesCurrent: false,
    clientDetected: false,
    clientCommand: 'claude',
    message: '未检测到 Claude Code 用户级 GoNavi MCP 配置',
  },
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
  onAddServer: () => {},
  onUpdateServerDraft: () => {},
  onTestServer: () => {},
  onSaveServer: () => {},
  onDeleteServer: () => {},
  ...patch,
});

describe('AISettingsMCPSection', () => {
  it('renders the extracted MCP client installer and server management entry point', () => {
    const markup = renderToStaticMarkup(
      <AISettingsMCPSection {...buildMCPSectionProps()} />,
    );

    expect(markup).toContain('接入外部客户端');
    expect(markup).toContain('尚未把当前 GoNavi MCP 接入到这里');
    expect(markup).toContain('常见启动方式模板');
    expect(markup).toContain('Node 脚本');
    expect(markup).toContain('新增 MCP 服务');
    expect(markup).toContain('还没有 MCP 服务');
  });

  it('renders troubleshooting hints when a server draft exists', () => {
    const markup = renderToStaticMarkup(
      <AISettingsMCPSection
        {...buildMCPSectionProps({
          mcpServers: [{
            id: 'mcp-local',
            name: 'Local MCP',
            transport: 'stdio',
            command: 'node',
            args: ['server.js', '--stdio'],
            env: {},
            enabled: true,
            timeoutSeconds: 20,
          }],
        })}
      />,
    );

    expect(markup).toContain('常见填错现象');
    expect(markup).toContain('测试提示找不到命令');
    expect(markup).toContain('认证失败、401 或 403');
    expect(markup).toContain('当前只支持 stdio');
    expect(markup).toContain('不要把密钥写进聊天内容');
  });

  it('seeds a new draft when a launch template is selected', () => {
    const onAddServer = vi.fn();
    const tree = AISettingsMCPSection(buildMCPSectionProps({
      mcpClientStatuses: [],
      selectedMCPClientStatus: undefined,
      onAddServer,
    }));

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
