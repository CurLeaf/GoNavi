import { describe, expect, it } from 'vitest';

import type { AIMCPClientInstallStatus } from '../types';
import {
  buildRemoteMCPClientGuide,
  buildRemoteMCPClientQuickStart,
  EMPTY_MCP_CLIENT_STATUSES,
  formatMCPLaunchCommand,
  isRemoteMCPClientStatus,
  normalizeMCPClientStatuses,
  pickPreferredMCPClient,
} from './mcpClientInstallStatus';

describe('mcpClientInstallStatus helpers', () => {
  it('fills missing clients with default placeholder statuses', () => {
    const statuses = normalizeMCPClientStatuses([
      {
        client: 'codex',
        displayName: 'Codex',
        installed: true,
        matchesCurrent: true,
        message: '已检测到 Codex 用户级 GoNavi MCP 配置，且与当前 GoNavi 安装路径一致',
      },
    ]);

    expect(statuses).toEqual([
      EMPTY_MCP_CLIENT_STATUSES[0],
      {
        client: 'codex',
        displayName: 'Codex',
        installMode: 'auto',
        installed: true,
        matchesCurrent: true,
        clientDetected: false,
        clientCommand: 'codex',
        clientPath: '',
        message: '已检测到 Codex 用户级 GoNavi MCP 配置，且与当前 GoNavi 安装路径一致',
        args: [],
      },
      EMPTY_MCP_CLIENT_STATUSES[2],
      EMPTY_MCP_CLIENT_STATUSES[3],
    ]);
  });

  it('prefers an already-installed but outdated client over a completely uninstalled one', () => {
    const statuses: AIMCPClientInstallStatus[] = [
      {
        client: 'claude-code',
        displayName: 'Claude Code',
        installed: false,
        matchesCurrent: false,
        message: '未检测到 Claude Code 用户级 GoNavi MCP 配置',
      },
      {
        client: 'codex',
        displayName: 'Codex',
        installed: true,
        matchesCurrent: false,
        message: '已检测到 Codex 中的 GoNavi MCP 记录，但与当前 GoNavi 安装路径不一致，建议更新',
      },
    ];

    expect(pickPreferredMCPClient(statuses)).toBe('codex');
  });

  it('prefers a locally detected client command when neither client has existing GoNavi MCP config', () => {
    const statuses: AIMCPClientInstallStatus[] = [
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
    ];

    expect(pickPreferredMCPClient(statuses)).toBe('codex');
  });

  it('prefers a client that already matches current GoNavi over another client with a stale config', () => {
    const statuses: AIMCPClientInstallStatus[] = [
      {
        client: 'claude-code',
        displayName: 'Claude Code',
        installed: true,
        matchesCurrent: true,
        clientDetected: true,
        clientCommand: 'claude',
        message: '已检测到 Claude Code 用户级 GoNavi MCP 配置，且与当前 GoNavi 安装路径一致',
      },
      {
        client: 'codex',
        displayName: 'Codex',
        installed: true,
        matchesCurrent: false,
        clientDetected: true,
        clientCommand: 'codex',
        message: '已检测到 Codex 中的 GoNavi MCP 记录，但与当前 GoNavi 安装路径不一致，建议更新',
      },
    ];

    expect(pickPreferredMCPClient(statuses)).toBe('claude-code');
  });

  it('keeps the user-selected client when it is still present in the latest status list', () => {
    expect(pickPreferredMCPClient(EMPTY_MCP_CLIENT_STATUSES, 'codex')).toBe('codex');
    expect(pickPreferredMCPClient(EMPTY_MCP_CLIENT_STATUSES, 'openclaw')).toBe('openclaw');
  });

  it('formats quoted launch commands for display and clipboard use', () => {
    expect(formatMCPLaunchCommand({
      command: 'C:/Program Files/GoNavi/GoNavi.exe',
      args: ['mcp-server', '--stdio'],
    })).toBe('"C:/Program Files/GoNavi/GoNavi.exe" mcp-server --stdio');
  });

  it('marks OpenClaw and Hermans as remote bridge clients and builds a safe guide', () => {
    const openClaw = EMPTY_MCP_CLIENT_STATUSES.find((item) => item.client === 'openclaw');

    expect(isRemoteMCPClientStatus(openClaw)).toBe(true);
    const guide = buildRemoteMCPClientGuide(openClaw);
    expect(guide).toContain('GoNavi MCP 远程接入说明 - OpenClaw');
    expect(guide).toContain('云端 Agent 不需要保存数据库密码');
    expect(guide).toContain('不能直接使用 Windows 本地 stdio 命令');
    expect(guide).toContain('allowMutating=true');
    expect(guide).toContain('"type": "streamable-http"');
    expect(guide).toContain('"Authorization": "Bearer <随机token>"');
    expect(guide).toContain('GoNavi.exe mcp-server remote-config --client openclaw --url https://<你的域名或隧道地址>/mcp --token <随机token>');
    expect(guide).toContain('GoNavi.exe mcp-server http --addr 127.0.0.1:8765 --path /mcp --token <随机token>');
  });

  it('builds remote quick-start snippets for cloud agents without database secrets', () => {
    const quickStart = buildRemoteMCPClientQuickStart({
      client: 'hermans',
      displayName: 'OpenClaw',
    });

    expect(quickStart.displayName).toBe('OpenClaw');
    expect(quickStart.configJson).toContain('"type": "streamable-http"');
    expect(quickStart.configJson).toContain('"url": "https://<你的域名或隧道地址>/mcp"');
    expect(quickStart.configJson).toContain('"Authorization": "Bearer <随机token>"');
    expect(quickStart.configJson).not.toContain('password');
    expect(quickStart.configCommand).toBe('GoNavi.exe mcp-server remote-config --client hermans --url https://<你的域名或隧道地址>/mcp --token <随机token>');
    expect(quickStart.launchCommand).toBe('GoNavi.exe mcp-server http --addr 127.0.0.1:8765 --path /mcp --token <随机token>');
    expect(quickStart.standaloneCommand).toBe('gonavi-mcp-server http --addr 127.0.0.1:8765 --path /mcp --token <随机token>');
    expect(quickStart.verificationSteps.join('\n')).toContain('get_connections');
    expect(quickStart.securityNotes.join('\n')).toContain('allowMutating=true');
  });
});
