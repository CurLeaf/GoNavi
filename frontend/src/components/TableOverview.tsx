import React, { useState, useEffect, useMemo, useCallback, useDeferredValue } from 'react';
import { Input, Spin, Empty, Dropdown, message, Tooltip, Modal, Button } from 'antd';
import type { MenuProps } from 'antd';
import { TableOutlined, SearchOutlined, ReloadOutlined, SortAscendingOutlined, DatabaseOutlined, ConsoleSqlOutlined, EditOutlined, CopyOutlined, SaveOutlined, DeleteOutlined, ExportOutlined, AppstoreOutlined, UnorderedListOutlined, WarningOutlined } from '@ant-design/icons';
import { useStore } from '../store';
import { DBQuery, DBShowCreateTable, ExportTable, DropTable, RenameTable } from '../../wailsjs/go/app/App';
import type { TabData } from '../types';
import { useAutoFetchVisibility } from '../utils/autoFetchVisibility';
import { buildRpcConnectionConfig } from '../utils/connectionRpcConfig';
import { noAutoCapInputProps } from '../utils/inputAutoCap';
import { getTableDataDangerActionMeta, supportsTableTruncateAction, type TableDataDangerActionKind } from './tableDataDangerActions';
import { buildTableSelectQuery } from '../utils/objectQueryTemplates';
import {
    TABLE_OVERVIEW_RENDER_BATCH_SIZE,
    buildTableOverviewSearchIndex,
    filterAndSortTableOverviewRows,
    resolveTableOverviewVisibleRows,
    type TableOverviewSortField,
    type TableOverviewSortOrder,
} from '../utils/tableOverviewFilter';
import { normalizeOceanBaseProtocol } from '../utils/oceanBaseProtocol';
import { V2TableContextMenuView, type V2TableContextMenuActionKey } from './V2TableContextMenu';

interface TableOverviewProps {
    tab: TabData;
}

interface TableStatRow {
    name: string;
    comment: string;
    rows: number;
    dataSize: number;
    indexSize: number;
    engine: string;
    createTime: string;
    updateTime: string;
}

type SortField = TableOverviewSortField;
type SortOrder = TableOverviewSortOrder;
type ViewMode = 'card' | 'list';

const formatSize = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formatRows = (count: number): string => {
    if (count === undefined || count === null || count < 0) return '—';
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return String(count);
};

const getMetadataDialect = (connType: string, driver?: string, oceanBaseProtocol?: string): string => {
    const type = (connType || '').trim().toLowerCase();
    if (type === 'custom') {
        const d = (driver || '').trim().toLowerCase();
        if (d === 'diros' || d === 'doris') return 'mysql';
        if (d === 'oceanbase') return normalizeOceanBaseProtocol(oceanBaseProtocol) === 'oracle' ? 'oracle' : 'mysql';
        if (d === 'opengauss' || d === 'open_gauss' || d === 'open-gauss') return 'opengauss';
        return d;
    }
    if (type === 'oceanbase' && normalizeOceanBaseProtocol(oceanBaseProtocol) === 'oracle') return 'oracle';
    if (type === 'mariadb' || type === 'oceanbase' || type === 'diros' || type === 'sphinx') return 'mysql';
    if (type === 'dameng') return 'dm';
    return type;
};

