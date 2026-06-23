import React, { useState, useEffect, useRef } from 'react';
import Editor from './MonacoEditor';
import { Button, Spin, Alert } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { TabData } from '../types';
import { useStore } from '../store';
import { DBQuery } from '../../wailsjs/go/app/App';
import { buildRpcConnectionConfig } from '../utils/connectionRpcConfig';
import { normalizeOceanBaseProtocol } from '../utils/oceanBaseProtocol';
import { splitQualifiedNameLast } from '../utils/qualifiedName';
import { buildEditableTriggerSql } from '../utils/triggerEditSql';
import { buildSqlServerObjectDefinitionQueries } from '../utils/sqlServerObjectDefinition';

interface TriggerViewerProps {
    tab: TabData;
}

const getCaseInsensitiveRawValue = (row: Record<string, any>, keys: string[]): any => {
    const normalizedKeyMap = new Map<string, string>();
    Object.keys(row || {}).forEach((key) => normalizedKeyMap.set(key.toLowerCase(), key));
    for (const key of keys) {
        const matchedKey = normalizedKeyMap.get(String(key || '').toLowerCase());
        if (!matchedKey) continue;
        const value = row[matchedKey];
        if (value !== undefined && value !== null && String(value).trim() !== '') {
            return value;
        }
    }
    return undefined;
};

const buildMySQLTriggerDDLFromMetadata = (
    row: Record<string, any>,
    fallbackTriggerName: string,
    fallbackTableName: string,
): string => {
    const triggerName = String(
        getCaseInsensitiveRawValue(row, ['trigger_name', 'Trigger', 'TRIGGER_NAME'])
        || splitQualifiedNameLast(fallbackTriggerName).objectName
        || fallbackTriggerName,
    ).trim();
    const triggerSchema = String(getCaseInsensitiveRawValue(row, ['trigger_schema', 'TRIGGER_SCHEMA']) || '').trim();
    const eventSchema = String(getCaseInsensitiveRawValue(row, ['event_object_schema', 'EVENT_OBJECT_SCHEMA']) || '').trim();
    const eventTable = String(
        getCaseInsensitiveRawValue(row, ['event_object_table', 'EVENT_OBJECT_TABLE', 'table_name', 'TABLE_NAME'])
        || splitQualifiedNameLast(fallbackTableName).objectName
        || fallbackTableName,
    ).trim();
    const actionTiming = String(getCaseInsensitiveRawValue(row, ['action_timing', 'ACTION_TIMING']) || '').trim().toUpperCase();
    const eventManipulation = String(getCaseInsensitiveRawValue(row, ['event_manipulation', 'EVENT_MANIPULATION']) || '').trim().toUpperCase();
    const actionOrientation = String(getCaseInsensitiveRawValue(row, ['action_orientation', 'ACTION_ORIENTATION']) || '').trim().toUpperCase();
    const actionStatement = String(getCaseInsensitiveRawValue(row, ['action_statement', 'ACTION_STATEMENT']) || '').trim();

    if (!triggerName || !eventTable || !actionTiming || !eventManipulation || !actionStatement) {
        return '';
    }

    const qualifiedTriggerName = triggerSchema ? `\`${triggerSchema.replace(/`/g, '``')}\`.\`${triggerName.replace(/`/g, '``')}\`` : `\`${triggerName.replace(/`/g, '``')}\``;
    const qualifiedTableName = eventSchema ? `\`${eventSchema.replace(/`/g, '``')}\`.\`${eventTable.replace(/`/g, '``')}\`` : `\`${eventTable.replace(/`/g, '``')}\``;
    const orientationClause = actionOrientation === 'ROW' ? '\nFOR EACH ROW' : '';
    return `CREATE TRIGGER ${qualifiedTriggerName}\n${actionTiming} ${eventManipulation} ON ${qualifiedTableName}${orientationClause}\n${actionStatement}`;
};

