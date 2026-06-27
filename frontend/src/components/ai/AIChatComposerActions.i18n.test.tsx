import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/provider';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import AIChatComposerActions from './AIChatComposerActions';

vi.mock('../../i18n/runtime', () => ({
  syncLanguageRuntime: vi.fn(async () => undefined),
}));

vi.mock('antd', async () => {
  const React = await import('react');
  return {
    Button: ({
      icon,
      onClick,
      children,
      ...rest
    }: {
      icon?: React.ReactNode;
      onClick?: () => void;
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => React.createElement('button', { ...rest, onClick }, icon, children),
    Tooltip: ({
      title,
      children,
    }: {
      title?: React.ReactNode;
      children?: React.ReactNode;
    }) => React.createElement(
      'div',
      { 'data-tooltip-title': typeof title === 'string' ? title : undefined },
      children,
    ),
  };
});

vi.mock('@ant-design/icons', async () => {
  const React = await import('react');
  const makeIcon = (name: string) => () => React.createElement('span', { 'data-icon': name });
  return {
    CodeOutlined: makeIcon('code'),
    PictureOutlined: makeIcon('picture'),
    SendOutlined: makeIcon('send'),
    StopOutlined: makeIcon('stop'),
    TableOutlined: makeIcon('table'),
  };
});

const source = readFileSync(new URL('./AIChatComposerActions.tsx', import.meta.url), 'utf8');
const zhCnCatalog = JSON.parse(readFileSync(new URL('../../../../shared/i18n/zh-CN.json', import.meta.url), 'utf8'));
const zhTwCatalog = JSON.parse(readFileSync(new URL('../../../../shared/i18n/zh-TW.json', import.meta.url), 'utf8'));
const enUsCatalog = JSON.parse(readFileSync(new URL('../../../../shared/i18n/en-US.json', import.meta.url), 'utf8'));
const jaJpCatalog = JSON.parse(readFileSync(new URL('../../../../shared/i18n/ja-JP.json', import.meta.url), 'utf8'));
const deDeCatalog = JSON.parse(readFileSync(new URL('../../../../shared/i18n/de-DE.json', import.meta.url), 'utf8'));
const ruRuCatalog = JSON.parse(readFileSync(new URL('../../../../shared/i18n/ru-RU.json', import.meta.url), 'utf8'));

const overlayTheme: OverlayWorkbenchTheme = {
  isDark: false,
  shellBg: '#fff',
  shellBorder: '1px solid #eee',
  shellShadow: 'none',
  shellBackdropFilter: 'none',
  sectionBg: '#fff',
  sectionBorder: '1px solid #eee',
  mutedText: '#666',
  titleText: '#111',
  iconBg: '#f5f5f5',
  iconColor: '#1677ff',
  hoverBg: '#f5f5f5',
  selectedBg: '#e6f4ff',
  selectedText: '#1677ff',
  divider: '#eee',
};

const baseProps = {
  variant: 'legacy' as const,
  input: 'select 1',
  draftAttachmentCount: 0,
  sending: false,
  darkMode: false,
  textColor: '#111',
  mutedColor: '#666',
  overlayTheme,
  fileInputRef: { current: null } as React.RefObject<HTMLInputElement>,
  onAttachmentUpload: () => undefined,
  onOpenContext: () => undefined,
  onOpenSlashMenu: () => undefined,
  onSend: () => undefined,
  onStop: () => undefined,
};

const renderComposerActions = (props: Partial<React.ComponentProps<typeof AIChatComposerActions>>) => renderToStaticMarkup(
  <I18nProvider
    preference="en-US"
    systemLanguages={['en-US']}
    onPreferenceChange={() => undefined}
  >
    <AIChatComposerActions
      {...baseProps}
      {...props}
    />
  </I18nProvider>,
);

const renderComposerActionsWithoutProvider = (props: Partial<React.ComponentProps<typeof AIChatComposerActions>>) => renderToStaticMarkup(
  <AIChatComposerActions
    {...baseProps}
    {...props}
  />,
);

describe('AIChatComposerActions i18n source guards', () => {
  it('uses i18n keys instead of legacy Chinese button titles and tooltips', () => {
    expect(source).toContain('useOptionalI18n()');
    expect(source).toContain("catalogTranslate('en-US', key, params)");
    expect(source).toContain("ai_chat.input.tooltip.upload_attachment");
    expect(source).toContain("ai_chat.input.tooltip.attach_table_context");
    expect(source).toContain("ai_chat.input.tooltip.slash_command");
    expect(source).toContain("ai_chat.input.action.stop");
    expect(source).toContain("ai_chat.input.action.send");
    expect(source).not.toContain('上传附件（图片、Markdown、Word、Excel、PDF、文本）');
    expect(source).not.toContain('关联附带数据库表上下文');
    expect(source).not.toContain('快捷命令');
    expect(source).not.toContain('停止生成');
    expect(source).not.toContain('发送');
  });

  it('keeps required tooltip and action keys present in all six catalogs', () => {
    const requiredKeys = [
      'ai_chat.input.tooltip.upload_attachment',
      'ai_chat.input.tooltip.attach_table_context',
      'ai_chat.input.tooltip.slash_command',
      'ai_chat.input.action.stop',
      'ai_chat.input.action.send',
    ];
    for (const key of requiredKeys) {
      expect(zhCnCatalog[key]).toBeTruthy();
      expect(zhTwCatalog[key]).toBeTruthy();
      expect(enUsCatalog[key]).toBeTruthy();
      expect(jaJpCatalog[key]).toBeTruthy();
      expect(deDeCatalog[key]).toBeTruthy();
      expect(ruRuCatalog[key]).toBeTruthy();
    }
  });

  it('renders localized v2 tooltips and stop title in en-US', () => {
    const markup = renderComposerActions({ variant: 'v2', sending: true, input: '' });

    expect(markup).toContain('Upload attachment (images, Markdown, Word, Excel, PDF, text)');
    expect(markup).toContain('Attach database table context');
    expect(markup).toContain('Slash commands');
    expect(markup).toContain('title="Stop generating"');
  });

  it('renders localized legacy send title in en-US', () => {
    const markup = renderComposerActions({ variant: 'legacy', sending: false });

    expect(markup).toContain('Upload attachment (images, Markdown, Word, Excel, PDF, text)');
    expect(markup).toContain('Attach database table context');
    expect(markup).toContain('title="Send"');
  });

  it('falls back to English tooltips and action titles without an i18n provider', () => {
    expect(() => renderComposerActionsWithoutProvider({ variant: 'v2', sending: true, input: '' })).not.toThrow();

    const sendingMarkup = renderComposerActionsWithoutProvider({ variant: 'v2', sending: true, input: '' });
    expect(sendingMarkup).toContain('Upload attachment (images, Markdown, Word, Excel, PDF, text)');
    expect(sendingMarkup).toContain('Attach database table context');
    expect(sendingMarkup).toContain('Slash commands');
    expect(sendingMarkup).toContain('title="Stop generating"');
    expect(sendingMarkup).not.toContain('ai_chat.input.tooltip.upload_attachment');

    const idleMarkup = renderComposerActionsWithoutProvider({ variant: 'legacy', sending: false });
    expect(idleMarkup).toContain('title="Send"');
    expect(idleMarkup).not.toContain('ai_chat.input.action.send');
  });
});
