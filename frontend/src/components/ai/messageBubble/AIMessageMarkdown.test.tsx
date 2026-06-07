import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AIMessageMarkdown } from './AIMessageMarkdown';
import { buildOverlayWorkbenchTheme } from '../../../utils/overlayWorkbenchTheme';

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
});
