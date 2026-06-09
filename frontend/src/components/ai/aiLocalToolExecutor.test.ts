import { describe, expect, it, vi } from 'vitest';

import type { AIMCPToolDescriptor, AIToolCall, ExternalSQLDirectory, SavedConnection } from '../../types';
import { buildToolResultMessage, executeLocalAIToolCall } from './aiLocalToolExecutor';

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

describe('aiLocalToolExecutor', () => {
  it('caches validated table context after get_tables succeeds', async () => {
    const toolContextMap = new Map();
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('get_tables', { connectionId: 'conn-1', dbName: 'crm' }),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap,
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn().mockResolvedValue({
          success: true,
          data: [{ Table: 'users' }, { Table: 'orders' }],
        }),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('users');
    expect(toolContextMap.get('conn-1:crm')).toEqual({
      connectionId: 'conn-1',
      dbName: 'crm',
      tables: ['users', 'orders'],
    });
  });

  it('returns the current active tab snapshot so the model can inspect the editor draft directly', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_active_tab', {
        includeContent: true,
      }),
      connections: [buildConnection()],
      tabs: [{
        id: 'tab-query-1',
        title: '订单查询',
        type: 'query',
        connectionId: 'conn-1',
        dbName: 'crm',
        query: 'SELECT id, status FROM orders WHERE status = \'paid\'',
        filePath: 'D:/sql/orders.sql',
      }],
      activeTabId: 'tab-query-1',
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"hasActiveTab":true');
    expect(result.content).toContain('"type":"query"');
    expect(result.content).toContain('"connectionName":"主库"');
    expect(result.content).toContain('"contentKind":"sql"');
    expect(result.content).toContain('SELECT id, status FROM orders');
  });

  it('returns a workspace tab overview so the model can inspect which editors are currently open', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_workspace_tabs', {
        limit: 2,
        includeContent: true,
      }),
      connections: [buildConnection()],
      tabs: [
        {
          id: 'tab-query-1',
          title: '订单查询',
          type: 'query',
          connectionId: 'conn-1',
          dbName: 'crm',
          query: 'SELECT * FROM orders WHERE status = \'paid\'',
        },
        {
          id: 'tab-table-1',
          title: 'users',
          type: 'table',
          connectionId: 'conn-1',
          dbName: 'crm',
          tableName: 'users',
        },
        {
          id: 'tab-redis-1',
          title: '缓存命令',
          type: 'redis-command',
          connectionId: 'conn-1',
          query: 'GET order:1',
          redisDB: 2,
        },
      ],
      activeTabId: 'tab-query-1',
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"activeTabId":"tab-query-1"');
    expect(result.content).toContain('"totalTabs":3');
    expect(result.content).toContain('"returnedTabs":2');
    expect(result.content).toContain('"truncated":true');
    expect(result.content).toContain('"isActive":true');
    expect(result.content).toContain('"title":"订单查询"');
    expect(result.content).toContain('SELECT * FROM orders');
  });

  it('returns the current linked AI context so the model can inspect which table schemas are already mounted', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_ai_context', {
        includeDDL: true,
        ddlLimit: 80,
      }),
      connections: [buildConnection()],
      activeContext: {
        connectionId: 'conn-1',
        dbName: 'crm',
      },
      aiContexts: {
        'conn-1:crm': [
          {
            dbName: 'crm',
            tableName: 'orders',
            ddl: 'CREATE TABLE orders (id bigint primary key, status varchar(32), amount decimal(10,2));',
          },
        ],
      },
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"hasActiveContext":true');
    expect(result.content).toContain('"connectionName":"主库"');
    expect(result.content).toContain('"tableName":"orders"');
    expect(result.content).toContain('"includeDDL":true');
    expect(result.content).toContain('CREATE TABLE orders');
  });

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
    expect(result.content).toContain('"serverCount":1');
    expect(result.content).toContain('"name":"Browser"');
    expect(result.content).toContain('"launchCommandPreview":"uvx mcp-server-browser"');
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
    expect(result.content).toContain('"example":"node / uvx / python"');
    expect(result.content).toContain('PowerShell $env:KEY=VALUE;');
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

  it('returns the current connection snapshot so the model can inspect host, db, and ssh state', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_current_connection', {}),
      connections: [{
        id: 'conn-1',
        name: '主库',
        config: {
          type: 'mysql',
          host: '10.188.101.184',
          port: 1523,
          user: 'glzc',
          database: 'crm',
          useSSH: true,
          ssh: {
            host: '192.168.66.28',
            port: 22,
            user: 'wyeye',
          },
        },
      }],
      activeContext: {
        connectionId: 'conn-1',
        dbName: 'crm',
      },
      tabs: [{
        id: 'tab-query-1',
        title: '订单分析',
        type: 'query',
        connectionId: 'conn-1',
        dbName: 'crm',
        query: 'select * from orders limit 20',
      }],
      activeTabId: 'tab-query-1',
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"hasActiveConnection":true');
    expect(result.content).toContain('"connectionName":"主库"');
    expect(result.content).toContain('"host":"10.188.101.184"');
    expect(result.content).toContain('"port":1523');
    expect(result.content).toContain('"activeDbName":"crm"');
    expect(result.content).toContain('"useSSH":true');
    expect(result.content).toContain('"sshHost":"192.168.66.28"');
    expect(result.content).toContain('"activeTabType":"query"');
  });

  it('returns the current connection capability snapshot so the model can inspect supported UI actions', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_connection_capabilities', {}),
      connections: [{
        id: 'conn-1',
        name: '分析库',
        config: {
          type: 'clickhouse',
          host: '10.10.1.30',
          port: 8123,
          user: 'default',
          database: 'analytics',
        },
      }],
      activeContext: {
        connectionId: 'conn-1',
        dbName: 'analytics',
      },
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"connectionName":"分析库"');
    expect(result.content).toContain('"resolvedType":"clickhouse"');
    expect(result.content).toContain('"supportsCreateDatabase":true');
    expect(result.content).toContain('"supportsRenameDatabase":false');
    expect(result.content).toContain('"forceReadOnlyQueryResult":true');
    expect(result.content).toContain('force_readonly_query_result');
  });

  it('returns the local saved connections snapshot so the model can find matching data sources by type or keyword', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_saved_connections', {
        type: 'mysql',
        keyword: '订单',
      }),
      connections: [
        {
          id: 'conn-1',
          name: '订单主库',
          config: {
            type: 'mysql',
            host: '10.10.1.18',
            port: 3306,
            user: 'root',
            database: 'crm',
            useSSH: true,
            ssh: {
              host: '192.168.1.8',
              port: 22,
              user: 'ops',
            },
          },
        },
        {
          id: 'conn-2',
          name: '分析仓库',
          config: {
            type: 'postgres',
            host: '10.10.1.20',
            port: 5432,
            user: 'analyst',
            database: 'dw',
          },
        },
      ],
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"totalMatched":1');
    expect(result.content).toContain('"typeBreakdown":{"mysql":1}');
    expect(result.content).toContain('"name":"订单主库"');
    expect(result.content).toContain('"useSSH":true');
    expect(result.content).not.toContain('分析仓库');
  });

  it('returns configured external sql directories so the model can locate local script assets', async () => {
    const externalSQLDirectories: ExternalSQLDirectory[] = [
      {
        id: 'dir-1',
        name: '报表脚本',
        path: 'D:/sql/reports',
        connectionId: 'conn-1',
        dbName: 'crm',
        createdAt: 2,
      },
      {
        id: 'dir-2',
        name: '运维脚本',
        path: 'D:/sql/ops',
        createdAt: 1,
      },
    ];
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_external_sql_directories', {
        keyword: '报表',
      }),
      connections: [buildConnection()],
      tabs: [
        {
          id: 'tab-1',
          title: '日报.sql',
          type: 'query',
          connectionId: 'conn-1',
          dbName: 'crm',
          filePath: 'D:/sql/reports/daily.sql',
          query: 'select 1',
        },
      ],
      mcpTools: [],
      toolContextMap: new Map(),
      externalSQLDirectories,
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"totalMatched":1');
    expect(result.content).toContain('"name":"报表脚本"');
    expect(result.content).toContain('"connectionName":"主库"');
    expect(result.content).toContain('"openFileTabCount":1');
    expect(result.content).toContain('日报.sql');
    expect(result.content).not.toContain('运维脚本');
  });

  it('reads a configured external sql file so the model can inspect script content directly', async () => {
    const readSQLFile = vi.fn().mockResolvedValue({
      success: true,
      data: {
        content: 'SELECT * FROM orders WHERE status = \'paid\';',
        filePath: 'D:/sql/reports/daily.sql',
        name: 'daily.sql',
      },
    });
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_external_sql_file', {
        filePath: 'D:/sql/reports/daily.sql',
        previewCharLimit: 18,
      }),
      connections: [buildConnection()],
      tabs: [
        {
          id: 'tab-1',
          title: 'daily.sql',
          type: 'query',
          connectionId: 'conn-1',
          dbName: 'crm',
          filePath: 'D:/sql/reports/daily.sql',
          query: 'select 1',
        },
      ],
      mcpTools: [],
      toolContextMap: new Map(),
      externalSQLDirectories: [
        {
          id: 'dir-1',
          name: '报表脚本',
          path: 'D:/sql/reports',
          connectionId: 'conn-1',
          dbName: 'crm',
          createdAt: 1,
        },
      ],
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
        readSQLFile,
      },
    });

    expect(result.success).toBe(true);
    expect(readSQLFile).toHaveBeenCalledWith('D:/sql/reports/daily.sql');
    expect(result.content).toContain('"fileName":"daily.sql"');
    expect(result.content).toContain('"connectionName":"主库"');
    expect(result.content).toContain('"hasOpenTab":true');
    expect(result.content).toContain('SELECT * FROM orde');
  });

  it('blocks external sql file reads outside configured directories', async () => {
    const readSQLFile = vi.fn();
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_external_sql_file', {
        filePath: 'D:/private/secret.sql',
      }),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      externalSQLDirectories: [
        {
          id: 'dir-1',
          name: '报表脚本',
          path: 'D:/sql/reports',
          connectionId: 'conn-1',
          dbName: 'crm',
          createdAt: 1,
        },
      ],
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
        readSQLFile,
      },
    });

    expect(result.success).toBe(false);
    expect(result.content).toContain('目标文件不在已配置的外部 SQL 目录中');
    expect(readSQLFile).not.toHaveBeenCalled();
  });

  it('blocks execute_sql when the AI safety check rejects the statement', async () => {
    const query = vi.fn();
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('execute_sql', {
        connectionId: 'conn-1',
        dbName: 'crm',
        sql: 'DELETE FROM users',
      }),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
        getColumns: vi.fn(),
        getIndexes: vi.fn(),
        getForeignKeys: vi.fn(),
        getTriggers: vi.fn(),
        showCreateTable: vi.fn(),
        query,
        checkSQL: vi.fn().mockResolvedValue({
          allowed: false,
          operationType: 'DELETE',
        }),
      },
    });

    expect(result.success).toBe(false);
    expect(result.content).toContain('安全策略拦截');
    expect(query).not.toHaveBeenCalled();
  });

  it('returns a cross-table column summary for get_all_columns', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('get_all_columns', {
        connectionId: 'conn-1',
        dbName: 'crm',
      }),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
        getAllColumns: vi.fn().mockResolvedValue({
          success: true,
          data: [
            { TableName: 'users', Name: 'email', Type: 'varchar(255)', Comment: '用户邮箱' },
            { TableName: 'orders', Name: 'user_id', Type: 'bigint', Comment: '关联用户' },
          ],
        }),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"tableCount":2');
    expect(result.content).toContain('"tableName":"users"');
    expect(result.content).toContain('"name":"email"');
  });

  it('returns index definitions and resolves the tool label for MCP descriptors', async () => {
    const mcpTools: AIMCPToolDescriptor[] = [{
      alias: 'custom_tool',
      originalName: 'custom_tool',
      serverId: 'server-1',
      serverName: 'demo',
      title: '自定义探针',
      description: '',
    }];
    const indexResult = await executeLocalAIToolCall({
      toolCall: buildToolCall('get_indexes', {
        connectionId: 'conn-1',
        dbName: 'crm',
        tableName: 'users',
      }),
      connections: [buildConnection()],
      mcpTools,
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
        getColumns: vi.fn(),
        getIndexes: vi.fn().mockResolvedValue({
          success: true,
          data: [{ keyName: 'idx_users_email', nonUnique: 0 }],
        }),
        getForeignKeys: vi.fn(),
        getTriggers: vi.fn(),
        showCreateTable: vi.fn(),
        query: vi.fn(),
      },
    });
    const message = buildToolResultMessage({
      id: 'msg-1',
      timestamp: 1,
      toolCall: buildToolCall('custom_tool', {}),
      execution: {
        content: 'ok',
        success: true,
        toolName: '自定义探针',
      },
    });

    expect(indexResult.success).toBe(true);
    expect(indexResult.content).toContain('idx_users_email');
    expect(message.tool_name).toBe('自定义探针');
  });

  it('previews sample rows for a table without forcing the model to handwrite select limit sql', async () => {
    const query = vi.fn().mockResolvedValue({
      success: true,
      data: [
        { id: 1, status: 'paid', amount: 120.5 },
        { id: 2, status: 'pending', amount: null },
      ],
    });
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('preview_table_rows', {
        connectionId: 'conn-1',
        dbName: 'crm',
        tableName: 'orders',
        limit: 5,
      }),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
        getColumns: vi.fn(),
        getIndexes: vi.fn(),
        getForeignKeys: vi.fn(),
        getTriggers: vi.fn(),
        showCreateTable: vi.fn(),
        query,
      },
    });

    expect(result.success).toBe(true);
    expect(query).toHaveBeenCalledWith(expect.anything(), 'crm', 'SELECT * FROM `orders` LIMIT 5 OFFSET 0');
    expect(result.content).toContain('"tableName":"orders"');
    expect(result.content).toContain('"status":"paid"');
    expect(result.content).toContain('"rowCount":2');
  });

  it('returns a full table snapshot bundle with optional sample rows in one tool call', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_table_bundle', {
        connectionId: 'conn-1',
        dbName: 'crm',
        tableName: 'orders',
        includeSampleRows: true,
        sampleLimit: 2,
      }),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
        getColumns: vi.fn().mockResolvedValue({
          success: true,
          data: [{ Field: 'id', Type: 'bigint', Null: 'NO', Comment: '主键' }],
        }),
        getIndexes: vi.fn().mockResolvedValue({
          success: true,
          data: [{ keyName: 'PRIMARY', seqInIndex: 1 }],
        }),
        getForeignKeys: vi.fn().mockResolvedValue({
          success: true,
          data: [{ columnName: 'user_id', refTable: 'users' }],
        }),
        getTriggers: vi.fn().mockResolvedValue({
          success: true,
          data: [{ triggerName: 'orders_bi' }],
        }),
        showCreateTable: vi.fn().mockResolvedValue({
          success: true,
          data: [{ ddl: 'CREATE TABLE orders (...)' }],
        }),
        query: vi.fn().mockResolvedValue({
          success: true,
          data: [{ id: 1, status: 'paid' }, { id: 2, status: 'pending' }],
        }),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"tableName":"orders"');
    expect(result.content).toContain('"field":"id"');
    expect(result.content).toContain('"keyName":"PRIMARY"');
    expect(result.content).toContain('"triggerName":"orders_bi"');
    expect(result.content).toContain('"sampleRows"');
    expect(result.content).toContain('"status":"paid"');
  });

  it('returns recent sql logs and supports filtering only failed statements', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_recent_sql_logs', {
        limit: 2,
        status: 'error',
      }),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      sqlLogs: [
        {
          id: 'log-1',
          timestamp: 3,
          sql: 'DELETE FROM users WHERE id = 9',
          status: 'error',
          duration: 120,
          message: 'permission denied',
          dbName: 'crm',
        },
        {
          id: 'log-2',
          timestamp: 2,
          sql: 'SELECT * FROM users LIMIT 10',
          status: 'success',
          duration: 18,
          dbName: 'crm',
          affectedRows: 10,
        },
        {
          id: 'log-3',
          timestamp: 1,
          sql: 'UPDATE orders SET status = \'paid\' WHERE id = 1',
          status: 'error',
          duration: 95,
          message: 'row lock timeout',
          dbName: 'crm',
        },
      ],
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"status":"error"');
    expect(result.content).toContain('"totalMatched":2');
    expect(result.content).toContain('permission denied');
    expect(result.content).toContain('row lock timeout');
    expect(result.content).not.toContain('SELECT * FROM users LIMIT 10');
  });

  it('returns a recent sql activity summary so the model can quickly spot writes, ddl, and repeated failures', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_recent_sql_activity', {
        limit: 3,
        activityKind: 'write',
        dbName: 'crm',
      }),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      sqlLogs: [
        {
          id: 'log-1',
          timestamp: 4,
          sql: 'DELETE FROM users WHERE id = 9',
          status: 'error',
          duration: 120,
          message: 'permission denied',
          dbName: 'crm',
        },
        {
          id: 'log-2',
          timestamp: 3,
          sql: 'UPDATE orders SET status = \'paid\' WHERE id = 1',
          status: 'error',
          duration: 95,
          message: 'row lock timeout',
          dbName: 'crm',
        },
        {
          id: 'log-3',
          timestamp: 2,
          sql: 'ALTER TABLE orders ADD COLUMN note varchar(32)',
          status: 'success',
          duration: 160,
          dbName: 'crm',
        },
        {
          id: 'log-4',
          timestamp: 1,
          sql: 'SELECT * FROM users LIMIT 10',
          status: 'success',
          duration: 18,
          dbName: 'crm',
          affectedRows: 10,
        },
      ],
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"activityKind":"write"');
    expect(result.content).toContain('"totalMatched":2');
    expect(result.content).toContain('"writeCount":2');
    expect(result.content).toContain('"statementTypeBreakdown":{"delete":1,"update":1}');
    expect(result.content).toContain('permission denied');
    expect(result.content).toContain('row lock timeout');
    expect(result.content).not.toContain('ALTER TABLE orders');
    expect(result.content).not.toContain('SELECT * FROM users LIMIT 10');
  });

  it('returns local saved queries so the model can reuse historical sql scripts', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_saved_queries', {
        keyword: '支付',
        connectionId: 'conn-1',
      }),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      savedQueries: [
        {
          id: 'saved-1',
          name: '支付订单核对',
          sql: 'SELECT * FROM orders WHERE status = \'paid\'',
          connectionId: 'conn-1',
          dbName: 'crm',
          createdAt: 2,
        },
        {
          id: 'saved-2',
          name: '用户列表',
          sql: 'SELECT * FROM users',
          connectionId: 'conn-1',
          dbName: 'crm',
          createdAt: 1,
        },
      ],
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"totalMatched":1');
    expect(result.content).toContain('支付订单核对');
    expect(result.content).toContain('"connectionName":"主库"');
    expect(result.content).toContain('status = \'paid\'');
  });

  it('returns local ai chat sessions so the model can locate previous conversations by title or preview', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_ai_sessions', {
        keyword: '支付',
        limit: 5,
      }),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      aiChatSessions: [
        { id: 'session-1', title: '支付异常排查', updatedAt: 200 },
        { id: 'session-2', title: '用户列表', updatedAt: 100 },
      ],
      aiChatHistory: {
        'session-1': [
          { id: 'msg-1', role: 'user', content: '帮我排查支付超时', timestamp: 101 },
          { id: 'msg-2', role: 'assistant', content: '先看最近错误日志', timestamp: 102 },
        ],
        'session-2': [
          { id: 'msg-3', role: 'user', content: '列出最近注册用户', timestamp: 103 },
        ],
      },
      activeSessionId: 'session-2',
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"totalMatched":1');
    expect(result.content).toContain('支付异常排查');
    expect(result.content).toContain('帮我排查支付超时');
    expect(result.content).toContain('先看最近错误日志');
    expect(result.content).not.toContain('列出最近注册用户');
  });

  it('returns sql snippets so the model can inspect local query templates', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_sql_snippets', {
        keyword: '支付',
      }),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      sqlSnippets: [
        {
          id: 'snippet-1',
          prefix: 'sel',
          name: 'SELECT 模板',
          body: 'SELECT * FROM ${1:table};',
          isBuiltin: true,
          createdAt: 1,
        },
        {
          id: 'snippet-2',
          prefix: 'pay',
          name: '支付模板',
          description: '支付对账',
          body: 'SELECT * FROM pay_orders WHERE created_at >= ${1:start};',
          isBuiltin: false,
          createdAt: 2,
        },
      ],
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"totalMatched":1');
    expect(result.content).toContain('"prefix":"pay"');
    expect(result.content).toContain('"customCount":1');
    expect(result.content).toContain('pay_orders');
  });

  it('returns a database overview bundle with per-table column previews in one tool call', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_database_bundle', {
        connectionId: 'conn-1',
        dbName: 'crm',
        tableLimit: 5,
        perTableColumnLimit: 1,
      }),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn().mockResolvedValue({
          success: true,
          data: [{ Table: 'users' }, { Table: 'orders' }],
        }),
        getAllColumns: vi.fn().mockResolvedValue({
          success: true,
          data: [
            { TableName: 'users', Name: 'id', Type: 'bigint', Comment: '主键' },
            { TableName: 'users', Name: 'email', Type: 'varchar(255)', Comment: '邮箱' },
            { TableName: 'orders', Name: 'id', Type: 'bigint', Comment: '主键' },
          ],
        }),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"dbName":"crm"');
    expect(result.content).toContain('"tableCount":2');
    expect(result.content).toContain('"tableName":"users"');
    expect(result.content).toContain('"columnCount":2');
    expect(result.content).toContain('"truncatedColumns":true');
  });
});
