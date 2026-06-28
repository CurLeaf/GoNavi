import { useEffect, useMemo, useRef } from 'react';

import {
  loadAISessionFromBackend,
  loadAISessionsFromBackend,
  useStore,
} from '../../store';
import type { AIChatMessage } from '../../types';

interface UseAIChatSessionStateOptions {
  aiActiveSessionId: string | null;
  aiPanelVisible: boolean;
  createNewAISession: () => void;
}

const EMPTY_AI_CHAT_MESSAGES: AIChatMessage[] = [];

export const useAIChatSessionState = ({
  aiActiveSessionId,
  aiPanelVisible,
  createNewAISession,
}: UseAIChatSessionStateOptions) => {
  const aiChatSessions = useStore((state) => state.aiChatSessions);
  const sid = aiActiveSessionId || 'session-fallback';
  const messages = useStore((state) => state.aiChatHistory[sid] || EMPTY_AI_CHAT_MESSAGES);

  useEffect(() => {
    if (!aiActiveSessionId) {
      createNewAISession();
    }
  }, [aiActiveSessionId, createNewAISession]);

  const sessionsLoadedRef = useRef(false);
  useEffect(() => {
    if (!aiPanelVisible || sessionsLoadedRef.current) {
      return;
    }
    sessionsLoadedRef.current = true;
    loadAISessionsFromBackend();
  }, [aiPanelVisible]);

  useEffect(() => {
    if (sid && sid !== 'session-fallback') {
      loadAISessionFromBackend(sid);
    }
  }, [sid]);

  const orderedAISessions = useMemo(
    () => [...aiChatSessions].sort((left, right) => right.updatedAt - left.updatedAt),
    [aiChatSessions],
  );

  return {
    sid,
    messages,
    orderedAISessions,
  };
};
