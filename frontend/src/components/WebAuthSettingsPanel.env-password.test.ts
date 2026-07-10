import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./WebAuthSettingsPanel.tsx', import.meta.url), 'utf8');
const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'de-DE', 'ru-RU'];

describe('WebAuthSettingsPanel environment-managed password', () => {
  it('disables password changes and explains how to update the password', () => {
    expect(source).toContain('passwordManagedByEnvironment: boolean;');
    expect(source).toContain('summary?.passwordManagedByEnvironment === true');
    expect(source).toContain("t('app.settings.web_auth.password.managed_by_environment')");
    expect(source).toContain('disabled={passwordManagedByEnvironment}');
  });

  it('keeps the six-character and environment-managed copy in every locale', () => {
    for (const locale of locales) {
      const catalog = JSON.parse(
        readFileSync(new URL(`../../../shared/i18n/${locale}.json`, import.meta.url), 'utf8'),
      ) as Record<string, string>;
      expect(catalog['app.settings.web_auth.password.new_placeholder']).toContain('6');
      expect(catalog['app.settings.web_auth.password.managed_by_environment']).toContain('GONAVI_WEB_PASSWORD');
      expect(catalog['web_auth.error.password_managed_by_environment']).toBeTruthy();
    }
  });
});
