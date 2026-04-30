import type { AIChatMessage, AIToolCall } from '../types';

export interface AIRequestMessage {
  role: AIChatMessage['role'];
  content: string;
  images?: string[];
  tool_calls?: AIToolCall[];
  tool_call_id?: string;
  reasoning_content?: string;
}

export const toAIRequestMessage = (message: AIChatMessage): AIRequestMessage => {
  const payload: AIRequestMessage = {
    role: message.role,
    content: message.content,
  };

  if (message.images && message.images.length > 0) {
    payload.images = message.images;
  }
  if (message.tool_calls && message.tool_calls.length > 0) {
    payload.tool_calls = message.tool_calls;
  }
  if (message.tool_call_id) {
    payload.tool_call_id = message.tool_call_id;
  }
  if (message.role === 'assistant' && message.reasoning_content) {
    payload.reasoning_content = message.reasoning_content;
  }

  return payload;
};
