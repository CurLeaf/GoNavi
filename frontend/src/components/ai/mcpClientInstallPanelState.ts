import type { AIMCPClientInstallStatus } from '../../types';
import { isRemoteMCPClientStatus } from '../../utils/mcpClientInstallStatus';

export interface MCPClientInstallStatusTone {
  label: string;
  color: string;
  bg: string;
}

export const hasMCPClientStatusIssue = (status: AIMCPClientInstallStatus | undefined): boolean =>
  /失败|异常|错误/u.test(String(status?.message || ''));

export const getMCPClientStatusTone = (
  status: AIMCPClientInstallStatus | undefined,
  darkMode: boolean,
): MCPClientInstallStatusTone => {
  if (status?.matchesCurrent) {
    return {
      label: '已接入',
      color: '#16a34a',
      bg: darkMode ? 'rgba(34,197,94,0.18)' : 'rgba(34,197,94,0.12)',
    };
  }
  if (status?.installed) {
    return {
      label: '需更新',
      color: '#d97706',
      bg: darkMode ? 'rgba(245,158,11,0.18)' : 'rgba(245,158,11,0.12)',
    };
  }
  if (isRemoteMCPClientStatus(status)) {
    return {
      label: '远程桥接',
      color: '#0284c7',
      bg: darkMode ? 'rgba(56,189,248,0.16)' : 'rgba(14,165,233,0.10)',
    };
  }
  if (hasMCPClientStatusIssue(status)) {
    return {
      label: '状态异常',
      color: '#dc2626',
      bg: darkMode ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.1)',
    };
  }
  return {
    label: '未接入',
    color: darkMode ? 'rgba(255,255,255,0.72)' : '#64748b',
    bg: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(100,116,139,0.08)',
  };
};

export const getMCPClientInstallStateLabel = (status: AIMCPClientInstallStatus | undefined): string => {
  if (status?.matchesCurrent) {
    return '外部工具接入状态：已接入当前 GoNavi';
  }
  if (status?.installed) {
    return '外部工具接入状态：已存在旧配置，需更新';
  }
  if (hasMCPClientStatusIssue(status)) {
    return '外部工具接入状态：读取失败';
  }
  if (isRemoteMCPClientStatus(status)) {
    return '外部工具接入状态：需配置远程 MCP 桥接';
  }
  return '外部工具接入状态：未接入';
};

export const resolveMCPClientCommandName = (status: AIMCPClientInstallStatus | undefined): string => {
  const command = String(status?.clientCommand || '').trim();
  if (command) {
    return command;
  }
  return status?.client === 'codex' ? 'codex' : 'claude';
};

export const getMCPClientStatusSummary = (status: AIMCPClientInstallStatus | undefined): string => {
  const label = status?.displayName || '这个客户端';
  if (status?.matchesCurrent) {
    return `${label} 已接入当前这份 GoNavi MCP，可直接在这个客户端里调用。`;
  }
  if (status?.installed) {
    return `${label} 里已经有旧的 GoNavi 接入记录，更新后会切到当前这份 GoNavi。`;
  }
  if (hasMCPClientStatusIssue(status)) {
    return `${label} 的接入状态读取失败，建议先刷新检测。`;
  }
  if (isRemoteMCPClientStatus(status)) {
    return `${label} 通常运行在云端或远端机器，需要通过远程 MCP 桥接调用当前 GoNavi。`;
  }
  return `当前还没有把这份 GoNavi MCP 接入 ${label}。`;
};

export const getMCPClientOptionSummary = (status: AIMCPClientInstallStatus | undefined): string => {
  if (status?.matchesCurrent) {
    return '当前这份 GoNavi MCP 已接入到这个客户端。';
  }
  if (status?.installed) {
    return '检测到旧的 GoNavi 接入记录，建议更新为当前安装路径。';
  }
  if (hasMCPClientStatusIssue(status)) {
    return '接入状态读取异常，建议先刷新再处理。';
  }
  if (isRemoteMCPClientStatus(status)) {
    return '适合云端 Agent：默认 schema-only 读取 GoNavi 表结构，不复制数据库密码，不暴露 SQL 执行。';
  }
  return '尚未把当前 GoNavi MCP 接入到这里。';
};

export const getMCPClientDetectionSummary = (status: AIMCPClientInstallStatus | undefined): string => {
  const label = status?.displayName || '这个客户端';
  const commandName = resolveMCPClientCommandName(status);
  if (isRemoteMCPClientStatus(status)) {
    return `${label} 通常不在这台 Windows 上运行，本机无需检测 ${commandName} 命令；请在云端配置远程 MCP 桥接地址。`;
  }
  if (status?.clientDetected) {
    return `已检测到本机 ${commandName} 命令，接入或更新后重启 ${label} 即可验证。`;
  }
  return `未检测到本机 ${commandName} 命令；如果 CLI 还没加入 PATH，也可以先写入 ${label} 的接入配置，稍后再重启验证。`;
};

export const getSelectedMCPClientStateLine = (status: AIMCPClientInstallStatus | undefined): string => {
  if (status?.matchesCurrent) {
    return '已接入当前 GoNavi，无需重复操作';
  }
  if (status?.installed) {
    return '已存在旧接入记录，建议更新到当前 GoNavi 路径';
  }
  if (hasMCPClientStatusIssue(status)) {
    return '状态读取异常，建议先刷新检测';
  }
  if (isRemoteMCPClientStatus(status)) {
    return '需要配置远程 MCP 桥接，数据库密码仍留在 GoNavi 本机';
  }
  return '当前还没有接入 GoNavi MCP';
};

export const resolveMCPClientInstallActionLabel = (status: AIMCPClientInstallStatus | undefined): string => {
  const label = status?.displayName || '目标客户端';
  if (status?.matchesCurrent) {
    return `${label} 已接入，无需重复安装`;
  }
  if (status?.installed) {
    return `更新 ${label} 接入配置`;
  }
  if (isRemoteMCPClientStatus(status)) {
    return `复制 ${label} 远程接入说明`;
  }
  return `安装到 ${label}（外部工具）`;
};
