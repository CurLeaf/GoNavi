import { describe, expect, it } from 'vitest';

import {
  buildModelFetchFailedNotice,
  buildMissingModelNotice,
  buildMissingProviderNotice,
} from './aiComposerNotice';

describe('ai composer notice helpers', () => {
  it('builds a compact notice for missing provider', () => {
    expect(buildMissingProviderNotice()).toEqual({
      tone: 'warning',
      title: '还没有可用供应商',
      description: '先在 AI 设置里添加并启用一个模型供应商。',
    });
  });

  it('builds a compact notice for missing model selection', () => {
    expect(buildMissingModelNotice()).toEqual({
      tone: 'warning',
      title: '先选择一个模型',
      description: '打开下方模型下拉并选择模型；如果列表为空，请检查供应商入口和 API Key。',
    });
  });

  it('builds a readable inline notice for model fetch failures', () => {
    expect(buildModelFetchFailedNotice('当前接口未返回可用模型')).toEqual({
      tone: 'error',
      title: '模型列表加载失败',
      description: '当前接口未返回可用模型',
    });
  });
});
