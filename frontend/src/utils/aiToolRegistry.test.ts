import { describe, expect, it } from 'vitest';

import { BUILTIN_AI_TOOL_INFO, buildAvailableAIChatTools } from './aiToolRegistry';

describe('aiToolRegistry', () => {
  it('registers the ai-runtime inspector as a builtin tool', () => {
    const info = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_ai_runtime');
    expect(info).toBeTruthy();
    expect(info?.desc).toContain('AI 自身运行状态');
    expect(info?.tool.function.description).toContain('当前供应商');
  });

  it('registers the mcp-setup inspector as a builtin tool', () => {
    const info = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_mcp_setup');
    expect(info).toBeTruthy();
    expect(info?.desc).toContain('MCP 配置');
    expect(info?.tool.function.description).toContain('外部客户端');
  });

  it('registers the current-connection inspector as a builtin tool', () => {
    const info = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_current_connection');
    expect(info).toBeTruthy();
    expect(info?.desc).toContain('当前活动连接');
    expect(info?.tool.function.description).toContain('SSH/代理/HTTP 隧道状态');
  });

  it('registers the saved-query and sql-snippet inspectors as builtin tools', () => {
    const savedQueryTool = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_saved_queries');
    const snippetTool = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_sql_snippets');

    expect(savedQueryTool?.desc).toContain('已保存的 SQL 查询');
    expect(savedQueryTool?.tool.function.description).toContain('历史查询');
    expect(snippetTool?.desc).toContain('SQL 片段模板');
    expect(snippetTool?.tool.function.description).toContain('片段模板');
  });

  it('keeps builtin tools and MCP tools in the unified runtime tool chain', () => {
    const tools = buildAvailableAIChatTools([{
      alias: 'custom_probe',
      originalName: 'custom_probe',
      serverId: 'server-1',
      serverName: 'demo',
      title: '自定义探针',
      description: '读取额外环境信息',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
    }]);

    expect(tools.some((item) => item.function.name === 'inspect_ai_runtime')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_mcp_setup')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_current_connection')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_saved_queries')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_sql_snippets')).toBe(true);
    expect(tools.some((item) => item.function.name === 'custom_probe')).toBe(true);
  });
});
