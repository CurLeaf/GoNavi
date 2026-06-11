import type { AIMCPServerConfig, AIMCPToolDescriptor } from '../../types';
import { buildMCPLaunchPreview } from '../../utils/mcpServerGuidance';

const DEFAULT_MCP_RUNTIME_LOG_LIMIT = 160;
const MAX_MCP_RUNTIME_LOG_LIMIT = 200;

type MCPRuntimeFailureKind =
  | 'list_tools_failed'
  | 'tool_call_failed'
  | 'http_start_failed'
  | 'http_process_exited'
  | 'configuration_error'
  | 'mcp_warning'
  | 'mcp_error';

type MCPRuntimeCause =
  | 'command_not_found'
  | 'timeout'
  | 'permission'
  | 'auth'
  | 'network'
  | 'stdio_closed'
  | 'process_exit'
  | 'argument_error'
  | 'transport'
  | 'unknown';

interface MCPRuntimeFailureEvent {
  kind: MCPRuntimeFailureKind;
  cause: MCPRuntimeCause;
  level: 'INFO' | 'WARN' | 'ERROR' | 'OTHER';
  serverName: string;
  linePreview: string;
  nextAction: string;
}

const secretLikeValuePatterns = [
  /bearer\s+[a-z0-9._~+/=-]{8,}/giu,
  /\bsk-[a-z0-9._-]{8,}/giu,
  /\bgh[pousr]_[a-z0-9_]{8,}/giu,
  /\bxox[baprs]-[a-z0-9-]{8,}/giu,
  /([A-Za-z_][A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|API[_-]?KEY)[A-Za-z0-9_]*)=([^\s;&]+)/giu,
];

const normalizeLimit = (input: unknown): number => {
  const value = Math.floor(Number(input) || DEFAULT_MCP_RUNTIME_LOG_LIMIT);
  if (value < 1) return 1;
  if (value > MAX_MCP_RUNTIME_LOG_LIMIT) return MAX_MCP_RUNTIME_LOG_LIMIT;
  return value;
};

const normalizeLogLines = (input: unknown): string[] =>
  Array.isArray(input)
    ? input.map((line) => String(line || '').trim()).filter(Boolean)
    : [];

const redactLogLine = (line: string): string => {
  let next = line;
  secretLikeValuePatterns.forEach((pattern) => {
    next = next.replace(pattern, (_match, key) => (typeof key === 'string' && key ? `${key}=***` : '[REDACTED]'));
  });
  return next.length > 2000 ? `${next.slice(0, 2000)}...[truncated ${next.length - 2000} chars]` : next;
};

const detectLevel = (line: string): MCPRuntimeFailureEvent['level'] => {
  if (line.includes('[ERROR]')) return 'ERROR';
  if (line.includes('[WARN]')) return 'WARN';
  if (line.includes('[INFO]')) return 'INFO';
  return 'OTHER';
};

const extractServerName = (line: string): string => {
  const match = line.match(/server=([^)]+)\)/iu);
  return String(match?.[1] || '').trim();
};

const detectFailureKind = (line: string): MCPRuntimeFailureKind | null => {
  if (line.includes('列出 MCP 工具失败')) return 'list_tools_failed';
  if (line.includes('调用 MCP 工具失败') || line.includes('MCP 工具调用失败')) return 'tool_call_failed';
  if (line.includes('GoNavi MCP HTTP 服务启动失败')) return 'http_start_failed';
  if (line.includes('GoNavi MCP HTTP 服务异常退出') || line.includes('MCP HTTP 子进程已退出')) return 'http_process_exited';
  if (line.includes('MCP 服务命令不能为空') || line.includes('暂不支持的 MCP transport')) return 'configuration_error';
  if (line.toLowerCase().includes('mcp') && line.includes('[ERROR]')) return 'mcp_error';
  if (line.toLowerCase().includes('mcp') && line.includes('[WARN]')) return 'mcp_warning';
  return null;
};

