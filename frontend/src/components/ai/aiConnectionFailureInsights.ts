import type { AIInspectionTranslator } from './aiInspectionI18n';
import { translateInspectionCopy } from './aiInspectionI18n';
import type { I18nParams } from '../../i18n';

const DEFAULT_CONNECTION_FAILURE_LOG_LIMIT = 120;
const MAX_CONNECTION_FAILURE_LOG_LIMIT = 240;
const MAX_RECENT_FAILURES = 8;

const LOCALIZED_TIMEOUT_KEYWORDS = [
  'timed out',
  '\u9023\u7dda\u903e\u6642',
  '\u903e\u6642',
  '\u30bf\u30a4\u30e0\u30a2\u30a6\u30c8',
  'zeit\u00fcberschreitung',
  '\u0442\u0430\u0439\u043c-\u0430\u0443\u0442',
];

const LOCALIZED_VALIDATION_PREFIXES = [
  '\u8fde\u63a5\u5efa\u7acb\u540e\u9a8c\u8bc1\u5931\u8d25\uff1a',
  '\u9023\u7dda\u5efa\u7acb\u5f8c\u9a57\u8b49\u5931\u6557\uff1a',
  'Failed to verify the established connection: ',
  '\u63a5\u7d9a\u78ba\u7acb\u5f8c\u306e\u691c\u8a3c\u306b\u5931\u6557\u3057\u307e\u3057\u305f: ',
  'Verbindung konnte nach dem Aufbau nicht verifiziert werden: ',
  '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u0435 \u043f\u043e\u0441\u043b\u0435 \u0443\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u044f: ',
];

const LOCALIZED_VALIDATION_KEYWORDS = [
  '\u9a8c\u8bc1\u5931\u8d25',
  '\u9a57\u8b49\u5931\u6557',
  'validation failed',
  '\u691c\u8a3c\u306b\u5931\u6557',
  'verbindungsvalidierung fehlgeschlagen',
  '\u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0430 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u044f',
];

const LOCALIZED_MONGO_CREDENTIAL_LABELS = [
  'primary credentials',
  'replica credentials',
  '\u4e3b\u5eab\u6191\u8b49',
  '\u5f9e\u5eab\u6191\u8b49',
  '\u30d7\u30e9\u30a4\u30de\u30ea\u8a8d\u8a3c\u60c5\u5831',
  '\u30ec\u30d7\u30ea\u30ab\u8a8d\u8a3c\u60c5\u5831',
  'prim\u00e4r-anmeldedaten',
  'replikat-anmeldedaten',
  '\u0443\u0447\u0435\u0442\u043d\u044b\u0435 \u0434\u0430\u043d\u043d\u044b\u0435 primary',
  '\u0443\u0447\u0435\u0442\u043d\u044b\u0435 \u0434\u0430\u043d\u043d\u044b\u0435 \u0440\u0435\u043f\u043b\u0438\u043a\u0438',
];

const LOCALIZED_COOLDOWN_ERROR_MARKERS = [
  '\u4e0a\u6b21\u9519\u8bef\uff1a',
  '\u4e0a\u6b21\u932f\u8aa4\uff1a',
  'last error: ',
  '\u524d\u56de\u306e\u30a8\u30e9\u30fc: ',
  'letzter Fehler: ',
  '\u043f\u043e\u0441\u043b\u0435\u0434\u043d\u044f\u044f \u043e\u0448\u0438\u0431\u043a\u0430: ',
];

const LOCALIZED_DETAIL_LOG_HINT_PATTERNS = [
  /（(?:详细日志|詳細日誌|詳細ログ)：[^）]+）/gu,
  /\s*\((?:detail log|Detailprotokoll|подробный журнал): [^)]+\)/giu,
];

const LOCALIZED_COOLDOWN_SECONDS_PATTERNS = [
  /(?:\u5269\u4f59=|\u8bf7\s*)(\d+)s(?:\s*\u540e\u91cd\u8bd5)?/u,
  /\u8acb\u65bc\s*(\d+)s?\s*\u5f8c\u91cd\u8a66/u,
  /Retry after\s+(\d+)s/iu,
  /(\d+)s\s*\u5f8c\u306b\u518d\u8a66\u884c/u,
  /in\s+(\d+)s\s+erneut/iu,
  /\u0447\u0435\u0440\u0435\u0437\s+(\d+)s/iu,
];

