import { describe, expect, it } from 'vitest';

import { BUILTIN_AI_TOOL_INFO, buildAvailableAIChatTools } from './aiToolRegistry';

describe('aiToolRegistry', () => {
  it('registers the ai-runtime inspector as a builtin tool', () => {
    const info = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_ai_runtime');
    expect(info).toBeTruthy();
    expect(info?.desc).toContain('AI 自身运行状态');
    expect(info?.tool.function.description).toContain('当前供应商');
  });

  it('registers the ai-safety inspector as a builtin tool', () => {
    const info = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_ai_safety');
    expect(info).toBeTruthy();
    expect(info?.desc).toContain('写入安全边界');
    expect(info?.tool.function.description).toContain('allowMutating');
  });

  it('registers the mcp-setup inspector as a builtin tool', () => {
    const info = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_mcp_setup');
    expect(info).toBeTruthy();
    expect(info?.desc).toContain('MCP 配置');
    expect(info?.tool.function.description).toContain('外部客户端');
  });

  it('registers the ai-provider inspector as a builtin tool', () => {
    const info = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_ai_providers');
    expect(info).toBeTruthy();
    expect(info?.desc).toContain('供应商与模型配置');
    expect(info?.tool.function.description).toContain('模型列表为空');
  });

  it('registers the chat-readiness inspector as a builtin tool', () => {
    const info = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_ai_chat_readiness');
    expect(info).toBeTruthy();
    expect(info?.desc).toContain('发送条件');
    expect(info?.tool.function.description).toContain('当前 AI 聊天输入区');
  });

  it('registers the ai-guidance inspector as a builtin tool', () => {
    const info = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_ai_guidance');
    expect(info).toBeTruthy();
    expect(info?.desc).toContain('提示词与 Skills');
    expect(info?.tool.function.description).toContain('自定义提示词');
  });

  it('registers the current-connection inspector as a builtin tool', () => {
    const info = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_current_connection');
    expect(info).toBeTruthy();
    expect(info?.desc).toContain('当前活动连接');
    expect(info?.tool.function.description).toContain('SSH/代理/HTTP 隧道状态');
  });

  it('registers the connection-capability inspector as a builtin tool', () => {
    const info = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_connection_capabilities');
    expect(info).toBeTruthy();
    expect(info?.desc).toContain('前端能力');
    expect(info?.tool.function.description).toContain('结果是否强制只读');
  });

  it('registers the saved-connections inspector as a builtin tool', () => {
    const info = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_saved_connections');
    expect(info).toBeTruthy();
    expect(info?.desc).toContain('已保存连接');
    expect(info?.tool.function.description).toContain('本地已保存连接清单');
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
    expect(tools.some((item) => item.function.name === 'inspect_ai_safety')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_ai_providers')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_ai_chat_readiness')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_mcp_setup')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_ai_guidance')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_current_connection')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_connection_capabilities')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_saved_connections')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_saved_queries')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_sql_snippets')).toBe(true);
    expect(tools.some((item) => item.function.name === 'custom_probe')).toBe(true);
  });
});