const detectCause = (line: string): MCPRuntimeCause => {
  const lower = line.toLowerCase();
  if (/(executable file not found|not found|no such file|cannot find|找不到|无法找到)/iu.test(line)) {
    return 'command_not_found';
  }
  if (/(context deadline exceeded|timeout|timed out|超时|deadline)/iu.test(line)) {
    return 'timeout';
  }
  if (/(permission denied|access is denied|operation not permitted|权限)/iu.test(line)) {
    return 'permission';
  }
  if (/(401|403|unauthorized|forbidden|authentication|认证|鉴权)/iu.test(line)) {
    return 'auth';
  }
  if (/(connection refused|connectex|econnrefused|network|dial tcp|refused|连接被拒绝)/iu.test(line)) {
    return 'network';
  }
  if (/(stdio|eof|closed pipe|broken pipe|stdin|stdout|标准输入|标准输出)/iu.test(line)) {
    return 'stdio_closed';
  }
  if (/(exit status|exited|异常退出|子进程已退出|process exited)/iu.test(line)) {
    return 'process_exit';
  }
  if (/(invalid character|invalid json|arguments|参数|schema|unmarshal)/iu.test(line)) {
    return 'argument_error';
  }
  if (lower.includes('transport')) {
    return 'transport';
  }
  return 'unknown';
};

const causeNextAction: Record<MCPRuntimeCause, string> = {
  command_not_found: '检查 command 是否只填可执行程序本身，并确认该命令在 PATH 中或使用绝对路径。',
  timeout: '提高 timeoutSeconds 到 45 或 60，并确认服务启动后会保持 stdio 连接。',
  permission: '检查可执行文件权限、杀毒/系统拦截和工作目录访问权限。',
  auth: '检查环境变量里的 Token/API Key 是否已配置、未过期且权限范围足够。',
  network: '检查 MCP 依赖的远端地址、代理、VPN 或本机端口是否可达。',
  stdio_closed: '确认 README 要求的 --stdio/stdin 参数已填写；Docker 场景确认 args 包含 -i。',
  process_exit: '单独在终端运行启动命令，查看进程启动后为什么立即退出。',
  argument_error: '先调用 inspect_mcp_tool_schema 读取真实 inputSchema，再修正工具 arguments JSON。',
  transport: '当前 GoNavi 新增 MCP 只支持 stdio，HTTP MCP 请使用 GoNavi HTTP 服务或对应远程接入说明。',
  unknown: '结合 inspect_mcp_setup 查看配置，再调用 inspect_app_logs 扩大日志窗口确认原始错误。',
};

const parseFailureEvent = (line: string): MCPRuntimeFailureEvent | null => {
  const kind = detectFailureKind(line);
  if (!kind) {
    return null;
  }
  const cause = detectCause(line);
  return {
    kind,
    cause,
    level: detectLevel(line),
    serverName: extractServerName(line),
    linePreview: redactLogLine(line),
    nextAction: causeNextAction[cause],
  };
};

const buildBreakdown = (events: MCPRuntimeFailureEvent[]) =>
  events.reduce<Record<string, number>>((acc, event) => {
    acc[event.kind] = (acc[event.kind] || 0) + 1;
    acc[event.cause] = (acc[event.cause] || 0) + 1;
    return acc;
  }, {});

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

const getServerToolCount = (serverId: string, tools: AIMCPToolDescriptor[]): number =>
  tools.filter((tool) => tool.serverId === serverId).length;

const matchesServer = (event: MCPRuntimeFailureEvent, server: AIMCPServerConfig): boolean => {
  const serverName = event.serverName.toLowerCase();
  if (!serverName) return false;
  return serverName === toTrimmedString(server.name).toLowerCase()
    || serverName === toTrimmedString(server.id).toLowerCase();
};

const buildServerSummaries = (
  servers: AIMCPServerConfig[],
  tools: AIMCPToolDescriptor[],
  events: MCPRuntimeFailureEvent[],
) => servers.map((server) => {
  const serverEvents = events.filter((event) => matchesServer(event, server));
  return {
    id: server.id,
    name: server.name,
    enabled: server.enabled !== false,
    transport: server.transport,
    launchCommandPreview: redactLogLine(buildMCPLaunchPreview(server.command, server.args)),
    timeoutSeconds: server.timeoutSeconds,
    envKeys: Object.keys(server.env || {}).sort(),
    discoveredToolCount: getServerToolCount(server.id, tools),
    recentFailureCount: serverEvents.length,
    recentFailureKinds: Array.from(new Set(serverEvents.map((event) => event.kind))),
    probableCauses: Array.from(new Set(serverEvents.map((event) => event.cause))),
  };
});

