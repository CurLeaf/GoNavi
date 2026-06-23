import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');

const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'de-DE', 'ru-RU'] as const;
const key = 'sidebar.message.visual_new_table_unsupported';

describe('Sidebar visual new table unsupported warning i18n', () => {
  it('localizes the visual new table unsupported warning', () => {
    expect(source).not.toContain("message.warning('当前数据源暂不支持可视化新建表')");
    expect(source).toContain(`message.warning(t('${key}'))`);
  });

  it('keeps the warning key available in every locale', () => {
    locales.forEach((locale) => {
      const catalog = JSON.parse(readFileSync(new URL(`../../../shared/i18n/${locale}.json`, import.meta.url), 'utf8')) as Record<string, string>;
      expect(catalog[key], `${locale}:${key}`).toBeTruthy();
    });
  });
});
