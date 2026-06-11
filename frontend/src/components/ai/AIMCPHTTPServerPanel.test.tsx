import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import AIMCPHTTPServerPanel from './AIMCPHTTPServerPanel';

describe('AIMCPHTTPServerPanel', () => {
  it('renders the in-app MCP HTTP switch and remote connection details', () => {
    const markup = renderToStaticMarkup(
      <AIMCPHTTPServerPanel
        status={{
          running: true,
          addr: '127.0.0.1:8765',
          path: '/mcp',
          url: 'http://127.0.0.1:8765/mcp',
          schemaOnly: true,
          authorizationHeader: 'Bearer gnv_test',
          message: 'GoNavi MCP HTTP 服务已启动',
        }}
        loading={false}
        cardBg="#fff"
        cardBorder="rgba(0,0,0,0.08)"
        darkMode={false}
        overlayTheme={buildOverlayWorkbenchTheme(false)}
        onToggle={() => {}}
        onCopyURL={() => {}}
        onCopyAuthorization={() => {}}
      />,
    );

    expect(markup).toContain('GoNavi MCP HTTP 服务');
    expect(markup).toContain('已启动');
    expect(markup).toContain('schema-only');
    expect(markup).toContain('http://127.0.0.1:8765/mcp');
    expect(markup).toContain('复制 Authorization');
  });
});
