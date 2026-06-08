import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import AIMCPServerCard from './AIMCPServerCard';
import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

describe('AIMCPServerCard', () => {
  it('renders explicit MCP parameter hints, required badges, and the actual launch preview for command, args, and env', () => {
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
    expect(markup).toContain('推荐填写顺序');
    expect(markup).toContain('小白用户可以按这个顺序填');
    expect(markup).toContain('字段速查');
    expect(markup).toContain('保存后显示给你和 AI 看的名字');
    expect(markup).toContain('示例值：');
    expect(markup).toContain('Filesystem / Browser / GitHub');
    expect(markup).toContain('server.js / --stdio / -m / your_mcp_server');
    expect(markup).toContain('当前固定为 stdio');
    expect(markup).toContain('单次工具发现或调用最多等待多久');
    expect(markup).toContain('必填');
    expect(markup).toContain('可选');
    expect(markup).toContain('固定');
    expect(markup).toContain('直接粘贴完整命令');
    expect(markup).toContain('自动拆分到下方字段');
    expect(markup).toContain('每个参数单独录入一个标签');
    expect(markup).toContain('每行一个 KEY=VALUE');
    expect(markup).toContain('没有等号或 key 含空格的行不会保存');
    expect(markup).toContain('不要把 node server.js --stdio 整串都塞进这里');
    expect(markup).toContain('不要写 export');
    expect(markup).toContain('当前阶段只支持 stdio');
    expect(markup).toContain('实际启动命令预览');
    expect(markup).toContain('操作说明');
    expect(markup).toContain('测试工具发现');
    expect(markup).toContain('不会保存配置');
    expect(markup).toContain('测试通过后，上方会显示这条服务实际发现到的工具');
    expect(markup).toContain('默认 20 秒');
    expect(markup).toContain('稍宽松 45 秒');
    expect(markup).toContain('慢启动 60 秒');
    expect(markup).toContain('node server.js --stdio');
    expect(markup).toContain('OPENAI_API_KEY=... uvx mcp-server-fetch --stdio');
  });
});
