import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import AIMCPServerCard from './AIMCPServerCard';
import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

describe('AIMCPServerCard', () => {
  it('renders explicit MCP parameter hints and the actual launch preview for command, args, and env', () => {
    const markup = renderToStaticMarkup(
      <AIMCPServerCard
        server={{
          id: 'mcp-1',
          name: '',
          transport: 'stdio',
          command: 'node',
          args: ['server.js', '--stdio'],
          env: {},
          enabled: true,
          timeoutSeconds: 20,
        }}
        serverTools={[]}
        cardBg="#fff"
        cardBorder="rgba(0,0,0,0.08)"
        inputBg="#fff"
        darkMode={false}
        overlayTheme={buildOverlayWorkbenchTheme(false)}
        loading={false}
        onChange={() => {}}
        onTest={() => {}}
        onSave={() => {}}
        onDelete={() => {}}
      />,
    );

    expect(markup).toContain('启动命令只填可执行程序本身');
    expect(markup).toContain('直接粘贴完整命令');
    expect(markup).toContain('自动拆分到下方字段');
    expect(markup).toContain('每个参数单独录入一个标签');
    expect(markup).toContain('每行一个 KEY=VALUE');
    expect(markup).toContain('没有等号或 key 含空格的行不会保存');
    expect(markup).toContain('当前阶段只支持 stdio');
    expect(markup).toContain('实际启动命令预览');
    expect(markup).toContain('node server.js --stdio');
  });
});
