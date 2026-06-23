import { describe, expect, it } from 'vitest';

import {
  buildAIComposerNotice,
  buildIncompleteProviderNotice,
  buildModelFetchFailedNotice,
  buildMissingModelNotice,
  buildMissingProviderNotice,
} from './aiComposerNotice';

const t = (key: string, params?: Record<string, unknown>) => {
  const suffix = params?.detail ? `:${String(params.detail)}` : '';
  return `${key}${suffix}`;
};

describe('ai composer notice helpers', () => {
  it('builds a translated compact notice for missing provider with an action', () => {
    expect(buildMissingProviderNotice(t)).toEqual({
      tone: 'warning',
      title: 'ai_chat.composer_notice.missing_provider.title',
      description: 'ai_chat.composer_notice.missing_provider.description',
      action: {
        key: 'open-settings',
        label: '打开 AI 设置',
      },
    });
  });

  it('builds a translated compact notice for missing model selection with an action', () => {
    expect(buildMissingModelNotice(t)).toEqual({
      tone: 'warning',
      title: 'ai_chat.composer_notice.missing_model.title',
      description: 'ai_chat.composer_notice.missing_model.description',
      action: {
        key: 'reload-models',
        label: '重新加载模型',
      },
    });
  });

  it('builds a translated incomplete provider notice from readiness issues', () => {
    expect(buildIncompleteProviderNotice(['missing_secret', 'missing_base_url'], t)).toEqual({
      tone: 'error',
      title: '当前供应商还缺少 密钥、接口地址',
      description: '先补全供应商配置再发送，避免请求刚发起就失败。',
      action: {
        key: 'open-settings',
        label: '修复供应商配置',
      },
    });
  });

  it('builds a translated inline notice for model fetch failures with raw detail', () => {
    expect(buildModelFetchFailedNotice(t, '当前接口未返回可用模型')).toEqual({
      tone: 'error',
      title: 'ai_chat.composer_notice.model_fetch_failed.title',
      description: 'ai_chat.composer_notice.model_fetch_failed.detail_description:当前接口未返回可用模型',
      action: {
        key: 'reload-models',
        label: '重新加载模型',
      },
    });
  });

  it('uses the translated default description when model fetch failure detail is empty', () => {
    expect(buildModelFetchFailedNotice(t, '   ')).toEqual({
      tone: 'error',
      title: 'ai_chat.composer_notice.model_fetch_failed.title',
      description: 'ai_chat.composer_notice.model_fetch_failed.default_description',
      action: {
        key: 'reload-models',
        label: '重新加载模型',
      },
    });
  });

  it('keeps a non-translated compatibility path for direct notices', () => {
    expect(buildModelFetchFailedNotice('当前接口未返回可用模型')).toEqual({
      tone: 'error',
      title: '模型列表加载失败',
      description: '当前接口未返回可用模型',
      action: {
        key: 'reload-models',
        label: '重新加载模型',
      },
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
      action: {
        key: 'reload-models',
        label: 'zh:ai_chat.composer_notice.action.reload_models',
      },
    });
    expect(relocalized).toEqual({
      tone: 'error',
      title: 'en:ai_chat.composer_notice.model_fetch_failed.title',
      description: 'en:ai_chat.composer_notice.model_fetch_failed.detail_description:HTTP 401 原始错误',
      action: {
        key: 'reload-models',
        label: 'en:ai_chat.composer_notice.action.reload_models',
      },
    });
  });

  it('returns null when there is no composer notice descriptor', () => {
    expect(buildAIComposerNotice(t, null)).toBeNull();
  });
});