const LOCALIZED_SSH_FAILURE_PREFIXES = [
  'SSH \u8fde\u63a5\u5efa\u7acb\u5931\u8d25\uff1a',
  '\u4ee3\u7406\u8fde\u63a5 SSH \u7f51\u5173\u5931\u8d25\uff1a',
  '\u4ee3\u7406\u9023\u7dda SSH \u9598\u9053\u5931\u6557\uff1a',
  'Failed to connect to the SSH gateway through the proxy: ',
  '\u30d7\u30ed\u30ad\u30b7\u7d4c\u7531\u3067 SSH \u30b2\u30fc\u30c8\u30a6\u30a7\u30a4\u306b\u63a5\u7d9a\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f: ',
  'Verbindung zum SSH-Gateway \u00fcber den Proxy fehlgeschlagen: ',
  '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u0442\u044c\u0441\u044f \u043a SSH-\u0448\u043b\u044e\u0437\u0443 \u0447\u0435\u0440\u0435\u0437 \u043f\u0440\u043e\u043a\u0441\u0438: ',
];

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
  cooldown: 'Connection cooldown',
  parameter_compatibility: 'Connection parameter/compatibility issue',
  validation: 'Connection validation failed',
  authentication: 'Authentication failed',
  timeout: 'Connection timeout',
  network: 'Network unreachable',
  ssh: 'SSH tunnel failed',
  startup: 'Driver/process startup failed',
  other: 'Other connection anomaly',
};

const CONNECTION_FAILURE_CATEGORY_KEYS: Record<ConnectionFailureCategory, string> = {
  cooldown: 'ai_chat.inspection.connection_failures.category.cooldown',
  parameter_compatibility: 'ai_chat.inspection.connection_failures.category.parameter_compatibility',
  validation: 'ai_chat.inspection.connection_failures.category.validation',
  authentication: 'ai_chat.inspection.connection_failures.category.authentication',
  timeout: 'ai_chat.inspection.connection_failures.category.timeout',
  network: 'ai_chat.inspection.connection_failures.category.network',
  ssh: 'ai_chat.inspection.connection_failures.category.ssh',
  startup: 'ai_chat.inspection.connection_failures.category.startup',
  other: 'ai_chat.inspection.connection_failures.category.other',
};

const localizeConnectionFailureCategory = (
  category: ConnectionFailureCategory,
  translate?: AIInspectionTranslator,
): string => translateInspectionCopy(
  translate,
  CONNECTION_FAILURE_CATEGORY_KEYS[category],
  CONNECTION_FAILURE_CATEGORY_LABELS[category],
);

const localizeConnectionFailureAction = (
  translate: AIInspectionTranslator | undefined,
  key: string,
  fallback: string,
  params?: I18nParams,
): string => translateInspectionCopy(
  translate,
  `ai_chat.inspection.connection_failures.next_action.${key}`,
  fallback,
  params,
);

const localizeConnectionFailureMessage = (
  translate: AIInspectionTranslator | undefined,
  key: string,
  fallback: string,
  params?: I18nParams,
): string => translateInspectionCopy(
  translate,
  `ai_chat.inspection.connection_failures.message.${key}`,
  fallback,
  params,
);

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
  LOCALIZED_DETAIL_LOG_HINT_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, ''),
    String(value || ''),
  )
    .replace(/\s+/g, ' ')
    .replace(/\s*->\s*/g, ' -> ')
    .trim();

const findFirstIncludedMarker = (value: string, markers: string[]): { marker: string; index: number } | null => {
  let matched: { marker: string; index: number } | null = null;
  markers.forEach((marker) => {
    const index = value.indexOf(marker);
    if (index < 0) {
      return;
    }
    if (!matched || index < matched.index) {
      matched = { marker, index };
    }
  });
  return matched;
};

const startsWithAnyMarker = (value: string, markers: string[]): boolean =>
  markers.some((marker) => value.startsWith(marker));

