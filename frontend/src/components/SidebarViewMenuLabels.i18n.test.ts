import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./sidebar/sidebarLegacyNodeMenu.tsx', import.meta.url), 'utf8');
const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'de-DE', 'ru-RU'] as const;

describe('Sidebar view menu labels i18n', () => {
  it('localizes ordinary view context menu labels', () => {
    expect(source).not.toContain("label: '浏览视图数据'");
    expect(source).not.toContain("label: '查看视图定义'");
    expect(source).not.toContain("label: '重命名视图'");
    expect(source).not.toContain("label: '删除视图'");
    expect(source).toContain("label: t('sidebar.menu.browse_view_data')");
    expect(source).toContain("label: t('sidebar.menu.view_definition')");
    expect(source).toContain("label: t('sidebar.menu.rename_view')");
    expect(source).toContain("label: t('sidebar.menu.delete_view')");
  });

  it('keeps ordinary view context menu catalog entries available in every locale', () => {
    locales.forEach((locale) => {
      const catalog = JSON.parse(readFileSync(new URL(`../../../shared/i18n/${locale}.json`, import.meta.url), 'utf8')) as Record<string, string>;
      expect(catalog['sidebar.menu.browse_view_data'], `${locale}:browse view data`).toBeTruthy();
      expect(catalog['sidebar.menu.view_definition'], `${locale}:view definition`).toBeTruthy();
      expect(catalog['sidebar.menu.rename_view'], `${locale}:rename view`).toBeTruthy();
      expect(catalog['sidebar.menu.delete_view'], `${locale}:delete view`).toBeTruthy();
    });
  });
});
