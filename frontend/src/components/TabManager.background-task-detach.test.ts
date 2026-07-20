import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./TabManager.tsx', import.meta.url), 'utf8');
const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'de-DE', 'ru-RU'];

describe('TabManager background task window guard', () => {
  it('keeps background task workbenches in the main WebView', () => {
    expect(source).toContain("tab.type === 'table-export' || tab.type === 'data-sync'");
    expect(source).toContain('if (tab && isBackgroundTaskWorkbenchTab(tab))');
    expect(source).toContain("message.warning(t('tab_manager.message.background_task_window_unavailable'))");
    expect(source).toContain('disabled: isBackgroundTaskWorkbenchTab(tab)');
  });

  it('keeps the detach guard message available across locales', () => {
    locales.forEach((locale) => {
      const catalog = JSON.parse(
        readFileSync(new URL(`../../../shared/i18n/${locale}.json`, import.meta.url), 'utf8'),
      ) as Record<string, string>;
      expect(catalog['tab_manager.message.background_task_window_unavailable']).toBeTruthy();
    });
  });
});
