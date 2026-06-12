import { useStore } from '../store';

const genCompressionMessageId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export const getDynamicMaxContextChars = (modelName?: string) => {
  if (!modelName) return 258000;
  const lower = modelName.toLowerCase();

  if (lower.includes('gemini-1.5-pro') || lower.includes('gemini-2') || lower.includes('gemini-3')) {
    return 5000000;
  }
  if (lower.includes('glm-5') || lower.includes('claude-4') || lower.includes('claude-3.7') || lower.includes('gpt-5') || lower.includes('qwen3') || lower.includes('deepseek-v4')) {
    return 1000000;
  }
  if (lower.includes('claude-3-opus') || lower.includes('claude-3.5') || lower.includes('glm-4-long') || lower.includes('qwen-long')) {
    return 1000000;
  }
  if (lower.includes('claude') || lower.includes('deepseek') || lower.includes('gpt-4.5') || lower.includes('qwen2.5')) {
    return 258000;
  }
  if (lower.includes('gpt-4') || lower.includes('gpt-4o') || lower.includes('glm') || lower.includes('z-ai')) {
    return 128000;
  }
  if (lower.includes('qwen')) {
    return 128000;
  }
  return 258000;
};

export const compressContextIfNeeded = async (sid: string, messagesPayload: any[], maxLimit: number) => {
  try {
    const chars = messagesPayload.reduce((sum, message) =>
      sum + (message.content?.length || 0) + (message.reasoning_content?.length || 0) + JSON.stringify(message.tool_calls || []).length, 0);
    if (chars < maxLimit) return null;

    const Service = (window as any).go?.aiservice?.Service;
    if (!Service?.AIChatSend) return null;

    const connectingMsgId = genCompressionMessageId();
    useStore.getState().addAIChatMessage(sid, {
      id: connectingMsgId,
      role: 'assistant',
      phase: 'connecting',
      content: '⚙️ 对话已超载，正在启动记忆压缩...',
      timestamp: Date.now(),
      loading: true,
    });

    const summaryPrompt = `这是一段超长对话的历史记录。为了释放上下文空间同时保留你的记忆核心，请你仔细阅读并以“技术事实、已探索出的数据结构状态、用户的中心诉求、当前进展”为准则，进行高度浓缩的结构化总结。
注意：
1. 客观准确，不能遗漏关键业务逻辑或探索出的表名/字段。
2. 剔除无效执行过程、客套话、JSON返回值本身。
3. 请控制在 1000-2000 字左右，输出纯干货 Markdown。
4. 开头直接输出总结，不要带寒暄。`;

    const result = await Service.AIChatSend([
      { role: 'system', content: summaryPrompt },
      ...messagesPayload,
    ]);

    if (result?.success && result.content) {
      useStore.getState().deleteAIChatMessage(sid, connectingMsgId);
      return result.content;
    }

    useStore.getState().updateAIChatMessage(sid, connectingMsgId, {
      loading: false,
      phase: 'idle',
      content: '❌ 记忆压缩失败，将尝试原样接续...',
    });
  } catch (error) {
    console.error('Compression exception:', error);
  }
  return null;
};

export const sanitizeErrorMsg = (raw: string): string => {
  if (!raw || typeof raw !== 'string') return '未知错误';
  if (raw.includes('<html') || raw.includes('<!DOCTYPE') || raw.includes('<head')) {
    const titleMatch = raw.match(/<title[^>]*>([^<]+)<\/title>/i);
    const codeMatch = raw.match(/\b(4\d{2}|5\d{2})\b/);
    const title = titleMatch?.[1]?.trim();
    const code = codeMatch?.[1];
    if (title) return code ? `HTTP ${code}: ${title}` : title;
    if (code) return `HTTP ${code} 服务端错误`;
    return '服务端返回了异常 HTML 响应（可能是网关超时或服务不可用）';
  }
  if (raw.length > 300) return `${raw.substring(0, 280)}...(已截断)`;
  return raw;
};
