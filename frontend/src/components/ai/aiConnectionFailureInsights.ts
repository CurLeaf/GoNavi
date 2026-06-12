const DEFAULT_CONNECTION_FAILURE_LOG_LIMIT = 120;
const MAX_CONNECTION_FAILURE_LOG_LIMIT = 240;
const MAX_RECENT_FAILURES = 8;

type ConnectionFailureCategory =
  | 'cooldown'
  | 'parameter_compatibility'
  | 'validation'
  | 'authentication'
  | 'timeout'
  | 'network'
  | 'ssh'
  | 'startup'
  | 'other';

type ConnectionFailureEventType =
  | 'connection_failure'
  | 'connection_operation_failure'
  | 'cooldown_hit'
  | 'ssh_failure';

interface ConnectionFailureEvent {
  rawLine: string;
  timestamp: string;
  level: string;
  eventType: ConnectionFailureEventType;
  category: ConnectionFailureCategory;
  categoryLabel: string;
  connectionType: string;
  address: string;
  dbName: string;
  sshAddress: string;
  rootCause: string;
  cooldownSeconds: number | null;
}

const CONNECTION_FAILURE_CATEGORY_LABELS: Record<ConnectionFailureCategory, string> = {
  cooldown: '冷却重试',
  parameter_compatibility: '连接参数/兼容性',
  validation: '连接验证失败',
  authentication: '认证失败',
  timeout: '连接超时',
  network: '网络不可达',
  ssh: 'SSH 隧道失败',
  startup: '驱动/进程启动失败',
  other: '其他连接异常',
};

const normalizeLogLines = (input: unknown): string[] =>
  Array.isArray(input)
    ? input.map((line) => String(line || '').trim()).filter(Boolean)
    : [];

const normalizeConnectionFailureLimit = (input: unknown): number => {
  const value = Math.floor(Number(input) || DEFAULT_CONNECTION_FAILURE_LOG_LIMIT);
  if (value < 1) {
    return 1;
  }
  if (value > MAX_CONNECTION_FAILURE_LOG_LIMIT) {
    return MAX_CONNECTION_FAILURE_LOG_LIMIT;
  }
  return value;
};

const extractLogTimestamp = (line: string): string => {
  const match = String(line || '').match(/^(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)/);
  return match?.[1] || '';
};

const extractLogLevelAndPayload = (line: string) => {
  const match = String(line || '').match(/\[(INFO|WARN|ERROR)\]\s*(.*)$/);
  if (match) {
    return {
      level: match[1],
      payload: String(match[2] || '').trim(),
    };
  }
  return {
    level: 'OTHER',
    payload: String(line || '').trim(),
  };
};

const extractField = (payload: string, field: string): string => {
  const match = payload.match(new RegExp(`${field}=([^\\s]+)`));
  return String(match?.[1] || '').trim();
};

const extractAddressCandidates = (text: string): string[] => {
  const matches = text.match(/\b(?:\d{1,3}(?:\.\d{1,3}){3}|localhost|[A-Za-z0-9._-]+):\d+\b/g);
  return Array.isArray(matches) ? Array.from(new Set(matches)) : [];
};

const sanitizeRootCause = (value: string): string =>
  String(value || '')
    .replace(/（详细日志：[^）]+）/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*->\s*/g, ' -> ')
    .trim();

const extractRootCause = (payload: string): string => {
  const errorChainIndex = payload.indexOf('错误链：');
  if (errorChainIndex >= 0) {
    return sanitizeRootCause(payload.slice(errorChainIndex + '错误链：'.length));
  }

  const reasonIndex = payload.indexOf('原因=');
  if (reasonIndex >= 0) {
    return sanitizeRootCause(payload.slice(reasonIndex + '原因='.length));
  }

  const cooldownIndex = payload.indexOf('连接最近失败，正在冷却中');
  if (cooldownIndex >= 0) {
    return sanitizeRootCause(payload.slice(cooldownIndex));
  }

  const sshFailureIndex = payload.indexOf('SSH 连接建立失败：');
  if (sshFailureIndex >= 0) {
    return sanitizeRootCause(payload.slice(sshFailureIndex + 'SSH 连接建立失败：'.length));
  }

  const validationIndex = payload.indexOf('连接建立后验证失败：');
  if (validationIndex >= 0) {
    return sanitizeRootCause(payload.slice(validationIndex));
  }

  return sanitizeRootCause(payload);
};

const extractCooldownSeconds = (payload: string, rootCause: string): number | null => {
  const target = `${payload} ${rootCause}`;
  const match = target.match(/(?:剩余=|请\s*)(\d+)s(?:\s*后重试)?/);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
};

