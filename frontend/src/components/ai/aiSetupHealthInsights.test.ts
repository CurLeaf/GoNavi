import { describe, expect, it } from 'vitest';

import { buildAISetupHealthSnapshot } from './aiSetupHealthInsights';

describe('buildAISetupHealthSnapshot', () => {
  it('marks the setup as blocked when the active provider is missing critical pieces', () => {
    const snapshot = buildAISetupHealthSnapshot({
      providers: [{
        id: 'provider-1',
        type: 'openai',
        name: 'OpenAI 主账号',
        apiKey: '',
        hasSecret: false,
        baseUrl: '',
        model: '',
        models: [],
        maxTokens: 32000,
        temperature: 0.2,
      }],
      activeProviderId: 'provider-1',
      builtinToolNames: ['inspect_ai_setup_health', 'inspect_ai_runtime'],
      mcpServers: [],
      mcpClientStatuses: [],
      mcpTools: [],
      skills: [],
      dynamicModels: [],
      userPromptSettings: {
        global: '',
        database: '',
        jvm: '',
        jvmDiagnostic: '',
      },
      activeContext: {
        connectionId: 'conn-1',
        dbName: 'crm',
      },
      activeContextItems: [],
    });

    expect(snapshot.status).toBe('blocked');
    expect(snapshot.blockers).toContain('当前活动供应商缺少 API Key / Secret');
    expect(snapshot.blockers).toContain('当前活动供应商缺少接口地址');
    expect(snapshot.blockers).toContain('当前活动供应商还没有选中模型');
    expect(snapshot.nextActions).toContain('补齐当前活动供应商的密钥');
    expect(snapshot.nextActions).toContain('为当前活动供应商选择一个可用模型');
    expect(snapshot.summary.chatReady).toBe(false);
  });

  it('summarizes a ready setup while still surfacing optional next-step guidance', () => {
    const snapshot = buildAISetupHealthSnapshot({
      providers: [{
        id: 'provider-1',
        type: 'openai',
        name: 'OpenAI 主账号',
        apiKey: '',
        hasSecret: true,
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-5.4',
        models: ['gpt-5.4', 'gpt-4.1'],
        maxTokens: 32000,
        temperature: 0.2,
      }],
      activeProviderId: 'provider-1',
      safetyLevel: 'readonly',
      contextLevel: 'with_samples',
      builtinToolNames: ['inspect_ai_setup_health', 'inspect_ai_runtime', 'get_columns'],
      mcpServers: [{
        id: 'server-1',
        name: 'Browser',
        transport: 'stdio',
        command: 'uvx',
        args: ['mcp-server-browser'],
        env: {},
        enabled: true,
        timeoutSeconds: 20,
      }],
      mcpClientStatuses: [{
        client: 'codex',
        displayName: 'Codex',
        installed: true,
        matchesCurrent: true,
        clientDetected: true,
        clientCommand: 'codex',
        clientPath: 'C:/Tools/codex.exe',
        configPath: 'C:/Users/demo/.codex/config.toml',
        command: 'gonavi-mcp-server',
        args: ['stdio'],
        message: '已接入当前 GoNavi MCP',
      }],
      mcpTools: [{
        alias: 'browser_open',
        originalName: 'browser_open',
        serverId: 'server-1',
        serverName: 'Browser',
        title: '打开页面',
        description: '打开页面',
      }],
      skills: [{
        id: 'skill-1',
        name: '结构审查',
        description: '优先核对字段',
        systemPrompt: '先看字段和索引，再给结论。',
        enabled: true,
        scopes: ['database'],
        requiredTools: ['get_columns'],
      }],
      dynamicModels: ['gpt-5.4', 'gpt-4.1'],
      userPromptSettings: {
        global: '回答前先核对上下文。',
        database: '',
        jvm: '',
        jvmDiagnostic: '',
      },
      activeContext: {
        connectionId: 'conn-1',
        dbName: 'crm',
      },
      activeContextItems: [{
        dbName: 'crm',
        tableName: 'orders',
        ddl: 'CREATE TABLE orders (...)',
      }],
    });

    expect(snapshot.status).toBe('ready');
    expect(snapshot.ready).toBe(true);
    expect(snapshot.blockers).toHaveLength(0);
    expect(snapshot.summary.activeProviderName).toBe('OpenAI 主账号');
    expect(snapshot.summary.currentExternalClientCount).toBe(1);
    expect(snapshot.summary.enabledSkillCount).toBe(1);
    expect(snapshot.mcp.message).toContain('当前共配置 1 个 MCP 服务');
    expect(snapshot.guidance.enabledSkillPreview).toContain('结构审查');
  });

  it('includes mcp server configuration validation issues in setup health warnings', () => {
    const snapshot = buildAISetupHealthSnapshot({
      providers: [{
        id: 'provider-1',
        type: 'openai',
        name: 'OpenAI 主账号',
        apiKey: '',
        hasSecret: true,
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-5.4',
        models: ['gpt-5.4'],
        maxTokens: 32000,
        temperature: 0.2,
      }],
      activeProviderId: 'provider-1',
      safetyLevel: 'readonly',
      contextLevel: 'schema_only',
      builtinToolNames: ['inspect_ai_setup_health', 'inspect_mcp_setup'],
      mcpServers: [{
        id: 'server-1',
        name: 'Broken',
        transport: 'stdio',
        command: '',
        args: [],
        env: {},
        enabled: true,
        timeoutSeconds: 1,
      }],
      mcpClientStatuses: [{
        client: 'codex',
        displayName: 'Codex',
        installed: true,
        matchesCurrent: true,
        clientDetected: true,
        clientCommand: 'codex',
        clientPath: 'C:/Tools/codex.exe',
        configPath: 'C:/Users/demo/.codex/config.toml',
        command: 'gonavi-mcp-server',
        args: ['stdio'],
        message: '已接入当前 GoNavi MCP',
      }],
      mcpTools: [],
      skills: [{
        id: 'skill-1',
        name: '结构审查',
        description: '优先核对字段',
        systemPrompt: '先看字段和索引，再给结论。',
        enabled: true,
        scopes: ['database'],
        requiredTools: ['get_columns'],
      }],
      userPromptSettings: {
        global: '回答前先核对上下文。',
        database: '',
        jvm: '',
        jvmDiagnostic: '',
      },
      activeContext: {
        connectionId: 'conn-1',
        dbName: 'crm',
      },
      activeContextItems: [{
        dbName: 'crm',
        tableName: 'orders',
        ddl: 'CREATE TABLE orders (...)',
      }],
    });

    expect(snapshot.status).toBe('needs_attention');
    expect(snapshot.summary.mcpServerConfigurationIssueCount).toBe(2);
    expect(snapshot.summary.mcpServersWithConfigurationErrors).toBe(1);
    expect(snapshot.warnings).toContain('有 1 个 MCP 服务存在启动配置错误，测试和工具发现可能失败');
    expect(snapshot.nextActions).toContain('先修复 MCP 服务配置检查里的错误项，再重新测试服务');
    expect(snapshot.mcp.servers[0].configurationIssues.map((issue) => issue.key)).toContain('command-missing');
  });
});
