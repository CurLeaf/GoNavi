const DEFAULT_AI_UPSTREAM_LOG_LIMIT = 160;
const MAX_AI_UPSTREAM_LOG_LIMIT = 300;
const DEFAULT_AI_UPSTREAM_REQUEST_LIMIT = 12;
const MAX_AI_UPSTREAM_REQUEST_LIMIT = 40;
const DEFAULT_AI_UPSTREAM_BODY_LIMIT = 6000;
const MAX_AI_UPSTREAM_BODY_LIMIT = 12000;

const secretLikeValuePatterns = [
  /bearer\s+[a-z0-9._~+/=-]{8,}/gi,
  /\bsk-[a-z0-9._-]{8,}/gi,
  /\bgh[pousr]_[a-z0-9_]{8,}/gi,
  /\bxox[baprs]-[a-z0-9-]{8,}/gi,
];

type AIUpstreamLogEventType = 'started' | 'completed' | 'failed' | 'other';

interface AIUpstreamLogEvent {
  type: AIUpstreamLogEventType;
  requestId: string;
  provider: string;
  method: string;
  endpoint: string;
  status?: number;
  duration?: string;
  bodyPreview?: string;
  error?: string;
  line: string;
}

interface AIUpstreamRequestSummary {
  requestId: string;
  provider: string;
  method: string;
  endpoint: string;
  state: 'started' | 'completed' | 'failed' | 'unknown';
  status?: number;
  duration?: string;
  bodyPreview?: string;
  error?: string;
  eventCount: number;
  hasBody: boolean;
}

const clampNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  const normalized = Math.floor(Number(value) || fallback);
  if (normalized < min) return min;
  if (normalized > max) return max;
  return normalized;
};

const normalizeLogLines = (input: unknown): string[] =>
  Array.isArray(input)
    ? input.map((line) => String(line || '').trim()).filter(Boolean)
    : [];

const redactAIUpstreamLogPreview = (value: string): string => {
  let result = value;
  secretLikeValuePatterns.forEach((pattern) => {
    result = result.replace(pattern, '[REDACTED]');
  });
  return result.replace(/data:([^;,]+);base64,[a-z0-9+/=._-]+/gi, 'data:$1;base64,[REDACTED]');
};

