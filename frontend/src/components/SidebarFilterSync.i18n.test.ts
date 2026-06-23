import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = [
  readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8'),
  readFileSync(new URL('./sidebar/SidebarSearchPanel.tsx', import.meta.url), 'utf8'),
].join('\n');

const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'de-DE', 'ru-RU'] as const;
const requiredKeys = [
  'sidebar.command_search.sync_to_filter_tooltip',
  'sidebar.command_search.sync_to_filter_aria',
  'sidebar.command_search.reset_filter',
  'sidebar.command_search.no_synced_filter',
  'sidebar.command_search.no_filter_content',
  'sidebar.message.sidebar_filter_sync_enabled',
  'sidebar.message.sidebar_filter_sync_disabled',
  'sidebar.message.sidebar_filter_reset',
];

describe('Sidebar filter sync i18n', () => {
  it('localizes v2 sidebar filter sync and reset shell text', () => {
    [
      '已开启左侧筛选同步',
      '已关闭左侧筛选同步',
      '已重置侧栏筛选',
      '同步输入内容到左侧筛选',
      '同步到左侧筛选',
      '重置侧栏筛选',
      '没有已同步的侧栏筛选',
      '没有筛选内容',
    ].forEach((snippet) => {
      expect(source).not.toContain(snippet);
    });

    requiredKeys.forEach((key) => {
      expect(source).toContain(`t('${key}'`);
    });
  });

  it('keeps v2 sidebar filter sync keys available in every locale', () => {
    locales.forEach((locale) => {
      const catalog = JSON.parse(readFileSync(new URL(`../../../shared/i18n/${locale}.json`, import.meta.url), 'utf8')) as Record<string, string>;
      requiredKeys.forEach((key) => {
        expect(catalog[key], `${locale}:${key}`).toBeTruthy();
      });
    });
  });
});
