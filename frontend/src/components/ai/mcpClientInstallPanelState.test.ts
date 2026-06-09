import { describe, expect, it } from 'vitest';

import type { AIMCPClientInstallStatus } from '../../types';
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

const buildStatus = (patch: Partial<AIMCPClientInstallStatus>): AIMCPClientInstallStatus => ({
  client: 'claude-code',
  displayName: 'Claude Code',
  installed: false,
  matchesCurrent: false,
  clientDetected: false,
  clientCommand: 'claude',
  message: '未检测到 Claude Code 用户级 GoNavi MCP 配置',
  ...patch,
});

describe('mcpClientInstallPanelState', () => {
  it('marks a current client as already connected and prevents repeated install wording', () => {
    const status = buildStatus({
      installed: true,
      matchesCurrent: true,
      clientDetected: true,
      message: '已检测到 Claude Code 用户级 GoNavi MCP 配置，且与当前 GoNavi 安装路径一致',
    });

    expect(getMCPClientStatusTone(status, false).label).toBe('已接入');
    expect(getMCPClientInstallStateLabel(status)).toBe('外部工具接入状态：已接入当前 GoNavi');
    expect(getSelectedMCPClientStateLine(status)).toBe('已接入当前 GoNavi，无需重复操作');
    expect(resolveMCPClientInstallActionLabel(status)).toBe('Claude Code 已接入，无需重复安装');
    expect(getMCPClientStatusSummary(status)).toContain('可直接在这个客户端里调用');
  });

  it('asks users to update stale external client records instead of reinstalling blindly', () => {
    const status = buildStatus({
      client: 'codex',
      displayName: 'Codex',
      installed: true,
      matchesCurrent: false,
      clientDetected: true,
      clientCommand: 'codex',
      message: '已检测到 Codex 中的 GoNavi MCP 记录，但与当前 GoNavi 安装路径不一致，建议更新',
    });

    expect(getMCPClientStatusTone(status, false).label).toBe('需更新');
    expect(getMCPClientOptionSummary(status)).toContain('建议更新为当前安装路径');
    expect(getSelectedMCPClientStateLine(status)).toBe('已存在旧接入记录，建议更新到当前 GoNavi 路径');
    expect(resolveMCPClientInstallActionLabel(status)).toBe('更新 Codex 接入配置');
  });

  it('explains that config can be written before the target CLI is detected in PATH', () => {
    const status = buildStatus({
      clientDetected: false,
      clientCommand: '',
    });

    expect(resolveMCPClientCommandName(status)).toBe('claude');
    expect(getMCPClientDetectionSummary(status)).toContain('CLI 还没加入 PATH');
    expect(resolveMCPClientInstallActionLabel(status)).toBe('安装到 Claude Code（外部工具）');
  });
});