const truncateText = (value: string, limit: number): string => {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit)}...[truncated ${value.length - limit} chars]`;
};

const extractField = (line: string, field: string): string => {
  const match = line.match(new RegExp(`(?:^|[\\s：])${field}=([^\\s]+)`));
  return match?.[1] || '';
};

const extractTailField = (line: string, field: string): string => {
  const marker = ` ${field}=`;
  const index = line.indexOf(marker);
  if (index < 0) {
    return '';
  }
  return line.slice(index + marker.length).trim();
};

const resolveEventType = (line: string): AIUpstreamLogEventType => {
  if (line.includes('AI 上游请求开始')) return 'started';
  if (line.includes('AI 上游请求完成')) return 'completed';
  if (line.includes('AI 上游请求失败')) return 'failed';
  return 'other';
};

const parseAIUpstreamLogEvent = (
  line: string,
  bodyPreviewLimit: number,
): AIUpstreamLogEvent | null => {
  if (!line.includes('AI 上游请求')) {
    return null;
  }

  const type = resolveEventType(line);
  const requestId = extractField(line, 'requestId');
  const provider = extractField(line, 'provider');
  const method = extractField(line, 'method');
  const endpoint = extractField(line, 'endpoint');
  const statusText = extractField(line, 'status');
  const bodyText = extractTailField(line, 'body');
  const errorText = extractTailField(line, 'err');
  const duration = extractField(line, 'duration');

  return {
    type,
    requestId,
    provider,
    method,
    endpoint,
    status: statusText ? Number(statusText) : undefined,
    duration,
    bodyPreview: bodyText ? truncateText(redactAIUpstreamLogPreview(bodyText), bodyPreviewLimit) : undefined,
    error: errorText ? truncateText(redactAIUpstreamLogPreview(errorText), 2000) : undefined,
    line: truncateText(redactAIUpstreamLogPreview(line), 4000),
  };
};

const matchesFilter = (event: AIUpstreamLogEvent, params: {
  provider?: unknown;
  requestId?: unknown;
  keyword?: unknown;
}): boolean => {
  const provider = String(params.provider || '').trim().toLowerCase();
  if (provider && event.provider.toLowerCase() !== provider) {
    return false;
  }
  const requestId = String(params.requestId || '').trim().toLowerCase();
  if (requestId && event.requestId.toLowerCase() !== requestId) {
    return false;
  }
  const keyword = String(params.keyword || '').trim().toLowerCase();
  if (!keyword) {
    return true;
  }
  return [
    event.requestId,
    event.provider,
    event.method,
    event.endpoint,
    event.bodyPreview,
    event.error,
  ].some((value) => String(value || '').toLowerCase().includes(keyword));
};

const summarizeAIUpstreamRequests = (
  events: AIUpstreamLogEvent[],
  includeBody: boolean,
  requestLimit: number,
): AIUpstreamRequestSummary[] => {
  const requestMap = new Map<string, AIUpstreamRequestSummary>();
  events.forEach((event) => {
    const requestKey = event.requestId || `line-${requestMap.size + 1}`;
    const existing = requestMap.get(requestKey) || {
      requestId: event.requestId,
      provider: event.provider,
      method: event.method,
      endpoint: event.endpoint,
      state: 'unknown' as const,
      eventCount: 0,
      hasBody: false,
    };
    existing.provider = event.provider || existing.provider;
    existing.method = event.method || existing.method;
    existing.endpoint = event.endpoint || existing.endpoint;
    existing.eventCount += 1;
    if (event.type === 'started') existing.state = 'started';
    if (event.type === 'completed') existing.state = 'completed';
    if (event.type === 'failed') existing.state = 'failed';
    if (event.status !== undefined) existing.status = event.status;
    if (event.duration) existing.duration = event.duration;
    if (event.bodyPreview) {
      existing.hasBody = true;
      if (includeBody) existing.bodyPreview = event.bodyPreview;
    }
    if (event.error) existing.error = event.error;
    requestMap.set(requestKey, existing);
  });
  return Array.from(requestMap.values()).slice(-requestLimit);
};

export const buildAIUpstreamLogSnapshot = (params: {
  readResult?: any;
  provider?: unknown;
  requestId?: unknown;
  keyword?: unknown;
  lineLimit?: unknown;
  requestLimit?: unknown;
  includeBody?: unknown;
  includeLines?: unknown;
  bodyPreviewLimit?: unknown;
}) => {
  const data = params.readResult?.data && typeof params.readResult.data === 'object'
    ? params.readResult.data as Record<string, unknown>
    : {};
  const requestedLineLimit = clampNumber(data.requestedLineLimit ?? params.lineLimit, DEFAULT_AI_UPSTREAM_LOG_LIMIT, 1, MAX_AI_UPSTREAM_LOG_LIMIT);
  const requestLimit = clampNumber(params.requestLimit, DEFAULT_AI_UPSTREAM_REQUEST_LIMIT, 1, MAX_AI_UPSTREAM_REQUEST_LIMIT);
  const bodyPreviewLimit = clampNumber(params.bodyPreviewLimit, DEFAULT_AI_UPSTREAM_BODY_LIMIT, 200, MAX_AI_UPSTREAM_BODY_LIMIT);
  const includeBody = params.includeBody !== false;
  const includeLines = params.includeLines === true;
  const lines = normalizeLogLines(data.lines);
  const parsedEvents = lines
    .map((line) => parseAIUpstreamLogEvent(line, bodyPreviewLimit))
    .filter((event): event is AIUpstreamLogEvent => Boolean(event))
    .filter((event) => matchesFilter(event, params));
  const eventBreakdown = {
    started: parsedEvents.filter((event) => event.type === 'started').length,
    completed: parsedEvents.filter((event) => event.type === 'completed').length,
    failed: parsedEvents.filter((event) => event.type === 'failed').length,
    other: parsedEvents.filter((event) => event.type === 'other').length,
  };
  const providers = Array.from(new Set(parsedEvents.map((event) => event.provider).filter(Boolean)));
  const requestIds = Array.from(new Set(parsedEvents.map((event) => event.requestId).filter(Boolean)));
  const requests = summarizeAIUpstreamRequests(parsedEvents, includeBody, requestLimit);

  return {
    logPath: String(data.logPath || ''),
    keyword: String(data.keyword || params.requestId || params.provider || params.keyword || '').trim(),
    providerFilter: String(params.provider || '').trim(),
    requestIdFilter: String(params.requestId || '').trim(),
    requestedLineLimit,
    returnedLineCount: lines.length,
    upstreamEventCount: parsedEvents.length,
    requestCount: requests.length,
    eventBreakdown,
    providers,
    requestIds,
    requests,
    lines: includeLines ? parsedEvents.map((event) => event.line) : undefined,
    message: parsedEvents.length > 0
      ? ''
      : '最近日志里没有找到 AI 上游请求记录；请先发送一次 AI 消息，或扩大 lineLimit 后重试。',
    nextActions: parsedEvents.length > 0
      ? [
          '如需核对完整入参，先用 requestId 精确过滤，再查看 bodyPreview 是否已被截断。',
          '如果只有开始没有完成/失败，继续查看 inspect_app_logs 或扩大 lineLimit 排查请求是否超时。',
        ]
      : [
          '确认当前构建已包含 AI 上游请求日志能力。',
          '发送一次 AI 聊天消息后再调用本工具。',
          '如果仍没有记录，调用 inspect_app_logs 读取最近 WARN/ERROR 原文。',
        ],
  };
};
