import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import AISettingsContextSection from './AISettingsContextSection';
import AISettingsSafetySection from './AISettingsSafetySection';
import { I18nProvider } from '../../i18n/provider';
import { t as catalogTranslate } from '../../i18n/catalog';
import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

const overlayTheme = buildOverlayWorkbenchTheme(false);
const contextSectionSource = readFileSync(new URL('./AISettingsContextSection.tsx', import.meta.url), 'utf8');

const REQUIRED_CONTEXT_KEYS = [
  'ai_settings.open_mode.title',
  'ai_settings.open_mode.description',
  'ai_settings.open_mode.dock.label',
  'ai_settings.open_mode.dock.desc',
  'ai_settings.open_mode.detached.label',
  'ai_settings.open_mode.detached.desc',
  'ai_settings.context.section_title',
  'ai_settings.context.description',
  'ai_settings.context.schema_only.label',
  'ai_settings.context.schema_only.desc',
  'ai_settings.context.with_samples.label',
  'ai_settings.context.with_samples.desc',
  'ai_settings.context.with_results.label',
  'ai_settings.context.with_results.desc',
] as const;

const safetySectionSource = readFileSync(new URL('./AISettingsSafetySection.tsx', import.meta.url), 'utf8');

const REQUIRED_SAFETY_KEYS = [
  'ai_settings.safety.description',
  'ai_settings.safety.readonly.label',
  'ai_settings.safety.readonly.desc',
  'ai_settings.safety.readwrite.label',
  'ai_settings.safety.readwrite.desc',
  'ai_settings.safety.full.label',
  'ai_settings.safety.full.desc',
] as const;

describe('AI settings readonly sections', () => {
  it('renders the safety cards and keeps the selected level visible', () => {
    const markup = renderToStaticMarkup(
      <I18nProvider preference="en-US" systemLanguages={['en-US']} onPreferenceChange={() => {}}>
        <AISettingsSafetySection
          safetyLevel="readonly"
          darkMode={false}
          overlayTheme={overlayTheme}
          cardBg="#fff"
          cardBorder="rgba(0,0,0,0.08)"
          onChange={() => {}}
        />
      </I18nProvider>,
    );

    expect(markup).toContain('Read-only mode');
    expect(markup).toContain('Read/write mode');
    expect(markup).toContain('Full mode');
  });

  it('uses catalog fallback keys for safety mode chrome', () => {
    expect(safetySectionSource).toContain('useOptionalI18n()');
    expect(safetySectionSource).toContain("catalogTranslate('en-US'");
    for (const key of REQUIRED_SAFETY_KEYS) {
      expect(catalogTranslate('en-US', key)).not.toBe(key);
      expect(catalogTranslate('zh-CN', key)).not.toBe(key);
      expect(safetySectionSource).toContain(key);
    }

    for (const oldCopy of [
      '只读模式',
      'AI 仅可执行 SELECT 等查询操作，最安全',
      '读写模式',
      'AI 可执行 INSERT/UPDATE/DELETE，危险操作需二次确认',
      '完全模式',
      'AI 可执行所有操作（含 DDL/过程调用），高危或未识别操作会告警',
      '控制 AI 可执行的 SQL 操作类型，保护数据安全',
    ]) {
      expect(safetySectionSource).not.toContain(oldCopy);
    }
  });

  it('renders the open-mode and context cards and keeps the selected values visible', () => {
    const markup = renderToStaticMarkup(
      <I18nProvider preference="en-US" systemLanguages={['en-US']} onPreferenceChange={() => {}}>
        <AISettingsContextSection
          contextLevel="with_samples"
          openMode="dock"
          darkMode={false}
          overlayTheme={overlayTheme}
          cardBg="#fff"
          cardBorder="rgba(0,0,0,0.08)"
          onChange={() => {}}
          onOpenModeChange={() => {}}
        />
      </I18nProvider>,
    );

    expect(markup).toContain('Default open style');
    expect(markup).toContain('Sidebar panel');
    expect(markup).toContain('Floating window');
    expect(markup).toContain('Schema only');
    expect(markup).toContain('With samples');
    expect(markup).toContain('With query results');
  });

  it('uses catalog fallback keys for context mode chrome', () => {
    expect(contextSectionSource).toContain('useOptionalI18n()');
    expect(contextSectionSource).toContain("catalogTranslate('en-US'");
    for (const key of REQUIRED_CONTEXT_KEYS) {
      expect(catalogTranslate('en-US', key)).not.toBe(key);
      expect(catalogTranslate('zh-CN', key)).not.toBe(key);
      expect(contextSectionSource).toContain(key);
    }

    for (const oldCopy of [
      '仅 Schema',
      '只传递表/列结构信息给 AI',
      '含采样数据',
      '包含少量采样数据帮助 AI 理解数据特征',
      '含查询结果',
      '传递最近的查询结果作为上下文',
      '控制发送给 AI 的数据库上下文信息量',
    ]) {
      expect(contextSectionSource).not.toContain(oldCopy);
    }
  });
});