const inferConnectionFailureCategory = (
  payload: string,
  rootCause: string,
): ConnectionFailureCategory => {
  const text = `${payload} ${rootCause}`;
  const lowerText = text.toLowerCase();
  const errorText = rootCause || payload;
  const lowerErrorText = errorText.toLowerCase();

  if (
    text.includes('SSH 连接建立失败')
    || /ssh\s+(dial|handshake|tunnel)/i.test(text)
    || /ssh.*(认证失败|连接失败|超时)/i.test(text)
  ) {
    return 'ssh';
  }
  if (
    lowerErrorText.includes('connect timeout')
    || lowerErrorText.includes('i/o timeout')
    || lowerErrorText.includes('deadline exceeded')
    || errorText.includes('连接超时')
    || /超时(?!\=)/.test(errorText)
  ) {
    return 'timeout';
  }
  if (
    lowerText.includes('access denied')
    || lowerText.includes('authentication failed')
    || lowerText.includes('password')
    || text.includes('凭据')
    || text.includes('认证')
    || text.includes('登录失败')
  ) {
    return 'authentication';
  }
  if (
    lowerText.includes('parametric information is abnormal')
    || lowerText.includes('error 1064')
    || lowerText.includes('%2cutf8')
    || lowerText.includes('multistatements')
    || text.includes('兼容参数')
    || lowerText.includes('syntax')
    || lowerText.includes('dsn')
    || text.includes('参数')
  ) {
    return 'parameter_compatibility';
  }
  if (text.includes('验证失败')) {
    return 'validation';
  }
  if (
    lowerText.includes('connection refused')
    || lowerText.includes('dial tcp')
    || lowerText.includes('no route')
    || lowerText.includes('network is unreachable')
    || lowerText.includes('refused')
  ) {
    return 'network';
  }
  if (lowerText.includes('spawn') || text.includes('启动失败') || text.includes('拉起失败')) {
    return 'startup';
  }
  if (text.includes('冷却')) {
    return 'cooldown';
  }
  return 'other';
};

const detectConnectionFailureEventType = (payload: string): ConnectionFailureEventType | null => {
  if (payload.includes('命中数据库连接失败冷却：') || payload.includes('连接最近失败，正在冷却中')) {
    return 'cooldown_hit';
  }
  if (payload.includes('SSH 连接建立失败：')) {
    return 'ssh_failure';
  }
  if (payload.includes('建立数据库连接失败：')) {
    return 'connection_failure';
  }
  if (/DB[A-Za-z0-9_]+\s+获取连接失败：/.test(payload)) {
    return 'connection_operation_failure';
  }
  return null;
};

const buildConnectionFailureEvent = (line: string): ConnectionFailureEvent | null => {
  const timestamp = extractLogTimestamp(line);
  const { level, payload } = extractLogLevelAndPayload(line);
  const eventType = detectConnectionFailureEventType(payload);
  if (!eventType) {
    return null;
  }

  const rootCause = extractRootCause(payload);
  const extractedType = extractField(payload, '类型');
  const extractedAddress = extractField(payload, '地址');
  const addressCandidates = extractAddressCandidates(rootCause);
  const address = extractedAddress || addressCandidates[0] || '';
  const category = inferConnectionFailureCategory(payload, rootCause);

  return {
    rawLine: line,
    timestamp,
    level,
    eventType,
    category,
    categoryLabel: CONNECTION_FAILURE_CATEGORY_LABELS[category],
    connectionType: extractedType,
    address,
    dbName: extractField(payload, '数据库'),
    sshAddress: extractField(payload, 'SSH'),
    rootCause,
    cooldownSeconds: extractCooldownSeconds(payload, rootCause),
  };
};

const appendUnique = (items: string[], value: string) => {
  const normalized = String(value || '').trim();
  if (!normalized || items.includes(normalized)) {
    return;
  }
  items.push(normalized);
};

const buildNextActions = (events: ConnectionFailureEvent[]): string[] => {
  const categories = new Set(events.map((event) => event.category));
  const hasCooldownEvent = events.some((event) => event.eventType === 'cooldown_hit');
  const nextActions: string[] = [];
  const latestEvent = events[events.length - 1];

  if (hasCooldownEvent || categories.has('cooldown')) {
    appendUnique(nextActions, '先修复上一次真实连接错误，再重试；只反复刷新会持续命中连接冷却。');
  }
  if (categories.has('parameter_compatibility')) {
    appendUnique(nextActions, '优先核对连接参数、DSN 和协议兼容性，尤其是 multiStatements、charset、额外 query 参数和 URL 编码。');
  }
  if (categories.has('validation')) {
    appendUnique(nextActions, '检查服务端返回的验证失败细节，确认当前数据库类型、驱动协议、库名或 Service Name 与目标服务匹配。');
  }
  if (categories.has('authentication')) {
    appendUnique(nextActions, '核对用户名、密码、认证库、租户或 Service Name 是否正确，确认服务端是否允许当前账号登录。');
  }
  if (categories.has('ssh')) {
    appendUnique(nextActions, '核对 SSH 跳板机地址、端口、账号和隧道目标地址，必要时先验证跳板机到数据库的连通性。');
  }
  if (categories.has('timeout') || categories.has('network')) {
    appendUnique(nextActions, '检查目标地址、端口、防火墙、代理和隧道链路是否可达，确认服务端当前确实在监听。');
  }
  if (categories.has('startup')) {
    appendUnique(nextActions, '检查驱动进程或外部依赖是否能正常启动，必要时先在本机或目标主机单独验证启动命令。');
  }
  if (latestEvent?.address) {
    appendUnique(nextActions, `如需核对当前界面里的连接是否还是同一目标，可再调用 inspect_current_connection 检查是否仍指向 ${latestEvent.address}。`);
  }
  if (nextActions.length === 0) {
    appendUnique(nextActions, '先结合 inspect_current_connection 和 inspect_saved_connections 核对当前连接配置，再扩大日志窗口继续排查。');
  }
  return nextActions;
};

