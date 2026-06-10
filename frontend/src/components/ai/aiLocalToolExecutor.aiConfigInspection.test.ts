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

describe('aiLocalToolExecutor AI config inspection tools', () => {
  it('returns the current ai runtime snapshot so the model can inspect provider, safety, skills, and tools', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_ai_runtime', {}),
      connections: [buildConnection()],
      mcpTools: [{
        alias: 'browser_open',
        originalName: 'browser_open',
        serverId: 'server-1',
        serverName: 'browser',
        title: '打开浏览器',
        description: '打开页面',
      }],
      skills: [{
        id: 'skill-1',
        name: '结构审查',
        systemPrompt: '先核对字段',
        enabled: true,
        scopes: ['database'],
        requiredTools: ['get_columns'],
      }],
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
          contextLevel: 'with_samples',
        }),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"hasActiveProvider":true');
    expect(result.content).toContain('"name":"OpenAI 主账号"');
    expect(result.content).toContain('"safetyLevel":"readonly"');
    expect(result.content).toContain('"contextLevel":"with_samples"');
    expect(result.content).toContain('"enabledSkillCount":1');
    expect(result.content).toContain('"alias":"browser_open"');
    expect(result.content).toContain('"builtinToolCount":');
  });

  it('returns the current ai safety snapshot so the model can inspect write boundaries and readonly guards', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_ai_safety', {}),
      connections: [{
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
              allowTraceCommands: true,
              allowMutatingCommands: false,
            },
          },
        },
      }],
      tabs: [{
        id: 'diag-tab-1',
        title: 'JVM 诊断',
        type: 'jvm-diagnostic',
        connectionId: 'jvm-1',
        readOnly: true,
      }],
      activeTabId: 'diag-tab-1',
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
        getAIRuntimeState: vi.fn().mockResolvedValue({
          safetyLevel: 'readwrite',
        }),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"safetyLevel":"readwrite"');
    expect(result.content).toContain('"allowDML":true');
    expect(result.content).toContain('"allowDDL":false');
    expect(result.content).toContain('"readOnly":true');
    expect(result.content).toContain('"allowMutatingCommands":false');
    expect(result.content).toContain('allowMutating=true');
  });

  it('returns the current ai provider snapshot so the model can inspect provider readiness and model selection', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_ai_providers', {}),
      connections: [buildConnection()],
      mcpTools: [],
      dynamicModels: ['gpt-5.4', 'gpt-4.1-mini'],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
        getAIRuntimeState: vi.fn().mockResolvedValue({
          activeProviderId: 'provider-1',
          providers: [
            {
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
            },
            {
              id: 'provider-2',
              type: 'custom',
              name: '自建代理',
              apiKey: '',
              hasSecret: false,
              baseUrl: '',
              model: '',
              models: [],
              headers: {
                Authorization: 'Bearer secret-token',
              },
              maxTokens: 16000,
              temperature: 0.7,
            },
          ],
        }),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"providerCount":2');
    expect(result.content).toContain('"missingSecretCount":1');
    expect(result.content).toContain('"name":"OpenAI 主账号"');
    expect(result.content).toContain('"name":"自建代理"');
    expect(result.content).toContain('"issues":["missing_secret","missing_base_url","missing_selected_model","missing_declared_models"]');
    expect(result.content).not.toContain('secret-token');
  });

  it('returns the current chat readiness snapshot so the model can inspect why ai input cannot send yet', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_ai_chat_readiness', {}),
      connections: [buildConnection()],
      mcpTools: [],
      dynamicModels: ['gpt-5.5', 'gpt-4.1-mini'],
      activeContext: {
        connectionId: 'conn-1',
        dbName: 'demo',
      },
      aiContexts: {
        'conn-1:demo': [{
          dbName: 'demo',
          tableName: 'orders',
          ddl: 'CREATE TABLE orders (...)',
        }],
      },
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
            model: '',
            models: ['gpt-5.5', 'gpt-4.1-mini'],
            maxTokens: 32000,
            temperature: 0.2,
          }],
        }),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"status":"missing_model"');
    expect(result.content).toContain('"contextAttachedCount":1');
    expect(result.content).toContain('"selectableModelCount":2');
    expect(result.content).toContain('OpenAI 主账号');
  });

  it('returns the current mcp setup snapshot so the model can inspect configured servers and client install state', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_mcp_setup', {}),
      connections: [buildConnection()],
      mcpTools: [{
        alias: 'browser_open',
        originalName: 'browser_open',
        serverId: 'server-1',
        serverName: 'Browser',
        title: '打开页面',
        description: '打开页面',
      }],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
        getMCPServers: vi.fn().mockResolvedValue([
          {
            id: 'server-1',
            name: 'Browser',
            transport: 'stdio',
            command: 'uvx',
            args: ['mcp-server-browser'],
            env: {
              OPENAI_API_KEY: '***',
            },
            enabled: true,
            timeoutSeconds: 20,
          },
          {
            id: 'server-2',
            name: 'Broken',
            transport: 'stdio',
            command: '',
            args: [],
            env: {},
            enabled: true,
            timeoutSeconds: 1,
          },
        ]),
        getMCPClientInstallStatuses: vi.fn().mockResolvedValue([
          {
            client: 'codex',
            displayName: 'Codex',
            installed: true,
            matchesCurrent: false,
            clientDetected: true,
            clientCommand: 'codex',
            clientPath: 'C:/Tools/codex.exe',
            configPath: 'C:/Users/demo/.codex/config.toml',
            command: 'gonavi-mcp-server',
            args: ['stdio'],
            message: '检测到旧的 GoNavi 路径',
          },
        ]),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"serverCount":2');
    expect(result.content).toContain('"name":"Browser"');
    expect(result.content).toContain('"launchCommandPreview":"uvx mcp-server-browser"');
    expect(result.content).toContain('"serverConfigurationIssueCount":2');
    expect(result.content).toContain('"serversWithConfigurationErrors":1');
    expect(result.content).toContain('"key":"command-missing"');
    expect(result.content).toContain('"displayName":"Codex"');
    expect(result.content).toContain('"launchCommandPreview":"gonavi-mcp-server stdio"');
  });

  it('returns the builtin mcp authoring guide so the model can explain how to fill command, args, env, and templates', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_mcp_authoring_guide', {}),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"supportsWholeCommandAutoSplit":true');
    expect(result.content).toContain('"fullCommandPasteExample":"$env:GITHUB_TOKEN=...; uvx mcp-server-github --stdio"');
    expect(result.content).toContain('"title":"启动命令"');
    expect(result.content).toContain('"example":"npx / node / uvx / python"');
    expect(result.content).toContain('PowerShell $env:KEY=VALUE;');
    expect(result.content).toContain('"title":"npx 包"');
    expect(result.content).toContain('"exampleLaunchPreview":"npx -y @modelcontextprotocol/server-filesystem --stdio"');
    expect(result.content).toContain('"title":"uvx 工具"');
    expect(result.content).toContain('"exampleLaunchPreview":"uvx some-mcp-server"');
  });

  it('returns the current ai guidance snapshot so the model can inspect active prompts and enabled skills', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_ai_guidance', {}),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      userPromptSettings: {
        global: '回答前先核对上下文。',
        database: '生成 SQL 时只读优先。',
        jvm: '',
        jvmDiagnostic: '',
      },
      skills: [{
        id: 'skill-1',
        name: '结构审查',
        description: '优先核对字段',
        systemPrompt: '先看字段和索引，再给结论。',
        enabled: true,
        scopes: ['database'],
        requiredTools: ['get_columns'],
      }],
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"customPromptCount":2');
    expect(result.content).toContain('"scope":"global"');
    expect(result.content).toContain('回答前先核对上下文');
    expect(result.content).toContain('"enabledSkillCount":1');
    expect(result.content).toContain('"name":"结构审查"');
  });
});
