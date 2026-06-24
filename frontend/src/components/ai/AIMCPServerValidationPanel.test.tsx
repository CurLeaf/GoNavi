import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/provider';
import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import type { MCPServerDraftValidation } from '../../utils/mcpServerValidation';
import AIMCPServerValidationPanel from './AIMCPServerValidationPanel';

vi.mock('../../i18n/runtime', () => ({
  syncLanguageRuntime: vi.fn(async () => undefined),
}));

const source = readFileSync(new URL('./AIMCPServerValidationPanel.tsx', import.meta.url), 'utf8');
const zhCnCatalog = JSON.parse(readFileSync(new URL('../../../../shared/i18n/zh-CN.json', import.meta.url), 'utf8'));
const zhTwCatalog = JSON.parse(readFileSync(new URL('../../../../shared/i18n/zh-TW.json', import.meta.url), 'utf8'));
const enUsCatalog = JSON.parse(readFileSync(new URL('../../../../shared/i18n/en-US.json', import.meta.url), 'utf8'));
const jaJpCatalog = JSON.parse(readFileSync(new URL('../../../../shared/i18n/ja-JP.json', import.meta.url), 'utf8'));
const deDeCatalog = JSON.parse(readFileSync(new URL('../../../../shared/i18n/de-DE.json', import.meta.url), 'utf8'));
const ruRuCatalog = JSON.parse(readFileSync(new URL('../../../../shared/i18n/ru-RU.json', import.meta.url), 'utf8'));

const REQUIRED_KEYS = [
  'ai_settings.mcp_server.validation.title',
  'ai_settings.mcp_server.validation.severity.error',
  'ai_settings.mcp_server.validation.severity.warning',
  'ai_settings.mcp_server.validation.severity.info',
  'ai_settings.mcp_server.validation.summary.errors',
  'ai_settings.mcp_server.validation.summary.warnings',
  'ai_settings.mcp_server.validation.summary.ready',
];

const buildValidation = (patch: Partial<MCPServerDraftValidation> = {}): MCPServerDraftValidation => ({
  issues: [
    {
      key: 'command-missing',
      severity: 'error',
      title: '启动命令未填写',
      detail: '至少填写 node、uvx、python 或本机 exe 路径；脚本名和 --stdio 放到命令参数里。',
    },
  ],
  errorCount: 1,
  warningCount: 0,
  infoCount: 0,
  canTest: false,
  canSave: false,
  ...patch,
});

const renderPanel = (validation: MCPServerDraftValidation, preference?: 'en-US' | 'zh-CN') => {
  const panel = (
    <AIMCPServerValidationPanel
      validation={validation}
      cardBorder="rgba(0,0,0,0.08)"
      darkMode={false}
      overlayTheme={buildOverlayWorkbenchTheme(false)}
    />
  );
  if (!preference) {
    return renderToStaticMarkup(panel);
  }
  return renderToStaticMarkup(
    <I18nProvider
      preference={preference}
      systemLanguages={[preference]}
      onPreferenceChange={() => undefined}
    >
      {panel}
    </I18nProvider>,
  );
};

describe('AIMCPServerValidationPanel', () => {
  it('uses catalog keys instead of hard-coded Chinese validation panel chrome', () => {
    expect(source).toContain('useOptionalI18n()');
    expect(source).toContain("catalogTranslate('en-US'");
    for (const key of REQUIRED_KEYS) {
      expect(source).toContain(key);
    }
    expect(source).not.toContain('配置检查');
    expect(source).not.toContain('需修复');
    expect(source).not.toContain('建议检查');
    expect(source).not.toContain('当前配置可以测试和保存。');
  });

  it('keeps validation panel keys present in all six catalogs', () => {
    for (const key of REQUIRED_KEYS) {
      expect(zhCnCatalog[key]).toBeTruthy();
      expect(zhTwCatalog[key]).toBeTruthy();
      expect(enUsCatalog[key]).toBeTruthy();
      expect(jaJpCatalog[key]).toBeTruthy();
      expect(deDeCatalog[key]).toBeTruthy();
      expect(ruRuCatalog[key]).toBeTruthy();
    }
  });

  it('renders localized summary chrome while preserving issue title and detail as supplied', () => {
    const markup = renderPanel(buildValidation(), 'en-US');

    expect(markup).toContain('Configuration check');
    expect(markup).toContain('Needs fix');
    expect(markup).toContain('Found 1 issue that must be fixed before testing or saving.');
    expect(markup).toContain('启动命令未填写');
    expect(markup).toContain('至少填写 node、uvx、python 或本机 exe 路径');
  });

  it('falls back to English without an i18n provider and renders ready summary', () => {
    const markup = renderPanel(buildValidation({
      issues: [],
      errorCount: 0,
      warningCount: 0,
      canTest: true,
      canSave: true,
    }));

    expect(markup).toContain('Configuration check');
    expect(markup).toContain('The current configuration can be tested and saved.');
  });
});
