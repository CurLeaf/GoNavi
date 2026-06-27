import type { AIInspectionTranslator } from './aiInspectionI18n';
import { translateInspectionCopy } from './aiInspectionI18n';

const DEFAULT_PREVIEW_LIMIT = 240;
const DEFAULT_STACK_LIMIT = 1200;

const copy = (
  translate: AIInspectionTranslator | undefined,
  key: string,
  fallback: string,
) => translateInspectionCopy(translate, key, fallback);

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

export const buildAILastRenderErrorSnapshot = (translate?: AIInspectionTranslator) => {
  const renderError = resolveGlobalRenderError();
  if (!renderError) {
    return {
      hasError: false,
      summary: copy(
        translate,
        'ai_chat.inspection.last_render_error.empty_summary',
        'No AI message render errors have been recorded yet.',
      ),
      nextActions: [
        copy(
          translate,
          'ai_chat.inspection.last_render_error.empty_next_action.reproduce',
          'If the user reports a blank AI message, white block, or localized render error, reproduce it and read this snapshot again.',
        ),
        copy(
          translate,
          'ai_chat.inspection.last_render_error.empty_next_action.inspect_health',
          'If the entire AI panel is failing, combine this with inspect_ai_setup_health and inspect_app_logs.',
        ),
      ],
    };
  }

  return {
    hasError: true,
    summary: copy(
      translate,
      'ai_chat.inspection.last_render_error.recorded_summary',
      'A recent AI message render error was recorded, including the message, render path, and stack summary needed for diagnosis.',
    ),
    messageId: String(renderError.messageId || ''),
    role: String(renderError.role || ''),
    recordedAt: typeof renderError.recordedAt === 'number' ? renderError.recordedAt : null,
    contentPreview: truncateText(renderError.contentPreview, DEFAULT_PREVIEW_LIMIT),
    errorMessage: truncateText(renderError.message, DEFAULT_PREVIEW_LIMIT),
    stackPreview: truncateText(renderError.stack, DEFAULT_STACK_LIMIT),
    componentStackPreview: truncateText(renderError.componentStack, DEFAULT_STACK_LIMIT),
    nextActions: [
      copy(
        translate,
        'ai_chat.inspection.last_render_error.next_action.match_message',
        'Match messageId and contentPreview against the current conversation to identify which bubble triggered the render error.',
      ),
      copy(
        translate,
        'ai_chat.inspection.last_render_error.next_action.narrow_scope',
        'If more narrowing is needed, compare the latest user input, tool results, and related component code.',
      ),
    ],
  };
};
