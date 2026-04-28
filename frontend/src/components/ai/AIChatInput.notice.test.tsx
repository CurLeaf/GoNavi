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
}));

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
        }}
        onModelChange={() => {}}
        onFetchModels={() => {}}
        textareaRef={React.createRef<HTMLTextAreaElement>()}
        darkMode={false}
        textColor="#162033"
        mutedColor="rgba(16,24,40,0.55)"
        overlayTheme={buildOverlayWorkbenchTheme(false)}
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
        composerNotice={null}
        onModelChange={() => {}}
        onFetchModels={() => {}}
        textareaRef={React.createRef<HTMLTextAreaElement>()}
        darkMode={false}
        textColor="#162033"
        mutedColor="rgba(16,24,40,0.55)"
        overlayTheme={buildOverlayWorkbenchTheme(false)}
      />
    );

    expect(markup).toContain('Meta+Enter 发送');
  });
});
