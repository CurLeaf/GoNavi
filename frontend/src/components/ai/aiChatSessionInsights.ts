import type { AIChatMessage } from '../../types';

interface AIChatSessionMeta {
  id: string;
  title: string;
  updatedAt: number;
}

const AI_CHAT_SESSION_PREVIEW_LIMIT = 240;
const AI_MESSAGE_FLOW_PREVIEW_LIMIT = 180;

const normalizeLimit = (input: unknown, fallback: number, max: number): number => {
  const value = Math.floor(Number(input) || fallback);
  if (value < 1) return 1;
  if (value > max) return max;
  return value;
};

const normalizeKeyword = (input: unknown): string => String(input || '').trim().toLowerCase();

const buildPreviewText = (messages: AIChatMessage[]) => {
  const firstUserMessage = messages.find((message) => message.role === 'user' && String(message.content || '').trim());
  const latestMeaningfulMessage = [...messages]
    .reverse()
    .find((message) => String(message.content || '').trim() || String(message.reasoning_content || '').trim());

  const firstUserPrompt = String(firstUserMessage?.content || '').trim();
  const latestMessageText = String(
    latestMeaningfulMessage?.content || latestMeaningfulMessage?.reasoning_content || '',
  ).trim();

  return {
    firstUserPrompt,
    latestMessageText,
  };
};

const matchesKeyword = (keyword: string, fields: Array<string | undefined>) => {
  if (!keyword) {
    return true;
  }
  return fields.some((field) => String(field || '').toLowerCase().includes(keyword));
};

export const buildAIChatSessionsSnapshot = (params: {
  aiChatSessions?: AIChatSessionMeta[];
  aiChatHistory?: Record<string, AIChatMessage[]>;
  activeSessionId?: string | null;
  keyword?: unknown;
  limit?: unknown;
  includePreview?: unknown;
}) => {
  const {
    aiChatSessions = [],
    aiChatHistory = {},
    activeSessionId = null,
    keyword,
    limit,
    includePreview = true,
  } = params;

  const safeKeyword = normalizeKeyword(keyword);
  const safeLimit = normalizeLimit(limit, 10, 50);
  const shouldIncludePreview = includePreview !== false;
  const sessionMetaMap = new Map(aiChatSessions.map((session) => [session.id, session]));

  const sessionIds = new Set<string>([
    ...aiChatSessions.map((session) => session.id),
    ...Object.keys(aiChatHistory || {}),
  ]);

  const allSessions = [...sessionIds].map((sessionId) => {
    const meta = sessionMetaMap.get(sessionId);
    const messages = [...(aiChatHistory[sessionId] || [])].sort((left, right) => left.timestamp - right.timestamp);
    const updatedAt = Number(
      meta?.updatedAt || messages[messages.length - 1]?.timestamp || messages[0]?.timestamp || 0,
    );
    const { firstUserPrompt, latestMessageText } = buildPreviewText(messages);
    const firstUserPromptPreview = shouldIncludePreview
      ? firstUserPrompt.slice(0, AI_CHAT_SESSION_PREVIEW_LIMIT)
      : '';
    const latestMessagePreview = shouldIncludePreview
      ? latestMessageText.slice(0, AI_CHAT_SESSION_PREVIEW_LIMIT)
      : '';

    return {
      id: sessionId,
      title: String(meta?.title || '').trim() || '未命名会话',
      updatedAt,
      isActive: sessionId === activeSessionId,
      messageCount: messages.length,
      userMessageCount: messages.filter((message) => message.role === 'user').length,
      assistantMessageCount: messages.filter((message) => message.role === 'assistant').length,
      toolMessageCount: messages.filter((message) => message.role === 'tool').length,
      hasToolMessages: messages.some((message) => message.role === 'tool'),
      hasErrorMessages: messages.some((message) => String(message.content || '').includes('❌')),
      lastMessageRole: messages[messages.length - 1]?.role || '',
      lastMessageAt: Number(messages[messages.length - 1]?.timestamp || 0),
      firstUserPromptPreview,
      firstUserPromptTruncated: shouldIncludePreview && firstUserPrompt.length > firstUserPromptPreview.length,
      latestMessagePreview,
      latestMessageTruncated: shouldIncludePreview && latestMessageText.length > latestMessagePreview.length,
    };
  });

  const filteredSessions = allSessions
    .filter((session) =>
      matchesKeyword(safeKeyword, [
        session.id,
        session.title,
        session.firstUserPromptPreview,
        session.latestMessagePreview,
      ]))
    .sort((left, right) => {
      if (left.isActive && !right.isActive) {
        return -1;
      }
      if (!left.isActive && right.isActive) {
        return 1;
      }
      return right.updatedAt - left.updatedAt;
    });

  const visibleSessions = filteredSessions.slice(0, safeLimit);

  return {
    activeSessionId: activeSessionId || '',
    keyword: safeKeyword,
    includePreview: shouldIncludePreview,
    limit: safeLimit,
    totalSessions: allSessions.length,
    totalMatched: filteredSessions.length,
    returnedSessions: visibleSessions.length,
    truncated: filteredSessions.length > visibleSessions.length,
    sessions: visibleSessions,
  };
};

const buildMessagePreview = (message: AIChatMessage, previewLimit: number): string => {
  const raw = String(message.content || message.reasoning_content || '').trim();
  return raw.slice(0, previewLimit);
};

const getToolCallNames = (message: AIChatMessage): string[] => (
  (message.tool_calls || [])
    .map((toolCall) => String(toolCall?.function?.name || '').trim())
    .filter(Boolean)
);