export const buildRecentConnectionFailureSnapshot = (params: {
  readResult?: any;
  keyword?: unknown;
  lineLimit?: unknown;
}) => {
  const data = params.readResult?.data && typeof params.readResult.data === 'object'
    ? params.readResult.data as Record<string, unknown>
    : {};
  const lines = normalizeLogLines(data.lines);
  const keyword = String(data.keyword || params.keyword || '').trim();
  const requestedLineLimit = normalizeConnectionFailureLimit(data.requestedLineLimit ?? params.lineLimit);
  const events = lines
    .map((line) => buildConnectionFailureEvent(line))
    .filter((event): event is ConnectionFailureEvent => Boolean(event));
  const latestEvent = events[events.length - 1];

  const categoryCounts = new Map<ConnectionFailureCategory, number>();
  const addressCounts = new Map<string, { count: number; connectionTypes: Set<string>; lastSeenAt: string }>();
  events.forEach((event) => {
    categoryCounts.set(event.category, (categoryCounts.get(event.category) || 0) + 1);
    if (!event.address) {
      return;
    }
    const current = addressCounts.get(event.address) || {
      count: 0,
      connectionTypes: new Set<string>(),
      lastSeenAt: '',
    };
    current.count += 1;
    if (event.connectionType) {
      current.connectionTypes.add(event.connectionType);
    }
    current.lastSeenAt = event.timestamp || current.lastSeenAt;
    addressCounts.set(event.address, current);
  });

  const categorySummary = Array.from(categoryCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([category, count]) => ({
      category,
      label: CONNECTION_FAILURE_CATEGORY_LABELS[category],
      count,
    }));
  const primaryCategory = categorySummary[0]?.category || '';

  const addresses = Array.from(addressCounts.entries())
    .sort((left, right) => right[1].count - left[1].count)
    .map(([address, summary]) => ({
      address,
      count: summary.count,
      connectionTypes: Array.from(summary.connectionTypes),
      lastSeenAt: summary.lastSeenAt,
    }));

  return {
    logPath: String(data.logPath || ''),
    keyword,
    requestedLineLimit,
    returnedLineCount: lines.length,
    fileWindowTruncated: data.fileWindowTruncated === true,
    matchedLinesTruncated: data.matchedLinesTruncated === true,
    failureEventCount: events.length,
    hasRecentFailures: events.length > 0,
    primaryCategory,
    primaryCategoryLabel: primaryCategory
      ? CONNECTION_FAILURE_CATEGORY_LABELS[primaryCategory as ConnectionFailureCategory]
      : '',
    cooldownHitCount: events.filter((event) => event.eventType === 'cooldown_hit').length,
    validationFailureCount: events.filter((event) => event.category === 'validation').length,
    sshFailureCount: events.filter((event) => event.category === 'ssh').length,
    categorySummary,
    addresses,
    latestFailureAt: latestEvent?.timestamp || '',
    latestFailure: latestEvent
      ? {
        timestamp: latestEvent.timestamp,
        level: latestEvent.level,
        eventType: latestEvent.eventType,
        category: latestEvent.category,
        categoryLabel: latestEvent.categoryLabel,
        connectionType: latestEvent.connectionType,
        address: latestEvent.address,
        dbName: latestEvent.dbName,
        sshAddress: latestEvent.sshAddress,
        cooldownSeconds: latestEvent.cooldownSeconds,
        rootCause: latestEvent.rootCause,
        rawLine: latestEvent.rawLine,
      }
      : null,
    recentFailures: events
      .slice(-MAX_RECENT_FAILURES)
      .reverse()
      .map((event) => ({
        timestamp: event.timestamp,
        level: event.level,
        eventType: event.eventType,
        category: event.category,
        categoryLabel: event.categoryLabel,
        connectionType: event.connectionType,
        address: event.address,
        dbName: event.dbName,
        sshAddress: event.sshAddress,
        cooldownSeconds: event.cooldownSeconds,
        rootCause: event.rootCause,
        rawLine: event.rawLine,
      })),
    nextActions: buildNextActions(events),
    message: events.length > 0
      ? `最近日志里识别到 ${events.length} 条连接相关异常，最新一条是 ${latestEvent?.categoryLabel || '连接异常'}`
      : keyword
        ? `最近日志里没有找到与“${keyword}”相关的连接失败记录`
        : '最近日志里没有识别到连接失败、验证失败或连接冷却记录',
  };
};
