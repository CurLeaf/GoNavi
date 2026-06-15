export type AIComposerNoticeTone = 'warning' | 'error';

export interface AIComposerNotice {
  tone: AIComposerNoticeTone;
  title: string;
  description: string;
}

export type AIComposerNoticeDescriptor =
  | { kind: 'missing_provider' }
  | { kind: 'missing_model' }
  | { kind: 'model_fetch_failed'; detail?: string | number | boolean | null | undefined };

export type AIComposerNoticeTranslator = (
  key: string,
  params?: Record<string, string | number | boolean | null | undefined>
) => string;

export const buildMissingProviderNotice = (t: AIComposerNoticeTranslator): AIComposerNotice => ({
  tone: 'warning',
  title: t('ai_chat.composer_notice.missing_provider.title'),
  description: t('ai_chat.composer_notice.missing_provider.description'),
});

export const buildMissingModelNotice = (t: AIComposerNoticeTranslator): AIComposerNotice => ({
  tone: 'warning',
  title: t('ai_chat.composer_notice.missing_model.title'),
  description: t('ai_chat.composer_notice.missing_model.description'),
});

export const buildModelFetchFailedNotice = (
  t: AIComposerNoticeTranslator,
  error?: string | number | boolean | null | undefined
): AIComposerNotice => {
  const detail = String(error || '').trim();

  return {
    tone: 'error',
    title: t('ai_chat.composer_notice.model_fetch_failed.title'),
    description: detail
      ? t('ai_chat.composer_notice.model_fetch_failed.detail_description', { detail })
      : t('ai_chat.composer_notice.model_fetch_failed.default_description'),
  };
};

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

  return buildModelFetchFailedNotice(t, descriptor.detail);
};