const buildOracleLikeTriggerDDLFromMetadata = (
    row: Record<string, any>,
    fallbackTriggerName: string,
    fallbackTableName: string,
): string => {
    const triggerName = String(
        getCaseInsensitiveRawValue(row, ['trigger_name', 'TRIGGER_NAME'])
        || splitQualifiedNameLast(fallbackTriggerName).objectName
        || fallbackTriggerName,
    ).trim();
    const owner = String(getCaseInsensitiveRawValue(row, ['owner', 'OWNER']) || splitQualifiedNameLast(fallbackTriggerName).parentPath || '').trim();
    const tableOwner = String(getCaseInsensitiveRawValue(row, ['table_owner', 'TABLE_OWNER']) || splitQualifiedNameLast(fallbackTableName).parentPath || '').trim();
    const tableName = String(
        getCaseInsensitiveRawValue(row, ['table_name', 'TABLE_NAME'])
        || splitQualifiedNameLast(fallbackTableName).objectName
        || fallbackTableName,
    ).trim();
    const triggerType = String(getCaseInsensitiveRawValue(row, ['trigger_type', 'TRIGGER_TYPE']) || '').trim();
    const triggeringEvent = String(getCaseInsensitiveRawValue(row, ['triggering_event', 'TRIGGERING_EVENT']) || '').trim();
    const whenClause = String(getCaseInsensitiveRawValue(row, ['when_clause', 'WHEN_CLAUSE']) || '').trim();
    const triggerBody = String(getCaseInsensitiveRawValue(row, ['trigger_body', 'TRIGGER_BODY']) || '').trim();

    if (!triggerName || !tableName || !triggerType || !triggeringEvent || !triggerBody) {
        return '';
    }

    const qualifiedTriggerName = owner ? `${owner}.${triggerName}` : triggerName;
    const qualifiedTableName = tableOwner ? `${tableOwner}.${tableName}` : tableName;
    const normalizedWhenClause = whenClause ? `\nWHEN (${whenClause.replace(/^\((.*)\)$/s, '$1')})` : '';
    const normalizedTriggerType = triggerType.replace(/\s+/g, ' ').trim();
    const triggerTypeMatch = normalizedTriggerType.match(/^(BEFORE|AFTER|INSTEAD OF)(?:\s+(EACH ROW|STATEMENT))?$/i);
    if (triggerTypeMatch) {
        const timing = String(triggerTypeMatch[1] || '').toUpperCase();
        const firingLevel = String(triggerTypeMatch[2] || '').toUpperCase();
        const forEachRowClause = firingLevel === 'EACH ROW' ? '\nFOR EACH ROW' : '';
        return `CREATE OR REPLACE TRIGGER ${qualifiedTriggerName}\n${timing} ${triggeringEvent} ON ${qualifiedTableName}${forEachRowClause}${normalizedWhenClause}\n${triggerBody}`;
    }
    return `CREATE OR REPLACE TRIGGER ${qualifiedTriggerName}\n${triggerType} ${triggeringEvent} ON ${qualifiedTableName}${normalizedWhenClause}\n${triggerBody}`;
};

