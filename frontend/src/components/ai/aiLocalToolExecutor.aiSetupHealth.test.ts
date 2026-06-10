import { describe, expect, it, vi } from 'vitest';

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

describe('aiLocalToolExecutor inspect_ai_setup_health', () => {
  it('returns an actionable ai setup health snapshot for diagnosing provider, mcp, and guidance issues together', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_ai_setup_health', {}),
      connections: [buildConnection()],
      activeContext: {
        connectionId: 'conn-1',
        dbName: 'crm',
      },
      aiContexts: {
        'conn-1:crm': [],
      },
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
      dynamicModels: ['gpt-5.4', 'gpt-4.1'],
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
            models: ['gpt-5.4', 'gpt-4.1'],
            maxTokens: 32000,
            temperature: 0.2,
          }],
          safetyLevel: 'readonly',
          contextLevel: 'schema_only',
        }),
        getMCPServers: vi.fn().mockResolvedValue([
          {
            id: 'server-1',
            name: 'Browser',
            transport: 'stdio',
            command: 'uvx',
            args: ['mcp-server-browser'],
            env: {},
            enabled: true,
            timeoutSeconds: 20,
          },
        ]),
        getMCPClientInstallStatuses: vi.fn().mockResolvedValue([
          {
            client: 'codex',
            displayName: 'Codex',
            installed: false,
            matchesCurrent: false,
            clientDetected: true,
            clientCommand: 'codex',
            clientPath: 'C:/Tools/codex.exe',
            configPath: 'C:/Users/demo/.codex/config.toml',
            command: 'gonavi-mcp-server',
            args: ['stdio'],
            message: '未检测到 Codex 用户级 GoNavi MCP 配置',
          },
        ]),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"status":"needs_attention"');
    expect(result.content).toContain('"activeProviderName":"OpenAI 主账号"');
    expect(result.content).toContain('"chatStatus":"ready"');
    expect(result.content).toContain('"enabledMCPServerCount":1');
    expect(result.content).toContain('"currentExternalClientCount":0');
    expect(result.content).toContain('如需让外部 Agent 使用 GoNavi MCP');
    expect(result.content).toContain('当前聊天已就绪，但还没有挂载任何表结构上下文');
  });
});