const buildTableStatusSQL = (dialect: string, dbName: string, schemaName?: string): string => {
        const escapeLiteral = (s: string) => s.replace(/'/g, "''");
        switch (dialect) {
        case 'mysql':
        case 'starrocks':
            return `
SELECT
    TABLE_NAME AS table_name,
    TABLE_COMMENT AS table_comment,
    TABLE_ROWS AS table_rows,
    DATA_LENGTH AS data_length,
    INDEX_LENGTH AS index_length,
    ENGINE AS engine,
    CREATE_TIME AS create_time,
    UPDATE_TIME AS update_time
FROM information_schema.tables
WHERE table_schema = '${escapeLiteral(dbName)}'
  AND table_type = 'BASE TABLE'
ORDER BY table_name`;
        case 'postgres':
        case 'kingbase':
        case 'vastbase':
        case 'highgo':
        case 'opengauss': {
            const schema = schemaName || 'public';
            return `
SELECT
    n.nspname || '.' || c.relname AS table_name,
    obj_description(c.oid, 'pg_class') AS table_comment,
    c.reltuples::bigint AS table_rows,
    pg_total_relation_size(c.oid) AS data_length,
    pg_indexes_size(c.oid) AS index_length
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname = '${escapeLiteral(schema)}'
ORDER BY c.relname`;
        }
        case 'sqlserver': {
            const safeDB = `[${dbName.replace(/]/g, ']]')}]`;
            return `
SELECT
    s.name + '.' + t.name AS table_name,
    ep.value AS table_comment,
    SUM(p.rows) AS table_rows,
    SUM(a.total_pages) * 8 * 1024 AS data_length,
    SUM(a.used_pages) * 8 * 1024 AS index_length
FROM ${safeDB}.sys.tables t
JOIN ${safeDB}.sys.schemas s ON t.schema_id = s.schema_id
LEFT JOIN ${safeDB}.sys.extended_properties ep ON ep.major_id = t.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
LEFT JOIN ${safeDB}.sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0, 1)
LEFT JOIN ${safeDB}.sys.allocation_units a ON p.partition_id = a.container_id
WHERE t.type = 'U'
GROUP BY s.name, t.name, ep.value
ORDER BY s.name, t.name`;
        }
        case 'clickhouse':
            return `SELECT name AS table_name, comment AS table_comment, total_rows AS table_rows, total_bytes AS data_length, 0 AS index_length FROM system.tables WHERE database = '${escapeLiteral(dbName)}' AND engine NOT IN ('View', 'MaterializedView') ORDER BY name`;
        case 'dm':
        case 'oracle': {
            const owner = (schemaName || dbName).toUpperCase();
            return `SELECT table_name, comments AS table_comment, num_rows AS table_rows, 0 AS data_length, 0 AS index_length FROM all_tab_comments JOIN all_tables USING (table_name, owner) WHERE owner = '${escapeLiteral(owner)}' ORDER BY table_name`;
        }
        default:
            return `SELECT table_name, '' AS table_comment, 0 AS table_rows, 0 AS data_length, 0 AS index_length FROM information_schema.tables WHERE table_schema = '${escapeLiteral(dbName)}' AND table_type = 'BASE TABLE' ORDER BY table_name`;
    }
};

const parseTableStats = (dialect: string, rows: Record<string, any>[]): TableStatRow[] => {
    return rows.map((row) => {
        const get = (keys: string[]): any => {
            for (const k of keys) {
                for (const rk of Object.keys(row)) {
                    if (rk.toLowerCase() === k.toLowerCase() && row[rk] !== null && row[rk] !== undefined) return row[rk];
                }
            }
            return undefined;
        };
        const strVal = (keys: string[]) => String(get(keys) ?? '').trim();
        const numVal = (keys: string[]) => {
            const v = get(keys);
            if (v === null || v === undefined || v === '') return 0;
            const n = Number(v);
            return isNaN(n) ? 0 : Math.max(0, Math.round(n));
        };

        return {
            name: strVal(['Name', 'table_name', 'tablename', 'TABLE_NAME']),
            comment: strVal(['Comment', 'table_comment', 'TABLE_COMMENT', 'comments']),
            rows: numVal(['Rows', 'table_rows', 'TABLE_ROWS', 'num_rows', 'reltuples', 'total_rows']),
            dataSize: numVal(['Data_length', 'data_length', 'DATA_LENGTH', 'total_bytes']),
            indexSize: numVal(['Index_length', 'index_length', 'INDEX_LENGTH']),
            engine: strVal(['Engine', 'engine']),
            createTime: strVal(['Create_time', 'create_time']),
            updateTime: strVal(['Update_time', 'update_time']),
        };
    }).filter(t => t.name);
};

const TableOverview: React.FC<TableOverviewProps> = ({ tab }) => {
    const connections = useStore(state => state.connections);
    const theme = useStore(state => state.theme);
    const appearance = useStore(state => state.appearance);
    const addTab = useStore(state => state.addTab);
    const setActiveContext = useStore(state => state.setActiveContext);
    const setAIPanelVisible = useStore(state => state.setAIPanelVisible);
    const addAIContext = useStore(state => state.addAIContext);
    const darkMode = theme === 'dark';
    const isV2Ui = appearance.uiVersion === 'v2';

    const [tables, setTables] = useState<TableStatRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');
    const [sortField, setSortField] = useState<SortField>('name');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
    const [viewMode, setViewMode] = useState<ViewMode>(isV2Ui ? 'card' : 'list');
    const [openContextMenuTable, setOpenContextMenuTable] = useState<string | null>(null);
    const [visibleTableLimit, setVisibleTableLimit] = useState(TABLE_OVERVIEW_RENDER_BATCH_SIZE);
    const deferredSearchText = useDeferredValue(searchText);
    const isSearchPending = searchText !== deferredSearchText;

    const connection = useMemo(() => connections.find(c => c.id === tab.connectionId), [connections, tab.connectionId]);
    const metadataDialect = useMemo(
        () => getMetadataDialect(connection?.config?.type || '', connection?.config?.driver, connection?.config?.oceanBaseProtocol),
        [connection?.config?.driver, connection?.config?.oceanBaseProtocol, connection?.config?.type]
    );
    const autoFetchVisible = useAutoFetchVisibility();

    const loadData = useCallback(async () => {
        if (!connection) return;
        setLoading(true);
        try {
            const config = {
                ...connection.config,
                port: Number(connection.config.port),
                password: connection.config.password || '',
                database: connection.config.database || '',
                useSSH: connection.config.useSSH || false,
                ssh: connection.config.ssh || { host: '', port: 22, user: '', password: '', keyPath: '' },
            };
            const sql = buildTableStatusSQL(metadataDialect, tab.dbName || '', (tab as any).schemaName);
            const res = await DBQuery(buildRpcConnectionConfig(config) as any, tab.dbName || '', sql);
            if (res.success && Array.isArray(res.data)) {
                setTables(parseTableStats(metadataDialect, res.data));
            } else {
                message.error('获取表信息失败: ' + (res.message || '未知错误'));
            }
        } catch (e: any) {
            message.error('获取表信息失败: ' + (e?.message || String(e)));
        } finally {
            setLoading(false);
        }
    }, [connection, metadataDialect, tab.dbName]);

    useEffect(() => {
        if (!autoFetchVisible) {
            return;
        }
        void loadData();
    }, [autoFetchVisible, loadData]);

    const tableSearchIndex = useMemo(() => buildTableOverviewSearchIndex(tables), [tables]);

    const sortedFiltered = useMemo(() => (
        filterAndSortTableOverviewRows(tableSearchIndex, deferredSearchText, sortField, sortOrder)
    ), [deferredSearchText, sortField, sortOrder, tableSearchIndex]);

    useEffect(() => {
        setVisibleTableLimit(TABLE_OVERVIEW_RENDER_BATCH_SIZE);
    }, [deferredSearchText, sortField, sortOrder, viewMode, tables]);

    const visibleOverview = useMemo(() => (
        resolveTableOverviewVisibleRows(sortedFiltered, visibleTableLimit)
    ), [sortedFiltered, visibleTableLimit]);

    const visibleTables = visibleOverview.visibleRows;

    const openTable = useCallback((tableName: string) => {
        if (!connection) return;
        setActiveContext({ connectionId: connection.id, dbName: tab.dbName || '' });
        addTab({
            id: `${connection.id}-${tab.dbName}-${tableName}`,
            title: tableName,
            type: 'table',
            connectionId: connection.id,
            dbName: tab.dbName,
            tableName,
        });
    }, [connection, tab.dbName, addTab, setActiveContext]);

    const openDesign = useCallback((tableName: string) => {
        if (!connection) return;
        setActiveContext({ connectionId: connection.id, dbName: tab.dbName || '' });
        addTab({
            id: `design-${connection.id}-${tab.dbName}-${tableName}`,
            title: `设计表 (${tableName})`,
            type: 'design',
            connectionId: connection.id,
            dbName: tab.dbName,
            tableName,
            initialTab: 'columns',
            readOnly: false,
        });
    }, [connection, tab.dbName, addTab, setActiveContext]);

    const openTableDdl = useCallback((tableName: string) => {
        if (!connection) return;
        setActiveContext({ connectionId: connection.id, dbName: tab.dbName || '' });
        addTab({
            id: `design-${connection.id}-${tab.dbName}-${tableName}`,
            title: `表结构 (${tableName})`,
            type: 'design',
            connectionId: connection.id,
            dbName: tab.dbName,
            tableName,
            initialTab: 'ddl',
            readOnly: true,
        });
    }, [connection, tab.dbName, addTab, setActiveContext]);

    const openQueryForTable = useCallback((tableName: string) => {
        if (!connection) return;
        setActiveContext({ connectionId: connection.id, dbName: tab.dbName || '' });
        addTab({
            id: `query-${Date.now()}`,
            title: '新建查询',
            type: 'query',
            connectionId: connection.id,
            dbName: tab.dbName,
            query: buildTableSelectQuery(metadataDialect, tableName),
        });
    }, [addTab, connection, metadataDialect, setActiveContext, tab.dbName]);

    const openTableInER = useCallback((tableName: string) => {
        if (!connection) return;
        openTable(tableName);
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('gonavi:data-grid:set-view-mode', {
                detail: {
                    connectionId: connection.id,
                    dbName: tab.dbName,
                    tableName,
                    viewMode: 'er',
                },
            }));
        }, 0);
    }, [connection, openTable, tab.dbName]);

    const buildConfig = useCallback(() => {
        if (!connection) return null;
        return {
            ...connection.config,
            port: Number(connection.config.port),
            password: connection.config.password || '',
            database: connection.config.database || '',
            useSSH: connection.config.useSSH || false,
            ssh: connection.config.ssh || { host: '', port: 22, user: '', password: '', keyPath: '' },
        };
    }, [connection]);

    const handleCopyStructure = useCallback(async (tableName: string) => {
        const config = buildConfig();
        if (!config) return;
        const res = await DBShowCreateTable(buildRpcConnectionConfig(config) as any, tab.dbName || '', tableName);
        if (res.success) {
            navigator.clipboard.writeText(res.data as string);
            message.success('表结构已复制到剪贴板');
        } else {
            message.error(res.message);
        }
    }, [buildConfig, tab.dbName]);

    const handleCopyTableName = useCallback(async (tableName: string) => {
        const name = String(tableName || '').trim();
        if (!name) {
            message.warning('表名为空，无法复制');
            return;
        }
        try {
            await navigator.clipboard.writeText(name);
            message.success('表名已复制到剪贴板');
        } catch (e: any) {
            message.error('复制表名失败: ' + (e?.message || String(e)));
        }
    }, []);

    const handleExport = useCallback(async (tableName: string, format: string) => {
        const config = buildConfig();
        if (!config) return;
        const hide = message.loading(`正在导出 ${tableName} 为 ${format.toUpperCase()}...`, 0);
        const res = await ExportTable(buildRpcConnectionConfig(config) as any, tab.dbName || '', tableName, format);
        hide();
        if (res.success) {
            message.success('导出成功');
        } else if (res.message !== '已取消') {
            message.error('导出失败: ' + res.message);
        }
    }, [buildConfig, tab.dbName]);

    const handleCopyTableAsInsert = useCallback(async (tableName: string) => {
        await handleExport(tableName, 'sql');
    }, [handleExport]);

    const handleDeleteTable = useCallback((tableName: string) => {
        const config = buildConfig();
        if (!config) return;
        Modal.confirm({
            title: '确认删除表',
            content: `确定删除表 "${tableName}" 吗？该操作不可恢复。`,
            okButtonProps: { danger: true },
            onOk: async () => {
                const res = await DropTable(buildRpcConnectionConfig(config) as any, tab.dbName || '', tableName);
                if (res.success) {
                    message.success('表删除成功');
                    loadData();
                } else {
                    message.error('删除失败: ' + res.message);
                }
            },
        });
    }, [buildConfig, tab.dbName, loadData]);

    const handleTableDataDangerAction = useCallback((tableName: string, action: TableDataDangerActionKind) => {
        const config = buildConfig();
        if (!config) return;

        const { label, progressLabel } = getTableDataDangerActionMeta(action);
        Modal.confirm({
            title: `确认${label}`,
            content: `${label}会永久删除表 "${tableName}" 中的所有数据，操作不可逆，是否继续？`,
            okText: '继续',
            cancelText: '取消',
            okButtonProps: { danger: true },
            onOk: async () => {
                const app = (window as any).go.app.App;
                const methodName = action === 'truncate' ? 'TruncateTables' : 'ClearTables';
                const hide = message.loading(`正在${progressLabel} ${tableName}...`, 0);
                try {
                    const res = await app[methodName](buildRpcConnectionConfig(config) as any, tab.dbName || '', [tableName]);
                    hide();
                    if (res.success) {
                        message.success(`${progressLabel}成功`);
                        loadData();
                    } else {
                        message.error(`${progressLabel}失败: ${res.message}`);
                        return Promise.reject();
                    }
                } catch (e: any) {
                    hide();
                    message.error(`${progressLabel}失败: ${e?.message || String(e)}`);
                    return Promise.reject();
                }
            },
        });
    }, [buildConfig, tab.dbName, loadData]);

    const handleRenameTable = useCallback((tableName: string) => {
        const config = buildConfig();
        if (!config) return;
        let newName = tableName;
        Modal.confirm({
            title: '重命名表',
            content: (
                <Input
                    {...noAutoCapInputProps}
                    defaultValue={tableName}
                    onChange={e => { newName = e.target.value; }}
                    placeholder="输入新表名"
                    autoFocus
                    style={{ marginTop: 8 }}
                />
            ),
            onOk: async () => {
                const trimmed = newName.trim();
                if (!trimmed) { message.error('表名不能为空'); return Promise.reject(); }
                if (trimmed === tableName) { message.warning('新旧表名相同'); return; }
                const res = await RenameTable(buildRpcConnectionConfig(config) as any, tab.dbName || '', tableName, trimmed);
                if (res.success) {
                    message.success('表重命名成功');
                    loadData();
                } else {
                    message.error('重命名失败: ' + res.message);
                }
            },
        });
    }, [buildConfig, tab.dbName, loadData]);

    const openCreateStarRocksRollup = useCallback((tableName: string) => {
        if (!connection) return;
        const safeTable = String(tableName || 'table_name').trim();
        const quotedTable = safeTable.includes('`') ? safeTable : safeTable.split('.').map(part => `\`${part.replace(/`/g, '``')}\``).join('.');
        addTab({
            id: `query-create-starrocks-rollup-${Date.now()}`,
            title: '新增 Rollup',
            type: 'query',
            connectionId: connection.id,
            dbName: tab.dbName,
            query: `ALTER TABLE ${quotedTable}\nADD ROLLUP rollup_name (column1, column2);`,
        });
    }, [addTab, connection, tab.dbName]);

    const injectTablePromptToAI = useCallback(async (tableName: string, promptKind: 'explain' | 'query') => {
        const dbName = tab.dbName || '';
        if (!connection?.id || !dbName || !tableName) {
            message.warning('当前表缺少连接上下文，无法发送给 AI');
            return;
        }

        let ddl = '';
        const config = buildConfig();
        if (config) {
            try {
                const res = await DBShowCreateTable(buildRpcConnectionConfig(config) as any, dbName, tableName);
                if (res.success) {
                    ddl = String(res.data || '').trim();
                    addAIContext(connection.id, { dbName, tableName, ddl });
                }
            } catch {
                // AI 入口仍可基于表名工作，DDL 获取失败不阻断打开面板。
            }
        }

        const prompt = promptKind === 'explain'
            ? [
                `请解释数据表 ${dbName}.${tableName} 的结构和业务含义。`,
                '重点说明字段含义、主键/索引、潜在关联关系、典型查询场景和风险点。',
                ddl ? `\n\`\`\`sql\n${ddl}\n\`\`\`` : '',
            ].filter(Boolean).join('\n')
            : [
                `请基于数据表 ${dbName}.${tableName} 生成 3 条常用查询 SQL。`,
                '要求包含：数据预览查询、按关键字段过滤查询、一个聚合或统计查询。',
                ddl ? `\n\`\`\`sql\n${ddl}\n\`\`\`` : '',
            ].filter(Boolean).join('\n');

        const wasClosed = !useStore.getState().aiPanelVisible;
        if (wasClosed) setAIPanelVisible(true);
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('gonavi:ai:inject-prompt', { detail: { prompt } }));
        }, wasClosed ? 350 : 0);
    }, [addAIContext, buildConfig, connection?.id, setAIPanelVisible, tab.dbName]);

    // --- Theme ---
    const cardBg = darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
    const cardHoverBg = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)';
    const cardBorder = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    const textPrimary = darkMode ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.88)';
    const textSecondary = darkMode ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)';
    const textMuted = darkMode ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
    const accentColor = '#1677ff';
    const containerBg = darkMode ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.01)';

    const toggleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder(field === 'name' ? 'asc' : 'desc');
        }
    };

    const sortMenuItems = [
        { key: 'name', label: `按名称${sortField === 'name' ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : ''}`, onClick: () => toggleSort('name') },
        { key: 'rows', label: `按行数${sortField === 'rows' ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : ''}`, onClick: () => toggleSort('rows') },
        { key: 'dataSize', label: `按大小${sortField === 'dataSize' ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : ''}`, onClick: () => toggleSort('dataSize') },
    ];

    const totalRows = useMemo(() => tables.reduce((s, t) => s + t.rows, 0), [tables]);
    const totalSize = useMemo(() => tables.reduce((s, t) => s + t.dataSize + t.indexSize, 0), [tables]);
    const maxCombinedSize = useMemo(() => sortedFiltered.reduce((max, table) => {
        return Math.max(max, table.dataSize + table.indexSize);
    }, 0), [sortedFiltered]);
    const allowTruncate = supportsTableTruncateAction(connection?.config?.type || '', connection?.config?.driver);

    const handleV2TableContextMenuAction = useCallback((table: TableStatRow, action: V2TableContextMenuActionKey) => {
        const tableName = table.name;
        switch (action) {
            case 'open-data':
            case 'open-new-tab':
                openTable(tableName);
                return;
            case 'design-table':
                openDesign(tableName);
                return;
            case 'new-query':
                openQueryForTable(tableName);
                return;
            case 'view-ddl':
                openTableDdl(tableName);
                return;
            case 'view-er':
                openTableInER(tableName);
                return;
            case 'copy-table-name':
                void handleCopyTableName(tableName);
                return;
            case 'copy-structure':
                void handleCopyStructure(tableName);
                return;
            case 'copy-insert':
                void handleCopyTableAsInsert(tableName);
                return;
            case 'rename-table':
                handleRenameTable(tableName);
                return;
            case 'new-rollup':
                openCreateStarRocksRollup(tableName);
                return;
            case 'backup-table':
                void handleExport(tableName, 'sql');
                return;
            case 'refresh-stats':
                void loadData();
                return;
            case 'export-xlsx':
                void handleExport(tableName, 'xlsx');
                return;
            case 'export-csv':
                void handleExport(tableName, 'csv');
                return;
            case 'export-json':
                void handleExport(tableName, 'json');
                return;
            case 'ai-explain':
                void injectTablePromptToAI(tableName, 'explain');
                return;
            case 'ai-generate-query':
                void injectTablePromptToAI(tableName, 'query');
                return;
            case 'truncate-table':
                void handleTableDataDangerAction(tableName, 'truncate');
                return;
            case 'drop-table':
                handleDeleteTable(tableName);
                return;
            default:
                return;
        }
    }, [
        handleCopyStructure,
        handleCopyTableAsInsert,
        handleCopyTableName,
        handleDeleteTable,
        handleExport,
        handleRenameTable,
        handleTableDataDangerAction,
        injectTablePromptToAI,
        loadData,
        openCreateStarRocksRollup,
        openDesign,
        openQueryForTable,
        openTable,
        openTableDdl,
        openTableInER,
    ]);

    const renderV2OverviewTableContextMenu = useCallback((table: TableStatRow) => (
        <V2TableContextMenuView
            tableName={table.name}
            stats={{
                rowCount: table.rows,
                dataLength: table.dataSize,
                indexLength: table.indexSize,
                engine: table.engine,
            }}
            supportsTruncate={allowTruncate}
            supportsStarRocksRollup={metadataDialect === 'starrocks'}
            onAction={(action) => {
                setOpenContextMenuTable(null);
                handleV2TableContextMenuAction(table, action);
            }}
        />
    ), [allowTruncate, handleV2TableContextMenuAction, metadataDialect]);

    const buildLegacyTableContextMenuItems = useCallback((table: TableStatRow): MenuProps['items'] => [
        { key: 'new-query', label: '新建查询', icon: <ConsoleSqlOutlined />, onClick: () => openQueryForTable(table.name) },
        { type: 'divider' },
        { key: 'design-table', label: '设计表', icon: <EditOutlined />, onClick: () => openDesign(table.name) },
        { key: 'copy-table-name', label: '复制表名', icon: <CopyOutlined />, onClick: () => handleCopyTableName(table.name) },
        { key: 'copy-structure', label: '复制表结构', icon: <CopyOutlined />, onClick: () => handleCopyStructure(table.name) },
        { key: 'backup-table', label: '备份表 (SQL)', icon: <SaveOutlined />, onClick: () => handleExport(table.name, 'sql') },
        { key: 'rename-table', label: '重命名表', icon: <EditOutlined />, onClick: () => handleRenameTable(table.name) },
        { key: 'danger-zone', label: '危险操作', icon: <WarningOutlined />, children: [
            ...(allowTruncate ? [{ key: 'truncate-table', label: '截断表', danger: true, onClick: () => handleTableDataDangerAction(table.name, 'truncate') }] : []),
            { key: 'clear-table', label: '清空表', danger: true, onClick: () => handleTableDataDangerAction(table.name, 'clear') },
            { key: 'drop-table', label: '删除表', icon: <DeleteOutlined />, danger: true, onClick: () => handleDeleteTable(table.name) },
        ]},
        { type: 'divider' },
        { key: 'export', label: '导出表数据', icon: <ExportOutlined />, children: [
            { key: 'export-csv', label: '导出 CSV', onClick: () => handleExport(table.name, 'csv') },
            { key: 'export-xlsx', label: '导出 Excel (XLSX)', onClick: () => handleExport(table.name, 'xlsx') },
            { key: 'export-json', label: '导出 JSON', onClick: () => handleExport(table.name, 'json') },
            { key: 'export-md', label: '导出 Markdown', onClick: () => handleExport(table.name, 'md') },
            { key: 'export-html', label: '导出 HTML', onClick: () => handleExport(table.name, 'html') },
        ]},
    ], [
        allowTruncate,
        handleCopyStructure,
        handleCopyTableName,
        handleDeleteTable,
        handleExport,
        handleRenameTable,
        handleTableDataDangerAction,
        openDesign,
        openQueryForTable,
    ]);

    if (loading) {
        return (
            <div className={isV2Ui ? 'gn-v2-table-overview gn-v2-table-overview-loading' : undefined} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: containerBg }}>
                <Spin size="large" tip="加载表信息..." />
            </div>
        );
    }

    return (
        <div className={isV2Ui ? 'gn-v2-table-overview' : undefined} style={{ display: 'flex', flexDirection: 'column', height: '100%', background: containerBg, overflow: 'hidden' }}>
            {/* Toolbar */}
            <div className={isV2Ui ? 'gn-v2-table-overview-header' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', flexShrink: 0 }}>
                <span className={isV2Ui ? 'gn-v2-table-overview-icon' : undefined}>
                    <DatabaseOutlined style={{ fontSize: 16, color: isV2Ui ? undefined : accentColor }} />
                </span>
                <span className={isV2Ui ? 'gn-v2-table-overview-title' : undefined} style={{ fontSize: 14, fontWeight: 600, color: textPrimary }}>{tab.dbName}</span>
                <span className={isV2Ui ? 'gn-v2-table-overview-summary' : undefined} style={{ fontSize: 12, color: textMuted }}>
                    <strong>{tables.length}</strong> 张表 · <strong>{formatRows(totalRows)}</strong> 行 · <strong>{formatSize(totalSize)}</strong>
                </span>
                <div style={{ flex: 1 }} />
                <Input
                    {...noAutoCapInputProps}
                    placeholder="搜索表名或注释..."
                    prefix={<SearchOutlined style={{ color: textMuted }} />}
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    allowClear
                    style={{ width: 240 }}
                    size="small"
                />
                <Dropdown menu={{ items: sortMenuItems }} trigger={['click']}>
                    <Tooltip title="排序"><SortAscendingOutlined style={{ fontSize: 16, color: textSecondary, cursor: 'pointer' }} /></Tooltip>
                </Dropdown>
                <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 6, background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}>
                    <Tooltip title="卡片视图">
                        <div
                            onClick={() => setViewMode('card')}
                            style={{
                                padding: '3px 7px', borderRadius: 5, cursor: 'pointer', transition: 'all 0.15s',
                                background: viewMode === 'card' ? (darkMode ? 'rgba(255,255,255,0.12)' : '#fff') : 'transparent',
                                boxShadow: viewMode === 'card' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                color: viewMode === 'card' ? accentColor : textMuted,
                            }}
                        >
                            <AppstoreOutlined style={{ fontSize: 14 }} />
                        </div>
                    </Tooltip>
                    <Tooltip title="列表视图">
                        <div
                            onClick={() => setViewMode('list')}
                            style={{
                                padding: '3px 7px', borderRadius: 5, cursor: 'pointer', transition: 'all 0.15s',
                                background: viewMode === 'list' ? (darkMode ? 'rgba(255,255,255,0.12)' : '#fff') : 'transparent',
                                boxShadow: viewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                color: viewMode === 'list' ? accentColor : textMuted,
                            }}
                        >
                            <UnorderedListOutlined style={{ fontSize: 14 }} />
                        </div>
                    </Tooltip>
                </div>
                <Tooltip title="刷新"><ReloadOutlined onClick={loadData} style={{ fontSize: 16, color: textSecondary, cursor: 'pointer' }} /></Tooltip>
            </div>

            {/* Content Area */}
            <div className={isV2Ui ? 'gn-v2-table-overview-content' : undefined} style={{ flex: 1, overflow: 'auto', padding: '0 16px 16px 16px' }}>
                {sortedFiltered.length > 0 && (isSearchPending || visibleOverview.hiddenCount > 0 || deferredSearchText.trim()) && (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                            marginBottom: 10,
                            padding: '8px 10px',
                            borderRadius: 10,
                            background: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)',
                            color: textMuted,
                            fontSize: 12,
                        }}
                    >
                        <span>
                            {isSearchPending
                                ? '正在更新筛选结果...'
                                : `匹配 ${sortedFiltered.length} 张表，当前渲染 ${visibleTables.length} 张`}
                        </span>
                        {visibleOverview.hiddenCount > 0 && (
                            <span>还有 {visibleOverview.hiddenCount} 张未渲染，可继续加载或缩小搜索范围</span>
                        )}
                    </div>
                )}
                {sortedFiltered.length === 0 ? (
                    <Empty description={searchText ? '无匹配结果' : '暂无表'} style={{ marginTop: 80 }} />
                ) : viewMode === 'card' ? (
                    /* ========== 卡片视图 ========== */
                    <div className={isV2Ui ? 'gn-v2-table-card-grid' : undefined} style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                        gap: 12,
                    }}>
                        {visibleTables.map(t => (
                            <Dropdown
                                key={t.name}
                                trigger={['contextMenu']}
                                menu={{ items: isV2Ui ? [] : buildLegacyTableContextMenuItems(t) }}
                                open={isV2Ui ? openContextMenuTable === t.name : undefined}
                                onOpenChange={isV2Ui ? (open) => setOpenContextMenuTable(open ? t.name : null) : undefined}
                                popupRender={isV2Ui ? () => renderV2OverviewTableContextMenu(t) : undefined}
                                rootClassName={isV2Ui ? 'gn-v2-table-context-menu-popup' : undefined}
                                overlayStyle={isV2Ui ? { width: 264, maxWidth: 'calc(100vw - 24px)' } : undefined}
                            >
                                <div
                                    className={isV2Ui ? 'gn-v2-table-card' : undefined}
                                    onDoubleClick={() => openTable(t.name)}
                                    style={{
                                        background: cardBg,
                                        border: `1px solid ${cardBorder}`,
                                        borderRadius: 10,
                                        padding: '14px 16px',
                                        cursor: 'pointer',
                                        transition: isV2Ui ? undefined : 'all 0.15s ease',
                                        userSelect: 'none',
                                    }}
                                    onMouseEnter={isV2Ui ? undefined : e => { (e.currentTarget as HTMLDivElement).style.background = cardHoverBg; (e.currentTarget as HTMLDivElement).style.borderColor = accentColor; }}
                                    onMouseLeave={isV2Ui ? undefined : e => { (e.currentTarget as HTMLDivElement).style.background = cardBg; (e.currentTarget as HTMLDivElement).style.borderColor = cardBorder; }}
                                >
                                        <div className={isV2Ui ? 'gn-v2-table-card-name' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                        <TableOutlined style={{ fontSize: 14, color: accentColor }} />
                                        <Tooltip title={t.name} mouseEnterDelay={0.4}>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, display: 'block' }}>
                                                {t.name}
                                            </span>
                                        </Tooltip>
                                    </div>
                                    {t.comment && (
                                        <Tooltip title={t.comment} mouseEnterDelay={0.4}>
                                            <div style={{ fontSize: 12, color: textSecondary, marginBottom: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {t.comment}
                                            </div>
                                        </Tooltip>
                                    )}
                                    <div className={isV2Ui ? 'gn-v2-table-card-meta' : undefined} style={{ display: 'flex', gap: 16, fontSize: 12, color: textMuted }}>
                                        <span title="行数" style={{ minWidth: 52 }}>📊 {formatRows(t.rows)}</span>
                                        <span title="数据大小" style={{ minWidth: 72 }}>💾 {formatSize(t.dataSize)}</span>
                                        {t.engine && <span title="引擎" style={{ marginLeft: 'auto', opacity: 0.7 }}>{t.engine}</span>}
                                    </div>
                                    {isV2Ui && (
                                        <div className="gn-v2-table-size-bar">
                                            <span style={{ width: `${Math.min(100, Math.max(4, maxCombinedSize > 0 ? Math.round(((t.dataSize + t.indexSize) / maxCombinedSize) * 100) : 4))}%` }} />
                                        </div>
                                    )}
                                </div>
                            </Dropdown>
                        ))}
                    </div>
                ) : (
                    /* ========== 行视图 ========== */
                    <div className={isV2Ui ? 'gn-v2-table-row-list' : undefined} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {visibleTables.map(t => {
                            const combinedSize = t.dataSize + t.indexSize;
                            const sizeRatio = maxCombinedSize > 0 ? combinedSize / maxCombinedSize : 0;
                            const fillWidth = maxCombinedSize > 0 ? `${Math.max(10, Math.round(sizeRatio * 100))}%` : '0%';
                            const fillColor = darkMode ? 'rgba(22,119,255,0.18)' : 'rgba(22,119,255,0.12)';
                            const rowSecondary = t.comment || (t.engine ? `${t.engine} 表` : '双击打开数据，右键查看更多操作');

                            return (
                                <Dropdown
                                    key={t.name}
                                    trigger={['contextMenu']}
                                    menu={{ items: isV2Ui ? [] : buildLegacyTableContextMenuItems(t) }}
                                    open={isV2Ui ? openContextMenuTable === t.name : undefined}
                                    onOpenChange={isV2Ui ? (open) => setOpenContextMenuTable(open ? t.name : null) : undefined}
                                    popupRender={isV2Ui ? () => renderV2OverviewTableContextMenu(t) : undefined}
                                    rootClassName={isV2Ui ? 'gn-v2-table-context-menu-popup' : undefined}
                                    overlayStyle={isV2Ui ? { width: 264, maxWidth: 'calc(100vw - 24px)' } : undefined}
                                >
                                    <div
                                        className={isV2Ui ? 'gn-v2-table-row' : undefined}
                                        onDoubleClick={() => openTable(t.name)}
                                        style={{
                                            position: 'relative',
                                            overflow: 'hidden',
                                            borderRadius: 10,
                                            border: `1px solid ${cardBorder}`,
                                            background: cardBg,
                                            cursor: 'pointer',
                                            transition: isV2Ui ? undefined : 'all 0.15s ease',
                                            userSelect: 'none',
                                        }}
                                        onMouseEnter={isV2Ui ? undefined : e => { (e.currentTarget as HTMLDivElement).style.background = cardHoverBg; (e.currentTarget as HTMLDivElement).style.borderColor = accentColor; }}
                                        onMouseLeave={isV2Ui ? undefined : e => { (e.currentTarget as HTMLDivElement).style.background = cardBg; (e.currentTarget as HTMLDivElement).style.borderColor = cardBorder; }}
                                    >
                                        <div
                                            style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                bottom: 0,
                                                width: fillWidth,
                                                background: fillColor,
                                                pointerEvents: 'none',
                                                transition: 'width 0.2s ease',
                                            }}
                                        />
                                        <div
                                            style={{
                                                position: 'relative',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: 16,
                                                padding: '14px 16px',
                                                flexWrap: 'wrap',
                                            }}
                                        >
                                            <div style={{ minWidth: 0, flex: '1 1 320px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                                    <TableOutlined style={{ fontSize: 13, color: accentColor, flexShrink: 0 }} />
                                                    <Tooltip title={t.name} mouseEnterDelay={0.4}>
                                                        <span style={{ color: textPrimary, fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {t.name}
                                                        </span>
                                                    </Tooltip>
                                                    {t.engine && (
                                                        <span
                                                            style={{
                                                                flexShrink: 0,
                                                                padding: '1px 6px',
                                                                borderRadius: 999,
                                                                fontSize: 11,
                                                                color: textMuted,
                                                                background: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                                                            }}
                                                        >
                                                            {t.engine}
                                                        </span>
                                                    )}
                                                </div>
                                                <Tooltip title={rowSecondary} mouseEnterDelay={0.4}>
                                                    <div style={{ marginTop: 6, color: textSecondary, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {rowSecondary}
                                                    </div>
                                                </Tooltip>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
                                                <div style={{ minWidth: 96, textAlign: 'right' }}>
                                                    <div style={{ color: textMuted }}>行数</div>
                                                    <div style={{ color: textPrimary, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatRows(t.rows)}</div>
                                                </div>
                                                <div style={{ minWidth: 110, textAlign: 'right' }}>
                                                    <div style={{ color: textMuted }}>数据大小</div>
                                                    <div style={{ color: textPrimary, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatSize(t.dataSize)}</div>
                                                </div>
                                                <div style={{ minWidth: 110, textAlign: 'right' }}>
                                                    <div style={{ color: textMuted }}>索引大小</div>
                                                    <div style={{ color: textPrimary, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatSize(t.indexSize)}</div>
                                                </div>
                                                <div style={{ minWidth: 96, textAlign: 'right' }}>
                                                    <div style={{ color: textMuted }}>相对大小</div>
                                                    <div style={{ color: textPrimary, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                                        {maxCombinedSize > 0 ? `${Math.round(sizeRatio * 100)}%` : '—'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </Dropdown>
                            );
                        })}
                    </div>
                )}
                {sortedFiltered.length > 0 && visibleOverview.hiddenCount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0 4px' }}>
                        <Button
                            size="small"
                            onClick={() => setVisibleTableLimit(limit => limit + TABLE_OVERVIEW_RENDER_BATCH_SIZE)}
                        >
                            显示更多表（剩余 {visibleOverview.hiddenCount}）
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TableOverview;
