import type {
  AIChatMessage,
  JVMAIPlanContext,
  JVMDiagnosticPlanContext,
} from '../../types';
import type { AIChatToolDefinition } from '../../utils/aiToolRegistry';
import { sanitizeErrorMsg } from '../../utils/aiChatRuntime';

interface AIChatService {
  AIChatStream?: (sid: string, messages: any[], tools: AIChatToolDefinition[]) => Promise<any>;
  AIChatSend?: (messages: any[], tools: AIChatToolDefinition[]) => Promise<any>;
}

interface DispatchAIChatPayloadOptions {
  sid: string;
  messages: any[];
  tools: AIChatToolDefinition[];
  addAIChatMessage: (sid: string, message: AIChatMessage) => void;
  setSending: (sending: boolean) => void;
  nextMessageId: () => string;
  jvmPlanContext?: JVMAIPlanContext;
  jvmDiagnosticPlanContext?: JVMDiagnosticPlanContext;
  unavailableContent?: string;
  onNonStreamSuccess?: () => void;
}

const getAIChatService = (): AIChatService | undefined =>
  (window as any)?.go?.aiservice?.Service;

export const dispatchAIChatPayload = async ({
  sid,
  messages,
  tools,
  addAIChatMessage,
  setSending,
  nextMessageId,
  jvmPlanContext,
  jvmDiagnosticPlanContext,
  unavailableContent,
  onNonStreamSuccess,
}: DispatchAIChatPayloadOptions): Promise<'stream' | 'send' | 'unavailable' | 'error'> => {
  try {
    const service = getAIChatService();
    if (service?.AIChatStream) {
      await service.AIChatStream(sid, messages, tools);
      return 'stream';
    }

    if (service?.AIChatSend) {
      const result = await service.AIChatSend(messages, tools);
      const rawError = result?.error || '未知错误';
      const cleanError = sanitizeErrorMsg(rawError);

      addAIChatMessage(sid, {
        id: nextMessageId(),
        role: 'assistant',
        content: result?.success ? result.content : `❌ ${cleanError}`,
        thinking: result?.success ? result.reasoning_content : undefined,
        reasoning_content: result?.success ? result.reasoning_content : undefined,
        rawError: !result?.success && cleanError !== rawError ? rawError : undefined,
        timestamp: Date.now(),
        jvmPlanContext,
        jvmDiagnosticPlanContext,
      });
      setSending(false);
      if (result?.success) {
        onNonStreamSuccess?.();
      }
      return 'send';
    }

    if (unavailableContent) {
      addAIChatMessage(sid, {
        id: nextMessageId(),
        role: 'assistant',
        content: unavailableContent,
        timestamp: Date.now(),
        jvmPlanContext,
        jvmDiagnosticPlanContext,
      });
    }
    setSending(false);
    return 'unavailable';
  } catch (error: any) {
    const rawError = error?.message || String(error);
    const cleanError = sanitizeErrorMsg(rawError);
    addAIChatMessage(sid, {
      id: nextMessageId(),
      role: 'assistant',
      content: `❌ 发送失败: ${cleanError}`,
      rawError: cleanError !== rawError ? rawError : undefined,
      timestamp: Date.now(),
      jvmPlanContext,
      jvmDiagnosticPlanContext,
    });
    setSending(false);
    return 'error';
  }
};
