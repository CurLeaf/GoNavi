import type { AIMCPServerConfig, AIMCPToolDescriptor } from '../../types';
import { buildMCPLaunchPreview } from '../../utils/mcpServerGuidance';
import type { AIInspectionTranslator } from './aiInspectionI18n';
import { translateInspectionCopy } from './aiInspectionI18n';

const DEFAULT_MCP_RUNTIME_LOG_LIMIT = 160;
const MAX_MCP_RUNTIME_LOG_LIMIT = 200;

const MCP_HTTP_START_FAILED_MARKERS = [
  'GoNavi MCP HTTP \u670d\u52a1\u542f\u52a8\u5931\u8d25',
  '\u542f\u52a8 GoNavi MCP HTTP \u670d\u52a1\u5931\u8d25',
  '\u555f\u52d5 GoNavi MCP HTTP \u670d\u52d9\u5931\u6557',
  'Failed to start GoNavi MCP HTTP service',
  'GoNavi MCP HTTP \u30b5\u30fc\u30d3\u30b9\u306e\u8d77\u52d5\u306b\u5931\u6557\u3057\u307e\u3057\u305f',
  'Starten des GoNavi MCP HTTP-Dienstes fehlgeschlagen',
  '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u044c \u0441\u043b\u0443\u0436\u0431\u0443 GoNavi MCP HTTP',
];

const MCP_HTTP_PROCESS_EXITED_MARKERS = [
  'GoNavi MCP HTTP \u670d\u52a1\u5f02\u5e38\u9000\u51fa',
  'GoNavi MCP HTTP \u670d\u52d9\u7570\u5e38\u9000\u51fa',
  'GoNavi MCP HTTP service stopped unexpectedly',
  'GoNavi MCP HTTP \u30b5\u30fc\u30d3\u30b9\u304c\u7570\u5e38\u7d42\u4e86\u3057\u307e\u3057\u305f',
  'Der GoNavi MCP HTTP-Dienst wurde unerwartet beendet',
  '\u0421\u043b\u0443\u0436\u0431\u0430 GoNavi MCP HTTP \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u043b\u0430\u0441\u044c \u0430\u0432\u0430\u0440\u0438\u0439\u043d\u043e',
];

const MCP_HTTP_SUBPROCESS_EXITED_MARKERS = [
  'MCP HTTP \u5b50\u8fdb\u7a0b\u5df2\u9000\u51fa',
  'MCP HTTP \u5b50\u7a0b\u5e8f\u5df2\u9000\u51fa',
  'MCP HTTP subprocess exited',
  'MCP HTTP \u30b5\u30d6\u30d7\u30ed\u30bb\u30b9\u304c\u7d42\u4e86\u3057\u307e\u3057\u305f',
  'Der MCP HTTP-Unterprozess wurde beendet',
  '\u041f\u043e\u0434\u043f\u0440\u043e\u0446\u0435\u0441\u0441 MCP HTTP \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u043b\u0441\u044f',
];

const MCP_COMMAND_REQUIRED_MARKERS = [
  'MCP \u670d\u52a1\u547d\u4ee4\u4e0d\u80fd\u4e3a\u7a7a',
  'MCP \u547d\u4ee4\u4e0d\u80fd\u4e3a\u7a7a',
  'MCP \u547d\u4ee4\u4e0d\u80fd\u70ba\u7a7a',
  'MCP command cannot be empty',
  'MCP \u30b3\u30de\u30f3\u30c9\u306f\u7a7a\u306b\u3067\u304d\u307e\u305b\u3093',
  'MCP-Befehl darf nicht leer sein',
  '\u041a\u043e\u043c\u0430\u043d\u0434\u0430 MCP \u043d\u0435 \u043c\u043e\u0436\u0435\u0442 \u0431\u044b\u0442\u044c \u043f\u0443\u0441\u0442\u043e\u0439',
];

const MCP_TRANSPORT_UNSUPPORTED_MARKERS = [
  '\u6682\u4e0d\u652f\u6301\u7684 MCP transport',
  '\u6682\u4e0d\u652f\u6301\u7684 MCP \u4f20\u8f93\u65b9\u5f0f',
  '\u66ab\u4e0d\u652f\u63f4\u7684 MCP \u50b3\u8f38\u65b9\u5f0f',
];

const MCP_LIST_TOOLS_FAILED_MARKERS = [
  '\u5217\u51fa MCP \u5de5\u5177\u5931\u8d25',
  'Failed to list MCP tools',
];

const MCP_TOOL_CALL_FAILED_MARKERS = [
  '\u8c03\u7528 MCP \u5de5\u5177\u5931\u8d25',
  'MCP \u5de5\u5177\u8c03\u7528\u5931\u8d25',
  'MCP tool call failed',
];

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
  | 'command_required'
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

const includesAny = (line: string, markers: string[]): boolean =>
  markers.some((marker) => line.includes(marker));

const detectFailureKind = (line: string): MCPRuntimeFailureKind | null => {
  if (includesAny(line, MCP_LIST_TOOLS_FAILED_MARKERS)) return 'list_tools_failed';
  if (includesAny(line, MCP_TOOL_CALL_FAILED_MARKERS)) return 'tool_call_failed';
  if (includesAny(line, MCP_HTTP_START_FAILED_MARKERS)) return 'http_start_failed';
  if (includesAny(line, MCP_HTTP_PROCESS_EXITED_MARKERS) || includesAny(line, MCP_HTTP_SUBPROCESS_EXITED_MARKERS)) return 'http_process_exited';
  if (includesAny(line, MCP_COMMAND_REQUIRED_MARKERS) || includesAny(line, MCP_TRANSPORT_UNSUPPORTED_MARKERS)) return 'configuration_error';
  if (line.toLowerCase().includes('mcp') && line.includes('[ERROR]')) return 'mcp_error';
  if (line.toLowerCase().includes('mcp') && line.includes('[WARN]')) return 'mcp_warning';
  return null;
};

