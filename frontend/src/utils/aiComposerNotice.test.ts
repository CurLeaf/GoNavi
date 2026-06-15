import { describe, expect, it } from 'vitest';

import {
  buildAIComposerNotice,
  buildModelFetchFailedNotice,
  buildMissingModelNotice,
  buildMissingProviderNotice,
} from './aiComposerNotice';

const t = (key: string, params?: Record<string, unknown>) => {
  const suffix = params?.detail ? `:${String(params.detail)}` : '';
  return `${key}${suffix}`;
};

describe('ai composer notice helpers', () => {
  it('builds a translated compact notice for missing provider', () => {
    expect(buildMissingProviderNotice(t)).toEqual({
      tone: 'warning',
      title: 'ai_chat.composer_notice.missing_provider.title',
      description: 'ai_chat.composer_notice.missing_provider.description',
    });
  });

  it('builds a translated compact notice for missing model selection', () => {
    expect(buildMissingModelNotice(t)).toEqual({
      tone: 'warning',
      title: 'ai_chat.composer_notice.missing_model.title',
      description: 'ai_chat.composer_notice.missing_model.description',
    });
  });

  it('builds a translated inline notice for model fetch failures with raw detail', () => {
    expect(buildModelFetchFailedNotice(t, '当前接口未返回可用模型')).toEqual({
      tone: 'error',
      title: 'ai_chat.composer_notice.model_fetch_failed.title',
      description: 'ai_chat.composer_notice.model_fetch_failed.detail_description:当前接口未返回可用模型',
    });
  });

  it('uses the translated default description when model fetch failure detail is empty', () => {
    expect(buildModelFetchFailedNotice(t, '   ')).toEqual({
      tone: 'error',
      title: 'ai_chat.composer_notice.model_fetch_failed.title',
      description: 'ai_chat.composer_notice.model_fetch_failed.default_description',
    });
  });

  it('builds a translated notice from a raw descriptor at render time', () => {
    const descriptor = { kind: 'model_fetch_failed', detail: 'HTTP 401 原始错误' } as const;
    const localized = buildAIComposerNotice(
      (key, params) => `zh:${key}${params?.detail ? `:${String(params.detail)}` : ''}`,
      descriptor,
    );
    const relocalized = buildAIComposerNotice(
      (key, params) => `en:${key}${params?.detail ? `:${String(params.detail)}` : ''}`,
      descriptor,
    );

    expect(localized).toEqual({
      tone: 'error',
      title: 'zh:ai_chat.composer_notice.model_fetch_failed.title',
      description: 'zh:ai_chat.composer_notice.model_fetch_failed.detail_description:HTTP 401 原始错误',
    });
    expect(relocalized).toEqual({
      tone: 'error',
      title: 'en:ai_chat.composer_notice.model_fetch_failed.title',
      description: 'en:ai_chat.composer_notice.model_fetch_failed.detail_description:HTTP 401 原始错误',
    });
  });

  it('returns null when there is no composer notice descriptor', () => {
    expect(buildAIComposerNotice(t, null)).toBeNull();
  });
});
