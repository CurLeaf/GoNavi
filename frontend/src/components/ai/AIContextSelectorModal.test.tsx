import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/provider';
import { AIContextSelectorModal } from './AIContextSelectorModal';

vi.mock('antd', async () => {
  const React = await import('react');
  return {
    Modal: ({
      open,
      title,
      okText,
      cancelText,
      children,
    }: {
      open?: boolean;
      title?: React.ReactNode;
      okText?: React.ReactNode;
      cancelText?: React.ReactNode;
      children?: React.ReactNode;
    }) => open ? React.createElement(
      'section',
      {
        'data-modal-ok-text': typeof okText === 'string' ? okText : undefined,
        'data-modal-cancel-text': typeof cancelText === 'string' ? cancelText : undefined,
      },
      React.createElement('header', null, title),
      children,
    ) : null,
    Spin: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
    Select: ({
      placeholder,
      value,
      options,
    }: {
      placeholder?: React.ReactNode;
      value?: string;
      options?: Array<{ label: string; value: string }>;
    }) => React.createElement(
      'div',
      {
        'data-select-placeholder': typeof placeholder === 'string' ? placeholder : undefined,
        'data-select-value': value,
        'data-select-options': JSON.stringify(options ?? []),
      },
    ),
    Input: ({
      placeholder,
      value,
    }: {
      placeholder?: React.ReactNode;
      value?: string;
    }) => React.createElement('div', {
      'data-input-placeholder': typeof placeholder === 'string' ? placeholder : undefined,
      'data-input-value': value,
    }),
    Checkbox: ({
      children,
      checked,
    }: {
      children?: React.ReactNode;
      checked?: boolean;
    }) => React.createElement('label', { 'data-checked': checked ? 'true' : 'false' }, children),
    Button: ({
      children,
    }: {
      children?: React.ReactNode;
    }) => React.createElement('button', null, children),
  };
});

vi.mock('@ant-design/icons', () => ({
  SearchOutlined: () => React.createElement('span', { 'data-icon': 'search' }),
}));

const source = readFileSync(new URL('./AIContextSelectorModal.tsx', import.meta.url), 'utf8');
const zhCnCatalog = JSON.parse(readFileSync(new URL('../../../../shared/i18n/zh-CN.json', import.meta.url), 'utf8'));
const zhTwCatalog = JSON.parse(readFileSync(new URL('../../../../shared/i18n/zh-TW.json', import.meta.url), 'utf8'));
const enUsCatalog = JSON.parse(readFileSync(new URL('../../../../shared/i18n/en-US.json', import.meta.url), 'utf8'));
const jaJpCatalog = JSON.parse(readFileSync(new URL('../../../../shared/i18n/ja-JP.json', import.meta.url), 'utf8'));
const deDeCatalog = JSON.parse(readFileSync(new URL('../../../../shared/i18n/de-DE.json', import.meta.url), 'utf8'));
const ruRuCatalog = JSON.parse(readFileSync(new URL('../../../../shared/i18n/ru-RU.json', import.meta.url), 'utf8'));

const baseProps: React.ComponentProps<typeof AIContextSelectorModal> = {
  open: true,
  loading: false,
  confirmLoading: false,
  darkMode: false,
  textColor: '#162033',
  overlayTheme: {
    mutedText: 'rgba(16,24,40,0.55)',
    shellBorder: '1px solid rgba(0,0,0,0.08)',
  } as any,
  dbList: ['analytics'],
  selectedDbName: 'analytics',
  searchText: '',
  filteredTables: [{ name: 'orders' }, { name: 'users' }],
  selectedTableKeys: [],
  onCancel: () => undefined,
  onConfirm: () => undefined,
  onDbChange: () => undefined,
  onSearchTextChange: () => undefined,
  onSelectedTableKeysChange: () => undefined,
};

const renderWithProvider = (
  language: 'zh-CN' | 'zh-TW' | 'en-US' | 'ja-JP' | 'de-DE' | 'ru-RU',
  overrides: Partial<React.ComponentProps<typeof AIContextSelectorModal>> = {},
) => renderToStaticMarkup(
  <I18nProvider
    preference={language}
    systemLanguages={[language]}
    onPreferenceChange={() => undefined}
  >
    <AIContextSelectorModal {...baseProps} {...overrides} />
  </I18nProvider>,
);

const renderWithoutProvider = (
  overrides: Partial<React.ComponentProps<typeof AIContextSelectorModal>> = {},
) => renderToStaticMarkup(<AIContextSelectorModal {...baseProps} {...overrides} />);

describe('AIContextSelectorModal i18n guards', () => {
  it('uses optional i18n keys instead of legacy Chinese literals', () => {
    expect(source).toContain('useOptionalI18n()');
    expect(source).toContain("catalogTranslate('en-US', key, params)");
    expect(source).toContain("ai_chat.input.context.selector.title");
    expect(source).toContain("ai_chat.input.context.selector.confirm");
    expect(source).toContain("ai_chat.input.context.selector.search_placeholder");
    expect(source).toContain("ai_chat.input.context.selector.empty_no_match");
    expect(source).not.toContain('关联数据库表结构上下文');
    expect(source).not.toContain('同步所选表至上下文');
    expect(source).not.toContain('全选匹配的表');
    expect(source).not.toContain('反选匹配结果');
    expect(source).not.toContain('当前数据库没有可关联的表');
  });

  it('keeps required selector keys present in all six catalogs', () => {
    const requiredKeys = [
      'ai_chat.input.context.selector.title',
      'ai_chat.input.context.selector.confirm',
      'ai_chat.input.context.selector.cancel',
      'ai_chat.input.context.selector.database_placeholder',
      'ai_chat.input.context.selector.search_placeholder',
      'ai_chat.input.context.selector.select_all',
      'ai_chat.input.context.selector.invert_selection',
      'ai_chat.input.context.selector.empty_no_tables',
      'ai_chat.input.context.selector.empty_no_match',
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

  it('renders english fallback copy without an i18n provider while preserving raw database and search text', () => {
    expect(() => renderWithoutProvider({
      selectedDbName: 'analytics',
      searchText: 'orders',
      filteredTables: [],
    })).not.toThrow();

    const markup = renderWithoutProvider({
      selectedDbName: 'analytics',
      searchText: 'orders',
      filteredTables: [],
    });

    expect(markup).toContain('Attach table schemas as context');
    expect(markup).toContain('data-modal-ok-text="Sync selected tables to context"');
    expect(markup).toContain('data-modal-cancel-text="Cancel"');
    expect(markup).toContain('data-select-placeholder="Switch database"');
    expect(markup).toContain('data-input-placeholder="Search table names in the current database..."');
    expect(markup).toContain('No tables matching &#x27;orders&#x27; were found');
    expect(markup).toContain('analytics');
    expect(markup).not.toContain('ai_chat.input.context.selector.title');
  });

  it('renders localized selection actions in en-US', () => {
    const markup = renderWithProvider('en-US');

    expect(markup).toContain('Attach table schemas as context');
    expect(markup).toContain('Sync selected tables to context');
    expect(markup).toContain('Select all matching tables (2)');
    expect(markup).toContain('Invert matching selection');
  });
});
