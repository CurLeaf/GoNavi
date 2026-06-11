import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import AIMCPArgumentHints from './AIMCPArgumentHints';

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

describe('AIMCPArgumentHints', () => {
  it('can append missing required args from command-specific hints', async () => {
    const onArgsChange = vi.fn();
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        <AIMCPArgumentHints
          command="docker"
          args={['run', '--rm']}
          onArgsChange={onArgsChange}
          cardBorder="rgba(0,0,0,0.08)"
          darkMode={false}
          overlayTheme={buildOverlayWorkbenchTheme(false)}
        />,
      );
    });

    const buttons = renderer.root.findAll(
      (node) => node.type === 'button' && flattenRendererText(node).includes('一键补齐缺失必填参数'),
    );

    expect(buttons.length).toBe(1);
    expect(flattenRendererText(buttons[0])).toContain('-i / mcp/server-fetch:latest');

    await act(async () => {
      buttons[0].props.onClick();
    });

    expect(onArgsChange).toHaveBeenCalledWith(['run', '--rm', '-i', 'mcp/server-fetch:latest']);
  });

  it('can split a full command line pasted into the command field', async () => {
    const onArgsChange = vi.fn();
    const onCommandArgsChange = vi.fn();
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        <AIMCPArgumentHints
          command="docker run --rm mcp/server-fetch:latest"
          args={['--env', 'API_KEY=secret']}
          onArgsChange={onArgsChange}
          onCommandArgsChange={onCommandArgsChange}
          cardBorder="rgba(0,0,0,0.08)"
          darkMode={false}
          overlayTheme={buildOverlayWorkbenchTheme(false)}
        />,
      );
    });

    const text = flattenRendererText(renderer.toJSON());
    expect(text).toContain('启动命令字段里还包含 3 个参数');
    expect(text).not.toContain('一键补齐缺失必填参数');

    const buttons = renderer.root.findAll(
      (node) => node.type === 'button' && flattenRendererText(node).includes('一键拆分启动命令字段'),
    );

    expect(buttons.length).toBe(1);

    await act(async () => {
      buttons[0].props.onClick();
    });

    expect(onArgsChange).not.toHaveBeenCalled();
    expect(onCommandArgsChange).toHaveBeenCalledWith('docker', [
      'run',
      '--rm',
      'mcp/server-fetch:latest',
      '--env',
      'API_KEY=secret',
    ]);
  });
});
