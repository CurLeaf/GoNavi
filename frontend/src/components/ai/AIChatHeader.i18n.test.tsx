import React from 'react';
import { readFileSync } from 'node:fs';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { catalogs, t } from '../../i18n/catalog';
import { I18nProvider } from '../../i18n/provider';
import { SUPPORTED_LANGUAGES } from '../../i18n/resolveLanguage';
import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import type { AIChatMessage } from '../../types';
import { AIChatHeader } from './AIChatHeader';

vi.mock('../../i18n/runtime', () => ({
  syncLanguageRuntime: vi.fn(async () => undefined),
}));

vi.mock('@ant-design/icons', () => {
  const Icon = () => <span />;
  return {
    ClearOutlined: Icon,
    CloseOutlined: Icon,
    ExportOutlined: Icon,
    HistoryOutlined: Icon,
    PlusOutlined: Icon,
    RobotOutlined: Icon,
    SettingOutlined: Icon,
    ThunderboltOutlined: Icon,
  };
});

vi.mock('antd', () => {
  const Button = ({ children, icon, onClick }: any) => (
    <button type="button" onClick={onClick}>
      {icon}
      {children}
    </button>
  );
  const Tooltip = ({ title, children }: any) => (
    <span data-tooltip={title}>
      {title}
      {children}
    </span>
  );

  return { Button, Tooltip };
});

const source = readFileSync(new URL('./AIChatHeader.tsx', import.meta.url), 'utf8');

const headerKeys = [
  'ai_chat.header.tooltip.history',
  'ai_chat.header.tooltip.export_markdown',
  'ai_chat.header.tooltip.new_chat_clear',
  'ai_chat.header.tooltip.new_chat',
  'ai_chat.header.tooltip.settings',
  'ai_chat.header.tooltip.close',
  'ai_chat.header.session.connected',
  'ai_chat.header.mode_tabs.aria_label',
  'ai_chat.header.mode.chat',
  'ai_chat.header.mode.insights',
  'ai_chat.header.mode.history',
  'ai_chat.header.action.export',
  'ai_chat.header.export_time',
  'ai_chat.header.export_user',
] as const;

type HeaderKey = (typeof headerKeys)[number];

const placeholderExpectations: Record<HeaderKey, string[]> = {
  'ai_chat.header.tooltip.history': [],
  'ai_chat.header.tooltip.export_markdown': [],
  'ai_chat.header.tooltip.new_chat_clear': [],
  'ai_chat.header.tooltip.new_chat': [],
  'ai_chat.header.tooltip.settings': [],
  'ai_chat.header.tooltip.close': [],
  'ai_chat.header.session.connected': ['title'],
  'ai_chat.header.mode_tabs.aria_label': [],
  'ai_chat.header.mode.chat': [],
  'ai_chat.header.mode.insights': [],
  'ai_chat.header.mode.history': [],
  'ai_chat.header.action.export': [],
  'ai_chat.header.export_time': [],
  'ai_chat.header.export_user': [],
};

const valuesExpectedToDifferFromEnglish = [
  'ai_chat.header.tooltip.history',
  'ai_chat.header.session.connected',
  'ai_chat.header.mode.insights',
  'ai_chat.header.action.export',
  'ai_chat.header.export_time',
] as const;

const getPlaceholders = (value: string): string[] =>
  Array.from(value.matchAll(/\{\{([A-Za-z0-9_]+)\}\}/g), (match) => match[1]).sort();

const textContent = (node: any): string => {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) {
    return node.map((item) => textContent(item)).join('');
  }
  return [
    node.props?.['aria-label'],
    node.props?.['data-tooltip'],
    textContent(node.children || []),
  ].filter(Boolean).join('');
};

const messages: AIChatMessage[] = [
  {
    id: 'm1',
    role: 'user',
    content: 'select * from main.orders where id = 42',
    timestamp: 1,
  },
  {
    id: 'm2',
    role: 'assistant',
    content: 'Use an index on main.orders.id.',
    timestamp: 2,
  },
];

const renderHeader = async (
  overrides: Partial<React.ComponentProps<typeof AIChatHeader>> = {},
): Promise<ReactTestRenderer> => {
  let renderer: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <I18nProvider
        preference="en-US"
        systemLanguages={['en-US']}
        onPreferenceChange={() => {}}
      >
        <AIChatHeader
          darkMode={false}
          mutedColor="#667085"
          textColor="#101828"
          overlayTheme={buildOverlayWorkbenchTheme(false)}
          onHistoryClick={() => {}}
          onClear={() => {}}
          onSettingsClick={() => {}}
          onClose={() => {}}
          messages={messages}
          {...overrides}
        />
      </I18nProvider>,
    );
  });
  return renderer!;
};

