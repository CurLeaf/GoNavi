import React, { useEffect, useSyncExternalStore } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// import './index.css' // Optional global styles

import { setCurrentLanguage, t } from './i18n'
import { I18nProvider } from './i18n/provider'
import { applyDayjsLocale } from './i18n/runtime'
import { useStore } from './store'
import { cloneBrowserMockValue, duplicateBrowserMockConnection, resolveBrowserMockSecretFlag } from './utils/browserMockConnections'
import RootErrorBoundary from './components/RootErrorBoundary'
import { hideBootSplash } from './utils/bootSplash'
import { signalMainWindowFrontendReady, waitForMainWindowContentPaint } from './utils/mainWindowStartup'
import { configureAntdStaticOverlayLayer } from './utils/overlayZIndex'
import { normalizeConnectionEnvironmentType } from './utils/connectionEnvironment'

configureAntdStaticOverlayLayer();

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

const devHarnessMode = import.meta.env.DEV ? resolveDevHarnessMode() : '';
const isPerfDataGridHarness = devHarnessMode === 'datagrid-perf';

if (
    typeof window !== 'undefined'
    && (
        typeof (window as any).go?.app?.App?.GetSavedConnections !== 'function'
    )
) {
    const existingRuntime = (window as any).runtime || {};
    const existingEnvironment = existingRuntime.Environment;
    const existingEventsOnMultiple = existingRuntime.EventsOnMultiple;
    const existingEventsEmit = existingRuntime.EventsEmit;
    const localRuntimeEventListeners = new Map<string, Set<(...args: any[]) => void>>();
    const emitLocalRuntimeEvent = (eventName: string, ...args: any[]) => {
        for (const listener of [...(localRuntimeEventListeners.get(eventName) || [])]) {
            listener(...args);
        }
    };
    const subscribeLocalRuntimeEvent = (
        eventName: string,
        callback: (...args: any[]) => void,
        maxCallbacks: number,
    ) => {
        let remaining = maxCallbacks;
        const listener = (...args: any[]) => {
            callback(...args);
            if (remaining > 0) {
                remaining -= 1;
                if (remaining === 0) {
                    localRuntimeEventListeners.get(eventName)?.delete(listener);
                }
            }
        };
        const listeners = localRuntimeEventListeners.get(eventName) || new Set();
        listeners.add(listener);
        localRuntimeEventListeners.set(eventName, listeners);
        return () => {
            listeners.delete(listener);
            if (listeners.size === 0) localRuntimeEventListeners.delete(eventName);
        };
    };
    (window as any).runtime = {
        ...existingRuntime,
        Environment: async () => {
            const detected = typeof existingEnvironment === 'function'
                ? await existingEnvironment()
                : {};
            if (String(detected?.buildType || '').trim()) {
                return detected;
            }
            return { ...detected, platform: 'browser', buildType: 'web' };
        },
        EventsOnMultiple: (eventName: string, callback: (...args: any[]) => void, maxCallbacks = -1) => {
            const offExisting = typeof existingEventsOnMultiple === 'function'
                ? existingEventsOnMultiple(eventName, callback, maxCallbacks)
                : undefined;
            const offLocal = subscribeLocalRuntimeEvent(eventName, callback, maxCallbacks);
            return () => {
                offLocal();
                if (typeof offExisting === 'function') offExisting();
            };
        },
        EventsOff: (eventName: string, ...additionalEventNames: string[]) => {
            existingRuntime.EventsOff?.(eventName, ...additionalEventNames);
            for (const name of [eventName, ...additionalEventNames]) {
                localRuntimeEventListeners.delete(name);
            }
        },
        EventsOffAll: () => {
            existingRuntime.EventsOffAll?.();
            localRuntimeEventListeners.clear();
        },
        EventsEmit: (eventName: string, ...args: any[]) => {
            existingEventsEmit?.(eventName, ...args);
            emitLocalRuntimeEvent(eventName, ...args);
        },
    };

    const mockConnections: any[] = isPerfDataGridHarness ? [{
        id: 'perf-conn',
        name: 'Perf Data Grid',
        config: {
            id: 'perf-conn',
            type: 'mysql',
            host: '127.0.0.1',
            port: 3306,
            user: 'root',
            database: 'perf_lab',
        },
    }] : [];
    let mockConnectionSidebarLayout: any = {
        initialized: false,
        revision: 0,
        connectionTags: [],
        sidebarRootOrder: [],
        rootSortMode: 'manual',
        rootConnectionSortMode: 'createdAt',
    };
    const mockSavedQueries: any[] = [];
    const mockSavedQueryGroups: any[] = [];
    const mockQueryTables = [
        { table_name: 'videos', table_comment: 'sample video records' },
        { table_name: 'users', table_comment: 'sample users' },
        ...(isPerfDataGridHarness ? [{ table_name: 'perf_grid', table_comment: 'data grid performance harness' }] : []),
    ];
    const mockQueryColumns = [
        { tableName: 'videos', name: 'id', type: 'bigint', comment: 'primary key' },
        { tableName: 'videos', name: 'code', type: 'varchar', comment: 'video code' },
        { tableName: 'videos', name: 'title', type: 'varchar', comment: 'video title' },
        { tableName: 'users', name: 'id', type: 'bigint', comment: 'primary key' },
        { tableName: 'users', name: 'name', type: 'varchar', comment: 'display name' },
        ...(isPerfDataGridHarness ? [
            { tableName: 'perf_grid', name: 'id', type: 'bigint', comment: 'primary key' },
            { tableName: 'perf_grid', name: 'created_at', type: 'datetime', comment: 'created time' },
            { tableName: 'perf_grid', name: 'updated_at', type: 'timestamp', comment: 'updated time' },
            { tableName: 'perf_grid', name: 'register_date', type: 'date', comment: 'date with preserved time' },
            { tableName: 'perf_grid', name: 'status', type: 'varchar', comment: 'record status' },
        ] : []),
    ];
    const mockConnectionSecrets = new Map<string, any>();
    let mockGlobalProxy: any = { enabled: false, type: 'socks5', host: '', port: 1080, user: '', password: '', hasPassword: false };
    let mockDownloadSource: 'cst' | 'bero' | 'github' = 'cst';
    let mockDataRootInfo: any = {
        path: 'C:/mock/.gonavi',
        defaultPath: 'C:/mock/.gonavi',
        driverPath: 'C:/mock/.gonavi/drivers',
        isDefaultPath: true,
        bootstrapPath: 'C:/mock/.gonavi/storage_root.json',
        logDirectory: 'C:/Users/mock/.GoNavi/Logs',
        activeLogDirectory: 'C:/Users/mock/.GoNavi/Logs',
        logFilePath: 'C:/Users/mock/.GoNavi/Logs/gonavi.log',
        defaultLogDirectory: 'C:/Users/mock/.GoNavi/Logs',
        logDirectorySource: 'default',
        logDirectoryEditable: true,
        logDirectoryRestartRequired: false,
        savedQueryDirectory: 'C:/mock/.gonavi/saved_queries',
        defaultSavedQueryDirectory: 'C:/mock/.gonavi/saved_queries',
        savedQueryDirectorySource: 'default',
    };
    const upsertMockConnection = (view: any) => {
        const index = mockConnections.findIndex((item) => item.id === view.id);
        if (index >= 0) {
            mockConnections[index] = view;
            return;
        }
        mockConnections.push(view);
    };

    const retainMockConnectionSecret = (value: unknown, existingValue: unknown): string => {
        const nextValue = String(value ?? '');
        return nextValue !== '' ? nextValue : String(existingValue ?? '');
    };

    const saveMockConnection = (input: any) => {
        const existing = mockConnections.find((item) => item.id === input?.id);
        const hasIncludeDatabases = Object.prototype.hasOwnProperty.call(input || {}, 'includeDatabases');
        const hasIncludeDatabasePatterns = Object.prototype.hasOwnProperty.call(input || {}, 'includeDatabasePatterns');
        const hasExcludeDatabasePatterns = Object.prototype.hasOwnProperty.call(input || {}, 'excludeDatabasePatterns');
        const hasIncludeRedisDatabases = Object.prototype.hasOwnProperty.call(input || {}, 'includeRedisDatabases');
        const hasSchemaVisibilityByDatabase = Object.prototype.hasOwnProperty.call(input || {}, 'schemaVisibilityByDatabase');
        const existingSecrets = existing ? (mockConnectionSecrets.get(existing.id) || {}) : {};
        const config = (input?.config && typeof input.config === 'object') ? input.config : {};
        const ssh = (config.ssh && typeof config.ssh === 'object') ? config.ssh : {};
        const proxy = (config.proxy && typeof config.proxy === 'object') ? config.proxy : {};
        const httpTunnel = (config.httpTunnel && typeof config.httpTunnel === 'object') ? config.httpTunnel : {};
        const nextId = String(input?.id || existing?.id || `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
        const nextSecrets: Record<string, string> = {
            password: retainMockConnectionSecret(config.password, existingSecrets.password),
            sshPassword: retainMockConnectionSecret(ssh.password, existingSecrets.sshPassword),
            proxyPassword: retainMockConnectionSecret(proxy.password, existingSecrets.proxyPassword),
            httpTunnelPassword: retainMockConnectionSecret(httpTunnel.password, existingSecrets.httpTunnelPassword),
            mysqlReplicaPassword: retainMockConnectionSecret(config.mysqlReplicaPassword, existingSecrets.mysqlReplicaPassword),
            mongoReplicaPassword: retainMockConnectionSecret(config.mongoReplicaPassword, existingSecrets.mongoReplicaPassword),
            redisSentinelPassword: retainMockConnectionSecret(config.redisSentinelPassword, existingSecrets.redisSentinelPassword),
            uri: retainMockConnectionSecret(config.uri, existingSecrets.uri),
            dsn: retainMockConnectionSecret(config.dsn, existingSecrets.dsn),
        };
        if (input?.clearPrimaryPassword) delete nextSecrets.password;
        if (input?.clearSSHPassword) delete nextSecrets.sshPassword;
        if (input?.clearProxyPassword) delete nextSecrets.proxyPassword;
        if (input?.clearHttpTunnelPassword) delete nextSecrets.httpTunnelPassword;
        if (input?.clearMySQLReplicaPassword) delete nextSecrets.mysqlReplicaPassword;
        if (input?.clearMongoReplicaPassword) delete nextSecrets.mongoReplicaPassword;
        if (input?.clearRedisSentinelPassword) delete nextSecrets.redisSentinelPassword;
        if (input?.clearOpaqueURI) delete nextSecrets.uri;
        if (input?.clearOpaqueDSN) delete nextSecrets.dsn;
        Object.entries(nextSecrets).forEach(([key, value]) => {
            if (value === '') delete nextSecrets[key];
        });
        if (Object.keys(nextSecrets).length > 0) {
            mockConnectionSecrets.set(nextId, nextSecrets);
        } else {
            mockConnectionSecrets.delete(nextId);
        }
        const view = {
            id: nextId,
            name: String(input?.name || existing?.name || t('connection.unnamed')),
            environmentType: normalizeConnectionEnvironmentType(
                input?.environmentType ?? existing?.environmentType,
            ),
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
                redisSentinelPassword: '',
            },
            includeDatabases: hasIncludeDatabases
                ? (Array.isArray(input?.includeDatabases) ? [...input.includeDatabases] : undefined)
                : existing?.includeDatabases,
            includeDatabasePatterns: hasIncludeDatabasePatterns
                ? (Array.isArray(input?.includeDatabasePatterns) ? [...input.includeDatabasePatterns] : undefined)
                : existing?.includeDatabasePatterns,
            excludeDatabasePatterns: hasExcludeDatabasePatterns
                ? (Array.isArray(input?.excludeDatabasePatterns) ? [...input.excludeDatabasePatterns] : undefined)
                : existing?.excludeDatabasePatterns,
            includeRedisDatabases: hasIncludeRedisDatabases
                ? (Array.isArray(input?.includeRedisDatabases) ? [...input.includeRedisDatabases] : undefined)
                : existing?.includeRedisDatabases,
            schemaVisibilityByDatabase: hasSchemaVisibilityByDatabase
                ? (input?.schemaVisibilityByDatabase && typeof input.schemaVisibilityByDatabase === 'object'
                    ? cloneBrowserMockValue(input.schemaVisibilityByDatabase)
                    : undefined)
                : existing?.schemaVisibilityByDatabase,
            iconType: typeof input?.iconType === 'string' ? input.iconType : (existing?.iconType || ''),
            iconColor: typeof input?.iconColor === 'string' ? input.iconColor : (existing?.iconColor || ''),
            hasPrimaryPassword: resolveBrowserMockSecretFlag(config.password, !!input?.clearPrimaryPassword, existing?.hasPrimaryPassword),
            hasSSHPassword: resolveBrowserMockSecretFlag(ssh.password, !!input?.clearSSHPassword, existing?.hasSSHPassword),
            hasProxyPassword: resolveBrowserMockSecretFlag(proxy.password, !!input?.clearProxyPassword, existing?.hasProxyPassword),
            hasHttpTunnelPassword: resolveBrowserMockSecretFlag(httpTunnel.password, !!input?.clearHttpTunnelPassword, existing?.hasHttpTunnelPassword),
            hasMySQLReplicaPassword: resolveBrowserMockSecretFlag(config.mysqlReplicaPassword, !!input?.clearMySQLReplicaPassword, existing?.hasMySQLReplicaPassword),
            hasMongoReplicaPassword: resolveBrowserMockSecretFlag(config.mongoReplicaPassword, !!input?.clearMongoReplicaPassword, existing?.hasMongoReplicaPassword),
            hasRedisSentinelPassword: resolveBrowserMockSecretFlag(config.redisSentinelPassword, !!input?.clearRedisSentinelPassword, existing?.hasRedisSentinelPassword),
            hasOpaqueURI: resolveBrowserMockSecretFlag(config.uri, !!input?.clearOpaqueURI, existing?.hasOpaqueURI),
            hasOpaqueDSN: resolveBrowserMockSecretFlag(config.dsn, !!input?.clearOpaqueDSN, existing?.hasOpaqueDSN),
        };
        upsertMockConnection(view);
        return cloneBrowserMockValue(view);
    };

    const updateMockConnectionVisibility = (input: any) => {
        const existing = mockConnections.find((item) => item.id === input?.id);
        if (!existing) {
            throw new Error(`saved connection not found: ${String(input?.id || '')}`);
        }
        const updated = {
            ...existing,
            includeDatabases: Array.isArray(input?.includeDatabases) ? [...input.includeDatabases] : undefined,
            includeDatabasePatterns: Array.isArray(input?.includeDatabasePatterns) ? [...input.includeDatabasePatterns] : undefined,
            excludeDatabasePatterns: Array.isArray(input?.excludeDatabasePatterns) ? [...input.excludeDatabasePatterns] : undefined,
            includeRedisDatabases: Array.isArray(input?.includeRedisDatabases) ? [...input.includeRedisDatabases] : undefined,
            schemaVisibilityByDatabase: input?.schemaVisibilityByDatabase && typeof input.schemaVisibilityByDatabase === 'object'
                ? cloneBrowserMockValue(input.schemaVisibilityByDatabase)
                : undefined,
        };
        upsertMockConnection(updated);
        return cloneBrowserMockValue(updated);
    };

    const saveMockQuery = (input: any) => {
        const nextId = String(input?.id || `saved-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
        const index = mockSavedQueries.findIndex((item) => item.id === nextId);
        const generatedNameIndex = index >= 0 ? index : mockSavedQueries.length;
        const view = {
            id: nextId,
            name: String(input?.name || t('saved_query.default_name', { index: generatedNameIndex + 1 })),
            sql: String(input?.sql || ''),
            connectionId: String(input?.connectionId || ''),
            dbName: String(input?.dbName || ''),
            createdAt: Number.isFinite(Number(input?.createdAt)) ? Number(input.createdAt) : Date.now(),
            connectionFingerprint: typeof input?.connectionFingerprint === 'string' ? input.connectionFingerprint : undefined,
            fingerprintVersion: typeof input?.fingerprintVersion === 'string' ? input.fingerprintVersion : undefined,
            bindingStatus: typeof input?.bindingStatus === 'string' ? input.bindingStatus : undefined,
            originalConnectionId: typeof input?.originalConnectionId === 'string' ? input.originalConnectionId : undefined,
        };
        if (index >= 0) {
            mockSavedQueries[index] = view;
        } else {
            mockSavedQueries.push(view);
        }
        return cloneBrowserMockValue(view);
    };

    const uniqueMockStringArray = (value: unknown): string[] => {
        if (!Array.isArray(value)) return [];
        const seen = new Set<string>();
        return value.reduce<string[]>((result, item) => {
            const next = String(item || '').trim();
            if (!next || seen.has(next)) return result;
            seen.add(next);
            result.push(next);
            return result;
        }, []);
    };

    const saveMockSavedQueryGroup = (input: any) => {
        const nextId = String(input?.id || `saved-query-group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
        const index = mockSavedQueryGroups.findIndex((item) => item.id === nextId);
        const existing = index >= 0 ? mockSavedQueryGroups[index] : undefined;
        const queryIds = uniqueMockStringArray(input?.queryIds);
        const childOrder = uniqueMockStringArray(input?.childOrder);
        const view = {
            id: nextId,
            name: String(input?.name || existing?.name || t('sidebar.saved_query_group.untitled')).trim(),
            parentGroupId: String(input?.parentGroupId || '').trim() || undefined,
            queryIds,
            childOrder,
        };
        if (index >= 0) {
            mockSavedQueryGroups[index] = view;
        } else {
            mockSavedQueryGroups.push(view);
        }
        mockSavedQueryGroups.forEach((group) => {
            if (group.id === nextId) return;
            group.queryIds = uniqueMockStringArray(group.queryIds).filter((queryId) => !queryIds.includes(queryId));
            group.childOrder = uniqueMockStringArray(group.childOrder)
                .filter((token) => !queryIds.includes(String(token).replace(/^query:/, '')));
        });
        return cloneBrowserMockValue(view);
    };

    const deleteMockSavedQueryGroup = (id: string) => {
        const index = mockSavedQueryGroups.findIndex((item) => item.id === id);
        if (index < 0) return;
        const removed = mockSavedQueryGroups[index];
        mockSavedQueryGroups.splice(index, 1);
        mockSavedQueryGroups.forEach((group) => {
            if (group.parentGroupId === removed.id) {
                group.parentGroupId = removed.parentGroupId || undefined;
            }
            if (group.id === removed.parentGroupId) {
                group.queryIds = uniqueMockStringArray([...(group.queryIds || []), ...(removed.queryIds || [])]);
                group.childOrder = uniqueMockStringArray([
                    ...(group.childOrder || []).filter((token: string) => token !== `group:${removed.id}`),
                    ...(removed.childOrder || []),
                ]);
            }
        });
    };

    const saveMockGlobalProxy = (input: any) => {
        const nextPassword = String(input?.password ?? '');
        const clearPassword = input?.clearPassword === true;
        mockGlobalProxy = {
            ...mockGlobalProxy,
            ...input,
            password: '',
            hasPassword: clearPassword ? false : (nextPassword !== '' ? true : !!mockGlobalProxy.hasPassword),
            clearPassword: undefined,
        };
        return cloneBrowserMockValue(mockGlobalProxy);
    };

    const mockGo = {
        app: {
            App: {
                SetLanguage: async () => null,
                GetSavedConnections: async () => cloneBrowserMockValue(mockConnections),
                BootstrapConnectionSidebarLayout: async (input: any) => {
                    if (
                        !mockConnectionSidebarLayout.initialized
                        && Array.isArray(input?.connectionTags)
                        && input.connectionTags.length > 0
                    ) {
                        mockConnectionSidebarLayout = {
                            initialized: true,
                            revision: 1,
                            connectionTags: cloneBrowserMockValue(input.connectionTags),
                            sidebarRootOrder: cloneBrowserMockValue(input.sidebarRootOrder || []),
                            rootSortMode: 'manual',
                            rootConnectionSortMode: input?.rootConnectionSortMode === 'manual' || input?.rootConnectionSortMode === 'name' ? input.rootConnectionSortMode : 'createdAt',
                        };
                    }
                    return cloneBrowserMockValue(mockConnectionSidebarLayout);
                },
                SaveConnectionSidebarLayout: async (input: any) => {
                    if (Number(input?.expectedRevision) !== Number(mockConnectionSidebarLayout.revision)) {
                        return {
                            conflict: true,
                            layout: cloneBrowserMockValue(mockConnectionSidebarLayout),
                        };
                    }
                    const layout = input?.layout || {};
                    mockConnectionSidebarLayout = {
                        initialized: true,
                        revision: Number(mockConnectionSidebarLayout.revision) + 1,
                        connectionTags: cloneBrowserMockValue(layout.connectionTags || []),
                        sidebarRootOrder: cloneBrowserMockValue(layout.sidebarRootOrder || []),
                        rootSortMode: 'manual',
                        rootConnectionSortMode: layout.rootConnectionSortMode === 'manual' || layout.rootConnectionSortMode === 'name' ? layout.rootConnectionSortMode : 'createdAt',
                    };
                    return {
                        conflict: false,
                        layout: cloneBrowserMockValue(mockConnectionSidebarLayout),
                    };
                },
                LoadConnectionSidebarLayout: async () => cloneBrowserMockValue(mockConnectionSidebarLayout),
                GetEditableSavedConnection: async (id: string) => {
                    const existing = mockConnections.find((item) => item.id === id);
                    if (!existing) {
                        throw new Error(`saved connection not found: ${id}`);
                    }
                    return cloneBrowserMockValue(existing);
                },
                RevealSavedConnectionPrimaryPassword: async (id: string) => {
                    const existing = mockConnections.find((item) => item.id === id);
                    if (!existing) {
                        throw new Error(`saved connection not found: ${id}`);
                    }
                    const password = String(mockConnectionSecrets.get(id)?.password || '');
                    if (!existing.hasPrimaryPassword || password === '') {
                        throw new Error(`saved connection has no stored primary password: ${id}`);
                    }
                    return password;
                },
                ListInstalledFontFamilies: async () => ({ success: true, data: [] }),
                SaveConnection: async (input: any) => saveMockConnection(input),
                UpdateConnectionVisibility: async (input: any) => updateMockConnectionVisibility(input),
                DeleteConnection: async (id: string) => {
                    const index = mockConnections.findIndex((item) => item.id === id);
                    if (index >= 0) {
                        mockConnections.splice(index, 1);
                    }
                    mockConnectionSecrets.delete(id);
                    return null;
                },
                DeleteConnections: async (ids: string[]) => {
                    const requested = new Set((Array.isArray(ids) ? ids : []).map((id) => String(id).trim()).filter(Boolean));
                    for (let index = mockConnections.length - 1; index >= 0; index -= 1) {
                        if (requested.has(String(mockConnections[index]?.id || ''))) {
                            mockConnectionSecrets.delete(mockConnections[index].id);
                            mockConnections.splice(index, 1);
                        }
                    }
                    requested.forEach((id) => mockConnectionSecrets.delete(id));
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
                    const existingSecrets = mockConnectionSecrets.get(id);
                    if (existingSecrets) {
                        mockConnectionSecrets.set(
                            duplicated.id,
                            cloneBrowserMockValue(existingSecrets),
                        );
                    }
                    return cloneBrowserMockValue(duplicated);
                },
                ImportLegacyConnections: async (items: any[]) => items.map((item) => saveMockConnection(item)),
                OpenConnection: async () => null,
                CloseConnection: async () => null,
                GetDatabases: async () => [],
                GetTables: async () => [],
                GetTableData: async () => ({ columns: [], rows: [], total: 0 }),
                GetTableColumns: async () => [],
                DBGetDatabases: async () => ({ success: true, data: ['missav_bot'] }),
                DBGetTables: async () => ({ success: true, data: cloneBrowserMockValue(mockQueryTables) }),
                DataSyncCapability: async (sourceConfig: any, targetConfig: any) => {
                    const sourceType = String(sourceConfig?.type || sourceConfig?.driver || '').trim().toLowerCase();
                    const targetType = String(targetConfig?.type || targetConfig?.driver || '').trim().toLowerCase();
                    const canExecute = sourceType !== '' && targetType !== '';
                    return {
                        sourceType,
                        targetType,
                        sourceModel: 'custom',
                        targetModel: 'custom',
                        planner: canExecute ? 'browser-mock-existing-target' : '',
                        supportLevel: canExecute ? 'partial' : 'unsupported',
                        canExecute,
                        supportsAutoCreate: false,
                        supportsAutoAddColumns: false,
                        requiresExistingTarget: true,
                    };
                },
                DBGetAllColumns: async () => ({ success: true, data: cloneBrowserMockValue(mockQueryColumns) }),
                DBGetDatabaseForeignKeys: async () => ({ success: true, data: {} }),
                DBGetColumns: async (_config: any, _dbName: string, tableName: string) => ({
                    success: true,
                    data: cloneBrowserMockValue(
                        mockQueryColumns
                            .filter((column) => String(column.tableName || '').toLowerCase() === String(tableName || '').toLowerCase())
                            .map(({ tableName: _tableName, ...column }) => column),
                    ),
                }),
                DBQuery: async () => ({ success: true, data: [], columns: [] }),
                DBQueryAudited: async () => ({ success: true, data: { affectedRows: 1 }, queryId: `query-${Date.now()}` }),
                ExecuteQuery: async () => ({ columns: [], rows: [], time: 0 }),
                GetSQLAuditEvents: async (filter: any) => ({
                    success: true,
                    data: {
                        items: [],
                        total: 0,
                        page: Number(filter?.page) || 1,
                        pageSize: Number(filter?.pageSize) || 50,
                        summary: { totalEvents: 0, successCount: 0, errorCount: 0, transactionCount: 0 },
                    },
                }),
                GetSQLAuditHealth: async () => ({
                    success: true,
                    data: {
                        status: 'healthy',
                        captureEnabled: true,
                        captureMode: 'redacted',
                        droppedEvents: 0,
                        firstFailureAt: 0,
                        lastFailureAt: 0,
                        lastSuccessAt: 0,
                        lastError: '',
                    },
                }),
                GetSQLAuditSettings: async () => ({ success: true, data: { enabled: true, captureMode: 'redacted', retentionDays: 30, maxRecords: 100000 } }),
                UpdateSQLAuditSettings: async () => ({ success: true }),
                VerifySQLAuditIntegrity: async () => ({
                    success: true,
                    data: { valid: true, weakValidation: true, partialChain: false, truncatedPrefix: false, checkedRecords: 0 },
                }),
                BuildSQLAuditExport: async (_filter: any, format: string) => ({
                    success: true,
                    data: {
                        fileName: `gonavi-sql-audit.${format === 'csv' ? 'csv' : 'json'}`,
                        mimeType: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json',
                        content: format === 'csv' ? '' : '[]',
                    },
                }),
                ExportSQLAuditFile: async (_filter: any, format: string) => ({ success: true, data: { filePath: `gonavi-sql-audit.${format}` } }),
                ClearSQLAuditEvents: async () => ({ success: true }),
                GetSavedQueries: async () => cloneBrowserMockValue(mockSavedQueries),
                GetSavedQueryGroups: async () => cloneBrowserMockValue(mockSavedQueryGroups),
                SaveQuery: async (input: any) => saveMockQuery(input),
                RenameSavedQuery: async (id: string, name: string) => {
                    const existing = mockSavedQueries.find((item) => item.id === id);
                    if (!existing) throw new Error('saved query not found');
                    return saveMockQuery({
                        ...existing,
                        name: String(name || '').trim(),
                    });
                },
                RevealSavedQueryInFolder: async (id: string) => {
                    const existing = mockSavedQueries.find((item) => item.id === id);
                    if (!existing) {
                        return {
                            success: false,
                            message: t('app.data_root.saved_query_directory.backend.error.query_not_found', { id }),
                        };
                    }
                    const path = `${mockDataRootInfo.savedQueryDirectory}/${id}.sql`;
                    return {
                        success: true,
                        message: t('app.data_root.saved_query_directory.backend.message.revealed', { path }),
                        data: { path },
                    };
                },
                SaveSavedQueryGroup: async (input: any) => saveMockSavedQueryGroup(input),
                ImportSavedQueries: async (payload: any) => {
                    const items = Array.isArray(payload) ? payload : payload?.queries;
                    (Array.isArray(items) ? items : []).forEach((item) => saveMockQuery(item));
                    const groups: unknown[] = Array.isArray(payload?.groups) ? payload.groups : [];
                    groups.forEach((group) => saveMockSavedQueryGroup(group));
                    return cloneBrowserMockValue(mockSavedQueries);
                },
                DeleteQuery: async (id: string) => {
                    const index = mockSavedQueries.findIndex((item) => item.id === id);
                    if (index >= 0) {
                        mockSavedQueries.splice(index, 1);
                    }
                    mockSavedQueryGroups.forEach((group) => {
                        group.queryIds = uniqueMockStringArray(group.queryIds).filter((queryId) => queryId !== id);
                        group.childOrder = uniqueMockStringArray(group.childOrder)
                            .filter((token) => token !== `query:${id}`);
                    });
                    return null;
                },
                DeleteSavedQueryGroup: async (id: string) => {
                    deleteMockSavedQueryGroup(id);
                    return null;
                },
                MoveSavedQueryToGroup: async (queryId: string, groupId: string) => {
                    if (!mockSavedQueries.some((query) => query.id === queryId)) {
                        throw new Error('saved query not found');
                    }
                    const target = groupId ? mockSavedQueryGroups.find((group) => group.id === groupId) : null;
                    if (groupId && !target) {
                        throw new Error('saved query group not found');
                    }
                    mockSavedQueryGroups.forEach((group) => {
                        group.queryIds = uniqueMockStringArray(group.queryIds).filter((id) => id !== queryId);
                        group.childOrder = uniqueMockStringArray(group.childOrder)
                            .filter((token) => token !== `query:${queryId}`);
                    });
                    if (target) {
                        target.queryIds = uniqueMockStringArray([...(target.queryIds || []), queryId]);
                        target.childOrder = uniqueMockStringArray([...(target.childOrder || []), `query:${queryId}`]);
                    }
                    return null;
                },
                MoveSavedQueryGroup: async (groupId: string, parentGroupId: string) => {
                    const target = mockSavedQueryGroups.find((group) => group.id === groupId);
                    if (!target) throw new Error('saved query group not found');
                    if (parentGroupId && !mockSavedQueryGroups.some((group) => group.id === parentGroupId)) {
                        throw new Error('saved query parent group not found');
                    }
                    mockSavedQueryGroups.forEach((group) => {
                        group.childOrder = uniqueMockStringArray(group.childOrder)
                            .filter((token) => token !== `group:${groupId}`);
                    });
                    target.parentGroupId = parentGroupId || undefined;
                    if (parentGroupId) {
                        const parent = mockSavedQueryGroups.find((group) => group.id === parentGroupId);
                        parent.childOrder = uniqueMockStringArray([...(parent.childOrder || []), `group:${groupId}`]);
                    }
                    return null;
                },
                RebindSavedQuery: async (id: string, connectionId: string) => {
                    const existing = mockSavedQueries.find((item) => item.id === id);
                    if (!existing) throw new Error('saved query not found');
                    return saveMockQuery({
                        ...existing,
                        connectionId,
                        originalConnectionId: existing.originalConnectionId || existing.connectionId,
                        bindingStatus: 'active',
                    });
                },
                GetAppInfo: async () => ({ success: true, data: { version: '0.0.0', author: 'GoNavi' } }),
                GetDataRootDirectoryInfo: async () => ({ success: true, data: cloneBrowserMockValue(mockDataRootInfo) }),
                OpenDriverDownloadDirectory: async (path: string) => ({ success: true, data: { path } }),
                OpenDataRootDirectory: async () => ({ success: true }),
                OpenLogDirectory: async () => ({ success: true }),
                OpenSavedQueryDirectory: async () => ({ success: true }),
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
                WriteSQLFile: async (_filePath: string, _content: string) => ({ success: true }),
                ExportSQLFile: async (_defaultName: string, _content: string) => ({ success: false, message: t('app.browser_mock.export_sql_unsupported') }),
                ImportConfigFile: async () => ({ success: false, message: '已取消' }),
                ImportConnectionsPayload: async (raw: string, _password?: string) => {
                    try {
                        const parsed = JSON.parse(raw);
                        if (Array.isArray(parsed)) {
                            return {
                                connections: parsed.map((item) => saveMockConnection(item)),
                                redisDbAliases: {},
                            };
                        }
                        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.connections)) {
                            return {
                                connections: parsed.connections.map((item: unknown) => saveMockConnection(item)),
                                redisDbAliases: parsed.redisDbAliases && typeof parsed.redisDbAliases === 'object'
                                    ? parsed.redisDbAliases
                                    : {},
                            };
                        }
                    } catch {
                        throw new Error(t('app.browser_mock.import_connection_package_unsupported'));
                    }
                    throw new Error(t('app.browser_mock.import_connection_package_unsupported'));
                },
                ExportConnectionsPackage: async (_options?: {
                    includeSecrets?: boolean;
                    filePassword?: string;
                    redisDbAliases?: Record<string, Record<string, string>>;
                }) => ({ success: false, message: t('app.browser_mock.export_connection_package_unsupported') }),
                ExportData: async () => ({ success: false }),
                GetGlobalProxyConfig: async () => ({ success: true, data: cloneBrowserMockValue(mockGlobalProxy) }),
                GetDownloadSourceConfig: async () => ({ source: mockDownloadSource }),
                SaveDownloadSourceConfig: async (source: string) => {
                    const normalized = String(source || '').trim().toLowerCase();
                    mockDownloadSource = normalized === 'bero' || normalized === 'github' ? normalized : 'cst';
                    return { source: mockDownloadSource };
                },
                SaveGlobalProxy: async (input: any) => saveMockGlobalProxy(input),
                ImportLegacyGlobalProxy: async (input: any) => saveMockGlobalProxy(input),
                TestGlobalProxyConnection: async (input: any) => {
                    const url = String(input?.url || 'https://api.github.com/').trim();
                    return {
                        success: true,
                        message: t('app.proxy.backend.message.test_success', { status: 200, duration: 18, url }),
                        data: {
                            url,
                            finalUrl: url,
                            statusCode: 200,
                            status: '200 OK',
                            durationMs: 18,
                            viaProxy: input?.proxy?.enabled === true,
                        },
                    };
                },
                SelectDataRootDirectory: async (currentPath: string) => ({ success: true, data: { ...mockDataRootInfo, path: currentPath || mockDataRootInfo.path } }),
                ApplyDataRootDirectory: async (path: string) => {
                    const nextPath = String(path || mockDataRootInfo.defaultPath);
                    mockDataRootInfo = {
                        ...mockDataRootInfo,
                        path: nextPath,
                        driverPath: `${nextPath}/drivers`,
                        isDefaultPath: nextPath === mockDataRootInfo.defaultPath,
                    };
                    return { success: true, message: t('app.data_root.message.updated'), data: cloneBrowserMockValue(mockDataRootInfo) };
                },
                SelectLogDirectory: async (currentPath: string) => ({
                    success: true,
                    data: { directory: currentPath || mockDataRootInfo.defaultLogDirectory },
                }),
                ApplyLogDirectory: async (path: string) => {
                    const nextPath = String(path || mockDataRootInfo.defaultLogDirectory);
                    mockDataRootInfo = {
                        ...mockDataRootInfo,
                        logDirectory: nextPath,
                        logDirectorySource: nextPath === mockDataRootInfo.defaultLogDirectory ? 'default' : 'custom',
                        logDirectoryRestartRequired: nextPath !== mockDataRootInfo.activeLogDirectory,
                    };
                    return {
                        success: true,
                        message: t('app.data_root.log_directory.message.updated'),
                        data: cloneBrowserMockValue(mockDataRootInfo),
                    };
                },
                SelectSavedQueryDirectory: async (currentPath: string) => ({
                    success: true,
                    data: { directory: currentPath || mockDataRootInfo.defaultSavedQueryDirectory },
                }),
                ApplySavedQueryDirectory: async (path: string) => {
                    const nextPath = String(path || mockDataRootInfo.defaultSavedQueryDirectory);
                    mockDataRootInfo = {
                        ...mockDataRootInfo,
                        savedQueryDirectory: nextPath,
                        savedQueryDirectorySource: nextPath === mockDataRootInfo.defaultSavedQueryDirectory
                            ? 'default'
                            : 'custom',
                    };
                    return {
                        success: true,
                        message: t('app.data_root.saved_query_directory.message.updated'),
                        data: cloneBrowserMockValue(mockDataRootInfo),
                    };
                },
            }
        },
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
    };
}
const rootNode = document.getElementById('root')!;

const readBrowserLanguages = (): string[] => {
    if (typeof navigator === 'undefined') return [];
    if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
        return [...navigator.languages];
    }
    return navigator.language ? [navigator.language] : [];
};

const serializeBrowserLanguages = (languages: readonly string[]) => languages.join('\n');

const deserializeBrowserLanguages = (snapshot: string) =>
    snapshot ? snapshot.split('\n').filter(Boolean) : [];

const getBrowserLanguageSnapshot = () => serializeBrowserLanguages(readBrowserLanguages());

const subscribeBrowserLanguageChange = (listener: () => void) => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
        return () => {};
    }
    window.addEventListener('languagechange', listener);
    return () => {
        if (typeof window.removeEventListener === 'function') {
            window.removeEventListener('languagechange', listener);
        }
    };
};

const subscribeStoreHydration = (listener: () => void) => {
    if (useStore.persist.hasHydrated()) {
        listener();
        return () => {};
    }
    return useStore.persist.onFinishHydration(() => {
        listener();
    });
};

const getStoreHydrationSnapshot = () => useStore.persist.hasHydrated();

const Root = ({ rootComponent }: { rootComponent: React.ReactNode }) => {
    const isStoreHydrated = useSyncExternalStore(
        subscribeStoreHydration,
        getStoreHydrationSnapshot,
        getStoreHydrationSnapshot,
    );
    const languagePreference = useStore((state) => state.languagePreference);
    const setLanguagePreference = useStore((state) => state.setLanguagePreference);
    const browserLanguageSnapshot = useSyncExternalStore(
        subscribeBrowserLanguageChange,
        getBrowserLanguageSnapshot,
        getBrowserLanguageSnapshot,
    );

    useEffect(() => {
        if (!isStoreHydrated) {
            return;
        }
        let cancelled = false;
        void waitForMainWindowContentPaint().then(() => {
            if (cancelled) return;
            hideBootSplash();
            signalMainWindowFrontendReady();
        });
        return () => {
            cancelled = true;
        };
    }, [isStoreHydrated]);

    if (!isStoreHydrated) {
        return null;
    }

    const systemLanguages = deserializeBrowserLanguages(browserLanguageSnapshot);
    const resolvedLanguage = setCurrentLanguage(languagePreference, systemLanguages);
    applyDayjsLocale(resolvedLanguage);

    return (
        <I18nProvider
            preference={languagePreference}
            onPreferenceChange={setLanguagePreference}
            systemLanguages={systemLanguages}
        >
            {rootComponent}
        </I18nProvider>
    );
};

const renderRoot = async () => {
    let rootComponent: React.ReactNode = <App />;
    if (devHarnessMode === 'datagrid-perf') {
        const { default: PerfDataGridHarness } = await import('./dev/PerfDataGridHarness');
        rootComponent = <PerfDataGridHarness />;
    }

    ReactDOM.createRoot(rootNode).render(
      <React.StrictMode>
        <RootErrorBoundary>
          <Root rootComponent={rootComponent} />
        </RootErrorBoundary>
      </React.StrictMode>,
    );
};

void renderRoot();
