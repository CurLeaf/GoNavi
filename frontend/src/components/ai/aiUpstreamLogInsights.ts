import type { AIInspectionTranslator } from './aiInspectionI18n';
import { translateInspectionCopy } from './aiInspectionI18n';

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
  bodySummary?: AIUpstreamPayloadSummary;
  error?: string;
  line: string;
}

interface AIUpstreamPayloadSummary {
  parseable: boolean;
  parseError?: string;
  topLevelKeys?: string[];
  model?: string;
  messageCount?: number;
  messageRoleCounts?: Record<string, number>;
  toolCount?: number;
  toolNames?: string[];
  hasStream?: boolean;
  hasToolChoice?: boolean;
  hasResponseFormat?: boolean;
  inputTextCharCount?: number;
  warnings?: string[];
}

interface LocalizableText {
  key: string;
  fallback: string;
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
  bodySummary?: AIUpstreamPayloadSummary;
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const translateText = (
  translate: AIInspectionTranslator | undefined,
  { key, fallback }: LocalizableText,
): string => translateInspectionCopy(translate, key, fallback);

const asRecordArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const stringValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const addName = (names: Set<string>, value: unknown) => {
  const normalized = stringValue(value);
  if (normalized) {
    names.add(normalized);
  }
};

const extractToolNames = (body: Record<string, unknown>): string[] => {
  const names = new Set<string>();
  asRecordArray(body.tools).forEach((tool) => {
    addName(names, tool.name);
    if (isRecord(tool.function)) {
      addName(names, tool.function.name);
    }
    asRecordArray(tool.functionDeclarations).forEach((declaration) => addName(names, declaration.name));
    asRecordArray(tool.function_declarations).forEach((declaration) => addName(names, declaration.name));
  });
  asRecordArray(body.functions).forEach((fn) => addName(names, fn.name));
  return Array.from(names).slice(0, 30);
};

const countToolDefinitions = (body: Record<string, unknown>, toolNames: string[]): number => {
  const tools = asRecordArray(body.tools);
  const functionDeclarationCount = tools.reduce((total, tool) => {
    const camelDeclarations = asRecordArray(tool.functionDeclarations).length;
    const snakeDeclarations = asRecordArray(tool.function_declarations).length;
    return total + camelDeclarations + snakeDeclarations;
  }, 0);
  const genericToolCount = tools.length;
  const legacyFunctionCount = asRecordArray(body.functions).length;
  return functionDeclarationCount || legacyFunctionCount || genericToolCount || toolNames.length;
};

const normalizeMessageRole = (message: Record<string, unknown>): string => {
  const role = stringValue(message.role);
  if (role) return role;
  if (isRecord(message.author)) {
    return stringValue(message.author.role) || 'unknown';
  }
  return 'unknown';
};

const getMessageLikeItems = (body: Record<string, unknown>): Record<string, unknown>[] => {
  const messages = asRecordArray(body.messages);
  if (messages.length > 0) return messages;
  const contents = asRecordArray(body.contents);
  if (contents.length > 0) return contents;
  return [];
};

const addTextLength = (value: unknown): number => {
  if (typeof value === 'string') return value.length;
  if (Array.isArray(value)) return value.reduce((total, item) => total + addTextLength(item), 0);
  if (!isRecord(value)) return 0;
  return ['content', 'text', 'prompt', 'system', 'input'].reduce(
    (total, key) => total + addTextLength(value[key]),
    0,
  );
};

const estimateInputTextChars = (body: Record<string, unknown>): number => {
  const messageItems = getMessageLikeItems(body);
  const messageChars = messageItems.reduce((total, item) => total + addTextLength(item), 0);
  return messageChars
    + addTextLength(body.system)
    + addTextLength(body.prompt)
    + addTextLength(body.input);
};

const summarizeAIUpstreamPayload = (
  bodyText: string,
  translate?: AIInspectionTranslator,
): AIUpstreamPayloadSummary => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch (error: any) {
    return {
      parseable: false,
      parseError: String(error?.message || error || 'invalid JSON'),
      warnings: [translateText(translate, {
        key: 'ai_chat.inspection.upstream_logs.warning.invalid_json',
        fallback: 'The request body is not complete JSON. It may have been truncated by logs, so a structured summary cannot be generated.',
      })],
    };
  }

  if (!isRecord(parsed)) {
    return {
      parseable: false,
      parseError: 'request body is not a JSON object',
      warnings: [translateText(translate, {
        key: 'ai_chat.inspection.upstream_logs.warning.not_json_object',
        fallback: 'The request body is not a JSON object, so model, message, and tool fields cannot be identified.',
      })],
    };
  }

  const topLevelKeys = Object.keys(parsed).slice(0, 30);
  const messages = getMessageLikeItems(parsed);
  const messageRoleCounts = messages.reduce<Record<string, number>>((acc, message) => {
    const role = normalizeMessageRole(message);
    acc[role] = (acc[role] || 0) + 1;
    return acc;
  }, {});
  if (parsed.system !== undefined) {
    messageRoleCounts.system = (messageRoleCounts.system || 0) + 1;
  }
  const toolNames = extractToolNames(parsed);
  const toolCount = countToolDefinitions(parsed, toolNames);
  const messageCount = messages.length + (parsed.system !== undefined ? 1 : 0) + (parsed.prompt !== undefined ? 1 : 0);
  const inputTextCharCount = estimateInputTextChars(parsed);
  const warnings: string[] = [];