describe('AIChatHeader i18n', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps header catalog keys complete with aligned placeholders', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const catalog = catalogs[language] as Record<string, string>;
      for (const key of headerKeys) {
        expect(catalog).toHaveProperty(key);
        expect(catalog[key]).toBeTruthy();
        expect(catalog[key]).not.toBe(key);
        expect(getPlaceholders(catalog[key])).toEqual(placeholderExpectations[key]);
      }
    }

    for (const language of SUPPORTED_LANGUAGES.filter((item) => item !== 'en-US')) {
      const catalog = catalogs[language] as Record<string, string>;
      for (const key of valuesExpectedToDifferFromEnglish) {
        expect(catalog[key]).not.toBe(catalogs['en-US'][key]);
      }
    }
  });

  it('renders English legacy and V2 fixed chrome while preserving raw session titles', async () => {
    const legacy = await renderHeader({ isV2Ui: false, sessionTitle: 'prod/main.orders' });
    const legacyText = textContent(legacy.toJSON());

    expect(legacyText).toContain('Chat history');
    expect(legacyText).toContain('Export as Markdown');
    expect(legacyText).toContain('New chat (clear current)');
    expect(legacyText).toContain('AI settings');
    expect(legacyText).toContain('Close panel');
    expect(legacyText).not.toContain('历史会话');
    expect(legacyText).not.toContain('导出为 Markdown');

    const v2 = await renderHeader({ isV2Ui: true, sessionTitle: 'prod/main.orders' });
    const v2Text = textContent(v2.toJSON());

    expect(v2Text).toContain('prod/main.orders · Connected');
    expect(v2Text).toContain('AI work mode');
    expect(v2Text).toContain('Chat');
    expect(v2Text).toContain('Auto insights');
    expect(v2Text).toContain('History');
    expect(v2Text).toContain('Export');
    expect(v2Text).not.toContain('已连接');
    expect(v2Text).not.toContain('自动洞察');
  });

  it('uses the localized component-level fallback session title', async () => {
    const v2 = await renderHeader({ isV2Ui: true, sessionTitle: undefined });
    const pageText = textContent(v2.toJSON());

    expect(pageText).toContain('New chat · Connected');
    expect(pageText).not.toContain('新对话 · 已连接');
  });

  it('exports Markdown with localized chrome while preserving raw title and message content', async () => {
    const createdBlobs: Blob[] = [];
    const anchor = {
      click: vi.fn(),
      href: '',
      download: '',
    };

    vi.stubGlobal('document', {
      createElement: vi.fn(() => anchor),
      body: {
        getAttribute: vi.fn(() => null),
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
    });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((blob: Blob) => {
        createdBlobs.push(blob);
        return 'blob:markdown';
      }),
      revokeObjectURL: vi.fn(),
    });

    const renderer = await renderHeader({ isV2Ui: true, sessionTitle: 'prod/main.orders' });
    const exportButton = renderer.root.findByProps({ className: 'gn-v2-ai-export-button' });

    await act(async () => {
      exportButton.props.onClick();
    });

    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(anchor.download).toBe('prod-main.orders.md');
    expect(createdBlobs).toHaveLength(1);

    const markdown = await createdBlobs[0].text();
    expect(markdown).toContain('# prod/main.orders');
    expect(markdown).toContain('> Exported at:');
    expect(markdown).toContain('## 👤 You');
    expect(markdown).toContain('## 🤖 GoNavi AI');
    expect(markdown).toContain('select * from main.orders where id = 42');
    expect(markdown).toContain('Use an index on main.orders.id.');
    expect(markdown).not.toContain('导出时间');
  });

  it('keeps source wired to i18n keys instead of fixed Chinese header chrome', () => {
    for (const key of headerKeys) {
      expect(source).toContain(key);
    }
    expect(source).toContain("t('ai_chat.panel.session.default_title')");
    expect(source).not.toContain('历史会话');
    expect(source).not.toContain('导出为 Markdown');
    expect(source).not.toContain('新对话 (清空当前)');
    expect(source).not.toContain('AI 设置');
    expect(source).not.toContain('关闭面板');
    expect(source).not.toContain('AI 工作模式');
    expect(source).not.toContain('自动洞察');
    expect(source).not.toContain('导出时间');
  });

  it('translates only the connected wrapper and keeps title parameter raw', () => {
    expect(t('en-US', 'ai_chat.header.session.connected', { title: 'prod/main.orders' }))
      .toBe('prod/main.orders · Connected');
    expect(t('en-US', 'ai_chat.header.export_time')).toBe('Exported at:');
  });
});
