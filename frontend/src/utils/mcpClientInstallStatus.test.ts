import { describe, expect, it } from 'vitest';

import type { AIMCPClientInstallStatus } from '../types';
import {
  EMPTY_MCP_CLIENT_STATUSES,
  formatMCPLaunchCommand,
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
        installed: true,
        matchesCurrent: true,
        clientDetected: false,
        clientCommand: 'codex',
        clientPath: '',
        message: '已检测到 Codex 用户级 GoNavi MCP 配置，且与当前 GoNavi 安装路径一致',
        args: [],
      },
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

  it('keeps the user-selected client when it is still present in the latest status list', () => {
    expect(pickPreferredMCPClient(EMPTY_MCP_CLIENT_STATUSES, 'codex')).toBe('codex');
  });

  it('formats quoted launch commands for display and clipboard use', () => {
    expect(formatMCPLaunchCommand({
      command: 'C:/Program Files/GoNavi/GoNavi.exe',
      args: ['mcp-server', '--stdio'],
    })).toBe('"C:/Program Files/GoNavi/GoNavi.exe" mcp-server --stdio');
  });
});
