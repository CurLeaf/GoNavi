import { readFileSync } from 'node:fs';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/provider';
import type { OverlayWorkbenchTheme } from '../utils/overlayWorkbenchTheme';
import SecurityUpdateIntroModal from './SecurityUpdateIntroModal';

vi.mock('../i18n/runtime', () => ({
  syncLanguageRuntime: vi.fn(async () => undefined),
}));

vi.mock('antd', async () => {
  const React = await import('react');
  return {
    Button: ({
      children,
    }: {
      children?: React.ReactNode;
    }) => React.createElement('button', null, children),
    Modal: ({
      children,
      footer,
      open,
      title,
    }: {
      children?: React.ReactNode;
      footer?: React.ReactNode;
      open?: boolean;
      title?: React.ReactNode;
    }) => (open ? React.createElement('section', null, title, footer, children) : null),
  };
});

vi.mock('@ant-design/icons', async () => {
  const React = await import('react');
  return {
    SafetyCertificateOutlined: () => React.createElement('span', null, 'certificate'),
  };
});

const source = readFileSync(new URL('./SecurityUpdateIntroModal.tsx', import.meta.url), 'utf8');

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

const renderIntroModalText = async () => {
  let renderer: ReturnType<typeof create>;

  await act(async () => {
    renderer = create(
      <I18nProvider
        preference="en-US"
        systemLanguages={['en-US']}
        onPreferenceChange={() => undefined}
      >
        <SecurityUpdateIntroModal
          open
          darkMode={false}
          overlayTheme={overlayTheme}
          onStart={() => undefined}
          onPostpone={() => undefined}
          onViewDetails={() => undefined}
        />
      </I18nProvider>,
    );
  });

  return JSON.stringify(renderer!.toJSON());
};

describe('SecurityUpdateIntroModal i18n source guards', () => {
  it('uses intro i18n keys instead of legacy Chinese shell copy', () => {
    expect(source).toContain('security_update.intro.title');
    expect(source).toContain('security_update.intro.description');
    expect(source).toContain('security_update.intro.action.start_now');
    expect(source).not.toContain('已保存配置安全更新');
    expect(source).not.toContain('使用新的安全存储方式前，需要先完成一次本地配置更新。');
    expect(source).not.toContain('查看详情');
    expect(source).not.toContain('稍后提醒我');
    expect(source).not.toContain('立即更新');
    expect(source).not.toContain('为了让已保存的连接、代理和相关服务配置使用新的安全存储方式');
  });

  it('localizes the intro modal chrome in English', async () => {
    const modalText = await renderIntroModalText();
    expect(modalText).toContain('Saved Configuration Security Update');
    expect(modalText).toContain('Complete a local configuration update before using the new secure storage.');
    expect(modalText).toContain('View Details');
    expect(modalText).toContain('Remind Me Later');
    expect(modalText).toContain('Update Now');
    expect(modalText).toContain('To move saved connections, proxy settings, and related service configuration to the new secure storage');
  });
});
