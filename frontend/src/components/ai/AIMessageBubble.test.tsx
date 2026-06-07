import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AIMessageBubble } from './AIMessageBubble';
import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

describe('AIMessageBubble', () => {
  it('renders thinking, tool progress and raw error actions after extracting status blocks', () => {
    const markup = renderToStaticMarkup(
      <AIMessageBubble
        msg={{
          id: 'assistant-1',
          role: 'assistant',
          content: '这里是诊断结论。',
          thinking: '先看连接，再看表结构。',
          rawError: 'driver timeout',
          timestamp: Date.now(),
          tool_calls: [
            {
              id: 'tool-1',
              type: 'function',
              function: {
                name: 'get_foreign_keys',
                arguments: '{}',
              },
            },
          ],
        }}
        darkMode={false}
        overlayTheme={buildOverlayWorkbenchTheme(false)}
        textColor="#1f2937"
        onEdit={() => {}}
        onRetry={() => {}}
        onDelete={() => {}}
        allMessages={[
          {
            id: 'tool-result-1',
            role: 'tool',
            content: '[{\"fk\":\"orders.customer_id\"}]',
            timestamp: Date.now(),
            tool_call_id: 'tool-1',
            tool_name: 'get_foreign_keys',
          },
        ]}
      />,
    );

    expect(markup).toContain('GoNavi AI');
    expect(markup).toContain('思考过程');
    expect(markup).toContain('梳理外键关系');
    expect(markup).toContain('复制报错原文');
    expect(markup).toContain('数据探针执行完毕');
  });
});
