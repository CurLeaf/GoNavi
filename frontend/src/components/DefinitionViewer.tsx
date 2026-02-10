import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { Spin, Alert } from 'antd';
import { TabData } from '../types';
import { useStore } from '../store';
import { DBQuery } from '../../wailsjs/go/app/App';

interface DefinitionViewerProps {
    tab: TabData;
}

const DefinitionViewer: React.FC<DefinitionViewerProps> = ({ tab }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [definition, setDefinition] = useState<string>('');

    const connections = useStore(state => state.connections);
    const theme = useStore(state => state.theme);
    const darkMode = theme === 'dark';

    const escapeSQLLiteral = (raw: string): string => String(raw || '').replace(/'/g, "''");

    const getMetadataDialect = (conn: any): string => {
        const type = String(conn?.config?.type || '').trim().toLowerCase();
        if (type === 'custom') {
            return String(conn?.config?.driver || '').trim().toLowerCase();
        }
        if (type === 'mariadb') return 'mysql';
        if (type === 'dameng') return 'dm';
        return type;
    };

    const parseSchemaAndName = (fullName: string): { schema: string; name: string } => {
        const raw = String(fullName || '').trim();
        const idx = raw.lastIndexOf('.');
        if (idx > 0 && idx < raw.length - 1) {
            return { schema: raw.substring(0, idx), name: raw.substring(idx + 1) };
        }
        return { schema: '', name: raw };
    };

    const buildShowViewQuery = (dialect: string, viewName: string, dbName: string): string => {
        const { schema, name } = parseSchemaAndName(viewName);
        const safeName = escapeSQLLiteral(name);
        const safeDbName = escapeSQLLiteral(dbName);

        switch (dialect) {
            case 'mysql':
                return `SHOW CREATE VIEW \`${name.replace(/`/g, '``')}\``;
            case 'postgres':
            case 'kingbase':
            case 'highgo':
            case 'vastbase': {
                const schemaRef = schema || 'public';
                return `SELECT pg_get_viewdef('${escapeSQLLiteral(schemaRef)}.${safeName}'::regclass, true) AS view_definition`;
            }
            case 'sqlserver':
                return `SELECT OBJECT_DEFINITION(OBJECT_ID('${escapeSQLLiteral(viewName)}')) AS view_definition`;
            case 'oracle':
            case 'dm':
                if (schema) {
                    return `SELECT TEXT AS view_definition FROM ALL_VIEWS WHERE OWNER = '${escapeSQLLiteral(schema).toUpperCase()}' AND VIEW_NAME = '${safeName.toUpperCase()}'`;
                }
                if (safeDbName) {
                    return `SELECT TEXT AS view_definition FROM ALL_VIEWS WHERE OWNER = '${safeDbName.toUpperCase()}' AND VIEW_NAME = '${safeName.toUpperCase()}'`;
                }
                return `SELECT TEXT AS view_definition FROM USER_VIEWS WHERE VIEW_NAME = '${safeName.toUpperCase()}'`;
            case 'sqlite':
                return `SELECT sql AS view_definition FROM sqlite_master WHERE type='view' AND name='${safeName}'`;
            default:
                return `-- 暂不支持该数据库类型的视图定义查看`;
        }
    };

    const buildShowRoutineQuery = (dialect: string, routineName: string, routineType: string, dbName: string): string => {
        const { schema, name } = parseSchemaAndName(routineName);
        const safeName = escapeSQLLiteral(name);
        const safeDbName = escapeSQLLiteral(dbName);
        const upperType = (routineType || 'FUNCTION').toUpperCase();

        switch (dialect) {
            case 'mysql':
                return `SHOW CREATE ${upperType} \`${name.replace(/`/g, '``')}\``;
            case 'postgres':
            case 'kingbase':
            case 'highgo':
            case 'vastbase': {
                const schemaRef = schema || 'public';
                return `SELECT pg_get_functiondef(p.oid) AS routine_definition FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = '${escapeSQLLiteral(schemaRef)}' AND p.proname = '${safeName}' LIMIT 1`;
            }
            case 'sqlserver':
                return `SELECT OBJECT_DEFINITION(OBJECT_ID('${escapeSQLLiteral(routineName)}')) AS routine_definition`;
            case 'oracle':
            case 'dm': {
                const owner = schema ? escapeSQLLiteral(schema).toUpperCase() : (safeDbName ? safeDbName.toUpperCase() : '');
                if (owner) {
                    return `SELECT TEXT FROM ALL_SOURCE WHERE OWNER = '${owner}' AND NAME = '${safeName.toUpperCase()}' AND TYPE = '${upperType}' ORDER BY LINE`;
                }
                return `SELECT TEXT FROM USER_SOURCE WHERE NAME = '${safeName.toUpperCase()}' AND TYPE = '${upperType}' ORDER BY LINE`;
            }
            case 'sqlite':
                return `-- SQLite 不支持存储函数/存储过程`;
            default:
                return `-- 暂不支持该数据库类型的函数/存储过程定义查看`;
        }
    };

    const extractViewDefinition = (dialect: string, data: any[]): string => {
        if (!data || data.length === 0) return '-- 未找到视图定义';
        const row = data[0];

        switch (dialect) {
            case 'mysql': {
                const keys = Object.keys(row);
                const sqlKey = keys.find(k => k.toLowerCase().includes('create view') || k.toLowerCase() === 'create view');
                if (sqlKey) return row[sqlKey];
                for (const key of keys) {
                    const val = String(row[key] || '');
                    if (val.toUpperCase().includes('CREATE') && val.toUpperCase().includes('VIEW')) {
                        return val;
                    }
                }
                return JSON.stringify(row, null, 2);
            }
            case 'oracle':
            case 'dm':
                return row.view_definition || row.VIEW_DEFINITION || row.text || row.TEXT || Object.values(row)[0] || '';
            default:
                return row.view_definition || row.VIEW_DEFINITION || row.sql || row.SQL || Object.values(row)[0] || '';
        }
    };

    const extractRoutineDefinition = (dialect: string, data: any[]): string => {
        if (!data || data.length === 0) return '-- 未找到函数/存储过程定义';

        switch (dialect) {
            case 'mysql': {
                const row = data[0];
                const keys = Object.keys(row);
                const sqlKey = keys.find(k => k.toLowerCase().includes('create function') || k.toLowerCase().includes('create procedure'));
                if (sqlKey) return row[sqlKey];
                for (const key of keys) {
                    const val = String(row[key] || '');
                    if (val.toUpperCase().includes('CREATE') && (val.toUpperCase().includes('FUNCTION') || val.toUpperCase().includes('PROCEDURE'))) {
                        return val;
                    }
                }
                return JSON.stringify(row, null, 2);
            }
            case 'oracle':
            case 'dm': {
                // Oracle/DM ALL_SOURCE returns multiple rows, one per line
                return data.map(row => row.text || row.TEXT || Object.values(row)[0] || '').join('');
            }
            default: {
                const row = data[0];
                return row.routine_definition || row.ROUTINE_DEFINITION || Object.values(row)[0] || '';
            }
        }
    };

    useEffect(() => {
        const loadDefinition = async () => {
            setLoading(true);
            setError(null);

            const conn = connections.find(c => c.id === tab.connectionId);
            if (!conn) {
                setError('未找到数据库连接');
                setLoading(false);
                return;
            }

            const dbName = tab.dbName || '';
            const dialect = getMetadataDialect(conn);

            let query: string;
            let extractFn: (dialect: string, data: any[]) => string;

            if (tab.type === 'view-def') {
                const viewName = tab.viewName || '';
                if (!viewName) {
                    setError('视图名称为空');
                    setLoading(false);
                    return;
                }
                query = buildShowViewQuery(dialect, viewName, dbName);
                extractFn = extractViewDefinition;
            } else {
                const routineName = tab.routineName || '';
                const routineType = tab.routineType || 'FUNCTION';
                if (!routineName) {
                    setError('函数/存储过程名称为空');
                    setLoading(false);
                    return;
                }
                query = buildShowRoutineQuery(dialect, routineName, routineType, dbName);
                extractFn = extractRoutineDefinition;
            }

            if (query.startsWith('--')) {
                setDefinition(query);
                setLoading(false);
                return;
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

                const result = await DBQuery(config as any, dbName, query);

                if (result.success && Array.isArray(result.data)) {
                    const def = extractFn(dialect, result.data);
                    setDefinition(def);
                } else {
                    setError(result.message || '查询定义失败');
                }
            } catch (e: any) {
                setError('查询定义失败: ' + (e?.message || String(e)));
            } finally {
                setLoading(false);
            }
        };

        loadDefinition();
    }, [tab.connectionId, tab.dbName, tab.viewName, tab.routineName, tab.routineType, tab.type, connections]);

    const objectLabel = tab.type === 'view-def' ? '视图' : '函数/存储过程';
    const objectName = tab.type === 'view-def' ? tab.viewName : tab.routineName;

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <Spin tip={`加载${objectLabel}定义...`} />
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ padding: 16 }}>
                <Alert type="error" message="加载失败" description={error} showIcon />
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ padding: '8px 16px', borderBottom: darkMode ? '1px solid #303030' : '1px solid #f0f0f0' }}>
                <strong>{objectLabel}: </strong>{objectName}
                {tab.dbName && <span style={{ marginLeft: 16, color: '#888' }}>数据库: {tab.dbName}</span>}
                {tab.routineType && <span style={{ marginLeft: 16, color: '#888' }}>类型: {tab.routineType}</span>}
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
                <Editor
                    height="100%"
                    language="sql"
                    theme={darkMode ? 'transparent-dark' : 'transparent-light'}
                    value={definition}
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

export default DefinitionViewer;
