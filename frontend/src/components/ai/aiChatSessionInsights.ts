import type { AIChatMessage } from '../../types';

interface AIChatSessionMeta {
  id: string;
  title: string;
  updatedAt: number;
}

const AI_CHAT_SESSION_PREVIEW_LIMIT = 240;

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
