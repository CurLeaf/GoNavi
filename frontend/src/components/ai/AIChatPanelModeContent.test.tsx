import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import AIChatPanelModeContent from './AIChatPanelModeContent';

describe('AIChatPanelModeContent', () => {
  it('renders insight cards for the automatic insights mode', () => {
    const markup = renderToStaticMarkup(
      <AIChatPanelModeContent
        mode="insights"
        insights={[
          {
            tone: 'info',
            title: '已关联 3 张表',
            body: '当前对话会带上 orders、customers、products 的结构上下文。',
          },
          {
            tone: 'warn',
            title: '2 条最近查询失败',
            body: 'Unknown column foo',
          },
        ]}
        sessions={[]}
        activeSessionId="session-1"
        onSelectSession={() => {}}
      />,
    );

    expect(markup).toContain('gn-v2-ai-insight-card tone-info');
    expect(markup).toContain('已关联 3 张表');
    expect(markup).toContain('2 条最近查询失败');
    expect(markup).toContain('Unknown column foo');
  });

  it('renders an empty state when there is no inline history session', () => {
    const markup = renderToStaticMarkup(
      <AIChatPanelModeContent
        mode="history"
        insights={[]}
        sessions={[]}
        activeSessionId="session-1"
        onSelectSession={() => {}}
      />,
    );

    expect(markup).toContain('gn-v2-ai-empty-note');
    expect(markup).toContain('暂无历史会话');
  });

  it('marks the active inline history session', () => {
    const markup = renderToStaticMarkup(
      <AIChatPanelModeContent
        mode="history"
        insights={[]}
        sessions={[
          { id: 'session-1', title: '当前会话', updatedAt: 1710000000000 },
          { id: 'session-2', title: '旧会话', updatedAt: 1700000000000 },
        ]}
        activeSessionId="session-1"
        onSelectSession={() => {}}
      />,
    );

    expect(markup).toContain('gn-v2-ai-history-card is-active');
    expect(markup).toContain('当前会话');
    expect(markup).toContain('旧会话');
  });
});
