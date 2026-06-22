import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { I18nProvider } from '../../i18n/provider';
import AISlashCommandMenu from './AISlashCommandMenu';
import { filterAISlashCommands } from './aiSlashCommands';

const source = readFileSync(new URL('./AISlashCommandMenu.tsx', import.meta.url), 'utf8');

const renderWithProvider = (
  language: 'zh-CN' | 'zh-TW' | 'en-US' | 'ja-JP' | 'de-DE' | 'ru-RU',
  commands = filterAISlashCommands('/'),
) => renderToStaticMarkup(
  <I18nProvider
    preference={language}
    systemLanguages={[language]}
    onPreferenceChange={() => undefined}
  >
    <AISlashCommandMenu
      visible
      commands={commands}
      darkMode={false}
      textColor="#162033"
      mutedColor="rgba(16,24,40,0.55)"
      onSelect={() => {}}
    />
  </I18nProvider>,
);

describe('AISlashCommandMenu', () => {
  it('uses optional i18n fallback keys instead of legacy Chinese empty-state literals', () => {
    expect(source).toContain('useOptionalI18n()');
    expect(source).toContain("catalogTranslate('en-US', key, params)");
    expect(source).toContain("ai_chat.input.slash.empty.title");
    expect(source).toContain("ai_chat.input.slash.empty.summary");
    expect(source).not.toContain('没有匹配的快捷命令');
    expect(source).not.toContain('可以先试这些更常用的入口');
    expect(source).not.toContain('当前共提供');
  });

  it('renders an empty-state hint when the slash filter has no matches', () => {
    const markup = renderToStaticMarkup(
      <AISlashCommandMenu
        visible
        commands={[]}
        darkMode={false}
        textColor="#162033"
        mutedColor="rgba(16,24,40,0.55)"
        onSelect={() => {}}
      />,
    );

    expect(markup).toContain('data-ai-chat-slash-empty="true"');
    expect(markup).toContain('No matching slash commands');
    expect(markup).toContain('Try these common entries first to jump into SQL generation, AI health checks, or MCP diagnostics.');
    expect(markup).toContain('There are 24 slash commands available. Search by command name, description, or keyword.');
    expect(markup).toContain('/sql');
    expect(markup).toContain('/health');
    expect(markup).toContain('/mcpadd');
  });

  it('renders grouped slash command entries with localized english copy when matches exist', () => {
    const markup = renderWithProvider('en-US');

    expect(markup).toContain('/sql');
    expect(markup).toContain('📝 Generate SQL');
    expect(markup).toContain('data-ai-chat-slash-group="generate"');
    expect(markup).toContain('SQL generation');
    expect(markup).toContain('Diagnostic probes');
    expect(markup).not.toContain('No matching slash commands');
  });
});
