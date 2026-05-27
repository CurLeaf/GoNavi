import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import PerfDataGridHarness from './dev/PerfDataGridHarness'
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

if (typeof window !== 'undefined' && !(window as any).go) {
    const mockConnections: any[] = [];
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
        const config = (input?.config && typeof input.config === 'object') ? input.config : {};
        const ssh = (config.ssh && typeof config.ssh === 'object') ? config.ssh : {};
        const proxy = (config.proxy && typeof config.proxy === 'object') ? config.proxy : {};
        const httpTunnel = (config.httpTunnel && typeof config.httpTunnel === 'object') ? config.httpTunnel : {};
        const nextId = String(input?.id || existing?.id || `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
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

    (window as any).go = {
        app: {
            App: {
                CheckUpdate: async () => ({ success: false }),
                DownloadUpdate: async () => ({ success: false }),
                GetSavedConnections: async () => cloneBrowserMockValue(mockConnections),
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
                WriteSQLFile: async (_filePath: string, _content: string) => ({ success: true }),
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
        }
    };
}
const rootNode = document.getElementById('root')!;
const devHarnessMode = import.meta.env.DEV ? resolveDevHarnessMode() : '';
const rootComponent = devHarnessMode === 'datagrid-perf'
    ? <PerfDataGridHarness />
    : <App />;

ReactDOM.createRoot(rootNode).render(
  <React.StrictMode>
    {rootComponent}
  </React.StrictMode>,
)


