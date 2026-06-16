import type { AIChatReadinessIssue } from '../components/ai/aiChatReadiness';
import { formatAIChatProviderIssueLabels } from '../components/ai/aiChatReadiness';

export type AIComposerNoticeTone = 'warning' | 'error';
export type AIComposerNoticeAction = 'open-settings' | 'reload-models';

export interface AIComposerNotice {
  tone: AIComposerNoticeTone;
  title: string;
  description: string;
  action?: {
    key: AIComposerNoticeAction;
    label: string;
  };
}

export type AIComposerNoticeDescriptor =
  | { kind: 'missing_provider' }
  | { kind: 'missing_model' }
  | { kind: 'provider_incomplete'; issues?: AIChatReadinessIssue[] }
  | { kind: 'model_fetch_failed'; detail?: string | number | boolean | null | undefined };

export type AIComposerNoticeTranslator = (
  key: string,
  params?: Record<string, string | number | boolean | null | undefined>
) => string;

const defaultCopy = {
  missingProviderTitle: '还没有可用供应商',
  missingProviderDescription: '先在 AI 设置里添加并启用一个模型供应商。',
  missingModelTitle: '先选择一个模型',
  missingModelDescription: '打开下方模型下拉并选择模型；如果列表为空，请检查供应商入口和 API Key。',
  incompleteProviderTitle: '当前供应商配置还不完整',
  incompleteProviderDescription: '先补全供应商配置再发送，避免请求刚发起就失败。',
  modelFetchFailedTitle: '模型列表加载失败',
  modelFetchFailedDescription: '请检查供应商入口、API Key 或账号权限，然后重新打开模型下拉。',
  openSettingsAction: '打开 AI 设置',
  fixProviderAction: '修复供应商配置',
  reloadModelsAction: '重新加载模型',
} as const;

const translateWithFallback = (
  t: AIComposerNoticeTranslator | undefined,
  key: string,
  fallback: string,
  params?: Record<string, string | number | boolean | null | undefined>,
): string => {
  if (!t) {
    return fallback;
  }
  const translated = t(key, params);
  return translated && translated !== key ? translated : fallback;
};

const buildNoticeAction = (
  key: AIComposerNoticeAction,
  labelKey: string,
  fallbackLabel: string,
  t?: AIComposerNoticeTranslator,
): AIComposerNotice['action'] => ({
  key,
  label: translateWithFallback(t, labelKey, fallbackLabel),
});

export const buildMissingProviderNotice = (t?: AIComposerNoticeTranslator): AIComposerNotice => ({
  tone: 'warning',
  title: t
    ? t('ai_chat.composer_notice.missing_provider.title')
    : defaultCopy.missingProviderTitle,
  description: t
    ? t('ai_chat.composer_notice.missing_provider.description')
    : defaultCopy.missingProviderDescription,
  action: buildNoticeAction(
    'open-settings',
    'ai_chat.composer_notice.action.open_settings',
    defaultCopy.openSettingsAction,
    t,
  ),
});

export const buildMissingModelNotice = (t?: AIComposerNoticeTranslator): AIComposerNotice => ({
  tone: 'warning',
  title: t
    ? t('ai_chat.composer_notice.missing_model.title')
    : defaultCopy.missingModelTitle,
  description: t
    ? t('ai_chat.composer_notice.missing_model.description')
    : defaultCopy.missingModelDescription,
  action: buildNoticeAction(
    'reload-models',
    'ai_chat.composer_notice.action.reload_models',
    defaultCopy.reloadModelsAction,
    t,
  ),
});

export const buildIncompleteProviderNotice = (
  issues: AIChatReadinessIssue[] = [],
  t?: AIComposerNoticeTranslator,
): AIComposerNotice => {
  const missingLabels = formatAIChatProviderIssueLabels(issues.filter((issue) => issue !== 'missing_selected_model'));
  const fallbackTitle = missingLabels.length > 0
    ? `当前供应商还缺少 ${missingLabels.join('、')}`
    : defaultCopy.incompleteProviderTitle;

  return {
    tone: 'error',
    title: translateWithFallback(
      t,
      'ai_chat.composer_notice.provider_incomplete.title',
      fallbackTitle,
      { labels: missingLabels.join('、') },
    ),
    description: translateWithFallback(
      t,
      'ai_chat.composer_notice.provider_incomplete.description',
      defaultCopy.incompleteProviderDescription,
    ),
    action: buildNoticeAction(
      'open-settings',
      'ai_chat.composer_notice.action.fix_provider',
      defaultCopy.fixProviderAction,
      t,
    ),
  };
};

export function buildModelFetchFailedNotice(
  t: AIComposerNoticeTranslator,
  error?: string | number | boolean | null | undefined,
): AIComposerNotice;
export function buildModelFetchFailedNotice(
  error?: string | number | boolean | null | undefined,
): AIComposerNotice;
export function buildModelFetchFailedNotice(
  tOrError?: AIComposerNoticeTranslator | string | number | boolean | null,
  error?: string | number | boolean | null | undefined,
): AIComposerNotice {
  const hasTranslator = typeof tOrError === 'function';
  const t = hasTranslator ? tOrError : undefined;
  const rawDetail = hasTranslator ? error : tOrError;
  const detail = String(rawDetail ?? '').trim();

  return {
    tone: 'error',
    title: t
      ? t('ai_chat.composer_notice.model_fetch_failed.title')
      : defaultCopy.modelFetchFailedTitle,
    description: t
      ? detail
        ? t('ai_chat.composer_notice.model_fetch_failed.detail_description', { detail })
        : t('ai_chat.composer_notice.model_fetch_failed.default_description')
      : detail || defaultCopy.modelFetchFailedDescription,
    action: buildNoticeAction(
      'reload-models',
      'ai_chat.composer_notice.action.reload_models',
      defaultCopy.reloadModelsAction,
      t,
    ),
  };
}

export const buildAIComposerNotice = (
  t: AIComposerNoticeTranslator,
  descriptor: AIComposerNoticeDescriptor | null
): AIComposerNotice | null => {
  if (!descriptor) {
    return null;
  }

  if (descriptor.kind === 'missing_provider') {
    return buildMissingProviderNotice(t);
  }
  if (descriptor.kind === 'missing_model') {
    return buildMissingModelNotice(t);
  }
  if (descriptor.kind === 'provider_incomplete') {
    return buildIncompleteProviderNotice(descriptor.issues, t);
  }

  return buildModelFetchFailedNotice(t, descriptor.detail);
};
