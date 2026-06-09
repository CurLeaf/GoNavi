import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';

import { EventsOn, EventsOff } from '../../../wailsjs/runtime';
import { useStore } from '../../store';
import type {
  AIChatMessage,
  AIToolCall,
  JVMAIPlanContext,
  JVMDiagnosticPlanContext,
} from '../../types';
import { sanitizeErrorMsg } from '../../utils/aiChatRuntime';
import { toAIRequestMessage } from '../../utils/aiMessagePayload';
import type { AIChatToolDefinition } from '../../utils/aiToolRegistry';

interface AIChatStreamChunk {
  content?: string;
  thinking?: string;
  reasoning_content?: string;
  tool_calls?: AIToolCall[];
  done?: boolean;
  error?: string;
}

interface UseAIChatStreamSubscriptionOptions {
  sid: string;
  sending: boolean;
  setSending: (sending: boolean) => void;
  availableTools: AIChatToolDefinition[];
  addAIChatMessage: (sid: string, message: AIChatMessage) => void;
  updateAIChatMessage: (
    sid: string,
    messageId: string,
    patch: Partial<AIChatMessage>,
  ) => void;
  buildSystemContextMessages: (
    overrideJVMPlanContext?: JVMAIPlanContext,
    overrideJVMDiagnosticPlanContext?: JVMDiagnosticPlanContext,
  ) => any[] | Promise<any[]>;
  executeLocalTools: (toolCalls: AIToolCall[], currentAsstMsgId: string) => void | Promise<void>;
  generateTitleForSession: (sid: string) => void | Promise<void>;
  nextMessageId: () => string;
  nudgeCountRef: MutableRefObject<number>;
  pendingJVMPlanContextRef: MutableRefObject<JVMAIPlanContext | undefined>;
  pendingJVMDiagnosticPlanContextRef: MutableRefObject<JVMDiagnosticPlanContext | undefined>;
}

interface AIChatStreamState {
  sid: string;
  assistantMsgId: string;
  isFirstCompletion: boolean;
  streamBuffer: {
    thinking: string;
    reasoningContent: string;
    content: string;
  };
  flushPending: boolean;
}

const createAIChatStreamState = (sid: string): AIChatStreamState => ({
  sid,
  assistantMsgId: '',
  isFirstCompletion: false,
  streamBuffer: { thinking: '', reasoningContent: '', content: '' },
  flushPending: false,
});

const resetAIChatStreamProgress = (state: AIChatStreamState) => {
  state.assistantMsgId = '';
  state.isFirstCompletion = false;
  state.streamBuffer.thinking = '';
  state.streamBuffer.reasoningContent = '';
  state.streamBuffer.content = '';
  state.flushPending = false;
};

