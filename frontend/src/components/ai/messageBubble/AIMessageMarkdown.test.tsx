import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import { AIMessageMarkdown } from './AIMessageMarkdown';
import { buildOverlayWorkbenchTheme } from '../../../utils/overlayWorkbenchTheme';

vi.mock('antd', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  message: { error: vi.fn() },
}));

vi.mock('@ant-design/icons', () => ({
  CheckOutlined: () => null,
  CopyOutlined: () => null,
  PlayCircleOutlined: () => null,
}));

describe('AIMessageMarkdown', () => {
  it('keeps SQL code block actions after extracting markdown rendering', () => {
    const markup = renderToStaticMarkup(
      <AIMessageMarkdown
        content={'```sql\nSELECT * FROM users;\n```'}
        darkMode={false}
        overlayTheme={buildOverlayWorkbenchTheme(false)}
        activeConnectionConfig={{ type: 'mysql', driver: 'mysql' }}
        activeConnectionId="conn-1"
        activeDbName="demo"
      />,
    );

    expect(markup).toContain('复制代码');
    expect(markup).toContain('插入');
    expect(markup).toContain('执行');
    expect(markup).toContain('预览');
  });

  it('can switch between fenced code renderers without changing hook order', () => {
    const overlayTheme = buildOverlayWorkbenchTheme(false);
    let renderer: ReactTestRenderer | undefined;

    try {
      expect(() => {
        act(() => {
          renderer = create(
            <AIMessageMarkdown
              content={'```python\nprint("hello")\n```'}
              darkMode={false}
              overlayTheme={overlayTheme}
            />,
          );
        });
        act(() => {
          renderer?.update(
            <AIMessageMarkdown
              content={'```mermaid\ngraph TD;\nA-->B;\n```'}
              darkMode={false}
              overlayTheme={overlayTheme}
            />,
          );
        });
        act(() => {
          renderer?.update(
            <AIMessageMarkdown
              content={'普通 `inline` 代码'}
              darkMode={false}
              overlayTheme={overlayTheme}
            />,
          );
        });
      }).not.toThrow();
    } finally {
      act(() => {
        renderer?.unmount();
      });
    }
  });
});
