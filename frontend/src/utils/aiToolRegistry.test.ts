import { describe, expect, it } from 'vitest';

import { BUILTIN_AI_TOOL_INFO, buildAvailableAIChatTools } from './aiToolRegistry';

describe('aiToolRegistry', () => {
  it('registers the ai-runtime inspector as a builtin tool', () => {
    const info = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_ai_runtime');
    expect(info).toBeTruthy();
    expect(info?.desc).toContain('AI 自身运行状态');
    expect(info?.tool.function.description).toContain('当前供应商');
  });

  it('registers the ai-setup-health inspector as a builtin tool', () => {
    const info = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_ai_setup_health');
    expect(info).toBeTruthy();
    expect(info?.desc).toContain('体检当前 AI 配置');
    expect(info?.tool.function.description).toContain('聊天发送前置');
  });

  it('registers the ai-support-bundle inspector as a builtin tool', () => {
    const info = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_ai_support_bundle');
    expect(info).toBeTruthy();
    expect(info?.desc).toContain('排障支持包');
    expect(info?.tool.function.description).toContain('默认不包含数据库密码');
    expect(info?.tool.function.parameters?.properties?.includeMessageContent?.description).toContain('默认 false');
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

  it('registers the mcp-remote-access inspector as a builtin tool', () => {
    const info = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_mcp_remote_access');
    expect(info).toBeTruthy();
    expect(info?.desc).toContain('OpenClaw/Hermans');
    expect(info?.tool.function.description).toContain('Bearer Token');
    expect(info?.tool.function.parameters?.properties?.exposeStrategy?.enum).toContain('cloudflare_tunnel');
  });

  it('registers the mcp-runtime-failure inspector as a builtin tool', () => {
    const info = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_mcp_runtime_failures');
    expect(info).toBeTruthy();
    expect(info?.desc).toContain('启动与调用失败');
    expect(info?.tool.function.description).toContain('工具发现失败');
    expect(info?.tool.function.parameters?.properties?.serverName?.description).toContain('MCP 服务名');
  });

  it('registers the mcp-authoring-guide inspector as a builtin tool', () => {
    const info = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_mcp_authoring_guide');
    expect(info).toBeTruthy();
    expect(info?.desc).toContain('新增 MCP');
    expect(info?.tool.function.description).toContain('command、args、env、timeout');
  });

  it('registers the mcp-draft inspector as a builtin tool', () => {
    const info = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_mcp_draft');
    expect(info).toBeTruthy();
    expect(info?.desc).toContain('MCP 新增草稿');
    expect(info?.tool.function.description).toContain('真实校验器试算');
    expect(info?.tool.function.parameters?.properties?.fullCommand?.description).toContain('一整行 MCP 启动命令');
    expect(info?.tool.function.parameters?.properties?.templateKey?.enum).toContain('docker');
  });

  it('registers the mcp-docker-setup inspector as a builtin tool', () => {
    const info = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_mcp_docker_setup');
    expect(info).toBeTruthy();
    expect(info?.desc).toContain('Docker MCP');
    expect(info?.tool.function.description).toContain('docker run');
    expect(info?.tool.function.parameters?.properties?.includeDisabled?.description).toContain('默认 true');
  });

  it('registers the mcp-tool-schema inspector as a builtin tool', () => {
    const info = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_mcp_tool_schema');
    expect(info).toBeTruthy();
    expect(info?.desc).toContain('MCP 工具参数');
    expect(info?.tool.function.description).toContain('inputSchema');
    expect(info?.tool.function.parameters?.properties?.alias?.description).toContain('真实 alias');
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

  it('registers the ai-upstream-log inspector as a builtin tool', () => {
    const info = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_ai_upstream_logs');
    expect(info).toBeTruthy();
    expect(info?.desc).toContain('上游请求入参');
    expect(info?.tool.function.description).toContain('请求 body 预览');
    expect(info?.tool.function.parameters?.properties?.requestId?.description).toContain('requestId');
    expect(info?.tool.function.parameters?.properties?.includePayloadSummary?.description).toContain('工具数量');
  });

  it('registers the ai-tool-catalog inspector as a builtin tool', () => {
    const info = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_ai_tool_catalog');
    expect(info).toBeTruthy();
    expect(info?.desc).toContain('内置工具目录');
    expect(info?.tool.function.description).toContain('推荐工具调用流程');
    expect(info?.tool.function.parameters?.properties?.keyword?.description).toContain('连接失败');
    expect(info?.tool.function.parameters?.properties?.includeMCPTools?.description).toContain('MCP 工具摘要');
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

  it('registers the external-sql-directory inspector as a builtin tool', () => {
    const info = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_external_sql_directories');
    expect(info).toBeTruthy();
    expect(info?.desc).toContain('外部 SQL 目录');
    expect(info?.tool.function.description).toContain('当前打开的外部 SQL 文件页签');
  });

  it('registers the external-sql-file inspector as a builtin tool', () => {
    const info = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_external_sql_file');
    expect(info).toBeTruthy();
    expect(info?.desc).toContain('外部 SQL 文件内容');
    expect(info?.tool.function.description).toContain('目录中的具体 SQL 脚本');
  });

  it('registers the shortcut inspector as a builtin tool', () => {
    const info = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_shortcuts');
    expect(info).toBeTruthy();
    expect(info?.desc).toContain('快捷键配置');
    expect(info?.tool.function.description).toContain('Win/Mac');
  });

  it('registers the app-log inspector as a builtin tool', () => {
    const info = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_app_logs');
    expect(info).toBeTruthy();
    expect(info?.desc).toContain('应用日志');
    expect(info?.tool.function.description).toContain('gonavi.log');
  });

  it('registers the recent-connection-failure inspector as a builtin tool', () => {
    const info = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_recent_connection_failures');
    expect(info).toBeTruthy();
    expect(info?.desc).toContain('连接失败');
    expect(info?.tool.function.description).toContain('multiStatements');
  });

  it('registers the ai-render-error inspector as a builtin tool', () => {
    const info = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_ai_last_render_error');
    expect(info).toBeTruthy();
    expect(info?.desc).toContain('渲染异常');
    expect(info?.tool.function.description).toContain('消息渲染异常');
  });

  it('registers the ai-message-flow inspector as a builtin tool', () => {
    const info = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_ai_message_flow');
    expect(info).toBeTruthy();
    expect(info?.desc).toContain('消息流');
    expect(info?.tool.function.description).toContain('连续 assistant 消息');
  });

  it('registers the ai-context-budget inspector as a builtin tool', () => {
    const info = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_ai_context_budget');
    expect(info).toBeTruthy();
    expect(info?.desc).toContain('上下文体量');
    expect(info?.tool.function.description).toContain('MCP 工具 schema');
    expect(info?.tool.function.parameters?.properties?.messageLimit?.description).toContain('最大 120');
  });

  it('registers the recent-sql-activity, saved-query, and sql-snippet inspectors as builtin tools', () => {
    const recentActivityTool = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_recent_sql_activity');
    const sqlEditorTransactionTool = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_sql_editor_transaction');
    const sqlRiskTool = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_sql_risk');
    const appLogTool = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_app_logs');
    const connectionFailureTool = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_recent_connection_failures');
    const renderErrorTool = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_ai_last_render_error');
    const messageFlowTool = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_ai_message_flow');
    const savedQueryTool = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_saved_queries');
    const aiSessionsTool = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_ai_sessions');
    const snippetTool = BUILTIN_AI_TOOL_INFO.find((item) => item.name === 'inspect_sql_snippets');

    expect(recentActivityTool?.desc).toContain('最近 SQL 活动');
    expect(recentActivityTool?.tool.function.description).toContain('最近 SQL 活动');
    expect(sqlEditorTransactionTool?.desc).toContain('SQL 编辑器事务');
    expect(sqlEditorTransactionTool?.tool.function.description).toContain('托管事务');
    expect(sqlRiskTool?.desc).toContain('SQL 的执行风险');
    expect(sqlRiskTool?.tool.function.description).toContain('危险点');
    expect(appLogTool?.desc).toContain('GoNavi 应用日志');
    expect(appLogTool?.tool.function.description).toContain('应用日志');
    expect(connectionFailureTool?.desc).toContain('连接失败');
    expect(connectionFailureTool?.tool.function.description).toContain('连接冷却');
    expect(renderErrorTool?.desc).toContain('渲染异常记录');
    expect(renderErrorTool?.tool.function.description).toContain('气泡局部报错');
    expect(messageFlowTool?.desc).toContain('消息流');
    expect(messageFlowTool?.tool.function.description).toContain('工具调用没有闭环');
    expect(savedQueryTool?.desc).toContain('已保存的 SQL 查询');
    expect(savedQueryTool?.tool.function.description).toContain('历史查询');
    expect(aiSessionsTool?.desc).toContain('AI 历史会话');
    expect(aiSessionsTool?.tool.function.description).toContain('之前的 AI 对话');
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
    expect(tools.some((item) => item.function.name === 'inspect_ai_setup_health')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_ai_support_bundle')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_ai_safety')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_ai_providers')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_ai_chat_readiness')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_ai_upstream_logs')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_ai_tool_catalog')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_mcp_setup')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_mcp_remote_access')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_mcp_runtime_failures')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_mcp_authoring_guide')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_mcp_draft')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_mcp_tool_schema')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_ai_guidance')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_current_connection')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_connection_capabilities')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_saved_connections')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_external_sql_directories')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_external_sql_file')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_recent_sql_activity')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_sql_editor_transaction')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_sql_risk')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_app_logs')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_recent_connection_failures')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_ai_last_render_error')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_ai_message_flow')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_ai_context_budget')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_saved_queries')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_ai_sessions')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_sql_snippets')).toBe(true);
    expect(tools.some((item) => item.function.name === 'inspect_shortcuts')).toBe(true);
    expect(tools.some((item) => item.function.name === 'custom_probe')).toBe(true);
  });
});
