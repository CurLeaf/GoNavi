const DEFAULT_PREVIEW_LIMIT = 240;
const DEFAULT_STACK_LIMIT = 1200;

const truncateText = (value: unknown, limit: number) => {
  const text = String(value || '');
  if (!text) {
    return '';
  }
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
};

const resolveGlobalRenderError = () => {
  const globalRecord = globalThis as Record<string, unknown>;
  const direct = globalRecord.__gonaviLastAIMessageRenderError;
  if (direct && typeof direct === 'object') {
    return direct as Record<string, unknown>;
  }

  const rootWindow = globalRecord.window as Record<string, unknown> | undefined;
  const fromWindow = rootWindow?.__gonaviLastAIMessageRenderError;
  if (fromWindow && typeof fromWindow === 'object') {
    return fromWindow as Record<string, unknown>;
  }

  return null;
};

export const buildAILastRenderErrorSnapshot = () => {
  const renderError = resolveGlobalRenderError();
  if (!renderError) {
    return {
      hasError: false,
      summary: '当前还没有记录到 AI 消息渲染异常。',
      nextActions: [
        '如果用户反馈 AI 某条消息空白、白块或只出现局部报错，再重新触发问题后读取这里。',
        '如果是整块 AI 面板异常，再结合 inspect_ai_setup_health 和 inspect_app_logs 一起看。',
      ],
    };
  }

  return {
    hasError: true,
    summary: '已记录到最近一次 AI 消息渲染异常，可据此定位是哪条消息、哪段渲染逻辑和报错栈摘要。',
    messageId: String(renderError.messageId || ''),
    role: String(renderError.role || ''),
    recordedAt: typeof renderError.recordedAt === 'number' ? renderError.recordedAt : null,
    contentPreview: truncateText(renderError.contentPreview, DEFAULT_PREVIEW_LIMIT),
    errorMessage: truncateText(renderError.message, DEFAULT_PREVIEW_LIMIT),
    stackPreview: truncateText(renderError.stack, DEFAULT_STACK_LIMIT),
    componentStackPreview: truncateText(renderError.componentStack, DEFAULT_STACK_LIMIT),
    nextActions: [
      '先按 messageId 和 contentPreview 对照当前会话，确认是哪条气泡触发的渲染异常。',
      '如果需要继续缩小范围，再结合最近一次用户输入、工具结果和相关组件代码排查。',
    ],
  };
};
