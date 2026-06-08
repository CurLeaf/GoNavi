import type { AIMCPClientInstallStatus } from '../types';

type MCPClientKey = 'claude-code' | 'codex';

export const EMPTY_MCP_CLIENT_STATUSES: AIMCPClientInstallStatus[] = [
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
    installed: false,
    matchesCurrent: false,
    message: '未检测到 Codex 用户级 GoNavi MCP 配置',
  },
];

const MCP_CLIENT_ORDER: MCPClientKey[] = ['claude-code', 'codex'];

const quoteMCPCommandPart = (value: string): string => {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  return /[\s"]/u.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
};

const isActionableClient = (client: string): client is MCPClientKey =>
  client === 'claude-code' || client === 'codex';

const hasStatusError = (status: AIMCPClientInstallStatus): boolean =>
  /失败|异常|错误|校验失败/u.test(String(status.message || ''));

const getMCPClientPriority = (status: AIMCPClientInstallStatus): number => {
  if (hasStatusError(status)) {
    return 0;
  }
  if (status.installed && !status.matchesCurrent) {
    return 1;
  }
  if (status.matchesCurrent) {
    return 2;
  }
  return 3;
};

export const normalizeMCPClientStatuses = (items?: AIMCPClientInstallStatus[]): AIMCPClientInstallStatus[] => {
  const baseMap = new Map<string, AIMCPClientInstallStatus>(
    EMPTY_MCP_CLIENT_STATUSES.map((item) => [item.client, { ...item }]),
  );
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (!item || !item.client) {
      return;
    }
    const base = baseMap.get(item.client) || {
      client: item.client,
      displayName: item.client,
      installed: false,
      matchesCurrent: false,
      message: '',
    };
    baseMap.set(item.client, {
      ...base,
      ...item,
      displayName: item.displayName || base.displayName,
      message: item.message || base.message,
      args: Array.isArray(item.args) ? item.args : (base.args || []),
    });
  });
  return MCP_CLIENT_ORDER
    .map((client) => baseMap.get(client))
    .filter((item): item is AIMCPClientInstallStatus => Boolean(item));
};

export const pickPreferredMCPClient = (
  items: AIMCPClientInstallStatus[],
  current?: MCPClientKey,
): MCPClientKey => {
  if (current && items.some((item) => item.client === current)) {
    return current;
  }

  const ranked = items
    .filter((item): item is AIMCPClientInstallStatus & { client: MCPClientKey } => isActionableClient(item.client))
    .slice()
    .sort((left, right) => {
      const priorityDiff = getMCPClientPriority(left) - getMCPClientPriority(right);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return MCP_CLIENT_ORDER.indexOf(left.client) - MCP_CLIENT_ORDER.indexOf(right.client);
    });

  return ranked[0]?.client || 'claude-code';
};

export const formatMCPLaunchCommand = (
  input?: Pick<AIMCPClientInstallStatus, 'command' | 'args'> | { command?: string; args?: string[] } | null,
): string => {
  const command = String(input?.command || '').trim();
  if (!command) {
    return '';
  }
  const args = Array.isArray(input?.args)
    ? input.args.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  return [command, ...args].map(quoteMCPCommandPart).filter(Boolean).join(' ');
};