export const buildAIMessageFlowSnapshot = (params: {
  aiChatSessions?: AIChatSessionMeta[];
  aiChatHistory?: Record<string, AIChatMessage[]>;
  activeSessionId?: string | null;
  sessionId?: unknown;
  limit?: unknown;
  includeContent?: unknown;
  previewLimit?: unknown;
}) => {
  const {
    aiChatSessions = [],
    aiChatHistory = {},
    activeSessionId = null,
    sessionId,
    limit,
    includeContent = true,
    previewLimit,
  } = params;

  const requestedSessionId = String(sessionId || activeSessionId || '').trim();
  const safeLimit = normalizeLimit(limit, 24, 80);
  const safePreviewLimit = normalizeLimit(previewLimit, AI_MESSAGE_FLOW_PREVIEW_LIMIT, 1000);
  const shouldIncludeContent = includeContent !== false;
  const sessionMetaMap = new Map(aiChatSessions.map((session) => [session.id, session]));
  const messages = requestedSessionId
    ? [...(aiChatHistory[requestedSessionId] || [])].sort((left, right) => left.timestamp - right.timestamp)
    : [];
  const toolResultsByCallId = new Map(
    messages
      .filter((message) => message.role === 'tool' && message.tool_call_id)
      .map((message) => [String(message.tool_call_id), message]),
  );

  const assistantMessages = messages.filter((message) => message.role === 'assistant');
  const toolCallMessages = assistantMessages.filter((message) => (message.tool_calls || []).length > 0);
  const unresolvedToolCalls = toolCallMessages.flatMap((message) =>
    (message.tool_calls || [])
      .filter((toolCall) => !toolResultsByCallId.has(toolCall.id))
      .map((toolCall) => ({
        assistantMessageId: message.id,
        toolCallId: toolCall.id,
        toolName: toolCall.function?.name || '',
      })),
  );
  const emptyAssistantMessages = assistantMessages.filter((message) =>
    !String(message.content || '').trim()
    && !String(message.reasoning_content || '').trim()
    && !(message.tool_calls || []).length
    && !message.loading,
  );

  const consecutiveAssistantPairs: Array<{ previousMessageId: string; nextMessageId: string }> = [];
  for (let index = 1; index < messages.length; index += 1) {
    if (messages[index - 1]?.role === 'assistant' && messages[index]?.role === 'assistant') {
      consecutiveAssistantPairs.push({
        previousMessageId: messages[index - 1].id,
        nextMessageId: messages[index].id,
      });
    }
  }

  const warnings = [
    unresolvedToolCalls.length > 0 ? `有 ${unresolvedToolCalls.length} 个工具调用没有匹配到 tool 结果消息` : '',
    consecutiveAssistantPairs.length > 0 ? `发现 ${consecutiveAssistantPairs.length} 组连续 assistant 消息，可能存在回复被拆成多个气泡` : '',
    emptyAssistantMessages.length > 0 ? `发现 ${emptyAssistantMessages.length} 条空 assistant 消息` : '',
    messages.some((message) => message.loading) ? '会话中仍有 loading 消息，可能还在流式生成或上次中断未清理' : '',
  ].filter(Boolean);

  const nextActions = [
    unresolvedToolCalls.length > 0 ? '优先核对 useAIChatLocalTools 是否为每个 tool_call_id 写入 tool 消息' : '',
    consecutiveAssistantPairs.length > 0 ? '检查流式追加逻辑是否复用了同一个 assistantMsgId，而不是为同一轮回复新建 assistant 消息' : '',
    emptyAssistantMessages.length > 0 ? '检查异常或取消路径是否留下了空 assistant 占位消息' : '',
    warnings.length === 0 ? '消息流未发现明显结构异常，可继续结合 inspect_ai_last_render_error 或 inspect_app_logs 排查渲染/运行时问题' : '',
  ].filter(Boolean);

  const recentMessages = messages.slice(-safeLimit).map((message) => {
    const preview = shouldIncludeContent ? buildMessagePreview(message, safePreviewLimit) : '';
    const toolCallNames = getToolCallNames(message);
    return {
      id: message.id,
      role: message.role,
      phase: message.phase || '',
      timestamp: message.timestamp,
      loading: Boolean(message.loading),
      contentLength: String(message.content || '').length,
      reasoningLength: String(message.reasoning_content || '').length,
      preview,
      previewTruncated: shouldIncludeContent
        && String(message.content || message.reasoning_content || '').trim().length > preview.length,
      toolCallCount: (message.tool_calls || []).length,
      toolCallNames,
      toolCallIds: (message.tool_calls || []).map((toolCall) => toolCall.id),
      toolCallId: message.tool_call_id || '',
      toolName: message.tool_name || '',
      success: message.success,
    };
  });

  const meta = requestedSessionId ? sessionMetaMap.get(requestedSessionId) : undefined;
  return {
    activeSessionId: activeSessionId || '',
    requestedSessionId,
    found: Boolean(requestedSessionId && (messages.length > 0 || meta)),
    title: String(meta?.title || '').trim(),
    updatedAt: Number(meta?.updatedAt || messages[messages.length - 1]?.timestamp || 0),
    totalMessages: messages.length,
    returnedMessages: recentMessages.length,
    truncated: messages.length > recentMessages.length,
    userMessageCount: messages.filter((message) => message.role === 'user').length,
    assistantMessageCount: assistantMessages.length,
    toolMessageCount: messages.filter((message) => message.role === 'tool').length,
    systemMessageCount: messages.filter((message) => message.role === 'system').length,
    assistantToolCallMessageCount: toolCallMessages.length,
    unresolvedToolCallCount: unresolvedToolCalls.length,
    emptyAssistantMessageCount: emptyAssistantMessages.length,
    consecutiveAssistantPairCount: consecutiveAssistantPairs.length,
    unresolvedToolCalls,
    consecutiveAssistantPairs,
    warnings,
    nextActions,
    messages: recentMessages,
  };
};
