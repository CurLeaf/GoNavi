import { useEffect, useMemo, useRef } from 'react';

import {
  loadAISessionFromBackend,
  loadAISessionsFromBackend,
  useStore,
} from '../../store';

interface UseAIChatSessionStateOptions {
  aiActiveSessionId: string | null;
  aiPanelVisible: boolean;
  createNewAISession: () => void;
}

export const useAIChatSessionState = ({
  aiActiveSessionId,
  aiPanelVisible,
  createNewAISession,
}: UseAIChatSessionStateOptions) => {
  const aiChatHistory = useStore((state) => state.aiChatHistory);
  const aiChatSessions = useStore((state) => state.aiChatSessions);

  useEffect(() => {
    if (!aiActiveSessionId) {
      createNewAISession();
    }
  }, [aiActiveSessionId, createNewAISession]);

  const sid = aiActiveSessionId || 'session-fallback';
  const messages = aiChatHistory[sid] || [];

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