const TriggerViewer: React.FC<TriggerViewerProps> = ({ tab }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [triggerDefinition, setTriggerDefinition] = useState<string>('');
    const [openingObjectEdit, setOpeningObjectEdit] = useState(false);
    const isMountedRef = useRef(true);
    const loadedDefinitionKeyRef = useRef('');

    const connections = useStore(state => state.connections);
    const theme = useStore(state => state.theme);
    const addTab = useStore(state => state.addTab);
    const setActiveContext = useStore(state => state.setActiveContext);
    const darkMode = theme === 'dark';
    const objectIdentityKey = [
        tab.connectionId,
        tab.dbName,
        tab.type,
        tab.triggerName,
        tab.triggerTableName,
        tab.schemaName,
    ].map((item) => String(item || '')).join('||');

    // 透明 Monaco Editor 主题由 MonacoEditor 包装组件按需注册（含 stickyScroll 不透明背景）

    const escapeSQLLiteral = (raw: string): string => String(raw || '').replace(/'/g, "''");
    const parseSchemaAndName = (fullName: string): { schema: string; name: string } => {
        const parsed = splitQualifiedNameLast(fullName);
        return { schema: parsed.parentPath, name: parsed.objectName };
    };

    const getMetadataDialect = (conn: any): string => {
        const type = String(conn?.config?.type || '').trim().toLowerCase();
        if (type === 'custom') {
            const driver = String(conn?.config?.driver || '').trim().toLowerCase();
            if (driver === 'diros' || driver === 'doris') return 'mysql';
            if (driver === 'goldendb' || driver === 'greatdb' || driver === 'gdb') return 'mysql';
            if (driver === 'oceanbase') return normalizeOceanBaseProtocol(conn?.config?.oceanBaseProtocol) === 'oracle' ? 'oracle' : 'mysql';
            if (driver === 'opengauss' || driver === 'open_gauss' || driver === 'open-gauss') return 'opengauss';
            if (driver === 'gaussdb' || driver === 'gauss_db' || driver === 'gauss-db') return 'gaussdb';
            return driver;
        }
        if (type === 'oceanbase' && normalizeOceanBaseProtocol(conn?.config?.oceanBaseProtocol) === 'oracle') return 'oracle';
        if (type === 'goldendb' || type === 'mariadb' || type === 'oceanbase' || type === 'diros' || type === 'sphinx') return 'mysql';
        if (type === 'dameng') return 'dm';
        return type;
    };

    const isSphinxConnection = (conn: any): boolean => {
        const type = String(conn?.config?.type || '').trim().toLowerCase();
        if (type === 'sphinx') return true;
        if (type !== 'custom') return false;
        const driver = String(conn?.config?.driver || '').trim().toLowerCase();
        return driver === 'sphinx' || driver === 'sphinxql';
    };

    const buildShowTriggerQueries = (dialect: string, triggerName: string, dbName: string): string[] => {
        const { schema, name } = parseSchemaAndName(triggerName);
        const safeTriggerName = escapeSQLLiteral(name);
        const safeDbName = escapeSQLLiteral(dbName);
        switch (dialect) {
            case 'mysql':
            case 'starrocks':
                return [
                    `SHOW CREATE TRIGGER \`${name.replace(/`/g, '``')}\``,
                    safeDbName
                        ? `SELECT TRIGGER_NAME, TRIGGER_SCHEMA, EVENT_OBJECT_SCHEMA, EVENT_OBJECT_TABLE, ACTION_TIMING, EVENT_MANIPULATION, ACTION_ORIENTATION, ACTION_STATEMENT FROM information_schema.triggers WHERE trigger_schema = '${safeDbName}' AND trigger_name = '${safeTriggerName}' LIMIT 1`
                        : '',
                    safeDbName
                        ? `SHOW TRIGGERS FROM \`${dbName.replace(/`/g, '``')}\` LIKE '${safeTriggerName}'`
                        : `SHOW TRIGGERS LIKE '${safeTriggerName}'`,
                ].filter(Boolean);
            case 'postgres':
            case 'kingbase':
            case 'highgo':
            case 'vastbase':
            case 'opengauss':
            case 'gaussdb':
                return [`SELECT pg_get_triggerdef(t.oid, true) AS trigger_definition
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
WHERE t.tgname = '${safeTriggerName}'
  AND NOT t.tgisinternal
LIMIT 1`];
            case 'sqlserver': {
                return buildSqlServerObjectDefinitionQueries('trigger', triggerName, dbName, 'trigger_definition');
            }
            case 'oracle':
            case 'dm':
                if (schema) {
                    return [
                        `SELECT DBMS_METADATA.GET_DDL('TRIGGER', '${safeTriggerName.toUpperCase()}', '${escapeSQLLiteral(schema).toUpperCase()}') AS trigger_definition FROM DUAL`,
                        `SELECT OWNER, TABLE_OWNER, TABLE_NAME, TRIGGER_NAME, TRIGGER_TYPE, TRIGGERING_EVENT, WHEN_CLAUSE, TRIGGER_BODY FROM ALL_TRIGGERS WHERE OWNER = '${escapeSQLLiteral(schema).toUpperCase()}' AND TRIGGER_NAME = '${safeTriggerName.toUpperCase()}'`,
                    ];
                }
                if (!safeDbName) {
                    return [
                        `SELECT DBMS_METADATA.GET_DDL('TRIGGER', '${safeTriggerName.toUpperCase()}') AS trigger_definition FROM DUAL`,
                        `SELECT TABLE_NAME, TRIGGER_NAME, TRIGGER_TYPE, TRIGGERING_EVENT, WHEN_CLAUSE, TRIGGER_BODY FROM USER_TRIGGERS WHERE TRIGGER_NAME = '${safeTriggerName.toUpperCase()}'`,
                    ];
                }
                return [
                    `SELECT DBMS_METADATA.GET_DDL('TRIGGER', '${safeTriggerName.toUpperCase()}', '${safeDbName.toUpperCase()}') AS trigger_definition FROM DUAL`,
                    `SELECT OWNER, TABLE_OWNER, TABLE_NAME, TRIGGER_NAME, TRIGGER_TYPE, TRIGGERING_EVENT, WHEN_CLAUSE, TRIGGER_BODY FROM ALL_TRIGGERS WHERE OWNER = '${safeDbName.toUpperCase()}' AND TRIGGER_NAME = '${safeTriggerName.toUpperCase()}'`,
                ];
            case 'sqlite':
                return [`SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = '${safeTriggerName}'`];
            case 'duckdb':
                return [`-- DuckDB 不支持触发器`];
            case 'tdengine':
                return [`-- TDengine 不支持触发器`];
            case 'mongodb':
                return [`-- MongoDB 不支持触发器`];
            default:
                return [`-- 暂不支持该数据库类型的触发器定义查看`];
        }
    };

    const runQueryCandidates = async (
        config: Record<string, any>,
        dbName: string,
        queries: string[]
    ): Promise<{ success: boolean; data: any[]; message?: string }> => {
        let lastMessage = '';
        let hasSuccessfulQuery = false;
        for (const query of queries) {
            const sql = String(query || '').trim();
            if (!sql) continue;
            try {
                const result = await DBQuery(buildRpcConnectionConfig(config) as any, dbName, sql);
                if (!result.success || !Array.isArray(result.data)) {
                    lastMessage = result.message || lastMessage;
                    continue;
                }
                hasSuccessfulQuery = true;
                if (result.data.length > 0) {
                    return { success: true, data: result.data };
                }
            } catch (error: any) {
                lastMessage = error?.message || String(error);
            }
        }
        if (hasSuccessfulQuery) {
            return { success: true, data: [] };
        }
        return { success: false, data: [], message: lastMessage };
    };

    const getVersionHint = async (config: Record<string, any>, dbName: string): Promise<string> => {
        const candidates = [
            `SELECT VERSION() AS version`,
            `SHOW VARIABLES LIKE 'version'`,
        ];
        for (const query of candidates) {
            try {
                const result = await DBQuery(buildRpcConnectionConfig(config) as any, dbName, query);
                if (!result.success || !Array.isArray(result.data) || result.data.length === 0) {
                    continue;
                }
                const row = result.data[0] as Record<string, any>;
                const version =
                    row.version
                    || row.VERSION
                    || row.Value
                    || row.value
                    || Object.values(row)[1]
                    || Object.values(row)[0];
                const text = String(version || '').trim();
                if (text) return text;
            } catch {
                // ignore
            }
        }
        return '';
    };

    const extractTriggerDefinition = (dialect: string, data: any[], fallbackTriggerName: string, fallbackTableName: string): string => {
        if (!data || data.length === 0) {
            return '-- 未找到触发器定义';
        }

        const row = data[0] as Record<string, any>;

        switch (dialect) {
            case 'mysql':
            case 'starrocks': {
                // MySQL SHOW CREATE TRIGGER returns: Trigger, sql_mode, SQL Original Statement, ...
                const keys = Object.keys(row);
                const metadataDDL = buildMySQLTriggerDDLFromMetadata(row, fallbackTriggerName, fallbackTableName);
                if (row.trigger_definition || row.TRIGGER_DEFINITION) {
                    return String(row.trigger_definition || row.TRIGGER_DEFINITION);
                }
                if (metadataDDL) {
                    return metadataDDL;
                }
                if (row.ACTION_STATEMENT || row.action_statement) {
                    return String(row.ACTION_STATEMENT || row.action_statement);
                }
                const sqlKey = keys.find(k => k.toLowerCase().includes('statement') || k.toLowerCase() === 'sql original statement');
                if (sqlKey) return row[sqlKey];
                // Fallback: try to find any key containing CREATE TRIGGER
                for (const key of keys) {
                    const val = String(row[key] || '');
                    if (val.toUpperCase().includes('CREATE TRIGGER')) {
                        return val;
                    }
                }
                return JSON.stringify(row, null, 2);
            }
            case 'postgres':
            case 'kingbase':
            case 'highgo':
            case 'vastbase':
            case 'opengauss':
            case 'gaussdb': {
                return row.trigger_definition || row.TRIGGER_DEFINITION || Object.values(row)[0] || '';
            }
            case 'sqlserver': {
                const directDefinition = getCaseInsensitiveRawValue(row, ['trigger_definition', 'definition']);
                if (directDefinition !== undefined && directDefinition !== null && String(directDefinition).trim() !== '') {
                    return String(directDefinition);
                }
                const helpTextDefinition = data
                    .map((item) => getCaseInsensitiveRawValue(item, ['Text', 'text']))
                    .filter((value) => value !== undefined && value !== null)
                    .map((value) => String(value))
                    .join('');
                if (helpTextDefinition.trim()) return helpTextDefinition;
                return Object.values(row)[0] || '';
            }
            case 'oracle':
            case 'dm': {
                const ddl = String(row.trigger_definition || row.TRIGGER_DEFINITION || '').trim();
                if (ddl) {
                    return ddl;
                }
                const metadataDDL = buildOracleLikeTriggerDDLFromMetadata(row, fallbackTriggerName, fallbackTableName);
                if (metadataDDL) {
                    return metadataDDL;
                }
                return row.trigger_body || row.TRIGGER_BODY || Object.values(row)[0] || '';
            }
            case 'sqlite': {
                return row.sql || row.SQL || Object.values(row)[0] || '';
            }
            default:
                return JSON.stringify(row, null, 2);
        }
    };

    const loadTriggerDefinition = async (): Promise<{ success: boolean; definition?: string; error?: string }> => {
        const conn = connections.find(c => c.id === tab.connectionId);
        if (!conn) {
            return { success: false, error: '未找到数据库连接' };
        }

        const triggerName = tab.triggerName || '';
        const dbName = tab.dbName || '';

        if (!triggerName) {
            return { success: false, error: '触发器名称为空' };
        }

        const dialect = getMetadataDialect(conn);
        const queries = buildShowTriggerQueries(dialect, triggerName, dbName);
        const sphinxLike = isSphinxConnection(conn) && dialect === 'mysql';

        if (!queries.length || String(queries[0] || '').startsWith('--')) {
            return { success: true, definition: String(queries[0] || '-- 暂不支持该数据库类型的触发器定义查看') };
        }

        try {
            const config = {
                ...conn.config,
                port: Number(conn.config.port),
                password: conn.config.password || '',
                database: conn.config.database || '',
                useSSH: conn.config.useSSH || false,
                ssh: conn.config.ssh || { host: '', port: 22, user: '', password: '', keyPath: '' }
            };

            const result = await runQueryCandidates(config, dbName, queries);

            if (result.success && Array.isArray(result.data) && result.data.length > 0) {
                return {
                    success: true,
                    definition: extractTriggerDefinition(dialect, result.data, triggerName, String(tab.triggerTableName || '')),
                };
            }

            if (result.success) {
                if (sphinxLike) {
                    const version = await getVersionHint(config, dbName);
                    const versionText = version ? `（版本: ${version}）` : '';
                    return {
                        success: true,
                        definition: `-- 当前 Sphinx 实例${versionText}未返回触发器定义。\n-- 已执行多套兼容查询，可能是版本能力限制或对象类型不支持。`
                    };
                }
                return { success: true, definition: '-- 未找到触发器定义' };
            }

            if (sphinxLike) {
                const version = await getVersionHint(config, dbName);
                const versionText = version ? `（版本: ${version}）` : '';
                return {
                    success: true,
                    definition: `-- 当前 Sphinx 实例${versionText}不支持触发器定义查询。\n-- 已自动尝试兼容语句，返回失败信息: ${result.message || 'unknown error'}`
                };
            }

            return { success: false, error: result.message || '查询触发器定义失败' };
        } catch (e: any) {
            return { success: false, error: '查询触发器定义失败: ' + (e?.message || String(e)) };
        }
    };

    useEffect(() => {
        let cancelled = false;
        const syncTriggerDefinition = async () => {
            setLoading(true);
            setError(null);
            const result = await loadTriggerDefinition();
            if (cancelled) {
                return;
            }
            if (result.success) {
                loadedDefinitionKeyRef.current = objectIdentityKey;
                setTriggerDefinition(String(result.definition || ''));
            } else {
                setError(result.error || '查询触发器定义失败');
            }
            setLoading(false);
        };

        syncTriggerDefinition();

        return () => {
            cancelled = true;
        };
    }, [tab.connectionId, tab.dbName, tab.triggerName, connections, objectIdentityKey]);

    useEffect(() => () => {
        isMountedRef.current = false;
    }, []);

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <Spin tip="加载触发器定义..." />
            </div>
        );
    }

    const displayedDefinition = loadedDefinitionKeyRef.current === objectIdentityKey ? triggerDefinition : '';
    const hasDefinition = String(displayedDefinition || '').trim() !== '';

    if (error && !hasDefinition) {
        return (
            <div style={{ padding: 16 }}>
                <Alert type="error" message="加载失败" description={error} showIcon />
            </div>
        );
    }

    const triggerName = String(tab.triggerName || '').trim();
    const dbName = String(tab.dbName || '').trim();
    const openObjectEditQuery = async () => {
        if (!triggerName || openingObjectEdit) return;
        setOpeningObjectEdit(true);
        setError(null);
        try {
            const result = await loadTriggerDefinition();
            if (!isMountedRef.current) {
                return;
            }
            if (!result.success) {
                setError(result.error || '查询触发器定义失败');
                return;
            }
            const latestDefinition = String(result.definition || '');
            loadedDefinitionKeyRef.current = objectIdentityKey;
            setTriggerDefinition(latestDefinition);
            setActiveContext({ connectionId: tab.connectionId, dbName });
            addTab({
                id: `query-edit-trigger-${tab.connectionId}-${dbName}-${Date.now()}`,
                title: `修改触发器: ${triggerName}`,
                type: 'query',
                connectionId: tab.connectionId,
                dbName,
                query: buildEditableTriggerSql(triggerName, latestDefinition),
                queryMode: 'object-edit',
            });
        } finally {
            if (isMountedRef.current) {
                setOpeningObjectEdit(false);
            }
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ padding: '8px 16px', borderBottom: darkMode ? '1px solid #303030' : '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <strong>触发器: </strong>{tab.triggerName}
                    {tab.dbName && <span style={{ marginLeft: 16, color: '#888' }}>数据库: {tab.dbName}</span>}
                </div>
                <Button size="small" icon={<EditOutlined />} onClick={openObjectEditQuery} disabled={!triggerName} loading={openingObjectEdit}>
                    对象修改
                </Button>
            </div>
            {error && hasDefinition && (
                <div style={{ padding: '8px 16px 0' }}>
                    <Alert type="warning" message="刷新最新定义失败" description={error} showIcon />
                </div>
            )}
            <div style={{ flex: 1, minHeight: 0 }}>
                <Editor
                    height="100%"
                    language="sql"
                    theme={darkMode ? 'transparent-dark' : 'transparent-light'}
                    value={displayedDefinition}
                    options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        fontSize: 14,
                        lineNumbers: 'on',
                        scrollBeyondLastLine: false,
                        wordWrap: 'on',
                        automaticLayout: true,
                    }}
                />
            </div>
        </div>
    );
};

export default TriggerViewer;
