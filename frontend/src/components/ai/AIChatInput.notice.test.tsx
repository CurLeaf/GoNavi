import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AIChatInput } from './AIChatInput';
import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

vi.mock('../../store', () => ({
  useStore: (selector: (state: any) => any) => selector({
    aiContexts: {},
    addAIContext: vi.fn(),
    removeAIContext: vi.fn(),
  }),
}));

vi.mock('../../../wailsjs/go/app/App', () => ({
  DBGetTables: vi.fn(),
  DBShowCreateTable: vi.fn(),
  DBGetDatabases: vi.fn(),
  DBGetColumns: vi.fn(),
}));

const renderAIChatInput = (overrides: Partial<React.ComponentProps<typeof AIChatInput>> = {}) => renderToStaticMarkup(
  <AIChatInput
    input=""
    setInput={() => {}}
    draftImages={[]}
    setDraftImages={() => {}}
    sending={false}
    onSend={() => {}}
    onStop={() => {}}
    handleKeyDown={() => {}}
    activeConnName=""
    activeContext={null}
    activeProvider={{ model: '', models: [] }}
    dynamicModels={[]}
    loadingModels={false}
    sendShortcutBinding={{ combo: 'Enter', enabled: true }}
    composerNotice={null}
    onComposerNoticeAction={() => {}}
    onModelChange={() => {}}
    onFetchModels={() => {}}
    textareaRef={React.createRef<HTMLTextAreaElement>()}
    darkMode={false}
    textColor="#162033"
    mutedColor="rgba(16,24,40,0.55)"
    overlayTheme={buildOverlayWorkbenchTheme(false)}
    isV2Ui
    {...overrides}
  />
);

describe('AIChatInput notice layout', () => {
  it('renders the composer notice above the input editor', () => {
    const markup = renderToStaticMarkup(
      <AIChatInput
        input=""
        setInput={() => {}}
        draftImages={[]}
        setDraftImages={() => {}}
        sending={false}
        onSend={() => {}}
        onStop={() => {}}
        handleKeyDown={() => {}}
        activeConnName=""
        activeContext={null}
        activeProvider={{ model: '', models: [] }}
        dynamicModels={[]}
        loadingModels={false}
        sendShortcutBinding={{ combo: 'Enter', enabled: true }}
        composerNotice={{
          tone: 'error',
          title: '模型列表加载失败',
          description: '请检查供应商入口和 API Key。',
          action: {
            key: 'reload-models',
            label: '重新加载模型',
          },
        }}
        onComposerNoticeAction={() => {}}
        onModelChange={() => {}}
        onFetchModels={() => {}}
        textareaRef={React.createRef<HTMLTextAreaElement>()}
        darkMode={false}
        textColor="#162033"
        mutedColor="rgba(16,24,40,0.55)"
        overlayTheme={buildOverlayWorkbenchTheme(false)}
        isV2Ui
      />
    );

    const noticeIndex = markup.indexOf('data-ai-chat-composer-notice="true"');
    const inputIndex = markup.indexOf('data-ai-chat-composer-input="true"');

    expect(noticeIndex).toBeGreaterThanOrEqual(0);
    expect(inputIndex).toBeGreaterThanOrEqual(0);
    expect(noticeIndex).toBeLessThan(inputIndex);
  });

  it('renders the selected send shortcut in the composer placeholder', () => {
    const markup = renderToStaticMarkup(
      <AIChatInput
        input=""
        setInput={() => {}}
        draftImages={[]}
        setDraftImages={() => {}}
        sending={false}
        onSend={() => {}}
        onStop={() => {}}
        handleKeyDown={() => {}}
        activeConnName=""
        activeContext={null}
        activeProvider={{ model: '', models: [] }}
        dynamicModels={[]}
        loadingModels={false}
        sendShortcutBinding={{ combo: 'Meta+Enter', enabled: true }}
        shortcutPlatform="mac"
        composerNotice={null}
        onComposerNoticeAction={() => {}}
        onModelChange={() => {}}
        onFetchModels={() => {}}
        textareaRef={React.createRef<HTMLTextAreaElement>()}
        darkMode={false}
        textColor="#162033"
        mutedColor="rgba(16,24,40,0.55)"
        overlayTheme={buildOverlayWorkbenchTheme(false)}
        isV2Ui
      />
    );

    expect(markup).toContain('⌘↵ 发送');
  });

  it('renders the model selector without the filled select variant', () => {
    const markup = renderToStaticMarkup(
      <AIChatInput
        input=""
        setInput={() => {}}
        draftImages={[]}
        setDraftImages={() => {}}
        sending={false}
        onSend={() => {}}
        onStop={() => {}}
        handleKeyDown={() => {}}
        activeConnName=""
        activeContext={null}
        activeProvider={{ model: 'gpt-5.5', models: ['gpt-5.5'] }}
        dynamicModels={[]}
        loadingModels={false}
        sendShortcutBinding={{ combo: 'Enter', enabled: true }}
        composerNotice={null}
        onComposerNoticeAction={() => {}}
        onModelChange={() => {}}
        onFetchModels={() => {}}
        textareaRef={React.createRef<HTMLTextAreaElement>()}
        darkMode={false}
        textColor="#162033"
        mutedColor="rgba(16,24,40,0.55)"
        overlayTheme={buildOverlayWorkbenchTheme(false)}
        isV2Ui
      />
    );

    expect(markup).toContain('gn-v2-ai-model-select');
    expect(markup).not.toContain('ant-select-filled');
    expect(markup).not.toContain('ant-select-show-search');
  });

  it('renders an enabled type-safe send button when text is present', () => {
    const markup = renderAIChatInput({ input: 'select 1' });
    const sendButton = markup.match(/<button[^>]*class="ai-chat-send-btn gn-v2-ai-send"[^>]*>/)?.[0] || '';

    expect(sendButton).toContain('type="button"');
    expect(sendButton).toContain('title="发送"');
    expect(sendButton).not.toContain('disabled');
  });

  it('keeps the legacy composer free of v2-only layout classes by default', () => {
    const markup = renderAIChatInput({ isV2Ui: false, input: 'select 1' });

    expect(markup).toContain('class="ai-chat-input-area"');
    expect(markup).toContain('class="ai-chat-send-btn"');
    expect(markup).not.toContain('gn-v2-ai-composer');
    expect(markup).not.toContain('gn-v2-ai-model-select');
    expect(markup).not.toContain('gn-v2-ai-send');
  });

  it('renders an actionable composer notice button when the notice provides an action', () => {
    const markup = renderAIChatInput({
      composerNotice: {
        tone: 'warning',
        title: '还没有可用供应商',
        description: '先在 AI 设置里添加并启用一个模型供应商。',
        action: {
          key: 'open-settings',
          label: '打开 AI 设置',
        },
      },
      onComposerNoticeAction: () => {},
    });

    expect(markup).toContain('打开 AI 设置');
  });
});
