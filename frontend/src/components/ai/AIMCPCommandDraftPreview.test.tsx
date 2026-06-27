import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import AIMCPCommandDraftPreview from './AIMCPCommandDraftPreview';
import { I18nProvider } from '../../i18n/provider';
import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

vi.mock('../../i18n/runtime', () => ({
  syncLanguageRuntime: vi.fn(async () => undefined),
}));

const source = readFileSync(new URL('./AIMCPCommandDraftPreview.tsx', import.meta.url), 'utf8');
const zhCnCatalog = JSON.parse(readFileSync(new URL('../../../../shared/i18n/zh-CN.json', import.meta.url), 'utf8'));
const zhTwCatalog = JSON.parse(readFileSync(new URL('../../../../shared/i18n/zh-TW.json', import.meta.url), 'utf8'));
const enUsCatalog = JSON.parse(readFileSync(new URL('../../../../shared/i18n/en-US.json', import.meta.url), 'utf8'));
const jaJpCatalog = JSON.parse(readFileSync(new URL('../../../../shared/i18n/ja-JP.json', import.meta.url), 'utf8'));
const deDeCatalog = JSON.parse(readFileSync(new URL('../../../../shared/i18n/de-DE.json', import.meta.url), 'utf8'));
const ruRuCatalog = JSON.parse(readFileSync(new URL('../../../../shared/i18n/ru-RU.json', import.meta.url), 'utf8'));

const REQUIRED_KEYS = [
  'ai_settings.mcp_server.command_preview.title',
  'ai_settings.mcp_server.command_preview.description',
  'ai_settings.mcp_server.command_preview.env_title',
  'ai_settings.mcp_server.command_preview.env_count',
  'ai_settings.mcp_server.command_preview.env_empty',
  'ai_settings.mcp_server.command_preview.empty_value',
  'ai_settings.mcp_server.command_preview.command_title',
  'ai_settings.mcp_server.command_preview.command_hint',
  'ai_settings.mcp_server.command_preview.args_title',
  'ai_settings.mcp_server.command_preview.args_count',
  'ai_settings.mcp_server.command_preview.args_empty',
];

const renderPreview = (preference: 'en-US' | 'zh-CN') => renderToStaticMarkup(
  <I18nProvider
    preference={preference}
    systemLanguages={[preference]}
    onPreferenceChange={() => undefined}
  >
    <AIMCPCommandDraftPreview
      draft={{
        command: 'python',
        args: ['-m', 'your_mcp_server', '--stdio'],
        env: {
          OPENAI_API_KEY: '***',
          HTTP_PROXY: 'http://127.0.0.1:7890',
        },
      }}
      darkMode={false}
      overlayTheme={buildOverlayWorkbenchTheme(false)}
      cardBorder="rgba(0,0,0,0.08)"
    />
  </I18nProvider>,
);

describe('AIMCPCommandDraftPreview', () => {
  it('uses catalog keys instead of hard-coded Chinese preview chrome', () => {
    expect(source).toContain('useOptionalI18n()');
    expect(source).toContain("catalogTranslate('en-US'");
    for (const key of REQUIRED_KEYS) {
      expect(source).toContain(key);
    }
    expect(source).not.toContain('自动拆分预览');
    expect(source).not.toContain('环境变量');
    expect(source).not.toContain('启动命令');
    expect(source).not.toContain('命令参数');
    expect(source).not.toContain('这条命令里没有检测到前缀环境变量。');
    expect(source).not.toContain('这条命令里没有检测到额外参数。');
  });

  it('keeps command preview keys present in all six catalogs', () => {
    for (const key of REQUIRED_KEYS) {
      expect(zhCnCatalog[key]).toBeTruthy();
      expect(zhTwCatalog[key]).toBeTruthy();
      expect(enUsCatalog[key]).toBeTruthy();
      expect(jaJpCatalog[key]).toBeTruthy();
      expect(deDeCatalog[key]).toBeTruthy();
      expect(ruRuCatalog[key]).toBeTruthy();
    }
  });

  it('renders localized preview chrome while preserving raw command, args, and env keys', () => {
    const enMarkup = renderPreview('en-US');
    const zhMarkup = renderPreview('zh-CN');

    expect(enMarkup).toContain('Auto split preview');
    expect(enMarkup).toContain('Environment variables');
    expect(enMarkup).toContain('Startup command');
    expect(enMarkup).toContain('Command arguments');
    expect(enMarkup).toContain('Will write 2 environment variables.');
    expect(enMarkup).toContain('Will split into 3 separate argument tags.');

    expect(zhMarkup).toContain('自动拆分预览');
    expect(zhMarkup).toContain('环境变量');
    expect(zhMarkup).toContain('启动命令');
    expect(zhMarkup).toContain('命令参数');

    for (const markup of [enMarkup, zhMarkup]) {
      expect(markup).toContain('OPENAI_API_KEY');
      expect(markup).toContain('HTTP_PROXY');
      expect(markup).toContain('python');
      expect(markup).toContain('your_mcp_server');
      expect(markup).toContain('--stdio');
    }
  });

  it('falls back to English without an i18n provider', () => {
    const markup = renderToStaticMarkup(
      <AIMCPCommandDraftPreview
        draft={{
          command: 'python',
          args: ['-m', 'your_mcp_server', '--stdio'],
          env: {
            OPENAI_API_KEY: '***',
            HTTP_PROXY: 'http://127.0.0.1:7890',
          },
        }}
        darkMode={false}
        overlayTheme={buildOverlayWorkbenchTheme(false)}
        cardBorder="rgba(0,0,0,0.08)"
      />,
    );

    expect(markup).toContain('Auto split preview');
    expect(markup).toContain('Environment variables');
    expect(markup).toContain('OPENAI_API_KEY');
    expect(markup).toContain('HTTP_PROXY');
    expect(markup).toContain('Startup command');
    expect(markup).toContain('python');
    expect(markup).toContain('Command arguments');
    expect(markup).toContain('your_mcp_server');
    expect(markup).toContain('--stdio');
  });
});
