import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import AIMCPHTTPServerPanel from './AIMCPHTTPServerPanel';

const findElement = (node: any, predicate: (element: any) => boolean): any => {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return null;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const match = findElement(item, predicate);
      if (match) {
        return match;
      }
    }
    return null;
  }
  if (predicate(node)) {
    return node;
  }
  return findElement(node.props?.children, predicate);
};

const buildPanelProps = () => ({
  status: {
    running: true,
    addr: '127.0.0.1:8765',
    path: '/mcp',
    url: 'http://127.0.0.1:8765/mcp',
    schemaOnly: true,
    authorizationHeader: 'Bearer gnv_test',
    message: 'GoNavi MCP HTTP 服务已启动',
  },
  draft: {
    addr: '127.0.0.1:8765',
    path: '/mcp',
    authorizationHeader: 'Bearer gnv_test',
  },
  loading: false,
  cardBg: '#fff',
  cardBorder: 'rgba(0,0,0,0.08)',
  darkMode: false,
  overlayTheme: buildOverlayWorkbenchTheme(false),
  onDraftChange: () => {},
  onToggle: () => {},
  onCopyURL: () => {},
  onCopyAuthorization: () => {},
});

describe('AIMCPHTTPServerPanel', () => {
  it('renders the in-app MCP HTTP switch and remote connection details', () => {
    const markup = renderToStaticMarkup(
      <AIMCPHTTPServerPanel {...buildPanelProps()} />,
    );

    expect(markup).toContain('GoNavi MCP HTTP 服务');
    expect(markup).toContain('已启动');
    expect(markup).toContain('schema-only');
    expect(markup).toContain('监听地址 / 端口');
    expect(markup).toContain('Authorization');
    expect(markup).toContain('127.0.0.1:8765');
    expect(markup).toContain('http://127.0.0.1:8765/mcp');
    expect(markup).toContain('复制 Authorization');
  });

  it('keeps Authorization read-only but revealable while running', () => {
    const tree = AIMCPHTTPServerPanel(buildPanelProps());
    const passwordInput = findElement(
      tree,
      (node) => node.props?.placeholder === 'Bearer gnv_xxx（留空自动生成）',
    );

    expect(passwordInput).toBeTruthy();
    expect(passwordInput.props.disabled).toBe(false);
    expect(passwordInput.props.readOnly).toBe(true);
  });
});
