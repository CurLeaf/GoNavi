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
    expect(markup).toContain('-y / @modelcontextprotocol/server-filesystem / --stdio / server.js');
    expect(markup).toContain('当前固定为 stdio');
    expect(markup).toContain('单次工具发现或调用最多等待多久');
    expect(markup).toContain('必填');
    expect(markup).toContain('可选');
    expect(markup).toContain('固定');
    expect(markup).toContain('直接粘贴完整命令');
    expect(markup).toContain('自动拆分到下方字段');
    expect(markup).toContain('$env:KEY=VALUE;');
    expect(markup).toContain('set KEY=VALUE &amp;&amp;');
    expect(markup).toContain('npx -y package --stdio');
    expect(markup).toContain('-y、@modelcontextprotocol/server-filesystem、--stdio、server.js');
    expect(markup).toContain('每个参数单独录入一个标签');
    expect(markup).toContain('当前命令 node 的参数提示');
    expect(markup).toContain('Node 脚本参数顺序建议');
    expect(markup).toContain('推荐顺序：脚本路径 -&gt; --stdio -&gt; 服务自己的业务参数');
    expect(markup).toContain('必填参数看起来已经齐了');
    expect(markup).toContain('每行一个 KEY=VALUE');
    expect(markup).toContain('没有等号或 key 含空格的行不会保存');
    expect(markup).toContain('不要把 npx -y package --stdio、node server.js --stdio 或 docker run -i image 整串都塞进这里');
    expect(markup).toContain('不要写 export');
    expect(markup).toContain('当前阶段只支持 stdio');
    expect(markup).toContain('实际启动命令预览');
    expect(markup).toContain('配置检查');
    expect(markup).toContain('服务名称为空');
    expect(markup).toContain('建议检查');
    expect(markup).toContain('操作说明');
    expect(markup).toContain('测试工具发现');
    expect(markup).toContain('不会保存配置');
    expect(markup).toContain('测试通过后，上方会显示这条服务实际发现到的工具');
    expect(markup).toContain('默认 20 秒');
    expect(markup).toContain('稍宽松 45 秒');
    expect(markup).toContain('慢启动 60 秒');
    expect(markup).toContain('npx -y @modelcontextprotocol/server-filesystem --stdio');
    expect(markup).toContain('node server.js --stdio');
    expect(markup).toContain('$env:GITHUB_TOKEN=...; uvx mcp-server-github --stdio');
  });

  it('renders actionable validation when command and args are mixed together', () => {
    const markup = renderToStaticMarkup(
      <AIMCPServerCard
        server={{
          id: 'mcp-1',
          name: 'Node MCP',
          transport: 'stdio',
          command: 'node server.js --stdio',
          args: [],
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

    expect(markup).toContain('启动命令可能填成了整行命令');
    expect(markup).toContain('把脚本名、模块名、--stdio 和环境变量拆到命令参数或环境变量里');
    expect(markup).toContain('命令参数可能缺少脚本或模块名');
  });

  it('renders env key purpose hints without requiring users to guess common MCP variables', () => {
    const markup = renderToStaticMarkup(
      <AIMCPServerCard
        server={{
          id: 'mcp-2',
          name: 'GitHub MCP',
          transport: 'stdio',
          command: 'uvx',
          args: ['mcp-server-github', '--stdio'],
          env: {
            GITHUB_TOKEN: '...',
            HTTPS_PROXY: 'http://127.0.0.1:7890',
          },
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

    expect(markup).toContain('环境变量用途提示');
    expect(markup).toContain('只解释 key 的用途和风险，不会显示 value');
    expect(markup).toContain('GITHUB_TOKEN');
    expect(markup).toContain('GitHub Token');
    expect(markup).toContain('HTTPS_PROXY');
    expect(markup).toContain('HTTPS 代理');
    expect(markup).toContain('当前像示例占位值');
    expect(markup).toContain('密钥类变量只保存在本机配置');
  });
});
