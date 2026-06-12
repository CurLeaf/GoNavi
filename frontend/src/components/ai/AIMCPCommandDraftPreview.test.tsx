import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import AIMCPCommandDraftPreview from './AIMCPCommandDraftPreview';
import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

describe('AIMCPCommandDraftPreview', () => {
  it('renders parsed env keys, command, and args so users can verify the split result before applying', () => {
    const markup = renderToStaticMarkup(
      <AIMCPCommandDraftPreview
        draft={{
          command: 'python',
          args: ['-m', 'your_mcp_server', '--stdio'],
          env: {
            OPENAI_API_KEY: '***',
            HTTP_PROXY: 'http://127.0.0.1:7890',
          },
        }}
        darkMode={false}
        overlayTheme={buildOverlayWorkbenchTheme(false)}
        cardBorder="rgba(0,0,0,0.08)"
      />,
    );

    expect(markup).toContain('自动拆分预览');
    expect(markup).toContain('环境变量');
    expect(markup).toContain('OPENAI_API_KEY');
    expect(markup).toContain('HTTP_PROXY');
    expect(markup).toContain('启动命令');
    expect(markup).toContain('python');
    expect(markup).toContain('命令参数');
    expect(markup).toContain('your_mcp_server');
    expect(markup).toContain('--stdio');
  });
});
