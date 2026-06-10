import type { AIMCPClientInstallStatus } from '../types';

export type MCPClientKey = 'claude-code' | 'codex' | 'openclaw' | 'hermans';

const AUTO_MCP_CLIENTS = new Set<MCPClientKey>(['claude-code', 'codex']);
const REMOTE_MCP_CLIENTS = new Set<MCPClientKey>(['openclaw', 'hermans']);

export const EMPTY_MCP_CLIENT_STATUSES: AIMCPClientInstallStatus[] = [
  {
    client: 'claude-code',
    displayName: 'Claude Code',
    installMode: 'auto',
    installed: false,
    matchesCurrent: false,
    clientDetected: false,
    clientCommand: 'claude',
    message: '未检测到 Claude Code 用户级 GoNavi MCP 配置',
  },
  {
    client: 'codex',
    displayName: 'Codex',
    installMode: 'auto',
    installed: false,
    matchesCurrent: false,
    clientDetected: false,
    clientCommand: 'codex',
    message: '未检测到 Codex 用户级 GoNavi MCP 配置',
  },
  {
    client: 'openclaw',
    displayName: 'OpenClaw',
    installMode: 'remote',
    installed: false,
    matchesCurrent: false,
    clientDetected: false,
    clientCommand: 'openclaw',
    message: 'OpenClaw 通常部署在云端 Linux；请通过远程 MCP 桥接接入 Windows GoNavi，不要复制数据库密码。',
  },
  {
    client: 'hermans',
    displayName: 'Hermans',
    installMode: 'remote',
    installed: false,
    matchesCurrent: false,
    clientDetected: false,
    clientCommand: 'hermans',
    message: 'Hermans 这类远程 Agent 请通过远程 MCP 桥接接入 Windows GoNavi，不要复制数据库密码。',
  },
];

const MCP_CLIENT_ORDER: MCPClientKey[] = ['claude-code', 'codex', 'openclaw', 'hermans'];

const quoteMCPCommandPart = (value: string): string => {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  return /[\s"]/u.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
};

export const isMCPClientKey = (client: string): client is MCPClientKey =>
  client === 'claude-code' || client === 'codex' || client === 'openclaw' || client === 'hermans';

export const isRemoteMCPClientStatus = (status?: Pick<AIMCPClientInstallStatus, 'client' | 'installMode'> | null): boolean => {
  const client = String(status?.client || '').trim();
  return status?.installMode === 'remote' || (isMCPClientKey(client) && REMOTE_MCP_CLIENTS.has(client));
};

export const supportsAutoMCPClientInstall = (status?: Pick<AIMCPClientInstallStatus, 'client' | 'installMode'> | null): boolean => {
  const client = String(status?.client || '').trim();
  return status?.installMode === 'auto' || (isMCPClientKey(client) && AUTO_MCP_CLIENTS.has(client));
};

const hasStatusError = (status: AIMCPClientInstallStatus): boolean =>
  /失败|异常|错误|校验失败/u.test(String(status.message || ''));

const getMCPClientPriority = (status: AIMCPClientInstallStatus): number => {
  if (status.matchesCurrent) {
    return 0;
  }
  if (status.installed && !status.matchesCurrent) {
    return 1;
  }
  if (status.clientDetected) {
    return 2;
  }
  if (hasStatusError(status)) {
    return 3;
  }
  return 4;
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
      installMode: item.installMode || base.installMode || 'auto',
      clientDetected: item.clientDetected ?? base.clientDetected ?? false,
      clientCommand: item.clientCommand || base.clientCommand,
      clientPath: item.clientPath || '',
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
    .filter((item): item is AIMCPClientInstallStatus & { client: MCPClientKey } => isMCPClientKey(item.client))
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

export const buildRemoteMCPClientGuide = (
  status?: Pick<AIMCPClientInstallStatus, 'displayName' | 'message'> | null,
): string => {
  const displayName = String(status?.displayName || '远程 Agent').trim();
  const streamableHTTPConfig = [
    '{',
    '  "mcpServers": {',
    '    "gonavi": {',
    '      "type": "streamable-http",',
    '      "url": "https://<你的域名或隧道地址>/mcp",',
    '      "headers": {',
    '        "Authorization": "Bearer <随机token>"',
    '      }',
    '    }',
    '  }',
    '}',
  ];
  return [
    `GoNavi MCP 远程接入说明 - ${displayName}`,
    '',
    '目标：',
    '- 数据库连接、账号和密码继续保存在 Windows 上的 GoNavi。云端 Agent 不需要保存数据库密码。',
    '- 云端 Agent 只通过 MCP tools 读取 get_connections/get_databases/get_tables/get_columns/get_table_ddl 等结果。',
    '- execute_sql 仍受 GoNavi AI 安全控制约束；写操作必须显式传 allowMutating=true。',
    '',
    '当前边界：',
    '- GoNavi 内置 MCP 本机入口是 stdio，适合 Claude Code / Codex 这类和 GoNavi 在同一台机器上的客户端。',
    '- 如果 OpenClaw/Hermans 部署在云端 Linux，不能直接使用 Windows 本地 stdio 命令；可在 Windows 上启动 GoNavi Streamable HTTP 模式，再通过隧道或反向代理给云端 Agent 调用。',
    '',
    '建议接入方式：',
    '1. Windows 本机保持 GoNavi 可访问，由 GoNavi 读取保存连接和系统凭据。',
    '2. 在 Windows 或可信内网侧运行：GoNavi.exe mcp-server http --addr 127.0.0.1:8765 --path /mcp --token <随机token>。',
    `3. 在 ${displayName} 中添加远程 MCP Server，transport 选择 Streamable HTTP，URL 填隧道/反向代理后的 /mcp 地址，并设置 Authorization: Bearer <随机token>。`,
    '4. 先调用 get_connections 获取 connectionId，再调用表结构工具；不要把数据库 host/user/password 写进云端 Agent 配置。',
    '',
    '可复制配置片段（适用于支持 mcpServers JSON 的 Agent）：',
    ...streamableHTTPConfig,
    '',
    'CLI / 服务启动命令：',
    'GoNavi.exe mcp-server http --addr 127.0.0.1:8765 --path /mcp --token <随机token>',
    '或设置环境变量：GONAVI_MCP_HTTP_TOKEN=<随机token> 后运行 gonavi-mcp-server http --addr 127.0.0.1:8765 --path /mcp',
    '',
    status?.message ? `当前提示：${status.message}` : '',
  ].filter((line, index, lines) => line || index < lines.length - 1).join('\n');
};
