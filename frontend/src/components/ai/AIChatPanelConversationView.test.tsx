import React, { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import AIChatPanelConversationView from './AIChatPanelConversationView';
import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

describe('AIChatPanelConversationView', () => {
  it('renders the welcome state when the chat mode has no messages', () => {
    const markup = renderToStaticMarkup(
      <AIChatPanelConversationView
        mode="chat"
        messages={[]}
        darkMode={false}
        overlayTheme={buildOverlayWorkbenchTheme(false)}
        textColor="#0f172a"
        mutedColor="#64748b"
        quickActionBg="rgba(255,255,255,0.8)"
        quickActionBorder="1px solid rgba(0,0,0,0.06)"
        showScrollBottom={false}
        contextTableNames={['sales.orders']}
        isV2Ui
        insights={[]}
        sessions={[]}
        activeSessionId="session-1"
        activeConnectionId={undefined}
        activeConnectionConfig={undefined}
        activeDbName={undefined}
        messagesEndRef={createRef<HTMLDivElement>()}
        onScrollMessages={() => {}}
        onQuickAction={() => {}}
        onSelectSession={() => {}}
        onEditMessage={() => {}}
        onRetryMessage={() => {}}
        onDeleteMessage={() => {}}
        onMessageRenderError={() => {}}
        onScrollBottom={() => {}}
      />,
    );

    expect(markup).toContain('你好，我是 GoNavi AI');
    expect(markup).toContain('已自动关联');
    expect(markup).toContain('生成 SQL');
  });

  it('renders inline history mode content and the scroll-bottom affordance', () => {
    const markup = renderToStaticMarkup(
      <AIChatPanelConversationView
        mode="history"
        messages={[]}
        darkMode={false}
        overlayTheme={buildOverlayWorkbenchTheme(false)}
        textColor="#0f172a"
        mutedColor="#64748b"
        quickActionBg="rgba(255,255,255,0.8)"
        quickActionBorder="1px solid rgba(0,0,0,0.06)"
        showScrollBottom
        contextTableNames={[]}
        isV2Ui
        insights={[]}
        sessions={[
          { id: 'session-1', title: '当前会话', updatedAt: 1710000000000 },
          { id: 'session-2', title: '旧会话', updatedAt: 1700000000000 },
        ]}
        activeSessionId="session-1"
        activeConnectionId={undefined}
        activeConnectionConfig={undefined}
        activeDbName={undefined}
        messagesEndRef={createRef<HTMLDivElement>()}
        onScrollMessages={() => {}}
        onQuickAction={() => {}}
        onSelectSession={() => {}}
        onEditMessage={() => {}}
        onRetryMessage={() => {}}
        onDeleteMessage={() => {}}
        onMessageRenderError={() => {}}
        onScrollBottom={() => {}}
      />,
    );

    expect(markup).toContain('gn-v2-ai-history-card is-active');
    expect(markup).toContain('当前会话');
    expect(markup).toContain('旧会话');
    expect(markup).toContain('down');
  });
});
