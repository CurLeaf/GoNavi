import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import AIMCPQuickAddServerPanel from './AIMCPQuickAddServerPanel';

vi.mock('antd', async () => {
  const React = await import('react');
  return {
    Input: {
      TextArea: (props: any) => React.createElement('textarea', props),
    },
    Button: ({ icon, children, ...props }: any) => React.createElement('button', props, icon, children),
  };
});

vi.mock('@ant-design/icons', async () => {
  const React = await import('react');
  return {
    PlusOutlined: () => React.createElement('span', { 'data-testid': 'plus-icon' }),
  };
});

const buildQuickAddPanel = (onAddServer = () => {}) => (
  <AIMCPQuickAddServerPanel
    cardBg="#fff"
    cardBorder="rgba(0,0,0,0.08)"
    inputBg="#fff"
    darkMode={false}
    overlayTheme={buildOverlayWorkbenchTheme(false)}
    onAddServer={onAddServer}
  />
);

const flattenRendererText = (node: any): string => {
  if (node == null || typeof node === 'boolean') {
    return '';
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map((item) => flattenRendererText(item)).join('');
  }
  return flattenRendererText(node.children ?? node.props?.children);
};

const findTemplateButton = (renderer: ReactTestRenderer, label: string) => {
  const matches = renderer.root.findAll(
    (node) => node.type === 'button' && flattenRendererText(node).includes(label),
  );
  expect(matches.length).toBe(1);
  return matches[0];
};

describe('AIMCPQuickAddServerPanel', () => {
  it('renders a top-level full-command entry for creating MCP drafts', () => {
    const markup = renderToStaticMarkup(
      buildQuickAddPanel(),
    );

    expect(markup).toContain('一行命令快速新增');
    expect(markup).toContain('先选最接近的模板');
    expect(markup).toContain('command、args 和 env');
    expect(markup).toContain('常见启动方式模板');
    expect(markup).toContain('npx 包');
    expect(markup).toContain('npx -y @modelcontextprotocol/server-filesystem --stdio');
    expect(markup).toContain('Docker 镜像');
    expect(markup).toContain('docker run --rm -i mcp/server-fetch:latest');
    expect(markup).toContain('粘贴完整命令');
    expect(markup).toContain('$env:GITHUB_TOKEN=...; uvx mcp-server-github --stdio');
    expect(markup).toContain('解析并新增草稿');
  });

  it('seeds a new npx MCP draft from the quick-add template', async () => {
    const onAddServer = vi.fn();
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = create(buildQuickAddPanel(onAddServer));
    });

    findTemplateButton(renderer, 'npx 包').props.onClick();

    expect(onAddServer).toHaveBeenCalledWith(expect.objectContaining({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '--stdio'],
    }));
  });

  it('seeds a docker MCP draft from the quick-add template', async () => {
    const onAddServer = vi.fn();
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = create(buildQuickAddPanel(onAddServer));
    });

    findTemplateButton(renderer, 'Docker 镜像').props.onClick();

    expect(onAddServer).toHaveBeenCalledWith(expect.objectContaining({
      command: 'docker',
      args: ['run', '--rm', '-i', 'mcp/server-fetch:latest'],
      timeoutSeconds: 45,
    }));
  });
});