const detectCause = (line: string): MCPRuntimeCause => {
  const lower = line.toLowerCase();
  if (includesAny(line, MCP_COMMAND_REQUIRED_MARKERS)) {
    return 'command_required';
  }
  if (includesAny(line, MCP_TRANSPORT_UNSUPPORTED_MARKERS)) {
    return 'transport';
  }
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
  if (/(exit status|exited|异常退出|子进程已退出|process exited)/iu.test(line) || includesAny(line, MCP_HTTP_SUBPROCESS_EXITED_MARKERS)) {
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

const translateMCPRuntimeCopy = (
  translate: AIInspectionTranslator | undefined,
  key: string,
  fallback: string,
  params?: Record<string, string | number | boolean | null | undefined>,
): string => (
  translate
    ? translateInspectionCopy(translate, key, fallback, params)
    : fallback
);

const causeNextActionFallback: Record<MCPRuntimeCause, string> = {
  command_not_found: 'Check that command contains only the executable name, and confirm it is on PATH or uses an absolute path.',
  timeout: 'Raise timeoutSeconds to 45 or 60, and confirm the service keeps the stdio connection open after startup.',
  permission: 'Check executable permissions, antivirus/system blocking, and working directory access.',
  auth: 'Check whether the Token/API Key in environment variables is configured, unexpired, and has enough scope.',
  network: 'Check whether the remote endpoint, proxy, VPN, or local port required by MCP is reachable.',
  stdio_closed: 'Confirm the --stdio/stdin argument required by README is set; for Docker, confirm args includes -i.',
  process_exit: 'Run the launch command in a terminal separately and inspect why the process exits immediately after startup.',
  argument_error: 'Call inspect_mcp_tool_schema first to read the real inputSchema, then fix the tool arguments JSON.',
  command_required: 'Fill startup command with the executable only. Move script names, modules, --stdio, and extra flags into args, then run Test tool discovery again.',
  transport: 'New MCP servers in GoNavi currently support stdio only; for HTTP MCP, use the GoNavi HTTP service or the matching remote access guide.',
  unknown: 'Inspect the configuration with inspect_mcp_setup, then call inspect_app_logs with a larger log window to confirm the raw error.',
};

const getCauseNextAction = (
  cause: MCPRuntimeCause,
  translate?: AIInspectionTranslator,
): string => translateMCPRuntimeCopy(
  translate,
  `ai_chat.inspection.mcp_runtime.next_action.${cause}`,
  causeNextActionFallback[cause],
);

const parseFailureEvent = (
  line: string,
  translate?: AIInspectionTranslator,
): MCPRuntimeFailureEvent | null => {
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
    nextAction: getCauseNextAction(cause, translate),
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
  translate?: AIInspectionTranslator,
): string[] => {
  const actions = Array.from(new Set(events.map((event) => event.nextAction)));
  const enabledServersWithoutTools = serverSummaries.filter((server) => server.enabled && server.discoveredToolCount === 0);
  if (enabledServersWithoutTools.length > 0) {
    actions.push(translateMCPRuntimeCopy(
      translate,
      'ai_chat.inspection.mcp_runtime.next_action.enabled_without_tools',
      'Some enabled MCP servers have no discovered tools; click "Test tool discovery" first and confirm the launch command runs independently.',
    ));
  }
  if (events.some((event) => event.kind === 'list_tools_failed')) {
    actions.push(translateMCPRuntimeCopy(
      translate,
      'ai_chat.inspection.mcp_runtime.next_action.fix_discovery_first',
      'When the tool list is empty, fix startup/discovery failure before diagnosing individual tool arguments.',
    ));
  }
  if (actions.length === 0) {
    actions.push(translateMCPRuntimeCopy(
      translate,
      'ai_chat.inspection.mcp_runtime.next_action.expand_logs',
      'No MCP failure signal was found in recent logs; if you just reproduced the issue, increase lineLimit or filter precisely with serverName.',
    ));
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
  translate?: AIInspectionTranslator;
}) => {
  const { translate } = params;
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
    .map((line) => parseFailureEvent(line, translate))
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
    warnings.push(translateMCPRuntimeCopy(
      translate,
      'ai_chat.inspection.mcp_runtime.warning.failure_events',
      `${events.length} MCP runtime failure signal was found in recent logs.`,
      { count: events.length },
    ));
  }
  const serversWithoutTools = serverSummaries.filter((server) => server.enabled && server.discoveredToolCount === 0).length;
  if (serversWithoutTools > 0) {
    warnings.push(translateMCPRuntimeCopy(
      translate,
      'ai_chat.inspection.mcp_runtime.warning.enabled_without_tools',
      `${serversWithoutTools} enabled MCP server currently has no discovered tools.`,
      { count: serversWithoutTools },
    ));
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
    nextActions: collectNextActions(events, serverSummaries, translate),
    lines: includeLines ? lines.map(redactLogLine) : undefined,
    message: events.length > 0
      ? translateMCPRuntimeCopy(
        translate,
        'ai_chat.inspection.mcp_runtime.message.failure_events',
        `${events.length} MCP runtime failure signal was found in recent logs`,
        { count: events.length },
      )
      : translateMCPRuntimeCopy(
        translate,
        'ai_chat.inspection.mcp_runtime.message.no_failure_events',
        'No MCP startup, tool discovery, or tool call failure signal was found in recent logs.',
      ),
  };
};
