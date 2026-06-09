import { describe, expect, it } from 'vitest';

import { buildAIAppHealthSnapshot } from './aiAppHealthInsights';

describe('buildAIAppHealthSnapshot', () => {
  it('marks the app health as degraded when logs and connection failures show runtime problems', () => {
    const snapshot = buildAIAppHealthSnapshot({
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
      builtinToolNames: ['inspect_app_health', 'inspect_ai_setup_health', 'inspect_app_logs'],
      mcpServers: [{
        id: 'server-1',
        name: 'GoNavi MCP',
        transport: 'stdio',
        command: 'gonavi-mcp-server',
        args: ['stdio'],
        env: {},
        enabled: true,
        timeoutSeconds: 20,
      }],
      mcpClientStatuses: [],
      mcpTools: [],
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
      aiContexts: {
        'conn-1:crm': [],
      },
      connections: [{
        id: 'conn-1',
        name: '主库',
        config: {
          type: 'mysql',
          host: '127.0.0.1',
          port: 3306,
          user: 'root',
        },
      }],
      tabs: [{
        id: 'query-1',
        title: '订单查询',
        type: 'query',
        connectionId: 'conn-1',
        dbName: 'crm',
        query: 'select * from orders',
      }],
      activeTabId: 'query-1',
      appLogReadResult: {
        success: true,
        data: {
          logPath: 'C:/Users/demo/.GoNavi/Logs/gonavi.log',
          requestedLineLimit: 120,
          lines: [
            '2026/06/10 09:00:00.000000 [INFO] started',
            '2026/06/10 09:00:01.000000 [ERROR] MCP server boot failed',
          ],
        },
      },
      connectionFailureReadResult: {
        success: true,
        data: {
          logPath: 'C:/Users/demo/.GoNavi/Logs/gonavi.log',
          requestedLineLimit: 120,
          lines: [
            '2026/06/10 09:01:00.000000 [ERROR] 建立数据库连接失败：类型=mysql 地址=127.0.0.1:3306 数据库=crm 用户=root；错误链：连接建立后验证失败：127.0.0.1:3306 验证失败: Error 1064 (42000): syntax error',
            '2026/06/10 09:01:01.000000 [WARN] 命中数据库连接失败冷却：类型=mysql 地址=127.0.0.1:3306 数据库=crm 缓存Key=abc 剩余=29s 原因=连接建立后验证失败：127.0.0.1:3306 验证失败: Error 1064 (42000): syntax error',
          ],
        },
      },
    });

    expect(snapshot.status).toBe('degraded');
    expect(snapshot.summary.appLogErrorCount).toBe(1);
    expect(snapshot.summary.recentConnectionFailureCount).toBe(2);
    expect(snapshot.summary.activeTabTitle).toBe('订单查询');
    expect(snapshot.warnings).toContain('最近应用日志里有 1 条 ERROR，需要优先查看 inspect_app_logs');
    expect(snapshot.nextActions).toContain('调用 inspect_recent_connection_failures 查看最新连接失败根因，再决定是否检查当前连接或保存连接配置');
    expect(snapshot.appLog.lines).toHaveLength(0);
    expect(snapshot.appLog.linesOmitted).toBe(true);
  });

  it('marks missing provider pieces as blocked even when logs are clean', () => {
    const snapshot = buildAIAppHealthSnapshot({
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
      appLogReadResult: {
        success: true,
        data: { lines: ['2026/06/10 09:00:00.000000 [INFO] started'] },
      },
      connectionFailureReadResult: {
        success: true,
        data: { lines: [] },
      },
    });

    expect(snapshot.status).toBe('blocked');
    expect(snapshot.blockers).toContain('当前活动供应商缺少 API Key / Secret');
    expect(snapshot.blockers).toContain('当前活动供应商缺少接口地址');
    expect(snapshot.summary.chatReady).toBe(false);
  });
});