export const useAIChatStreamSubscription = ({
  sid,
  sending,
  setSending,
  availableTools,
  addAIChatMessage,
  updateAIChatMessage,
  buildSystemContextMessages,
  executeLocalTools,
  generateTitleForSession,
  nextMessageId,
  nudgeCountRef,
  pendingJVMPlanContextRef,
  pendingJVMDiagnosticPlanContextRef,
}: UseAIChatStreamSubscriptionOptions) => {
  const sendingRef = useRef(sending);
  const streamStateRef = useRef(createAIChatStreamState(sid));

  useEffect(() => {
    sendingRef.current = sending;
  }, [sending]);

  useEffect(() => {
    const eventName = `ai:stream:${sid}`;
    if (streamStateRef.current.sid !== sid) {
      streamStateRef.current = createAIChatStreamState(sid);
    }
    const streamState = streamStateRef.current;

    // 缓冲高频 token，避免把流式吞吐直接转成同步重绘风暴
    const streamBuffer = streamState.streamBuffer;

    const flushStreamBuffer = () => {
      streamState.flushPending = false;
      if (!streamState.assistantMsgId) return;
      const current = useStore.getState().aiChatHistory[sid];
      const existing = current?.find((message) => message.id === streamState.assistantMsgId);
      if (!existing) return;

      const updates: Partial<AIChatMessage> = {};
      if (streamBuffer.thinking) {
        updates.thinking = (existing.thinking || '') + streamBuffer.thinking;
        updates.phase = 'thinking';
        streamBuffer.thinking = '';
      }
      if (streamBuffer.reasoningContent) {
        updates.reasoning_content = (existing.reasoning_content || '') + streamBuffer.reasoningContent;
        streamBuffer.reasoningContent = '';
      }
      if (streamBuffer.content) {
        updates.content = (existing.content || '') + streamBuffer.content;
        updates.phase = 'generating';
        streamBuffer.content = '';
      }

      if (Object.keys(updates).length > 0) {
        updateAIChatMessage(sid, streamState.assistantMsgId, updates);
      }
    };

    const handler = (data: AIChatStreamChunk) => {
      if (!streamState.assistantMsgId) {
        const history = useStore.getState().aiChatHistory[sid] || [];
        const lastMsg = history[history.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.loading && lastMsg.phase === 'connecting') {
          streamState.assistantMsgId = lastMsg.id;
          updateAIChatMessage(sid, streamState.assistantMsgId, { content: '' });
        }
      }

      if (data.error) {
        const cleanErr = sanitizeErrorMsg(data.error);
        const rawErr = cleanErr !== data.error ? data.error : undefined;
        if (streamState.assistantMsgId) {
          updateAIChatMessage(sid, streamState.assistantMsgId, {
            content: `❌ 错误: ${cleanErr}`,
            phase: 'idle',
            loading: false,
            rawError: rawErr,
          });
        } else {
          addAIChatMessage(sid, {
            id: nextMessageId(),
            role: 'assistant',
            phase: 'idle',
            content: `❌ 错误: ${cleanErr}`,
            rawError: rawErr,
            timestamp: Date.now(),
            jvmPlanContext: pendingJVMPlanContextRef.current,
            jvmDiagnosticPlanContext: pendingJVMDiagnosticPlanContextRef.current,
          });
        }
        resetAIChatStreamProgress(streamState);
        setSending(false);
        return;
      }

      if (data.tool_calls && data.tool_calls.length > 0) {
        if (streamState.assistantMsgId) {
          updateAIChatMessage(sid, streamState.assistantMsgId, { tool_calls: data.tool_calls, phase: 'tool_calling' });
        } else {
          streamState.assistantMsgId = nextMessageId();
          addAIChatMessage(sid, {
            id: streamState.assistantMsgId,
            role: 'assistant',
            phase: 'tool_calling',
            content: '',
            tool_calls: data.tool_calls,
            timestamp: Date.now(),
            loading: true,
            jvmPlanContext: pendingJVMPlanContextRef.current,
            jvmDiagnosticPlanContext: pendingJVMDiagnosticPlanContextRef.current,
          });
        }
      }

      const displayThinking = data.thinking || data.reasoning_content || '';
      if (displayThinking || data.reasoning_content) {
        if (!streamState.assistantMsgId) {
          streamState.assistantMsgId = nextMessageId();
          addAIChatMessage(sid, {
            id: streamState.assistantMsgId,
            role: 'assistant',
            phase: 'thinking',
            content: '',
            thinking: displayThinking || undefined,
            reasoning_content: data.reasoning_content || undefined,
            timestamp: Date.now(),
            loading: true,
            jvmPlanContext: pendingJVMPlanContextRef.current,
            jvmDiagnosticPlanContext: pendingJVMDiagnosticPlanContextRef.current,
          });
          if (sendingRef.current) setSending(false);
        } else {
          streamBuffer.thinking += displayThinking;
          if (data.reasoning_content) {
            streamBuffer.reasoningContent += data.reasoning_content;
          }
          if (sendingRef.current) setSending(false);
        }
      }

      if (data.content) {
        if (!streamState.assistantMsgId) {
          streamState.assistantMsgId = nextMessageId();
          addAIChatMessage(sid, {
            id: streamState.assistantMsgId,
            role: 'assistant',
            phase: 'generating',
            content: data.content,
            timestamp: Date.now(),
            loading: true,
            jvmPlanContext: pendingJVMPlanContextRef.current,
            jvmDiagnosticPlanContext: pendingJVMDiagnosticPlanContextRef.current,
          });
          setSending(false);
          const currentHistory = useStore.getState().aiChatHistory[sid] || [];
          if (currentHistory.length <= 1) streamState.isFirstCompletion = true;
        } else {
          streamBuffer.content += data.content;
          if (sendingRef.current) setSending(false);
        }
      }

      if (streamBuffer.thinking || streamBuffer.reasoningContent || streamBuffer.content) {
        if (!streamState.flushPending) {
          streamState.flushPending = true;
          requestAnimationFrame(flushStreamBuffer);
        }
      }

      if (data.done) {
        if (streamBuffer.thinking || streamBuffer.reasoningContent || streamBuffer.content) {
          flushStreamBuffer();
        }
        const doneAssistantId = streamState.assistantMsgId;
        const doneIsFirst = streamState.isFirstCompletion;
        resetAIChatStreamProgress(streamState);
        setTimeout(() => {
          const currentMsgs = useStore.getState().aiChatHistory[sid] || [];
          for (const msg of currentMsgs) {
            if (msg.id !== doneAssistantId && msg.loading && msg.phase === 'connecting') {
              updateAIChatMessage(sid, msg.id, { loading: false, phase: 'idle' });
            }
          }

          if (doneAssistantId) {
            const current = useStore.getState().aiChatHistory[sid];
            const existing = current?.find((message) => message.id === doneAssistantId);
            if (existing && existing.tool_calls && existing.tool_calls.length > 0) {
              nudgeCountRef.current = 0;
              setTimeout(() => executeLocalTools(existing.tool_calls!, doneAssistantId), 50);
              return;
            }

            if (
              existing &&
              nudgeCountRef.current < 2 &&
              /(?:让我|我先|我来|现在|接下来|下面).*(?:查询|查找|获取|查看|检查|调用)|(?:获取|查询|查找|查看).*(?:信息|字段|列表|数据)[：:]?\s*$/.test(existing.content || '')
            ) {
              nudgeCountRef.current += 1;
              updateAIChatMessage(sid, doneAssistantId, { loading: false, phase: 'idle' });
              (async () => {
                try {
                  const currentHistory = useStore.getState().aiChatHistory[sid] || [];
                  const messagesPayload = currentHistory.map(toAIRequestMessage);
                  const sysMessages = await buildSystemContextMessages(
                    existing.jvmPlanContext,
                    existing.jvmDiagnosticPlanContext,
                  );
                  messagesPayload.push({
                    role: 'user',
                    content: '请直接使用 function call 调用工具执行操作，不要只用文字描述计划。',
                  });
                  const allMsg = [...sysMessages, ...messagesPayload];
                  const service = (window as any).go?.aiservice?.Service;
                  if (service?.AIChatStream) {
                    await service.AIChatStream(sid, allMsg, availableTools);
                  }
                } catch (error) {
                  console.error('Nudge failed', error);
                  setSending(false);
                }
              })();
              return;
            }

            if (doneIsFirst) generateTitleForSession(sid);

            const hasContent = !!existing?.content?.trim();
            const hasThinking = !!existing?.thinking?.trim();
            const hasTools = !!existing?.tool_calls?.length;

            if (!hasContent && !hasThinking && !hasTools) {
              updateAIChatMessage(sid, doneAssistantId, {
                content: '❌ 模型未能成功响应任何内容，可能遭遇频控、上下文超载或理解拒绝。',
                loading: false,
                phase: 'idle',
              });
            } else {
              updateAIChatMessage(sid, doneAssistantId, { loading: false, phase: 'idle' });
            }
          } else {
            addAIChatMessage(sid, {
              id: nextMessageId(),
              role: 'assistant',
              content: '❌ 请求中断：未收到任何具体回复。',
              timestamp: Date.now(),
              loading: false,
            });
          }
          setSending(false);
        }, 50);
      }
    };

    EventsOn(eventName, handler);
    return () => {
      EventsOff(eventName);
    };
  }, [
    addAIChatMessage,
    availableTools,
    buildSystemContextMessages,
    executeLocalTools,
    generateTitleForSession,
    nextMessageId,
    nudgeCountRef,
    pendingJVMDiagnosticPlanContextRef,
    pendingJVMPlanContextRef,
    setSending,
    sid,
    updateAIChatMessage,
  ]);
};