const normalizeExtractedRootCause = (value: string): string => {
  const trimmed = String(value || '').trim();
  const cooldownMarker = findFirstIncludedMarker(trimmed, LOCALIZED_COOLDOWN_ERROR_MARKERS);
  if (cooldownMarker) {
    return sanitizeRootCause(trimmed.slice(cooldownMarker.index + cooldownMarker.marker.length));
  }

  const sshFailureMarker = findFirstIncludedMarker(trimmed, LOCALIZED_SSH_FAILURE_PREFIXES);
  if (sshFailureMarker) {
    return sanitizeRootCause(trimmed.slice(sshFailureMarker.index + sshFailureMarker.marker.length));
  }

  const validationMarker = findFirstIncludedMarker(trimmed, LOCALIZED_VALIDATION_PREFIXES);
  if (validationMarker) {
    return sanitizeRootCause(trimmed.slice(validationMarker.index));
  }

  return sanitizeRootCause(trimmed);
};

const extractRootCause = (payload: string): string => {
  const errorChainIndex = payload.indexOf('错误链：');
  if (errorChainIndex >= 0) {
    return normalizeExtractedRootCause(payload.slice(errorChainIndex + '错误链：'.length));
  }

  const reasonIndex = payload.indexOf('原因=');
  if (reasonIndex >= 0) {
    return normalizeExtractedRootCause(payload.slice(reasonIndex + '原因='.length));
  }

  return normalizeExtractedRootCause(payload);
};

