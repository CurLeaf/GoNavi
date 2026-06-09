import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useStore } from '../../store';
import { useAIChatSessionTitleGenerator } from './useAIChatSessionTitleGenerator';

const SESSION_ID = 'session-title';

let currentGenerator: ((sessionId: string) => Promise<void>) | undefined;

const TitleGeneratorHarness = ({
  updateAISessionTitle,
}: {
  updateAISessionTitle: (sessionId: string, title: string) => void;
}) => {
  currentGenerator = useAIChatSessionTitleGenerator({ updateAISessionTitle });
  return null;
};

describe('useAIChatSessionTitleGenerator', () => {
  beforeEach(() => {
    currentGenerator = undefined;
    useStore.setState({
      aiChatHistory: {
        [SESSION_ID]: [
          {
            id: 'user-1',
            role: 'user',
            content: '帮我分析当前连接失败原因，并给出下一步排查建议，内容很长需要被截断',
            timestamp: 1,
          },
          {
            id: 'assistant-1',
            role: 'assistant',
            content: '可以',
            timestamp: 2,
          },
        ],
      },
      aiChatSessions: [{ id: SESSION_ID, title: '新的对话', updatedAt: 1 }],
      aiActiveSessionId: SESSION_ID,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    useStore.setState({
      aiChatHistory: {},
      aiChatSessions: [],
      aiActiveSessionId: null,
    });
  });

  it('generates a cleaned session title from the first user message', async () => {
    const AIChatSend = vi.fn().mockResolvedValue({ success: true, content: '"连接失败排查"' });
    vi.stubGlobal('window', {
      go: {
        aiservice: {
          Service: { AIChatSend },
        },
      },
    });
    const updateAISessionTitle = vi.fn();

    await act(async () => {
      create(<TitleGeneratorHarness updateAISessionTitle={updateAISessionTitle} />);
    });
    await act(async () => {
      await currentGenerator?.(SESSION_ID);
    });

    expect(AIChatSend).toHaveBeenCalledTimes(1);
    expect(AIChatSend.mock.calls[0][0]).toEqual([
      {
        role: 'system',
        content:
          'You are a summarizer. Provide a short 3-6 word title for this prompt. Do not use quotes, punctuation, or explain. Just the title in the same language as the prompt.',
      },
      {
        role: 'user',
        content: '帮我分析当前连接失败原因，并给出下一步排查建议，内容很长需要被截断'.slice(0, 50),
      },
    ]);
    expect(updateAISessionTitle).toHaveBeenCalledWith(SESSION_ID, '连接失败排查');
  });

  it('keeps the generator stable when the title updater is stable', async () => {
    vi.stubGlobal('window', {});
    const updateAISessionTitle = vi.fn();
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(<TitleGeneratorHarness updateAISessionTitle={updateAISessionTitle} />);
    });
    const firstGenerator = currentGenerator;

    await act(async () => {
      renderer?.update(<TitleGeneratorHarness updateAISessionTitle={updateAISessionTitle} />);
    });

    expect(currentGenerator).toBe(firstGenerator);
    await act(async () => {
      renderer?.unmount();
    });
  });

  it('skips generation when the Wails AI service is unavailable', async () => {
    vi.stubGlobal('window', {});
    const updateAISessionTitle = vi.fn();

    await act(async () => {
      create(<TitleGeneratorHarness updateAISessionTitle={updateAISessionTitle} />);
    });
    await act(async () => {
      await currentGenerator?.(SESSION_ID);
    });

    expect(updateAISessionTitle).not.toHaveBeenCalled();
  });
});