  if (messageCount === 0) {
    warnings.push(translateText(translate, {
      key: 'ai_chat.inspection.upstream_logs.warning.missing_messages',
      fallback: 'No messages, contents, system, or prompt field was found. Confirm whether the upstream protocol matches expectations.',
    }));
  }
  if (toolCount === 0) {
    warnings.push(translateText(translate, {
      key: 'ai_chat.inspection.upstream_logs.warning.missing_tools',
      fallback: 'The payload does not include tools/functions, so the model cannot initiate tool calls.',
    }));
  }
  if (inputTextCharCount > 60000) {
    warnings.push(translateText(translate, {
      key: 'ai_chat.inspection.upstream_logs.warning.large_input',
      fallback: 'The input text is large. Narrow the context or reduce log/DDL content if needed.',
    }));
  }

  return {
    parseable: true,
    topLevelKeys,
    model: stringValue(parsed.model) || stringValue(parsed.modelName),
    messageCount,
    messageRoleCounts,
    toolCount,
    toolNames,
    hasStream: parsed.stream === true || isRecord(parsed.stream_options),
    hasToolChoice: parsed.tool_choice !== undefined || parsed.toolChoice !== undefined || parsed.toolConfig !== undefined,
    hasResponseFormat: parsed.response_format !== undefined || parsed.responseFormat !== undefined || parsed.generationConfig !== undefined,
    inputTextCharCount,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
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
  includePayloadSummary: boolean,
  translate?: AIInspectionTranslator,
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
    bodySummary: bodyText && includePayloadSummary ? summarizeAIUpstreamPayload(bodyText, translate) : undefined,
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
    if (event.bodySummary) existing.bodySummary = event.bodySummary;
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
  includePayloadSummary?: unknown;
  translate?: AIInspectionTranslator;
}) => {
  const data = params.readResult?.data && typeof params.readResult.data === 'object'
    ? params.readResult.data as Record<string, unknown>
    : {};
  const requestedLineLimit = clampNumber(data.requestedLineLimit ?? params.lineLimit, DEFAULT_AI_UPSTREAM_LOG_LIMIT, 1, MAX_AI_UPSTREAM_LOG_LIMIT);
  const requestLimit = clampNumber(params.requestLimit, DEFAULT_AI_UPSTREAM_REQUEST_LIMIT, 1, MAX_AI_UPSTREAM_REQUEST_LIMIT);
  const bodyPreviewLimit = clampNumber(params.bodyPreviewLimit, DEFAULT_AI_UPSTREAM_BODY_LIMIT, 200, MAX_AI_UPSTREAM_BODY_LIMIT);
  const { translate } = params;
  const includeBody = params.includeBody !== false;
  const includeLines = params.includeLines === true;
  const includePayloadSummary = params.includePayloadSummary !== false;
  const lines = normalizeLogLines(data.lines);
  const parsedEvents = lines
    .map((line) => parseAIUpstreamLogEvent(line, bodyPreviewLimit, includePayloadSummary, translate))
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
    payloadSummaryEnabled: includePayloadSummary,
    eventBreakdown,
    providers,
    requestIds,
    requests,
    lines: includeLines ? parsedEvents.map((event) => event.line) : undefined,
    message: parsedEvents.length > 0
      ? ''
      : translateText(translate, {
          key: 'ai_chat.inspection.upstream_logs.message.empty',
          fallback: 'No AI upstream request records were found in recent logs. Send one AI message first, or retry with a larger lineLimit.',
        }),
    nextActions: parsedEvents.length > 0
      ? [
          translateText(translate, {
            key: 'ai_chat.inspection.upstream_logs.next_action.filter_request_body',
            fallback: 'To verify full request inputs, filter precisely by requestId first, then check whether bodyPreview was truncated.',
          }),
          translateText(translate, {
            key: 'ai_chat.inspection.upstream_logs.next_action.inspect_timeout',
            fallback: 'If there is only a start event with no completion or failure, continue with inspect_app_logs or increase lineLimit to check for request timeout.',
          }),
        ]
      : [
          translateText(translate, {
            key: 'ai_chat.inspection.upstream_logs.next_action.confirm_logging',
            fallback: 'Confirm that the current build includes AI upstream request logging.',
          }),
          translateText(translate, {
            key: 'ai_chat.inspection.upstream_logs.next_action.send_message',
            fallback: 'Send one AI chat message, then call this tool again.',
          }),
          translateText(translate, {
            key: 'ai_chat.inspection.upstream_logs.next_action.read_warn_error',
            fallback: 'If there are still no records, call inspect_app_logs to read recent WARN/ERROR raw logs.',
          }),
        ],
  };
};
