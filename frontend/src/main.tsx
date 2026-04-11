import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// import './index.css' // Optional global styles

// 全局配置 dayjs 使用中文 locale，使 Ant Design 的 DatePicker/TimePicker 等组件
// 的月份、星期等文本显示为中文。必须在 Ant Design 组件渲染前完成配置。
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
dayjs.locale('zh-cn')

// 全局配置 Monaco Editor 使用本地打包的文件，避免从 CDN (jsdelivr) 加载。
// Windows WebView2 环境下访问外部 CDN 可能失败，导致编辑器一直显示 Loading。
// 中文语言包必须在 monaco-editor 主包之前导入，否则右键菜单等 UI 仍为英文。
import 'monaco-editor/esm/nls.messages.zh-cn'
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import { cloneBrowserMockValue, duplicateBrowserMockConnection, resolveBrowserMockSecretFlag } from './utils/browserMockConnections'
loader.config({ monaco })

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
                OpenDownloadedUpdateDirectory: async () => ({ success: false }),
                OpenDataRootDirectory: async () => ({ success: true }),
                InstallUpdateAndRestart: async () => ({ success: false }),
                ImportConfigFile: async () => ({ success: false }),
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
// 全局注册透明主题，避免每个 Editor 组件 beforeMount 中重复定义
monaco.editor.defineTheme('transparent-dark', {
  base: 'vs-dark', inherit: true, rules: [],
  colors: { 'editor.background': '#00000000', 'editor.lineHighlightBackground': '#ffffff10', 'editorGutter.background': '#00000000', 'editorStickyScroll.background': '#1e1e1e', 'editorStickyScrollHover.background': '#2a2a2a' }
})
monaco.editor.defineTheme('transparent-light', {
  base: 'vs', inherit: true, rules: [],
  colors: { 'editor.background': '#00000000', 'editor.lineHighlightBackground': '#00000010', 'editorGutter.background': '#00000000', 'editorStickyScroll.background': '#ffffff', 'editorStickyScrollHover.background': '#f5f5f5' }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)



