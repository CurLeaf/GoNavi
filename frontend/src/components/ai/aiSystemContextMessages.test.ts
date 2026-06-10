import { describe, expect, it } from 'vitest';

import type {
  AISkillConfig,
  AIUserPromptSettings,
  SavedConnection,
  TabData,
} from '../../types';
import { buildAISystemContextMessages } from './aiSystemContextMessages';

const userPromptSettings: AIUserPromptSettings = {
  global: '回答前先核对上下文。',
  database: '生成 SQL 时保持只读优先。',
  jvm: '解释 JVM 资源时先说风险。',
  jvmDiagnostic: '诊断命令必须说明预期信号。',
};

const connections: SavedConnection[] = [
  {
    id: 'conn-1',
    name: '本地开发库',
    config: {
      type: 'mysql',
      host: '127.0.0.1',
      port: 3306,
      user: 'root',
    },
  },
  {
    id: 'jvm-1',
    name: 'JVM 诊断环境',
    config: {
      type: 'jvm',
      host: '10.0.0.8',
      port: 0,
      user: '',
      jvm: {
        environment: 'uat',
        readOnly: true,
        diagnostic: {
          transport: 'agent-bridge',
          allowObserveCommands: true,
          allowTraceCommands: false,
          allowMutatingCommands: false,
        },
      },
    },
  },
];

describe('buildAISystemContextMessages', () => {
  it('adds database workspace inspection guidance plus custom prompts and eligible skills', () => {
    const skills: AISkillConfig[] = [
      {
        id: 'skill-1',
        name: '结构审查',
        description: '优先核对结构',
        systemPrompt: '先看字段和索引，再给结论。',
        enabled: true,
        scopes: ['database'],
        requiredTools: ['inspect_workspace_tabs', 'get_columns'],
      },
    ];

    const messages = buildAISystemContextMessages({
      activeContext: null,
      aiContexts: {},
      connections: [connections[0]],
      tabs: [],
      activeTabId: null,
      availableToolNames: ['inspect_workspace_tabs', 'inspect_app_health', 'inspect_ai_setup_health', 'inspect_ai_runtime', 'inspect_ai_safety', 'inspect_ai_providers', 'inspect_ai_chat_readiness', 'inspect_mcp_setup', 'inspect_mcp_authoring_guide', 'inspect_mcp_draft', 'inspect_mcp_tool_schema', 'inspect_ai_guidance', 'inspect_ai_context', 'inspect_current_connection', 'inspect_connection_capabilities', 'inspect_saved_connections', 'inspect_external_sql_directories', 'inspect_external_sql_file', 'inspect_recent_sql_activity', 'inspect_sql_editor_transaction', 'inspect_sql_risk', 'inspect_recent_connection_failures', 'inspect_app_logs', 'inspect_ai_last_render_error', 'inspect_ai_message_flow', 'inspect_saved_queries', 'inspect_ai_sessions', 'inspect_sql_snippets', 'inspect_shortcuts', 'get_columns'],
      skills,
      userPromptSettings,
    });

    const joined = messages.map((message) => message.content).join('\n');
    expect(joined).toContain('inspect_workspace_tabs 盘点当前工作区');
    expect(joined).toContain('inspect_app_health 获取 AI 配置、应用日志、连接失败、回复气泡渲染异常和工作区页签的全局健康总览');
    expect(joined).toContain('inspect_ai_setup_health 先拿到整体现状');
    expect(joined).toContain('inspect_ai_runtime 读取当前 AI 运行状态');
    expect(joined).toContain('inspect_ai_safety 读取真实安全边界');
    expect(joined).toContain('inspect_ai_providers 读取真实供应商配置');
    expect(joined).toContain('inspect_ai_chat_readiness 读取真实发送前置状态');
    expect(joined).toContain('inspect_mcp_setup 读取真实 MCP 配置');
    expect(joined).toContain('inspect_mcp_authoring_guide 读取真实新增指引和模板');
    expect(joined).toContain('inspect_mcp_draft 返回自动拆分、启动预览、配置错误/告警和 nextActions');
    expect(joined).toContain('inspect_mcp_tool_schema 读取真实 inputSchema');
    expect(joined).toContain('inspect_ai_guidance 读取真实提示与技能配置');
    expect(joined).toContain('inspect_ai_context 读取当前挂载的表结构上下文');
    expect(joined).toContain('inspect_current_connection');
    expect(joined).toContain('inspect_connection_capabilities');
    expect(joined).toContain('inspect_saved_connections');
    expect(joined).toContain('inspect_external_sql_directories');
    expect(joined).toContain('inspect_external_sql_file');
    expect(joined).toContain('inspect_recent_sql_activity');
    expect(joined).toContain('inspect_sql_editor_transaction 读取真实提交设置');
    expect(joined).toContain('inspect_sql_risk');
    expect(joined).toContain('inspect_recent_connection_failures 读取真实连接失败总结');
    expect(joined).toContain('inspect_app_logs 读取真实应用日志尾部');
    expect(joined).toContain('inspect_ai_last_render_error 读取最近一次被隔离的前端渲染异常记录');
    expect(joined).toContain('inspect_ai_message_flow 读取当前会话的真实消息结构');
    expect(joined).toContain('inspect_saved_queries');
    expect(joined).toContain('inspect_ai_sessions');
    expect(joined).toContain('inspect_sql_snippets');
    expect(joined).toContain('inspect_shortcuts 读取真实快捷键配置和平台差异');
    expect(joined).toContain('当前连接');
    expect(joined).toContain('以下是当前用户的自定义补充提示词（全局）');
    expect(joined).toContain('以下是当前用户的自定义补充提示词（数据库会话）');
    expect(joined).toContain('以下是当前启用的 Skill「结构审查」');
  });

  it('builds the JVM diagnostic prompt when the active tab is a diagnostic workspace', () => {
    const tabs: TabData[] = [
      {
        id: 'diag-tab-1',
        title: 'JVM 诊断',
        type: 'jvm-diagnostic',
        connectionId: 'jvm-1',
      },
    ];

    const messages = buildAISystemContextMessages({
      activeContext: null,
      aiContexts: {},
      connections,
      tabs,
      activeTabId: 'diag-tab-1',
      availableToolNames: [],
      skills: [],
      userPromptSettings,
    });

    expect(messages).toHaveLength(3);
    expect(messages[0].content).toContain('你是 GoNavi 的 JVM 诊断助手');
    expect(messages[0].content).toContain('transport 必须填写当前值 agent-bridge');
    expect(messages[1].content).toContain('以下是当前用户的自定义补充提示词（全局）');
    expect(messages[2].content).toContain('以下是当前用户的自定义补充提示词（JVM 诊断）');
  });
});
