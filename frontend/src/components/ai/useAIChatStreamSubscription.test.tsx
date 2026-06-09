import React, { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useStore } from '../../store';
import { useAIChatStreamSubscription } from './useAIChatStreamSubscription';

const runtimeMock = vi.hoisted(() => {
  const handlers = new Map<string, (data: any) => void>();
  return {
    handlers,
    EventsOn: vi.fn((eventName: string, handler: (data: any) => void) => {
      handlers.set(eventName, handler);
    }),
    EventsOff: vi.fn((eventName: string) => {
      handlers.delete(eventName);
    }),
  };
});

vi.mock('../../../wailsjs/runtime', () => ({
  EventsOn: runtimeMock.EventsOn,
  EventsOff: runtimeMock.EventsOff,
}));

const SESSION_ID = 'session-stream';
let nextId = 0;

const emitStreamChunk = async (data: any) => {
  const handler = runtimeMock.handlers.get(`ai:stream:${SESSION_ID}`);
  expect(handler).toBeTypeOf('function');
  await act(async () => {
    handler?.(data);
    await Promise.resolve();
  });
};

const appendMessage = (
  sessionId: string,
  message: Parameters<ReturnType<typeof useStore.getState>['addAIChatMessage']>[1],
) => {
  useStore.setState((state) => {
    const messages = state.aiChatHistory[sessionId] || [];
    return {
      aiChatHistory: {
        ...state.aiChatHistory,
        [sessionId]: [...messages, message],
      },
    };
  });
};

const patchMessage = (
  sessionId: string,
  messageId: string,
  patch: Parameters<ReturnType<typeof useStore.getState>['updateAIChatMessage']>[2],
) => {
  useStore.setState((state) => {
    const messages = state.aiChatHistory[sessionId];
    if (!messages) {
      return state;
    }
    return {
      aiChatHistory: {
        ...state.aiChatHistory,
        [sessionId]: messages.map((message) =>
          message.id === messageId ? { ...message, ...patch } : message,
        ),
      },
    };
  });
};

const StreamHarness = () => {
  const [sending, setSending] = useState(true);
  const nudgeCountRef = useRef(0);
  const pendingJVMPlanContextRef = useRef<any>(undefined);
  const pendingJVMDiagnosticPlanContextRef = useRef<any>(undefined);

  useAIChatStreamSubscription({
    sid: SESSION_ID,
    sending,
    setSending,
    availableTools: [],
    addAIChatMessage: appendMessage,
    updateAIChatMessage: patchMessage,
    buildSystemContextMessages: async () => [],
    executeLocalTools: async () => {},
    generateTitleForSession: async () => {},
    nextMessageId: () => `assistant-created-${++nextId}`,
    nudgeCountRef,
    pendingJVMPlanContextRef,
    pendingJVMDiagnosticPlanContextRef,
  });

  return null;
};

describe('useAIChatStreamSubscription', () => {
  beforeEach(() => {
    nextId = 0;
    runtimeMock.handlers.clear();
    runtimeMock.EventsOn.mockClear();
    runtimeMock.EventsOff.mockClear();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    useStore.setState({
      aiChatHistory: {
        [SESSION_ID]: [
          {
            id: 'user-1',
            role: 'user',
            content: 'hello',
            timestamp: 1,
          },
          {
            id: 'assistant-connecting',
            role: 'assistant',
            phase: 'connecting',
            content: '',
            timestamp: 2,
            loading: true,
          },
        ],
      },
      aiChatSessions: [{ id: SESSION_ID, title: 'hello', updatedAt: 1 }],
      aiActiveSessionId: SESSION_ID,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useStore.setState({
      aiChatHistory: {},
      aiChatSessions: [],
      aiActiveSessionId: null,
    });
  });

  it('keeps streamed chunks in the same assistant message after a parent rerender', async () => {
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(<StreamHarness />);
    });

    await emitStreamChunk({ content: 'Hello' });
    await emitStreamChunk({ content: ' world' });

    const messages = useStore.getState().aiChatHistory[SESSION_ID] || [];
    const assistantMessages = messages.filter((message) => message.role === 'assistant');

    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0]).toMatchObject({
      id: 'assistant-connecting',
      phase: 'generating',
      content: 'Hello world',
      loading: true,
    });

    await act(async () => {
      renderer?.unmount();
    });
  });
});
