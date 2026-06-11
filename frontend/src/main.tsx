import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// import './index.css' // Optional global styles

// 全局配置 dayjs 使用中文 locale，使 Ant Design 的 DatePicker/TimePicker 等组件
// 的月份、星期等文本显示为中文。必须在 Ant Design 组件渲染前完成配置。
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
dayjs.locale('zh-cn')

import { cloneBrowserMockValue, duplicateBrowserMockConnection, resolveBrowserMockSecretFlag } from './utils/browserMockConnections'

const resolveDevHarnessMode = (): string => {
    if (typeof window === 'undefined') {
        return '';
    }
    try {
        return new URLSearchParams(window.location.search).get('devHarness') || '';
    } catch {
        return '';
    }
};

if (typeof window !== 'undefined' && (!(window as any).go?.app?.App || !(window as any).go?.aiservice?.Service)) {
    const mockConnections: any[] = [];
    const mockConnectionSecrets = new Map<string, any>();
    const mockProviders: any[] = [];
    const mockProviderSecrets = new Map<string, string>();
    let mockActiveProviderId = '';
    let mockAISafetyLevel = 'readonly';
    let mockAIContextLevel = 'schema_only';
    let mockAIUserPromptSettings: any = {
        global: '',
        database: '',
        jvm: '',
        jvmDiagnostic: '',
    };
    let mockMCPServers: any[] = [];
    let mockMCPHTTPServerStatus: any = {
        running: false,
        addr: '127.0.0.1:8765',
        path: '/mcp',
        url: 'http://127.0.0.1:8765/mcp',
        schemaOnly: true,
        message: 'GoNavi MCP HTTP 服务未启动',
    };
    let mockMCPClientStatuses: any[] = [
        {
            client: 'claude-code',
            displayName: 'Claude Code',
            installed: false,
            matchesCurrent: false,
            clientDetected: false,
            clientCommand: 'claude',
            message: '未检测到 Claude Code 用户级 GoNavi MCP 配置',
            configPath: 'C:/Users/mock/.claude.json',
            command: 'C:/Program Files/GoNavi/GoNavi.exe',
            args: ['mcp-server'],
        },
        {
            client: 'codex',
            displayName: 'Codex',
            installed: true,
            matchesCurrent: false,
            clientDetected: true,
            clientCommand: 'codex',
            clientPath: 'C:/Users/mock/AppData/Roaming/npm/codex.cmd',
            message: '已检测到 Codex 中的 GoNavi MCP 记录，但与当前 GoNavi 安装路径不一致，建议更新',
            configPath: 'C:/Users/mock/.codex/config.toml',
            command: 'C:/Old/GoNavi.exe',
            args: ['mcp-server'],
        },
    ];
    let mockSkills: any[] = [];
    let mockGlobalProxy: any = { enabled: false, type: 'socks5', host: '', port: 1080, user: '', password: '', hasPassword: false };
    let mockDataRootInfo: any = {
        path: 'C:/mock/.gonavi',
        defaultPath: 'C:/mock/.gonavi',
        driverPath: 'C:/mock/.gonavi/drivers',
        isDefaultPath: true,
        bootstrapPath: 'C:/mock/.gonavi/storage_root.json',
    };

    const upsertMockConnection = (view: any) => {
        const index = mockConnections.findIndex((item) => item.id === view.id);
        if (index >= 0) {
            mockConnections[index] = view;
            return;
        }
        mockConnections.push(view);
    };

    const saveMockConnection = (input: any) => {
        const existing = mockConnections.find((item) => item.id === input?.id);
        const existingSecrets = mockConnectionSecrets.get(existing?.id || input?.id || '') || {};
        const config = (input?.config && typeof input.config === 'object') ? input.config : {};
        const ssh = (config.ssh && typeof config.ssh === 'object') ? config.ssh : {};
        const proxy = (config.proxy && typeof config.proxy === 'object') ? config.proxy : {};
        const httpTunnel = (config.httpTunnel && typeof config.httpTunnel === 'object') ? config.httpTunnel : {};
        const nextId = String(input?.id || existing?.id || `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
        const nextSecrets = {
            password: String(config.password ?? existingSecrets.password ?? ''),
            sshPassword: String(ssh.password ?? existingSecrets.sshPassword ?? ''),
            proxyPassword: String(proxy.password ?? existingSecrets.proxyPassword ?? ''),
            httpTunnelPassword: String(httpTunnel.password ?? existingSecrets.httpTunnelPassword ?? ''),
            mysqlReplicaPassword: String(config.mysqlReplicaPassword ?? existingSecrets.mysqlReplicaPassword ?? ''),
            mongoReplicaPassword: String(config.mongoReplicaPassword ?? existingSecrets.mongoReplicaPassword ?? ''),
            uri: String(config.uri ?? existingSecrets.uri ?? ''),
            dsn: String(config.dsn ?? existingSecrets.dsn ?? ''),
        };
        if (input?.clearPrimaryPassword) nextSecrets.password = '';
        if (input?.clearSSHPassword) nextSecrets.sshPassword = '';
        if (input?.clearProxyPassword) nextSecrets.proxyPassword = '';
        if (input?.clearHttpTunnelPassword) nextSecrets.httpTunnelPassword = '';
        if (input?.clearMySQLReplicaPassword) nextSecrets.mysqlReplicaPassword = '';
        if (input?.clearMongoReplicaPassword) nextSecrets.mongoReplicaPassword = '';
        if (input?.clearOpaqueURI) nextSecrets.uri = '';
        if (input?.clearOpaqueDSN) nextSecrets.dsn = '';
        mockConnectionSecrets.set(nextId, nextSecrets);
        const view = {
            id: nextId,
            name: String(input?.name || existing?.name || '未命名连接'),
            config: {
                ...config,
                id: nextId,
                password: '',
                ssh: { ...ssh, password: '' },
                proxy: { ...proxy, password: '' },
                httpTunnel: { ...httpTunnel, password: '' },
                uri: '',
                dsn: '',
                mysqlReplicaPassword: '',
                mongoReplicaPassword: '',
            },
            includeDatabases: Array.isArray(input?.includeDatabases) ? [...input.includeDatabases] : existing?.includeDatabases,
            includeRedisDatabases: Array.isArray(input?.includeRedisDatabases) ? [...input.includeRedisDatabases] : existing?.includeRedisDatabases,
            iconType: typeof input?.iconType === 'string' ? input.iconType : (existing?.iconType || ''),
            iconColor: typeof input?.iconColor === 'string' ? input.iconColor : (existing?.iconColor || ''),
            hasPrimaryPassword: resolveBrowserMockSecretFlag(config.password, !!input?.clearPrimaryPassword, existing?.hasPrimaryPassword),
            hasSSHPassword: resolveBrowserMockSecretFlag(ssh.password, !!input?.clearSSHPassword, existing?.hasSSHPassword),
            hasProxyPassword: resolveBrowserMockSecretFlag(proxy.password, !!input?.clearProxyPassword, existing?.hasProxyPassword),
            hasHttpTunnelPassword: resolveBrowserMockSecretFlag(httpTunnel.password, !!input?.clearHttpTunnelPassword, existing?.hasHttpTunnelPassword),
            hasMySQLReplicaPassword: resolveBrowserMockSecretFlag(config.mysqlReplicaPassword, !!input?.clearMySQLReplicaPassword, existing?.hasMySQLReplicaPassword),
            hasMongoReplicaPassword: resolveBrowserMockSecretFlag(config.mongoReplicaPassword, !!input?.clearMongoReplicaPassword, existing?.hasMongoReplicaPassword),
            hasOpaqueURI: resolveBrowserMockSecretFlag(config.uri, !!input?.clearOpaqueURI, existing?.hasOpaqueURI),
            hasOpaqueDSN: resolveBrowserMockSecretFlag(config.dsn, !!input?.clearOpaqueDSN, existing?.hasOpaqueDSN),
        };
        upsertMockConnection(view);
        return cloneBrowserMockValue(view);
    };

    const saveMockGlobalProxy = (input: any) => {
        const nextPassword = String(input?.password ?? '');
        mockGlobalProxy = {
            ...mockGlobalProxy,
            ...input,
            password: '',
            hasPassword: nextPassword !== '' ? true : !!mockGlobalProxy.hasPassword,
        };
        return cloneBrowserMockValue(mockGlobalProxy);
    };

    const saveMockProvider = (input: any) => {
        const existing = mockProviders.find((item) => item.id === input?.id);
        const nextId = String(input?.id || existing?.id || `provider-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
        const apiKey = String(input?.apiKey ?? '');
        if (apiKey !== '') {
            mockProviderSecrets.set(nextId, apiKey);
        } else if (input?.hasSecret === false) {
            mockProviderSecrets.delete(nextId);
        }
        const hasSecret = mockProviderSecrets.has(nextId);
        const view = {
            ...existing,
            ...input,
            id: nextId,
            apiKey: '',
            hasSecret,
            secretRef: '',
        };
        const index = mockProviders.findIndex((item) => item.id === nextId);
        if (index >= 0) {
            mockProviders[index] = view;
        } else {
            mockProviders.push(view);
        }
        if (!mockActiveProviderId) {
            mockActiveProviderId = nextId;
        }
        return cloneBrowserMockValue(view);
    };

    const mockGo = {
        app: {
            App: {
                CheckUpdate: async () => ({ success: false }),
                DownloadUpdate: async () => ({ success: false }),
                GetSavedConnections: async () => cloneBrowserMockValue(mockConnections),
                GetEditableSavedConnection: async (id: string) => {
                    const existing = mockConnections.find((item) => item.id === id);
                    if (!existing) {
                        throw new Error(`saved connection not found: ${id}`);
                    }
                    const secrets = mockConnectionSecrets.get(id) || {};
                    return cloneBrowserMockValue({
                        ...existing,
                        config: {
                            ...existing.config,
                            password: secrets.password || '',
                            ssh: { ...(existing.config?.ssh || {}), password: secrets.sshPassword || '' },
                            proxy: { ...(existing.config?.proxy || {}), password: secrets.proxyPassword || '' },
                            httpTunnel: { ...(existing.config?.httpTunnel || {}), password: secrets.httpTunnelPassword || '' },
                            mysqlReplicaPassword: secrets.mysqlReplicaPassword || '',
                            mongoReplicaPassword: secrets.mongoReplicaPassword || '',
                            uri: secrets.uri || '',
                            dsn: secrets.dsn || '',
                        },
                    });
                },
                ListInstalledFontFamilies: async () => ({ success: true, data: [] }),
                SaveConnection: async (input: any) => saveMockConnection(input),
                DeleteConnection: async (id: string) => {
                    const index = mockConnections.findIndex((item) => item.id === id);
                    if (index >= 0) {
                        mockConnections.splice(index, 1);
                    }
                    return null;
                },
                DuplicateConnection: async (id: string) => {
                    const existing = mockConnections.find((item) => item.id === id);
                    if (!existing) return null;
                    const duplicated = duplicateBrowserMockConnection({
                        existing,
                        items: mockConnections,
                        nextId: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    });
                    mockConnections.push(duplicated);
                    return cloneBrowserMockValue(duplicated);
                },
                ImportLegacyConnections: async (items: any[]) => items.map((item) => saveMockConnection(item)),
                OpenConnection: async () => null,
                CloseConnection: async () => null,
                GetDatabases: async () => [],
                GetTables: async () => [],
                GetTableData: async () => ({ columns: [], rows: [], total: 0 }),
                GetTableColumns: async () => [],
                ExecuteQuery: async () => ({ columns: [], rows: [], time: 0 }),
                GetSavedQueries: async () => [],
                SaveQuery: async () => null,
                DeleteQuery: async () => null,
                GetAppInfo: async () => ({}),
                GetDataRootDirectoryInfo: async () => ({ success: true, data: cloneBrowserMockValue(mockDataRootInfo) }),
                CheckForUpdates: async () => ({ success: false }),
                CheckForUpdatesSilently: async () => ({ success: false }),
                OpenDownloadedUpdateDirectory: async () => ({ success: false }),
                OpenDriverDownloadDirectory: async (path: string) => ({ success: true, data: { path } }),
                OpenDataRootDirectory: async () => ({ success: true }),
                SelectSQLDirectory: async (currentPath: string) => ({ success: false, message: currentPath ? '已取消' : '已取消' }),
                ListSQLDirectory: async () => ({ success: true, data: [] }),
                ReadSQLFile: async () => ({ success: false, message: '已取消' }),
                ReadAppLogTail: async (lineLimit: number, keyword: string) => {
                    const allLines = [
                        '2026/06/09 10:10:00.000000 [INFO] 应用启动完成',
                        '2026/06/09 10:10:05.000000 [WARN] MCP mock service slow start',
                        '2026/06/09 10:10:09.000000 [ERROR] MySQL mock dial failed: connect timeout',
                    ];
                    const normalizedKeyword = String(keyword || '').trim().toLowerCase();
                    const filtered = normalizedKeyword
                        ? allLines.filter((line) => line.toLowerCase().includes(normalizedKeyword))
                        : allLines;
                    const safeLimit = Math.max(1, Math.min(Number(lineLimit) || 80, 200));
                    const visibleLines = filtered.slice(-safeLimit);
                    return {
                        success: true,
                        data: {
                            logPath: 'C:/Users/mock/.GoNavi/Logs/gonavi.log',
                            keyword: String(keyword || ''),
                            requestedLineLimit: safeLimit,
                            returnedLineCount: visibleLines.length,
                            fileWindowTruncated: false,
                            matchedLinesTruncated: filtered.length > visibleLines.length,
                            levelBreakdown: {
                                INFO: visibleLines.filter((line) => line.includes('[INFO]')).length,
                                WARN: visibleLines.filter((line) => line.includes('[WARN]')).length,
                                ERROR: visibleLines.filter((line) => line.includes('[ERROR]')).length,
                                OTHER: visibleLines.filter((line) => !/\[(INFO|WARN|ERROR)\]/.test(line)).length,
                            },
                            lines: visibleLines,
                        },
                    };
                },
                CreateSQLFile: async (_directoryPath: string, _name: string) => ({ success: true, data: { filePath: '', name: _name } }),
                CreateSQLDirectory: async (directoryPath: string, name: string) => ({ success: true, data: { directoryPath: `${directoryPath}/${name}`, name } }),
                DeleteSQLFile: async (_filePath: string) => ({ success: true }),
                DeleteSQLDirectory: async (_directoryPath: string) => ({ success: true }),
                RenameSQLFile: async (_filePath: string, name: string) => ({ success: true, data: { filePath: _filePath, name } }),
                RenameSQLDirectory: async (directoryPath: string, name: string) => ({ success: true, data: { directoryPath: `${directoryPath.replace(/[\\/][^\\/]*$/, '')}/${name}`, name } }),
                WriteSQLFile: async (_filePath: string, _content: string) => ({ success: true }),
                ExportSQLFile: async (_defaultName: string, _content: string) => ({ success: false, message: '浏览器 mock 不支持 SQL 文件导出' }),
                InstallUpdateAndRestart: async () => ({ success: false }),
                ImportConfigFile: async () => ({ success: false, message: '已取消' }),
                ImportConnectionsPayload: async (raw: string, _password?: string) => {
                    try {
                        const parsed = JSON.parse(raw);
                        if (Array.isArray(parsed)) {
                            return parsed.map((item) => saveMockConnection(item));
                        }
                    } catch {
                        throw new Error('浏览器 mock 不支持恢复包导入，仅支持历史 JSON 连接数组');
                    }
                    throw new Error('浏览器 mock 不支持恢复包导入，仅支持历史 JSON 连接数组');
                },
                ExportConnectionsPackage: async (_options?: { includeSecrets?: boolean; filePassword?: string }) => ({ success: false, message: '浏览器 mock 不支持恢复包导出' }),
                ExportData: async () => ({ success: false }),
                GetGlobalProxyConfig: async () => ({ success: true, data: cloneBrowserMockValue(mockGlobalProxy) }),
                SaveGlobalProxy: async (input: any) => saveMockGlobalProxy(input),
                ImportLegacyGlobalProxy: async (input: any) => saveMockGlobalProxy(input),
                SelectDataRootDirectory: async (currentPath: string) => ({ success: true, data: { ...mockDataRootInfo, path: currentPath || mockDataRootInfo.path } }),
                ApplyDataRootDirectory: async (path: string) => {
                    const nextPath = String(path || mockDataRootInfo.defaultPath);
                    mockDataRootInfo = {
                        ...mockDataRootInfo,
                        path: nextPath,
                        driverPath: `${nextPath}/drivers`,
                        isDefaultPath: nextPath === mockDataRootInfo.defaultPath,
                    };
                    return { success: true, message: '数据目录已更新', data: cloneBrowserMockValue(mockDataRootInfo) };
                },
            }
        },
        aiservice: {
            Service: {
                AIGetProviders: async () => cloneBrowserMockValue(mockProviders),
                AIGetEditableProvider: async (id: string) => {
                    const existing = mockProviders.find((item) => item.id === id);
                    if (!existing) {
                        throw new Error(`provider not found: ${id}`);
                    }
                    return cloneBrowserMockValue({
                        ...existing,
                        apiKey: mockProviderSecrets.get(id) || '',
                    });
                },
                AISaveProvider: async (input: any) => saveMockProvider(input),
                AIDeleteProvider: async (id: string) => {
                    const index = mockProviders.findIndex((item) => item.id === id);
                    if (index >= 0) {
                        mockProviders.splice(index, 1);
                    }
                    mockProviderSecrets.delete(id);
                    if (mockActiveProviderId === id) {
                        mockActiveProviderId = mockProviders[0]?.id || '';
                    }
                    return null;
                },
                AIGetActiveProvider: async () => mockActiveProviderId,
                AISetActiveProvider: async (id: string) => {
                    mockActiveProviderId = id;
                    return null;
                },
                AIGetSafetyLevel: async () => mockAISafetyLevel,
                AIGetContextLevel: async () => mockAIContextLevel,
                AIGetBuiltinPrompts: async () => ({}),
                AIGetUserPromptSettings: async () => cloneBrowserMockValue(mockAIUserPromptSettings),
                AISaveUserPromptSettings: async (input: any) => {
                    mockAIUserPromptSettings = {
                        global: String(input?.global || ''),
                        database: String(input?.database || ''),
                        jvm: String(input?.jvm || ''),
                        jvmDiagnostic: String(input?.jvmDiagnostic || ''),
                    };
                    return null;
                },
                AIGetMCPClientInstallStatuses: async () => cloneBrowserMockValue(mockMCPClientStatuses),
                AIGetMCPHTTPServerStatus: async () => cloneBrowserMockValue(mockMCPHTTPServerStatus),
                AIStartMCPHTTPServer: async (input: any) => {
                    const addr = String(input?.addr || '127.0.0.1:8765');
                    const path = String(input?.path || '/mcp').startsWith('/') ? String(input?.path || '/mcp') : `/${String(input?.path || '/mcp')}`;
                    mockMCPHTTPServerStatus = {
                        running: true,
                        addr,
                        path,
                        url: `http://${addr}${path}`,
                        schemaOnly: true,
                        token: 'gnv_browser_mock_token',
                        authorizationHeader: 'Bearer gnv_browser_mock_token',
                        startedAt: Date.now(),
                        message: 'GoNavi MCP HTTP 服务已启动',
                    };
                    return cloneBrowserMockValue(mockMCPHTTPServerStatus);
                },
                AIStopMCPHTTPServer: async () => {
                    mockMCPHTTPServerStatus = {
                        ...mockMCPHTTPServerStatus,
                        running: false,
                        token: '',
                        authorizationHeader: '',
                        message: 'GoNavi MCP HTTP 服务已停止',
                    };
                    return cloneBrowserMockValue(mockMCPHTTPServerStatus);
                },
                AIGetMCPServers: async () => cloneBrowserMockValue(mockMCPServers),
                AIInstallClaudeCodeMCP: async () => {
                    mockMCPClientStatuses = mockMCPClientStatuses.map((item) => item.client === 'claude-code'
                        ? {
                            ...item,
                            installed: true,
                            matchesCurrent: true,
                            message: '已写入 Claude Code 用户级 MCP 配置，重启 Claude CLI 后可在 /mcp 的 User MCPs 中看到 GoNavi。',
                            command: 'C:/Program Files/GoNavi/GoNavi.exe',
                            args: ['mcp-server'],
                        }
                        : item);
                    return {
                        success: true,
                        client: 'claude-code',
                        message: '已写入 Claude Code 用户级 MCP 配置，重启 Claude CLI 后可在 /mcp 的 User MCPs 中看到 GoNavi。',
                        configPath: 'C:/Users/mock/.claude.json',
                        command: 'C:/Program Files/GoNavi/GoNavi.exe',
                        args: ['mcp-server'],
                    };
                },
                AIInstallCodexMCP: async () => {
                    mockMCPClientStatuses = mockMCPClientStatuses.map((item) => item.client === 'codex'
                        ? {
                            ...item,
                            installed: true,
                            matchesCurrent: true,
                            message: '已写入 Codex 用户级 MCP 配置，重启 Codex CLI 或桌面端后可看到 GoNavi。',
                            command: 'C:/Program Files/GoNavi/GoNavi.exe',
                            args: ['mcp-server'],
                        }
                        : item);
                    return {
                        success: true,
                        client: 'codex',
                        message: '已写入 Codex 用户级 MCP 配置，重启 Codex CLI 或桌面端后可看到 GoNavi。',
                        configPath: 'C:/Users/mock/.codex/config.toml',
                        command: 'C:/Program Files/GoNavi/GoNavi.exe',
                        args: ['mcp-server'],
                    };
                },
                AISaveMCPServer: async (input: any) => {
                    const next = {
                        id: String(input?.id || `mcp-${Date.now()}`),
                        name: String(input?.name || ''),
                        transport: 'stdio',
                        command: String(input?.command || ''),
                        args: Array.isArray(input?.args) ? [...input.args] : [],
                        env: { ...(input?.env || {}) },
                        enabled: input?.enabled !== false,
                        timeoutSeconds: Number(input?.timeoutSeconds) || 20,
                    };
                    const index = mockMCPServers.findIndex((item) => item.id === next.id);
                    if (index >= 0) mockMCPServers[index] = next;
                    else mockMCPServers.push(next);
                    return null;
                },
                AIDeleteMCPServer: async (id: string) => {
                    mockMCPServers = mockMCPServers.filter((item) => item.id !== id);
                    return null;
                },
                AITestMCPServer: async (input: any) => ({
                    success: String(input?.command || '').trim() !== '',
                    message: String(input?.command || '').trim() !== '' ? 'MCP mock 测试成功' : 'MCP 命令不能为空',
                    tools: [],
                }),
                AIListMCPTools: async () => [],
                AICallMCPTool: async (_alias: string, _argumentsJSON: string) => ({
                    alias: _alias,
                    serverId: '',
                    serverName: '',
                    originalName: _alias,
                    content: '浏览器 mock 未接入真实 MCP 服务',
                    isError: true,
                }),
                AIGetSkills: async () => cloneBrowserMockValue(mockSkills),
                AISaveSkill: async (input: any) => {
                    const next = {
                        id: String(input?.id || `skill-${Date.now()}`),
                        name: String(input?.name || ''),
                        description: String(input?.description || ''),
                        systemPrompt: String(input?.systemPrompt || ''),
                        enabled: input?.enabled !== false,
                        scopes: Array.isArray(input?.scopes) ? [...input.scopes] : ['global'],
                        requiredTools: Array.isArray(input?.requiredTools) ? [...input.requiredTools] : [],
                    };
                    const index = mockSkills.findIndex((item) => item.id === next.id);
                    if (index >= 0) mockSkills[index] = next;
                    else mockSkills.push(next);
                    return null;
                },
                AIDeleteSkill: async (id: string) => {
                    mockSkills = mockSkills.filter((item) => item.id !== id);
                    return null;
                },
                AITestProvider: async (input: any) => ({
                    success: String(input?.apiKey || '').trim() !== '',
                    message: String(input?.apiKey || '').trim() !== '' ? '端点连通性测试成功！' : '连接测试失败: missing api key',
                }),
                AISetSafetyLevel: async (level: string) => {
                    mockAISafetyLevel = String(level || 'readonly');
                    return null;
                },
                AISetContextLevel: async (level: string) => {
                    mockAIContextLevel = String(level || 'schema_only');
                    return null;
                },
            },
        }
    };
    const existingGo = (window as any).go || {};
    (window as any).go = {
        ...mockGo,
        ...existingGo,
        app: {
            ...mockGo.app,
            ...(existingGo.app || {}),
            App: {
                ...mockGo.app.App,
                ...(existingGo.app?.App || {}),
            },
        },
        aiservice: {
            ...mockGo.aiservice,
            ...(existingGo.aiservice || {}),
            Service: {
                ...mockGo.aiservice.Service,
                ...(existingGo.aiservice?.Service || {}),
            },
        },
    };
}
const rootNode = document.getElementById('root')!;
const devHarnessMode = import.meta.env.DEV ? resolveDevHarnessMode() : '';
const renderRoot = async () => {
    let rootComponent = <App />;
    if (devHarnessMode === 'datagrid-perf') {
        const { default: PerfDataGridHarness } = await import('./dev/PerfDataGridHarness');
        rootComponent = <PerfDataGridHarness />;
    }

    ReactDOM.createRoot(rootNode).render(
      <React.StrictMode>
        {rootComponent}
      </React.StrictMode>,
    );
};

void renderRoot();
