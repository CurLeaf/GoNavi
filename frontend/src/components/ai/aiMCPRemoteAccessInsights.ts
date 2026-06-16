import type { AIMCPClientInstallStatus } from '../../types';
import {
  buildRemoteMCPClientGuide,
  isRemoteMCPClientStatus,
  normalizeMCPClientStatuses,
} from '../../utils/mcpClientInstallStatus';

type MCPRemoteExposeStrategyKey =
  | 'reverse_proxy'
  | 'ssh_reverse_tunnel'
  | 'cloudflare_tunnel'
  | 'tailscale'
  | 'custom';

const DEFAULT_HTTP_ADDR = '127.0.0.1:8765';
const DEFAULT_HTTP_PATH = '/mcp';

const REMOTE_EXPOSE_STRATEGIES: Array<{
  key: MCPRemoteExposeStrategyKey;
  title: string;
  detail: string;
  risk: string;
}> = [
  {
    key: 'reverse_proxy',
    title: '内网反向代理',
    detail: '适合 Windows GoNavi 和云端 Agent 之间已有可信内网或网关的团队环境。',
    risk: '需要网关层继续限制来源 IP、TLS 和 Bearer Token，不要裸露公网。',
  },
  {
    key: 'ssh_reverse_tunnel',
    title: 'SSH 反向隧道',
    detail: '适合临时把 Windows 本机的 127.0.0.1:8765 映射到云端 Linux。配置简单，但要保证 SSH 账号和端口受控。',
    risk: '隧道断开后云端 Agent 会不可用，适合 PoC 或受控运维环境。',
  },
  {
    key: 'cloudflare_tunnel',
    title: 'Cloudflare Tunnel',
    detail: '适合没有固定公网入口的 Windows 机器，通过 Cloudflare Access 叠加身份校验。',
    risk: '必须启用 Access / Zero Trust 规则，不能只依赖随机 URL。',
  },
  {
    key: 'tailscale',
    title: 'Tailscale / WireGuard',
    detail: '适合把 Windows GoNavi 和云端 Agent 放进同一个私有网络，优先走内网地址。',
    risk: '需要控制 ACL，只允许目标 Agent 访问 GoNavi MCP 端口。',
  },
  {
    key: 'custom',
    title: '自定义桥接',
    detail: '适合已有企业网关、堡垒机或专用 MCP 网关的环境。',
    risk: '需要明确 TLS、鉴权、审计和来源限制，避免把本机数据库能力暴露给未知 Agent。',
  },
];

const normalizePath = (value: unknown): string => {
  const raw = String(value || DEFAULT_HTTP_PATH).trim();
  if (!raw) {
    return DEFAULT_HTTP_PATH;
  }
  return raw.startsWith('/') ? raw : `/${raw}`;
};

const normalizeLocalAddr = (value: unknown): string => {
  const raw = String(value || DEFAULT_HTTP_ADDR).trim();
  return raw || DEFAULT_HTTP_ADDR;
};

const normalizePublicUrl = (value: unknown, path: string): string => {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  const normalizedPath = normalizePath(path);
  const withoutTrailingSlash = raw.replace(/\/+$/u, '');
  return withoutTrailingSlash.endsWith(normalizedPath)
    ? withoutTrailingSlash
    : `${withoutTrailingSlash}${normalizedPath}`;
};

const buildHttpLaunchCommand = (binary: string, addr: string, path: string): string =>
  `${binary} mcp-server http --addr ${addr} --path ${path} --token <随机token>`;

const buildStandaloneLaunchCommand = (addr: string, path: string): string =>
  `gonavi-mcp-server http --addr ${addr} --path ${path} --token <随机token>`;

const resolveStrategy = (value: unknown) => {
  const key = String(value || '').trim() as MCPRemoteExposeStrategyKey;
  return REMOTE_EXPOSE_STRATEGIES.find((item) => item.key === key) || REMOTE_EXPOSE_STRATEGIES[0];
};

export const buildMCPRemoteAccessSnapshot = (params: {
  mcpClientStatuses?: AIMCPClientInstallStatus[];
  publicUrl?: string;
  localAddr?: string;
  path?: string;
  exposeStrategy?: MCPRemoteExposeStrategyKey | string;
  tokenConfigured?: boolean;
} = {}) => {
  const localAddr = normalizeLocalAddr(params.localAddr);
  const path = normalizePath(params.path);
  const localUrl = `http://${localAddr}${path}`;
  const publicUrl = normalizePublicUrl(params.publicUrl, path);
  const selectedStrategy = resolveStrategy(params.exposeStrategy);
  const clientStatuses = normalizeMCPClientStatuses(params.mcpClientStatuses);
  const remoteClients = clientStatuses
    .filter(isRemoteMCPClientStatus)
    .map((status) => ({
      client: status.client,
      displayName: status.displayName,
      installMode: status.installMode || 'remote',
      message: status.message || '',
      guide: buildRemoteMCPClientGuide(status),
    }));

  const warnings: string[] = [];
  const nextActions: string[] = [
    '在 Windows 本机启动 GoNavi MCP HTTP 模式，并确认 /healthz 可访问。',
    '通过隧道、反向代理或私有网络只暴露 /mcp 给指定云端 Agent。',
    '在 OpenClaw/Hermans 里配置 Streamable HTTP MCP URL 和 Authorization Bearer Token。',
    '先调用 get_connections 获取 connectionId，再读取库表结构；不要把数据库密码复制到云端 Agent。',
  ];

  if (!publicUrl) {
    warnings.push('尚未提供云端 Agent 可访问的 MCP URL；远程 Agent 不能直接访问 Windows 本机 127.0.0.1。');
  } else if (!/^https:\/\//iu.test(publicUrl) && !/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])/iu.test(publicUrl)) {
    warnings.push('远程 MCP URL 不是 HTTPS；如果不是私有网络地址，建议加 TLS 或放到受控隧道后面。');
  }

  if (params.tokenConfigured === false) {
    warnings.push('尚未确认 Bearer Token；HTTP MCP 必须配置随机 token，不能无鉴权暴露。');
  }

  return {
    mode: 'streamable-http',
    message: publicUrl
      ? `远程 Agent 应通过 ${publicUrl} 访问 GoNavi MCP，并使用 Bearer Token 鉴权`
      : '远程 Agent 需要通过受控隧道或反向代理访问 Windows GoNavi MCP HTTP 入口',
    endpoint: {
      localAddr,
      path,
      localUrl,
      publicUrl,
      healthCheckPath: '/healthz',
      authHeader: 'Authorization: Bearer <随机token>',
    },
    launchCommands: {
      appBinary: buildHttpLaunchCommand('GoNavi.exe', localAddr, path),
      standaloneBinary: buildStandaloneLaunchCommand(localAddr, path),
      tokenEnvFallback: 'GONAVI_MCP_HTTP_TOKEN=<随机token> gonavi-mcp-server http --addr 127.0.0.1:8765 --path /mcp',
    },
    selectedStrategy,
    exposeStrategies: REMOTE_EXPOSE_STRATEGIES,
    remoteClients,
    securityBoundary: {
      databaseSecretsStayLocal: true,
      cloudAgentNeedsDatabasePassword: false,
      httpBearerTokenRequired: true,
      executeSqlStillRequiresAISafetyPolicy: true,
      mutatingSqlStillRequiresAllowMutating: true,
      recommendedBindAddress: '127.0.0.1，除非前面有受控网关或私有网络',
    },
    warnings,
    nextActions,
  };
};