const collectNextActions = (
  events: MCPRuntimeFailureEvent[],
  serverSummaries: ReturnType<typeof buildServerSummaries>,
): string[] => {
  const actions = Array.from(new Set(events.map((event) => event.nextAction)));
  const enabledServersWithoutTools = serverSummaries.filter((server) => server.enabled && server.discoveredToolCount === 0);
  if (enabledServersWithoutTools.length > 0) {
    actions.push('有已启用 MCP 服务暂未发现工具，优先点击“测试工具发现”刷新并确认启动命令可独立运行。');
  }
  if (events.some((event) => event.kind === 'list_tools_failed')) {
    actions.push('工具列表为空时先修复启动/发现失败，再排查单个工具 arguments。');
  }
  if (actions.length === 0) {
    actions.push('最近日志未发现 MCP 失败信号；如果刚刚复现过问题，请扩大 lineLimit 或改用 serverName 精确过滤。');
  }
  return actions;
};

export const buildMCPRuntimeFailureSnapshot = (params: {
  readResult?: any;
  mcpServers?: AIMCPServerConfig[];
  mcpTools?: AIMCPToolDescriptor[];
  keyword?: unknown;
  serverName?: unknown;
  lineLimit?: unknown;
  includeLines?: unknown;
}) => {
  const data = params.readResult?.data && typeof params.readResult.data === 'object'
    ? params.readResult.data as Record<string, unknown>
    : {};
  const keyword = toTrimmedString(data.keyword || params.serverName || params.keyword || 'MCP');
  const requestedLineLimit = normalizeLimit(data.requestedLineLimit ?? params.lineLimit);
  const serverNameFilter = toTrimmedString(params.serverName).toLowerCase();
  const textFilter = toTrimmedString(params.keyword).toLowerCase();
  const includeLines = params.includeLines === true;
  const lines = normalizeLogLines(data.lines);
  const events = lines
    .map(parseFailureEvent)
    .filter((event): event is MCPRuntimeFailureEvent => Boolean(event))
    .filter((event) => !serverNameFilter || event.serverName.toLowerCase().includes(serverNameFilter) || event.linePreview.toLowerCase().includes(serverNameFilter))
    .filter((event) => !textFilter || event.linePreview.toLowerCase().includes(textFilter));
  const serverSummaries = buildServerSummaries(
    Array.isArray(params.mcpServers) ? params.mcpServers : [],
    Array.isArray(params.mcpTools) ? params.mcpTools : [],
    events,
  );
  const failureServerNames = Array.from(new Set(events.map((event) => event.serverName).filter(Boolean)));
  const warnings: string[] = [];

  if (events.length > 0) {
    warnings.push(`最近日志中发现 ${events.length} 条 MCP 运行期异常信号。`);
  }
  const serversWithoutTools = serverSummaries.filter((server) => server.enabled && server.discoveredToolCount === 0).length;
  if (serversWithoutTools > 0) {
    warnings.push(`有 ${serversWithoutTools} 个已启用 MCP 服务当前未发现工具。`);
  }

  return {
    logPath: String(data.logPath || ''),
    keyword,
    serverNameFilter: toTrimmedString(params.serverName),
    requestedLineLimit,
    returnedLineCount: lines.length,
    fileWindowTruncated: data.fileWindowTruncated === true,
    matchedLinesTruncated: data.matchedLinesTruncated === true,
    failureEventCount: events.length,
    failureServerNames,
    breakdown: buildBreakdown(events),
    events,
    serverSummaries,
    warnings,
    nextActions: collectNextActions(events, serverSummaries),
    lines: includeLines ? lines.map(redactLogLine) : undefined,
    message: events.length > 0
      ? `最近日志中发现 ${events.length} 条 MCP 运行期异常信号`
      : '最近日志里没有发现 MCP 启动、工具发现或工具调用失败信号。',
  };
};
