import { useCallback } from 'react';

import { useStore } from '../../store';

interface UseAIChatSessionTitleGeneratorOptions {
  updateAISessionTitle: (sessionId: string, title: string) => void;
}

const TITLE_PROMPT =
  'You are a summarizer. Provide a short 3-6 word title for this prompt. Do not use quotes, punctuation, or explain. Just the title in the same language as the prompt.';

export const useAIChatSessionTitleGenerator = ({
  updateAISessionTitle,
}: UseAIChatSessionTitleGeneratorOptions) => {
  return useCallback(
    async (currentSid: string) => {
      try {
        const Service = (window as any).go?.aiservice?.Service;
        const historyLocal = useStore.getState().aiChatHistory[currentSid] || [];
        if (!Service?.AIChatSend || historyLocal.length < 2) return;

        const firstUserMsg = historyLocal.find((message) => message.role === 'user');
        if (!firstUserMsg) return;

        const snippet = firstUserMsg.content.slice(0, 50);
        const titleReq = [
          { role: 'system', content: TITLE_PROMPT },
          { role: 'user', content: snippet },
        ];
        const response = await Service.AIChatSend(titleReq);
        if (response?.success && response.content) {
          const cleanTitle = response.content.trim().replace(/^["']|["']$/g, '');
          updateAISessionTitle(currentSid, cleanTitle);
        }
      } catch (error) {
        console.warn('Failed to auto-generate title', error);
      }
    },
    [updateAISessionTitle],
  );
};
