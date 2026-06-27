import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AIToolCall, SavedConnection } from '../../types';
import { executeLocalAIToolCall } from './aiLocalToolExecutor';

const buildConnection = (): SavedConnection => ({
  id: 'conn-1',
  name: '主库',
  config: {
    type: 'mysql',
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
  },
});

const buildToolCall = (name: string, args: Record<string, unknown>): AIToolCall => ({
  id: `call-${name}`,
  type: 'function',
  function: {
    name,
    arguments: JSON.stringify(args),
  },
});

describe('aiLocalToolExecutor inspect_app_health', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__gonaviLastAIMessageRenderError;
  });

  it('returns an app-level health snapshot across ai setup, logs, connection failures, and workspace tabs', async () => {
    (globalThis as Record<string, unknown>).__gonaviLastAIMessageRenderError = {
      messageId: 'msg-render-1',
      role: 'assistant',
      contentPreview: '这是一条触发渲染异常的 AI 回复预览',
      message: 'Cannot read properties of undefined',
      stack: 'TypeError: Cannot read properties of undefined\n    at AIMessageBubble.tsx:12:3',
      componentStack: '\n    at AIMessageBubble\n    at AIChatPanelConversationView',
      recordedAt: 1780700000000,
    };

    const readAppLogTail = vi.fn()
      .mockResolvedValueOnce({
        success: true,
        data: {
          logPath: 'C:/Users/demo/.GoNavi/Logs/gonavi.log',
          requestedLineLimit: 120,
          lines: [
            '2026/06/10 09:00:00.000000 [INFO] started',
            '2026/06/10 09:00:01.000000 [ERROR] MCP server boot failed',
          ],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          logPath: 'C:/Users/demo/.GoNavi/Logs/gonavi.log',
          requestedLineLimit: 120,
          lines: [
            '2026/06/10 09:01:00.000000 [ERROR] 建立数据库连接失败：类型=mysql 地址=127.0.0.1:3306 数据库=crm 用户=root；错误链：连接建立后验证失败：127.0.0.1:3306 验证失败: Error 1064 (42000): syntax error',
          ],
        },
      });

    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_app_health', {
        lineLimit: 120,
      }),
      connections: [buildConnection()],
      activeContext: {
        connectionId: 'conn-1',
        dbName: 'crm',
      },
      tabs: [{
        id: 'query-1',
        title: '订单查询',
        type: 'query',
        connectionId: 'conn-1',
        dbName: 'crm',
        query: 'select * from orders',
      }],
      activeTabId: 'query-1',
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
        getAIRuntimeState: vi.fn().mockResolvedValue({
          activeProviderId: 'provider-1',
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
          safetyLevel: 'readonly',
          contextLevel: 'schema_only',
        }),
        getMCPServers: vi.fn().mockResolvedValue([]),
        getMCPClientInstallStatuses: vi.fn().mockResolvedValue([]),
        readAppLogTail,
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"status":"degraded"');
    expect(result.content).toContain('"activeProviderName":"OpenAI 主账号"');
    expect(result.content).toContain('"appLogErrorCount":1');
    expect(result.content).toContain('"recentConnectionFailureCount":1');
    expect(result.content).toContain('"activeTabTitle":"订单查询"');
    expect(result.content).toContain('"hasLastAIMessageRenderError":true');
    expect(result.content).toContain('"lastAIMessageRenderErrorId":"msg-render-1"');
    expect(result.content).toContain('"messageId":"msg-render-1"');
    expect(result.content).toContain('inspect_ai_last_render_error');
    expect(result.content).toContain('inspect_recent_connection_failures');
    expect(readAppLogTail).toHaveBeenCalledWith(120, '');
  });

  it('passes the local translator into inspect_app_health snapshot wrappers', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_app_health', {
        lineLimit: 120,
      }),
      connections: [buildConnection()],
      tabs: [],
      activeTabId: null,
      mcpTools: [],
      toolContextMap: new Map(),
      translate: (key, params) => {
        const suffix = params
          ? ` ${Object.entries(params).map(([paramKey, value]) => `${paramKey}=${value}`).join(',')}`
          : '';
        return `T:${key}${suffix}`;
      },
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
        getAIRuntimeState: vi.fn().mockResolvedValue({
          activeProviderId: '',
          providers: [],
          safetyLevel: 'readonly',
          contextLevel: 'schema_only',
        }),
        getMCPServers: vi.fn().mockResolvedValue([]),
        getMCPClientInstallStatuses: vi.fn().mockResolvedValue([]),
        readAppLogTail: vi.fn()
          .mockResolvedValueOnce({ success: false, message: 'raw log backend failure' })
          .mockResolvedValueOnce({ success: false, message: 'raw connection log failure' }),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('T:ai_chat.inspection.app_health.app_log.unread detail=raw log backend failure');
    expect(result.content).toContain(
      'T:ai_chat.inspection.app_health.connection_failures.unread detail=raw connection log failure',
    );
    expect(result.content).toContain('T:ai_chat.inspection.app_health.warning.no_workspace_tabs');
  });
});