const extractCooldownSeconds = (payload: string, rootCause: string): number | null => {
  const target = `${payload} ${rootCause}`;
  for (const pattern of LOCALIZED_COOLDOWN_SECONDS_PATTERNS) {
    const match = target.match(pattern);
    if (!match) {
      continue;
    }
    const value = Number(match[1]);
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return null;
};

const inferConnectionFailureCategory = (
  payload: string,
  rootCause: string,
): ConnectionFailureCategory => {
  const text = `${payload} ${rootCause}`;
  const lowerText = text.toLowerCase();
  const errorText = rootCause || payload;
  const lowerErrorText = errorText.toLowerCase();
  const hasLocalizedTimeoutKeyword = LOCALIZED_TIMEOUT_KEYWORDS.some((keyword) => lowerErrorText.includes(keyword.toLowerCase()));
  const hasLocalizedValidationPrefix = LOCALIZED_VALIDATION_PREFIXES.some((keyword) => text.includes(keyword));
  const hasLocalizedValidationKeyword = LOCALIZED_VALIDATION_KEYWORDS.some((keyword) => lowerText.includes(keyword.toLowerCase()));
  const hasLocalizedMongoCredentialLabel = LOCALIZED_MONGO_CREDENTIAL_LABELS.some((label) => lowerText.includes(label.toLowerCase()));
  const hasLocalizedSSHFailurePrefix = LOCALIZED_SSH_FAILURE_PREFIXES.some((marker) => text.includes(marker));

  if (
    hasLocalizedSSHFailurePrefix
    || /ssh\s+(dial|handshake|tunnel)/i.test(text)
    || /ssh.*(认证失败|连接失败|超时)/i.test(text)
  ) {
    return 'ssh';
  }
  if (
    lowerErrorText.includes('connect timeout')
    || lowerErrorText.includes('i/o timeout')
    || lowerErrorText.includes('deadline exceeded')
    || hasLocalizedTimeoutKeyword
    || errorText.includes('\u8fde\u63a5\u8d85\u65f6')
    || /\u8d85\u65f6(?!\=)/.test(errorText)
  ) {
    return 'timeout';
  }
  if (
    lowerText.includes('access denied')
    || lowerText.includes('authentication failed')
    || lowerText.includes('password')
    || hasLocalizedMongoCredentialLabel
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
  if (hasLocalizedValidationKeyword || hasLocalizedValidationPrefix) {
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
  if (startsWithAnyMarker(payload, LOCALIZED_SSH_FAILURE_PREFIXES)) {
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

const buildConnectionFailureEvent = (
  line: string,
  translate?: AIInspectionTranslator,
): ConnectionFailureEvent | null => {
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
    categoryLabel: localizeConnectionFailureCategory(category, translate),
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

const buildNextActions = (
  events: ConnectionFailureEvent[],
  translate?: AIInspectionTranslator,
): string[] => {
  const categories = new Set(events.map((event) => event.category));
  const hasCooldownEvent = events.some((event) => event.eventType === 'cooldown_hit');
  const nextActions: string[] = [];
  const latestEvent = events[events.length - 1];

  if (hasCooldownEvent || categories.has('cooldown')) {
    appendUnique(nextActions, localizeConnectionFailureAction(
      translate,
      'cooldown',
      'Fix the previous real connection error before retrying; repeated refreshes will keep hitting the connection cooldown.',
    ));
  }
  if (categories.has('parameter_compatibility')) {
    appendUnique(nextActions, localizeConnectionFailureAction(
      translate,
      'parameter_compatibility',
      'Check connection parameters, DSN, and protocol compatibility first, especially multiStatements, charset, extra query parameters, and URL encoding.',
    ));
  }
  if (categories.has('validation')) {
    appendUnique(nextActions, localizeConnectionFailureAction(
      translate,
      'validation',
      'Inspect the server validation failure details and confirm that database type, driver protocol, database name, or Service Name matches the target service.',
    ));
  }
  if (categories.has('authentication')) {
    appendUnique(nextActions, localizeConnectionFailureAction(
      translate,
      'authentication',
      'Verify the username, password, authentication database, tenant, or Service Name, and confirm the server allows this account to log in.',
    ));
  }
  if (categories.has('ssh')) {
    appendUnique(nextActions, localizeConnectionFailureAction(
      translate,
      'ssh',
      'Check the SSH jump host address, port, account, and tunnel target address; if needed, verify connectivity from the jump host to the database first.',
    ));
  }
  if (categories.has('timeout') || categories.has('network')) {
    appendUnique(nextActions, localizeConnectionFailureAction(
      translate,
      'network',
      'Check whether the target address, port, firewall, proxy, and tunnel path are reachable, and confirm the server is actually listening.',
    ));
  }
  if (categories.has('startup')) {
    appendUnique(nextActions, localizeConnectionFailureAction(
      translate,
      'startup',
      'Check whether the driver process or external dependency can start normally; if needed, validate the startup command locally or on the target host first.',
    ));
  }
  if (latestEvent?.address) {
    appendUnique(nextActions, localizeConnectionFailureAction(
      translate,
      'check_current_connection',
      `If you need to confirm the connection currently shown in the UI still targets the same endpoint, call inspect_current_connection to check whether it still points to ${latestEvent.address}.`,
      { address: latestEvent.address },
    ));
  }
  if (nextActions.length === 0) {
    appendUnique(nextActions, localizeConnectionFailureAction(
      translate,
      'inspect_config',
      'First use inspect_current_connection and inspect_saved_connections to verify the current connection configuration, then widen the log window if more evidence is needed.',
    ));
  }
  return nextActions;
};

export const buildRecentConnectionFailureSnapshot = (params: {
  readResult?: any;
  keyword?: unknown;
  lineLimit?: unknown;
  translate?: AIInspectionTranslator;
}) => {
  const translate = params.translate;
  const data = params.readResult?.data && typeof params.readResult.data === 'object'
    ? params.readResult.data as Record<string, unknown>
    : {};
  const lines = normalizeLogLines(data.lines);
  const keyword = String(data.keyword || params.keyword || '').trim();
  const requestedLineLimit = normalizeConnectionFailureLimit(data.requestedLineLimit ?? params.lineLimit);
  const events = lines
    .map((line) => buildConnectionFailureEvent(line, translate))
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
      label: localizeConnectionFailureCategory(category, translate),
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
      ? localizeConnectionFailureCategory(primaryCategory as ConnectionFailureCategory, translate)
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
    nextActions: buildNextActions(events, translate),
    message: events.length > 0
      ? localizeConnectionFailureMessage(
        translate,
        'detected',
        `Recent logs identified ${events.length} connection-related anomalies; latest category is ${latestEvent?.categoryLabel || 'connection anomaly'}`,
        {
          count: events.length,
          categoryLabel: latestEvent?.categoryLabel || localizeConnectionFailureCategory('other', translate),
        },
      )
      : keyword
        ? localizeConnectionFailureMessage(
          translate,
          'no_keyword_match',
          `No recent connection failure records matched keyword "${keyword}"`,
          { keyword },
        )
        : localizeConnectionFailureMessage(
          translate,
          'none',
          'No connection failures, validation failures, or connection cooldown records were identified in recent logs',
        ),
  };
};
