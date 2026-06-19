import Modal from './common/ResizableDraggableModal';
import React, { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import Editor, { type OnMount } from './MonacoEditor';
import { message, Input, Form, MenuProps } from 'antd';
import { format, type SqlLanguage } from 'sql-formatter';
import { v4 as uuidv4 } from 'uuid';
import { TabData, ColumnDefinition, IndexDefinition } from '../types';
import { useStore } from '../store';
import { DBQuery, DBQueryWithCancel, DBQueryMulti, DBQueryMultiTransactional, DBGetTables, DBGetAllColumns, DBGetDatabases, DBGetColumns, DBGetIndexes, CancelQuery, GenerateQueryID, WriteSQLFile, ExportSQLFile } from '../../wailsjs/go/app/App';
import { GONAVI_ROW_KEY } from './DataGrid';
import { getDataSourceCapabilities, shouldShowOceanBaseRowNumberColumn } from '../utils/dataSourceCapabilities';
import { applyMongoQueryAutoLimit, convertMongoShellToJsonCommand } from "../utils/mongodb";
import { getShortcutDisplayLabel, getShortcutPlatform, getShortcutPrimaryModifierDisplayLabel, isEditableElement, isShortcutMatch, comboToMonacoKeyBinding, resolveShortcutBinding } from "../utils/shortcuts";
import { useAutoFetchVisibility } from '../utils/autoFetchVisibility';
import { buildRpcConnectionConfig } from '../utils/connectionRpcConfig';
import { isPostgresSchemaDialect } from '../utils/connectionDriverType';
import { isOracleLikeDialect, resolveSqlDialect, resolveSqlFunctions, resolveSqlKeywords } from '../utils/sqlDialect';
import { applyQueryAutoLimit } from '../utils/queryAutoLimit';
import {
    buildQueryResultPageSql,
    createInitialQueryResultPagination,
    resolveQueryResultPaginationTotal,
} from '../utils/queryResultPagination';
import { extractQueryResultTableRef, type QueryResultTableRef } from '../utils/queryResultTable';
import { quoteIdentPart, quoteQualifiedIdent } from '../utils/sql';
import { formatSqlExecutionError } from '../utils/sqlErrorSemantics';
import { shouldUseSqlEditorManagedTransaction } from '../utils/sqlEditorTransaction';
import { findSqlStatementRanges, resolveCurrentSqlStatementRange, resolveExecutableSql } from '../utils/sqlStatementSelection';
import { isMacLikePlatform } from '../utils/appearance';
import { splitSidebarQualifiedName } from '../utils/sidebarLocate';
import { buildMySQLCompatibleViewMetadataSqls, isSidebarViewTableType, normalizeSidebarViewName } from '../utils/sidebarMetadata';
import { SIDEBAR_SQL_EDITOR_DRAG_MIME, decodeSidebarSqlEditorDragPayload, hasSidebarSqlEditorDragPayload } from '../utils/sidebarSqlDrag';
import { resolveUniqueKeyGroupsFromIndexes } from './dataGridCopyInsert';
// SQL 诊断工作台：lazy 加载避免 reactflow/dagre 进入主 bundle（约 130KB gzipped 独立 chunk）
const ExplainWorkbench = lazy(() => import('./explain/ExplainWorkbench'));
// 慢 SQL 历史面板：lazy 加载
const SlowQueryPanel = lazy(() => import('./explain/SlowQueryPanel'));
import { SUPPORTED_LANGUAGES, t as translate } from '../i18n';
import {
    DUCKDB_ROWID_LOCATOR_COLUMN,
    ORACLE_ROWID_LOCATOR_COLUMN,
    type EditRowLocator,
} from '../utils/rowLocator';
import { getQueryTabDraft, hasQueryTabDraft, setQueryTabDraft, setSQLFileTabDraft } from '../utils/sqlFileTabDrafts';
import {
    getColumnDefinitionComment,
    getColumnDefinitionKey,
    getColumnDefinitionName,
    getColumnDefinitionType,
} from '../utils/columnDefinition';
import QueryEditorResultsPanel, { type QueryEditorResultSet } from './QueryEditorResultsPanel';
import { SQL_EDITOR_AUTO_COMMIT_DELAY_OPTIONS } from './QueryEditorTransactionSettings';
import QueryEditorTransactionToolbar from './QueryEditorTransactionToolbar';
import QueryEditorToolbar from './QueryEditorToolbar';
import { useSqlEditorTransactionController } from './useSqlEditorTransactionController';

const UNTITLED_QUERY_DATABASE_PLACEHOLDER = '__GONAVI_QUERY_DATABASE__';

const UNTITLED_QUERY_TITLE_PREFIXES = Array.from(
    new Set(
        SUPPORTED_LANGUAGES
            .flatMap((language) => {
                const titles = [translate('query.new', undefined, language).trim()];
                const databaseQueryTitle = translate(
                    'sidebar.tab.new_query_database',
                    { database: UNTITLED_QUERY_DATABASE_PLACEHOLDER },
                    language,
                ).trim();
                const databasePrefixIndex = databaseQueryTitle.indexOf(UNTITLED_QUERY_DATABASE_PLACEHOLDER);
                if (databasePrefixIndex > 0) {
                    titles.push(databaseQueryTitle.slice(0, databasePrefixIndex).trim());
                }
                return titles;
            })
            .filter(Boolean)
    )
);

const buildQueryEditorMonacoActionLabel = (key: string): string =>
    `GoNavi: ${translate(key)}`;

const QUERY_EDITOR_SQL_PROMPT_PLACEHOLDER = '{SQL}';

const buildQueryEditorAiContextPrompt = (connection: any, database: string): string => {
    if (!connection) {
        return '';
    }

    const sourceLabel = String(connection.config?.type || '').trim() || translate('query_editor.ai_prompt.default_source');
    const databaseLabel = String(database || '').trim() || translate('query_editor.ai_prompt.default_database');

    return translate('query_editor.ai_prompt.context', {
        type: sourceLabel,
        name: `"${connection.name}"`,
        database: `"${databaseLabel}"`,
    });
};

// HMR 重载时释放旧注册避免补全和 hover 内容重复
const _g = globalThis as any;
const SQL_COMPLETION_PROVIDER_VERSION = '20260612-cursor-stable-completion-v1';
if (!_g.__gonaviSqlCompletionState) {
    _g.__gonaviSqlCompletionState = { registered: false, version: '', disposables: [] as any[] };
}
if (!Array.isArray(_g.__gonaviSqlCompletionState.disposables)) {
    _g.__gonaviSqlCompletionState.disposables = [];
}
let sqlCompletionRegistered = _g.__gonaviSqlCompletionState.registered;
let sqlCompletionDisposables = _g.__gonaviSqlCompletionState.disposables;

// 模块级共享变量：completion provider 从这些变量读取当前活跃 Tab 的状态。
// 每个 QueryEditor 实例在成为活跃 Tab 时更新这些变量，确保 provider 始终使用正确的上下文。
let sharedCurrentDb = '';
let sharedCurrentConnectionId = '';
let sharedConnections: any[] = [];
type CompletionTableMeta = {dbName: string, tableName: string, comment?: string};
type CompletionColumnMeta = {dbName: string, tableName: string, name: string, type: string, comment?: string};
type CompletionViewMeta = {dbName: string, viewName: string, schemaName?: string};
type CompletionTriggerMeta = {dbName: string, triggerName: string, tableName: string, schemaName?: string};
type CompletionRoutineMeta = {dbName: string, routineName: string, routineType: string, schemaName?: string};
let sharedTablesData: CompletionTableMeta[] = [];
let sharedAllColumnsData: CompletionColumnMeta[] = [];
let sharedVisibleDbs: string[] = [];
let sharedViewsData: CompletionViewMeta[] = [];
let sharedMaterializedViewsData: CompletionViewMeta[] = [];
let sharedTriggersData: CompletionTriggerMeta[] = [];
let sharedRoutinesData: CompletionRoutineMeta[] = [];
let sharedColumnsCacheData: Record<string, any[]> = {};
const sharedLazyTablesCache: Record<string, CompletionTableMeta[] | undefined> = {};
const sharedLazyTablesInFlight: Record<string, Promise<CompletionTableMeta[]> | undefined> = {};
const createEmptySqlCompletionResult = () => ({ suggestions: [] as any[] });
const isSqlCompletionRequestCancelled = (token?: { isCancellationRequested?: boolean } | null) =>
    Boolean(token?.isCancellationRequested);
const clearRecord = (record: Record<string, unknown>) => {
    Object.keys(record).forEach((key) => {
        delete record[key];
    });
};
const resetSharedQueryEditorMetadata = () => {
    sharedTablesData = [];
    sharedAllColumnsData = [];
    sharedViewsData = [];
    sharedMaterializedViewsData = [];
    sharedTriggersData = [];
    sharedRoutinesData = [];
    sharedColumnsCacheData = {};
    clearRecord(sharedLazyTablesCache);
    clearRecord(sharedLazyTablesInFlight);
};

const QUERY_LOCATOR_ALIAS_PREFIX = '__gonavi_locator_';

const buildQueryReadOnlyLocator = (reason: string): EditRowLocator => ({
    strategy: 'none',
    columns: [],
    valueColumns: [],
    readOnly: true,
    reason,
});

type SimpleSelectInfo = {
    selectsAll: boolean;
    selectsBareAll: boolean;
    writableColumns: Record<string, string>;
};

type QueryStatementPlan = {
    originalSql: string;
    executedSql: string;
    tableRef?: QueryResultTableRef;
    pkColumns: string[];
    editLocator?: EditRowLocator;
    warning?: string;
};

const stripSidebarDropIdentifierQuotes = (part: string): string => {
    const text = String(part || '').trim();
    if (!text) return '';
    if ((text.startsWith('`') && text.endsWith('`')) || (text.startsWith('"') && text.endsWith('"')) || (text.startsWith('[') && text.endsWith(']'))) {
        return text.slice(1, -1).trim();
    }
    return text;
};

const shouldPrefixSidebarDropDatabase = (
    payloadConnectionId: string,
    payloadDbName: string,
    payloadText: string,
    currentConnectionId: string,
    currentDb: string,
): boolean => {
    const sourceDbName = String(payloadDbName || '').trim();
    if (!sourceDbName) return false;
    const normalizedSourceDbName = sourceDbName.toLowerCase();
    if (String(currentDb || '').trim().toLowerCase() === normalizedSourceDbName) return false;

    const sourceConnectionId = String(payloadConnectionId || '').trim();
    const targetConnectionId = String(currentConnectionId || '').trim();
    if (sourceConnectionId && targetConnectionId && sourceConnectionId !== targetConnectionId) return false;

    const parts = String(payloadText || '')
        .split('.')
        .map(stripSidebarDropIdentifierQuotes)
        .filter(Boolean);
    return parts[0]?.toLowerCase() !== normalizedSourceDbName;
};

const isQueryEditorPrimaryMouseButton = (event: any): boolean => {
    if (event?.leftButton === true) return true;
    if (event?.leftButton === false) return false;

    const browserEvent = event?.browserEvent || event?.nativeEvent || event;
    if (browserEvent?.button === 0) return true;
    if (event?.button === 0) return true;
    if (browserEvent?.buttons === 1) return true;
    if (event?.buttons === 1) return true;
    return false;
};

const readSidebarSqlDropText = (
    event: DragEvent,
    currentConnectionId = '',
    currentDb = '',
): string => {
    const payload = decodeSidebarSqlEditorDragPayload(String(event.dataTransfer?.getData(SIDEBAR_SQL_EDITOR_DRAG_MIME) || ''));
    if (payload?.text) {
        if (shouldPrefixSidebarDropDatabase(payload.connectionId || '', payload.dbName || '', payload.text, currentConnectionId, currentDb)) {
            return `${String(payload.dbName || '').trim()}.${payload.text}`;
        }
        return payload.text;
    }
    return String(event.dataTransfer?.getData('text/plain') || '').trim();
};

const stripQueryIdentifierQuotes = (part: string): string => {
    const text = String(part || '').trim();
    if (!text) return '';
    if ((text.startsWith('`') && text.endsWith('`')) || (text.startsWith('"') && text.endsWith('"'))) {
        return text.slice(1, -1).trim();
    }
    if (text.startsWith('[') && text.endsWith(']')) {
        return text.slice(1, -1).trim();
    }
    return text;
};

const MYSQL_SYSTEM_METADATA_SCHEMAS = new Set(['information_schema', 'performance_schema', 'mysql', 'sys']);
const POSTGRES_SYSTEM_METADATA_SCHEMAS = new Set(['information_schema', 'pg_catalog']);
const SQLITE_SYSTEM_METADATA_TABLES = new Set(['sqlite_master', 'sqlite_schema', 'sqlite_temp_master', 'sqlite_temp_schema']);

const isSystemMetadataQueryResult = (tableRef: QueryResultTableRef, dbType: string): boolean => {
    const normalizedDbType = String(dbType || '').trim().toLowerCase();
    const metadataDbName = stripQueryIdentifierQuotes(tableRef.metadataDbName).toLowerCase();
    const metadataTableName = stripQueryIdentifierQuotes(tableRef.metadataTableName).toLowerCase();

    if (['mysql', 'goldendb', 'mariadb', 'oceanbase', 'diros', 'starrocks', 'sphinx', 'tidb'].includes(normalizedDbType)) {
        return MYSQL_SYSTEM_METADATA_SCHEMAS.has(metadataDbName);
    }
    if (['postgres', 'kingbase', 'highgo', 'vastbase', 'opengauss', 'gaussdb'].includes(normalizedDbType)) {
        return POSTGRES_SYSTEM_METADATA_SCHEMAS.has(metadataDbName);
    }
    if (normalizedDbType === 'sqlite' || normalizedDbType === 'duckdb') {
        return SQLITE_SYSTEM_METADATA_TABLES.has(metadataTableName) || metadataDbName === 'information_schema';
    }
    if (normalizedDbType === 'sqlserver') {
        return metadataDbName === 'information_schema' || metadataDbName === 'sys';
    }
    if (normalizedDbType === 'clickhouse') {
        return metadataDbName === 'system' || metadataDbName === 'information_schema';
    }
    return false;
};

const splitTopLevelComma = (text: string): string[] => {
    const parts: string[] = [];
    let current = '';
    let parenDepth = 0;
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    let escaped = false;

    for (let index = 0; index < text.length; index++) {
        const ch = text[index];
        if (escaped) {
            current += ch;
            escaped = false;
            continue;
        }
        if ((inSingle || inDouble) && ch === '\\') {
            current += ch;
            escaped = true;
            continue;
        }
        if (!inDouble && !inBacktick && ch === "'") {
            inSingle = !inSingle;
            current += ch;
            continue;
        }
        if (!inSingle && !inBacktick && ch === '"') {
            inDouble = !inDouble;
            current += ch;
            continue;
        }
        if (!inSingle && !inDouble && ch === '`') {
            inBacktick = !inBacktick;
            current += ch;
            continue;
        }
        if (!inSingle && !inDouble && !inBacktick) {
            if (ch === '(') parenDepth++;
            if (ch === ')' && parenDepth > 0) parenDepth--;
            if (ch === ',' && parenDepth === 0) {
                parts.push(current.trim());
                current = '';
                continue;
            }
        }
        current += ch;
    }

    if (current.trim()) parts.push(current.trim());
    return parts;
};

const SIMPLE_IDENTIFIER_PATH_RE = /^(?:[`"\[]?[A-Za-z_][\w$]*[`"\]]?\s*\.\s*){0,2}[`"\[]?[A-Za-z_][\w$]*[`"\]]?$/;
const QUERY_ALIAS_RESERVED = new Set([
    'where', 'group', 'order', 'having', 'limit', 'fetch', 'offset', 'join', 'left', 'right', 'inner', 'outer', 'on', 'union',
    'for', 'connect', 'start', 'window', 'sample', 'pivot', 'unpivot', 'qualify', 'model',
]);

const getLastIdentifierPart = (path: string): string => {
    const parts = String(path || '').split('.').map((part) => stripQueryIdentifierQuotes(part.trim())).filter(Boolean);
    return parts[parts.length - 1] || '';
};

const resolveSimpleSelectItemColumn = (item: string): { resultName: string; sourceName: string } | 'all' | undefined => {
    const text = String(item || '').trim();
    if (!text) return undefined;
    if (text === '*' || /\.\s*\*$/.test(text)) return 'all';

    let expr = text;
    let alias = '';
    const asMatch = text.match(/^(.*?)\s+AS\s+([`"\[]?[A-Za-z_][\w$]*[`"\]]?)$/i);
    if (asMatch) {
        expr = asMatch[1].trim();
        alias = stripQueryIdentifierQuotes(asMatch[2]);
    } else {
        const bareAliasMatch = text.match(/^(.*?)\s+([`"\[]?[A-Za-z_][\w$]*[`"\]]?)$/);
        if (bareAliasMatch && SIMPLE_IDENTIFIER_PATH_RE.test(bareAliasMatch[1].trim())) {
            const candidateAlias = stripQueryIdentifierQuotes(bareAliasMatch[2]);
            if (candidateAlias && !QUERY_ALIAS_RESERVED.has(candidateAlias.toLowerCase())) {
                expr = bareAliasMatch[1].trim();
                alias = candidateAlias;
            }
        }
    }

    if (!SIMPLE_IDENTIFIER_PATH_RE.test(expr)) return undefined;
    const sourceName = getLastIdentifierPart(expr);
    const resultName = alias || sourceName;
    return sourceName && resultName ? { resultName, sourceName } : undefined;
};

const parseSimpleSelectInfo = (sql: string): SimpleSelectInfo | undefined => {
    const match = String(sql || '').match(/^\s*SELECT\s+([\s\S]+?)\s+FROM\s+/i);
    if (!match) return undefined;
    const selectList = match[1].trim();
    if (!selectList || /^DISTINCT\b/i.test(selectList)) return undefined;

    const writableColumns: Record<string, string> = {};
    let selectsAll = false;
    let selectsBareAll = false;
    for (const item of splitTopLevelComma(selectList)) {
        const trimmedItem = String(item || '').trim();
        const resolved = resolveSimpleSelectItemColumn(item);
        if (!resolved) continue;
        if (resolved === 'all') {
            selectsAll = true;
            if (trimmedItem === '*') {
                selectsBareAll = true;
            }
            continue;
        }
        writableColumns[resolved.resultName] = resolved.sourceName;
    }
    return { selectsAll, selectsBareAll, writableColumns };
};

const appendQuerySelectExpressions = (sql: string, expressions: string[]): string => {
    if (expressions.length === 0) return sql;
    return String(sql || '').replace(
        /^(\s*SELECT\s+)([\s\S]+?)(\s+FROM\s+[\s\S]*)$/i,
        (_match, prefix, selectList, rest) => `${prefix}${String(selectList).trimEnd()}, ${expressions.join(', ')}${rest}`,
    );
};

const QUERY_LOCATOR_SOURCE_ALIAS = 'gonavi_query_source';

const rewriteOracleSelectAllWithExpressions = (sql: string, expressions: string[]): string | undefined => {
    if (expressions.length === 0) return undefined;

    const match = String(sql || '').match(/^(\s*SELECT\s+)([\s\S]+?)(\s+FROM\s+)([\s\S]*)$/i);
    if (!match) return undefined;

    const prefix = match[1];
    const selectList = match[2].trim();
    const fromKeyword = match[3];
    const fromTail = match[4];
    const selectItems = splitTopLevelComma(selectList);
    if (selectItems.length === 0) return undefined;

    let selectAllFound = false;
    for (const item of selectItems) {
        if (String(item || '').trim() === '*') {
            selectAllFound = true;
            break;
        }
    }
    if (!selectAllFound) return undefined;

    const fromTrimmed = fromTail.trimStart();
    const tableMatch = fromTrimmed.match(QUERY_EDITOR_SQL_LEADING_IDENTIFIER_PATH_REGEX);
    if (!tableMatch) return undefined;

    const tableText = tableMatch[1];
    const afterTable = tableMatch[2] || '';

    const parseAlias = (tail: string): { alias: string; remainder: string } => {
        const trimmedTail = String(tail || '').trimStart();
        if (!trimmedTail) {
            return { alias: '', remainder: tail };
        }

        const asMatch = trimmedTail.match(/^AS\s+([`"\[]?[A-Za-z_][\w$]*[`"\]]?)([\s\S]*)$/i);
        if (asMatch) {
            const candidate = stripQueryIdentifierQuotes(asMatch[1]);
            if (candidate && !QUERY_ALIAS_RESERVED.has(candidate.toLowerCase())) {
                return { alias: candidate, remainder: asMatch[2] || '' };
            }
        }

        const bareMatch = trimmedTail.match(/^([`"\[]?[A-Za-z_][\w$]*[`"\]]?)([\s\S]*)$/);
        if (bareMatch) {
            const candidate = stripQueryIdentifierQuotes(bareMatch[1]);
            if (candidate && !QUERY_ALIAS_RESERVED.has(candidate.toLowerCase())) {
                return { alias: candidate, remainder: bareMatch[2] || '' };
            }
        }

        return { alias: '', remainder: tail };
    };

    const parsedAlias = parseAlias(afterTable);
    const sourceAlias = parsedAlias.alias || QUERY_LOCATOR_SOURCE_ALIAS;
    const qualifiedExpressions = expressions
        .map((expression) => {
            const trimmed = String(expression || '').trim();
            if (!trimmed) return '';
            if (/^ROWID\b/i.test(trimmed)) {
                return trimmed.replace(/^(\s*)ROWID\b/i, `$1${sourceAlias}.ROWID`);
            }
            return trimmed;
        })
        .filter(Boolean);
    if (qualifiedExpressions.length === 0) return undefined;

    const rewrittenSelectItems = selectItems.map((item) => {
        const trimmed = String(item || '').trim();
        if (trimmed === '*') {
            return `${sourceAlias}.*`;
        }
        return item.trimEnd();
    });

    const aliasClause = parsedAlias.alias ? ` ${parsedAlias.alias}` : ` ${sourceAlias}`;
    const finalSelectItems = [...rewrittenSelectItems, ...qualifiedExpressions];
    return `${prefix}${finalSelectItems.join(', ')}${fromKeyword}${tableText}${aliasClause}${parsedAlias.remainder}`;
};

const findWritableResultColumnForSource = (writableColumns: Record<string, string>, target: string): string | undefined => {
    const normalizedTarget = String(target || '').trim().toLowerCase();
    return Object.entries(writableColumns || {}).find(([, sourceColumn]) => (
        String(sourceColumn || '').trim().toLowerCase() === normalizedTarget
    ))?.[0];
};

const resolveMetadataColumnName = (tableColumnNames: string[], sourceColumn: string): string => {
    const normalizedSource = String(sourceColumn || '').trim();
    if (!normalizedSource) return '';
    return tableColumnNames.find((column) => String(column || '').trim().toLowerCase() === normalizedSource.toLowerCase())
        || normalizedSource;
};

const buildQueryLocatorAlias = (column: string, index: number): string => {
    const normalized = String(column || '').trim().replace(/[^A-Za-z0-9_]/g, '_').slice(0, 48) || 'column';
    return `${QUERY_LOCATOR_ALIAS_PREFIX}${index}_${normalized}`;
};

const buildQueryLocatorColumnExpression = (dbType: string, column: string, alias: string): string => (
    `${quoteIdentPart(dbType, column)} AS ${quoteIdentPart(dbType, alias)}`
);

const buildQueryRowIDExpression = (dbType: string, sourceAlias?: string): string => (
    `${sourceAlias ? `${sourceAlias}.` : ''}ROWID AS ${quoteIdentPart(dbType, ORACLE_ROWID_LOCATOR_COLUMN)}`
);

const buildDuckDBRowIDExpression = (dbType: string, sourceAlias?: string): string => (
    `${sourceAlias ? `${sourceAlias}.` : ''}rowid AS ${quoteIdentPart(dbType, DUCKDB_ROWID_LOCATOR_COLUMN)}`
);

const escapeMetadataSqlLiteral = (raw: string): string => String(raw || '').replace(/'/g, "''");

const quoteSqlServerDbIdentifier = (raw: string): string => `[${String(raw || '').replace(/]/g, ']]')}]`;

type MetadataQuerySpec = {
    sql: string;
    inferredType?: 'FUNCTION' | 'PROCEDURE';
};

type MetadataQueryResult = {
    rows: Record<string, any>[];
    inferredType?: 'FUNCTION' | 'PROCEDURE';
};

const normalizeMetadataDialect = (conn: any): string => {
    const type = String(conn?.config?.type || '').trim().toLowerCase();
    const driver = String(conn?.config?.driver || '').trim();
    const dialect = resolveSqlDialect(type, driver, {
        oceanBaseProtocol: conn?.config?.oceanBaseProtocol,
    });
    if (dialect === 'diros' || dialect === 'sphinx' || dialect === 'mariadb' || dialect === 'oceanbase') return 'mysql';
    if (dialect === 'dameng') return 'oracle';
    return String(dialect || '').toLowerCase();
};

const resolveQueryEditorFormatterLanguage = (conn: any): SqlLanguage => {
    const dialect = normalizeMetadataDialect(conn);
    switch (dialect) {
        case 'postgres':
        case 'kingbase':
        case 'highgo':
        case 'vastbase':
        case 'opengauss':
        case 'gaussdb':
            return 'postgresql';
        case 'duckdb':
            return 'duckdb';
        case 'sqlite':
            return 'sqlite';
        case 'sqlserver':
            return 'transactsql';
        case 'oracle':
        case 'dameng':
            return 'plsql';
        case 'clickhouse':
            return 'clickhouse';
        case 'mysql':
        case 'goldendb':
        case 'sphinx':
            return 'mysql';
        case 'mariadb':
            return 'mariadb';
        default:
            return 'sql';
    }
};

const buildCompletionTableCommentSQL = (dialect: string, dbName: string): string => {
    const db = String(dbName || '').trim();
    const escapedDb = escapeMetadataSqlLiteral(db);
    switch (dialect) {
        case 'mysql':
        case 'starrocks':
            return `SELECT TABLE_NAME AS table_name, TABLE_COMMENT AS table_comment FROM information_schema.tables WHERE table_schema = '${escapedDb}' AND table_type = 'BASE TABLE' ORDER BY table_name`;
        case 'postgres':
        case 'kingbase':
        case 'vastbase':
        case 'highgo':
        case 'opengauss':
        case 'gaussdb':
            return `SELECT n.nspname || '.' || c.relname AS table_name, obj_description(c.oid, 'pg_class') AS table_comment FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg|_%' ESCAPE '|' ORDER BY n.nspname, c.relname`;
        case 'sqlserver': {
            const safeDb = quoteSqlServerDbIdentifier(db);
            return `SELECT s.name + '.' + t.name AS table_name, ep.value AS table_comment FROM ${safeDb}.sys.tables t JOIN ${safeDb}.sys.schemas s ON t.schema_id = s.schema_id LEFT JOIN ${safeDb}.sys.extended_properties ep ON ep.major_id = t.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description' WHERE t.type = 'U' ORDER BY s.name, t.name`;
        }
        case 'clickhouse':
            return `SELECT name AS table_name, comment AS table_comment FROM system.tables WHERE database = '${escapedDb}' AND engine NOT IN ('View', 'MaterializedView') ORDER BY name`;
        case 'oracle': {
            const owner = escapedDb.toUpperCase();
            return `SELECT table_name, comments AS table_comment FROM all_tab_comments WHERE owner = '${owner}' ORDER BY table_name`;
        }
        default:
            return '';
    }
};

const getCaseInsensitiveValue = (row: Record<string, any>, keys: string[]): any => {
    for (const key of keys) {
        for (const rowKey of Object.keys(row || {})) {
            if (rowKey.toLowerCase() === key.toLowerCase()) {
                return row[rowKey];
            }
        }
    }
    return undefined;
};

const normalizeCommentText = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const text = String(value).trim();
    if (!text || text.toLowerCase() === '<nil>') return '';
    return text;
};

const buildCompletionDocumentation = (comment?: string): string | undefined => {
    const text = normalizeCommentText(comment);
    return text ? translate('query_editor.completion.documentation.comment', { comment: text }) : undefined;
};

const appendCommentToDetail = (detail: string, comment?: string): string => {
    const text = normalizeCommentText(comment);
    return text ? `${detail} - ${text}` : detail;
};

const stripCompletionIdentifierQuotes = (ident: string): string => {
    let raw = String(ident || '').trim();
    if (!raw) return raw;
    const first = raw[0];
    const last = raw[raw.length - 1];
    if ((first === '`' && last === '`') || (first === '"' && last === '"')) {
        raw = raw.slice(1, -1);
    }
    return raw.trim();
};

const normalizeCompletionQualifiedName = (ident: string): string => {
    const raw = String(ident || '').trim();
    if (!raw) return raw;
    return raw
        .split('.')
        .map(p => stripCompletionIdentifierQuotes(p.trim()))
        .filter(Boolean)
        .join('.');
};

const getCompletionQualifiedNameLastPart = (qualified: string): string => {
    const raw = normalizeCompletionQualifiedName(qualified);
    if (!raw) return raw;
    const parts = raw.split('.').filter(Boolean);
    return parts[parts.length - 1] || raw;
};

const splitCompletionSchemaAndTable = (qualified: string): { schema: string; table: string } => {
    const raw = normalizeCompletionQualifiedName(qualified);
    if (!raw) return { schema: '', table: '' };
    const parts = raw.split('.').filter(Boolean);
    if (parts.length >= 2) {
        return {
            schema: parts[parts.length - 2] || '',
            table: parts[parts.length - 1] || '',
        };
    }
    return { schema: '', table: parts[0] || '' };
};

const DEFAULT_QUERY_TEMPLATE = 'SELECT * FROM ';

const getTabQueryValue = (tab: TabData): string => (
    typeof tab.query === 'string' ? tab.query : ''
);

const getInitialEditorQuery = (tab: TabData): string => {
    if (hasQueryTabDraft(tab.id)) {
        return getQueryTabDraft(tab.id);
    }
    const tabQuery = getTabQueryValue(tab);
    if (tabQuery || tab.filePath || tab.savedQueryId || tab.readOnly) {
        return tabQuery;
    }
    return DEFAULT_QUERY_TEMPLATE;
};

const resolveNextResultSetIndex = (sets: Array<{ key?: string }>): number => {
    const maxIndex = sets.reduce((max, item) => {
        const match = String(item?.key || '').match(/^result-(\d+)$/);
        const index = match ? Number(match[1]) : 0;
        return Number.isFinite(index) ? Math.max(max, index) : max;
    }, 0);
    return maxIndex + 1;
};

const normalizeExecutedSqlKey = (sql: string): string => String(sql || '')
    .replace(/\r\n/g, '\n')
    .replace(/；/g, ';')
    .trim()
    .replace(/;+\s*$/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

const areSqlStatementListsEqual = (left: string[], right: string[]): boolean => (
    left.length === right.length
    && left.every((statement, index) => normalizeExecutedSqlKey(statement) === normalizeExecutedSqlKey(right[index]))
);

const normalizeEditorPosition = (position: any): { lineNumber: number; column: number } | null => {
    if (!position) return null;
    const lineNumber = Number(position.positionLineNumber ?? position.lineNumber ?? position.endLineNumber ?? position.startLineNumber ?? position.selectionStartLineNumber);
    const column = Number(position.positionColumn ?? position.column ?? position.endColumn ?? position.startColumn ?? position.selectionStartColumn);
    if (!Number.isFinite(lineNumber) || !Number.isFinite(column) || lineNumber < 1 || column < 1) {
        return null;
    }
    return { lineNumber, column };
};

const getNormalizedOffsetAtPosition = (
    sqlText: string,
    position: { lineNumber: number; column: number },
): number => {
    const text = String(sqlText || '').replace(/\r\n/g, '\n');
    const lines = text.split('\n');
    const targetLineIndex = Math.max(0, Math.min(lines.length - 1, position.lineNumber - 1));
    let offset = 0;
    for (let index = 0; index < targetLineIndex; index++) {
        offset += (lines[index]?.length || 0) + 1;
    }
    return Math.max(0, Math.min(text.length, offset + Math.max(0, position.column - 1)));
};

const getFirstRowValue = (row: Record<string, any>): string => {
    for (const value of Object.values(row || {})) {
        if (value !== undefined && value !== null) {
            const normalized = String(value).trim();
            if (normalized !== '') return normalized;
        }
    }
    return '';
};

const getMySQLShowTablesName = (row: Record<string, any>): string => {
    for (const key of Object.keys(row || {})) {
        if (!key.toLowerCase().startsWith('tables_in_')) continue;
        const value = row[key];
        if (value === undefined || value === null) continue;
        const normalized = String(value).trim();
        if (normalized !== '') return normalized;
    }
    return '';
};

const normalizeMetadataQuerySpecs = (specs: MetadataQuerySpec[]): MetadataQuerySpec[] => {
    const seen = new Set<string>();
    const normalized: MetadataQuerySpec[] = [];
    specs.forEach((spec) => {
        const sql = String(spec.sql || '').trim();
        if (!sql) return;
        const key = `${spec.inferredType || ''}@@${sql}`;
        if (seen.has(key)) return;
        seen.add(key);
        normalized.push({ sql, inferredType: spec.inferredType });
    });
    return normalized;
};

const buildQualifiedCompletionName = (schemaName: string, objectName: string): string => {
    const schema = String(schemaName || '').trim();
    const object = String(objectName || '').trim();
    if (!object) return '';
    if (!schema || object.includes('.')) return object;
    return `${schema}.${object}`;
};

const buildCompletionViewsMetadataQuerySpecs = (dialect: string, dbName: string): MetadataQuerySpec[] => {
    const safeDbName = escapeMetadataSqlLiteral(dbName);
    switch (dialect) {
        case 'mysql':
        case 'starrocks': {
            return normalizeMetadataQuerySpecs(
                buildMySQLCompatibleViewMetadataSqls(dbName).map((sql) => ({ sql })),
            );
        }
        case 'postgres':
        case 'kingbase':
        case 'highgo':
        case 'vastbase':
        case 'opengauss':
        case 'gaussdb':
            return [{ sql: `SELECT schemaname AS schema_name, viewname AS view_name FROM pg_catalog.pg_views WHERE schemaname != 'information_schema' AND schemaname NOT LIKE 'pg|_%' ESCAPE '|' ORDER BY schemaname, viewname` }];
        case 'sqlserver': {
            const safeDb = quoteSqlServerDbIdentifier(dbName || 'master');
            return [{ sql: `SELECT s.name AS schema_name, v.name AS view_name FROM ${safeDb}.sys.views v JOIN ${safeDb}.sys.schemas s ON v.schema_id = s.schema_id ORDER BY s.name, v.name` }];
        }
        case 'oracle': {
            return normalizeMetadataQuerySpecs([
                { sql: 'SELECT VIEW_NAME AS view_name FROM USER_VIEWS ORDER BY VIEW_NAME' },
                { sql: 'SELECT OWNER AS schema_name, VIEW_NAME AS view_name FROM ALL_VIEWS WHERE OWNER = USER ORDER BY VIEW_NAME' },
                {
                    sql: safeDbName
                        ? `SELECT OWNER AS schema_name, VIEW_NAME AS view_name FROM ALL_VIEWS WHERE OWNER = '${safeDbName.toUpperCase()}' ORDER BY VIEW_NAME`
                        : '',
                },
            ]);
        }
        case 'sqlite':
            return [{ sql: 'SELECT name AS view_name FROM sqlite_master WHERE type = \'view\' ORDER BY name' }];
        case 'duckdb':
            return [{ sql: `SELECT table_schema AS schema_name, table_name AS view_name FROM information_schema.views WHERE table_schema NOT IN ('information_schema', 'pg_catalog') ORDER BY table_schema, table_name` }];
        default:
            return [];
    }
};

const buildCompletionMaterializedViewsMetadataQuerySpecs = (dialect: string, dbName: string): MetadataQuerySpec[] => {
    if (dialect !== 'starrocks') {
        return [];
    }
    const safeDbName = escapeMetadataSqlLiteral(dbName);
    const dbIdent = String(dbName || '').replace(/`/g, '``').trim();
    return normalizeMetadataQuerySpecs([
        {
            sql: safeDbName
                ? `SELECT TABLE_SCHEMA AS schema_name, TABLE_NAME AS object_name FROM information_schema.tables WHERE TABLE_SCHEMA = '${safeDbName}' AND UPPER(TABLE_TYPE) LIKE '%MATERIALIZED%' ORDER BY TABLE_NAME`
                : '',
        },
        { sql: dbIdent ? `SHOW MATERIALIZED VIEWS FROM \`${dbIdent}\`` : '' },
        { sql: 'SHOW MATERIALIZED VIEWS' },
    ]);
};

const buildCompletionTriggersMetadataQuerySpecs = (dialect: string, dbName: string): MetadataQuerySpec[] => {
    const safeDbName = escapeMetadataSqlLiteral(dbName);
    switch (dialect) {
        case 'mysql':
        case 'starrocks': {
            const dbIdent = String(dbName || '').replace(/`/g, '``').trim();
            return normalizeMetadataQuerySpecs([
                {
                    sql: safeDbName
                        ? `SELECT TRIGGER_NAME AS trigger_name, EVENT_OBJECT_TABLE AS table_name, TRIGGER_SCHEMA AS schema_name FROM information_schema.triggers WHERE trigger_schema = '${safeDbName}' ORDER BY EVENT_OBJECT_TABLE, TRIGGER_NAME`
                        : '',
                },
                { sql: dbIdent ? `SHOW TRIGGERS FROM \`${dbIdent}\`` : '' },
                { sql: 'SHOW TRIGGERS' },
            ]);
        }
        case 'postgres':
        case 'kingbase':
        case 'highgo':
        case 'vastbase':
        case 'opengauss':
        case 'gaussdb':
            return [{ sql: `SELECT DISTINCT event_object_schema AS schema_name, event_object_table AS table_name, trigger_name FROM information_schema.triggers WHERE trigger_schema NOT IN ('pg_catalog', 'information_schema') AND trigger_schema NOT LIKE 'pg|_%' ESCAPE '|' ORDER BY event_object_schema, event_object_table, trigger_name` }];
        case 'sqlserver': {
            const safeDb = quoteSqlServerDbIdentifier(dbName || 'master');
            return [{ sql: `SELECT s.name AS schema_name, t.name AS table_name, tr.name AS trigger_name FROM ${safeDb}.sys.triggers tr JOIN ${safeDb}.sys.tables t ON tr.parent_id = t.object_id JOIN ${safeDb}.sys.schemas s ON t.schema_id = s.schema_id WHERE tr.parent_class = 1 ORDER BY s.name, t.name, tr.name` }];
        }
        case 'oracle':
            if (!safeDbName) {
                return [{ sql: 'SELECT TRIGGER_NAME AS trigger_name, TABLE_NAME AS table_name FROM USER_TRIGGERS ORDER BY TABLE_NAME, TRIGGER_NAME' }];
            }
            return [{ sql: `SELECT OWNER AS schema_name, TABLE_NAME AS table_name, TRIGGER_NAME AS trigger_name FROM ALL_TRIGGERS WHERE OWNER = '${safeDbName.toUpperCase()}' ORDER BY TABLE_NAME, TRIGGER_NAME` }];
        case 'sqlite':
            return [{ sql: 'SELECT name AS trigger_name, tbl_name AS table_name FROM sqlite_master WHERE type = \'trigger\' ORDER BY tbl_name, name' }];
        default:
            return [];
    }
};

const buildCompletionFunctionsMetadataQuerySpecs = (dialect: string, dbName: string): MetadataQuerySpec[] => {
    const safeDbName = escapeMetadataSqlLiteral(dbName);
    switch (dialect) {
        case 'mysql':
        case 'starrocks':
            return normalizeMetadataQuerySpecs([
                {
                    sql: safeDbName
                        ? `SELECT ROUTINE_NAME AS routine_name, ROUTINE_TYPE AS routine_type, ROUTINE_SCHEMA AS schema_name FROM information_schema.routines WHERE routine_schema = '${safeDbName}' ORDER BY ROUTINE_TYPE, ROUTINE_NAME`
                        : '',
                },
                {
                    sql: safeDbName ? `SHOW FUNCTION STATUS WHERE Db = '${safeDbName}'` : 'SHOW FUNCTION STATUS',
                    inferredType: 'FUNCTION',
                },
                {
                    sql: safeDbName ? `SHOW PROCEDURE STATUS WHERE Db = '${safeDbName}'` : 'SHOW PROCEDURE STATUS',
                    inferredType: 'PROCEDURE',
                },
            ]);
        case 'postgres':
        case 'kingbase':
        case 'highgo':
        case 'vastbase':
        case 'opengauss':
        case 'gaussdb':
            return normalizeMetadataQuerySpecs([
                {
                    sql: `SELECT n.nspname AS schema_name, p.proname AS routine_name, CASE WHEN p.prokind = 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END AS routine_type FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg|_%' ESCAPE '|' ORDER BY n.nspname, routine_type, p.proname`,
                },
                {
                    sql: `SELECT r.routine_schema AS schema_name, r.routine_name AS routine_name, COALESCE(NULLIF(UPPER(r.routine_type), ''), 'FUNCTION') AS routine_type FROM information_schema.routines r WHERE r.routine_schema NOT IN ('pg_catalog', 'information_schema') AND r.routine_schema NOT LIKE 'pg|_%' ESCAPE '|' ORDER BY r.routine_schema, routine_type, r.routine_name`,
                },
                {
                    sql: `SELECT n.nspname AS schema_name, p.proname AS routine_name, 'FUNCTION' AS routine_type FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg|_%' ESCAPE '|' ORDER BY n.nspname, p.proname`,
                },
            ]);
        case 'sqlserver': {
            const safeDb = quoteSqlServerDbIdentifier(dbName || 'master');
            return [{ sql: `SELECT s.name AS schema_name, o.name AS routine_name, CASE o.type WHEN 'P' THEN 'PROCEDURE' WHEN 'FN' THEN 'FUNCTION' WHEN 'IF' THEN 'FUNCTION' WHEN 'TF' THEN 'FUNCTION' END AS routine_type FROM ${safeDb}.sys.objects o JOIN ${safeDb}.sys.schemas s ON o.schema_id = s.schema_id WHERE o.type IN ('P','FN','IF','TF') ORDER BY o.type, s.name, o.name` }];
        }
        case 'oracle':
            return normalizeMetadataQuerySpecs([
                { sql: `SELECT OBJECT_NAME AS routine_name, OBJECT_TYPE AS routine_type FROM USER_OBJECTS WHERE OBJECT_TYPE IN ('FUNCTION','PROCEDURE') ORDER BY OBJECT_TYPE, OBJECT_NAME` },
                { sql: `SELECT OWNER AS schema_name, OBJECT_NAME AS routine_name, OBJECT_TYPE AS routine_type FROM ALL_OBJECTS WHERE OWNER = USER AND OBJECT_TYPE IN ('FUNCTION','PROCEDURE') ORDER BY OBJECT_TYPE, OBJECT_NAME` },
                {
                    sql: safeDbName
                        ? `SELECT OWNER AS schema_name, OBJECT_NAME AS routine_name, OBJECT_TYPE AS routine_type FROM ALL_OBJECTS WHERE OWNER = '${safeDbName.toUpperCase()}' AND OBJECT_TYPE IN ('FUNCTION','PROCEDURE') ORDER BY OBJECT_TYPE, OBJECT_NAME`
                        : '',
                },
            ]);
        case 'duckdb':
            return [{
                sql: `SELECT schema_name, function_name AS routine_name, 'FUNCTION' AS routine_type FROM duckdb_functions() WHERE internal = false AND lower(function_type) = 'macro' AND COALESCE(macro_definition, '') <> '' ORDER BY schema_name, function_name`,
                inferredType: 'FUNCTION',
            }];
        default:
            return [];
    }
};

const queryCompletionMetadataRowsBySpecs = async (
    config: Record<string, any>,
    dbName: string,
    specs: MetadataQuerySpec[],
): Promise<MetadataQueryResult[]> => {
    const normalizedSpecs = normalizeMetadataQuerySpecs(specs);
    if (normalizedSpecs.length === 0) {
        return [];
    }
    const results: MetadataQueryResult[] = [];
    for (const spec of normalizedSpecs) {
        try {
            const result = await DBQuery(buildRpcConnectionConfig(config) as any, dbName, spec.sql);
            if (!result.success || !Array.isArray(result.data)) {
                continue;
            }
            results.push({
                rows: result.data as Record<string, any>[],
                inferredType: spec.inferredType,
            });
        } catch {
            // 忽略单条元数据查询失败，继续走兼容查询。
        }
    }
    return results;
};

type QueryEditorNavigationTarget =
    | { type: 'database'; dbName: string }
    | { type: 'table'; dbName: string; tableName: string; schemaName?: string }
    | { type: 'view'; dbName: string; viewName: string; schemaName?: string }
    | { type: 'materialized-view'; dbName: string; viewName: string; schemaName?: string }
    | { type: 'trigger'; dbName: string; triggerName: string; tableName: string; schemaName?: string }
    | { type: 'routine'; dbName: string; routineName: string; routineType: string; schemaName?: string };

type QueryEditorHoverTarget =
    | { kind: 'database'; dbName: string; range: { startColumn: number; endColumn: number } }
    | { kind: 'table'; dbName: string; tableName: string; schemaName?: string; comment?: string; range: { startColumn: number; endColumn: number } }
    | { kind: 'view'; dbName: string; viewName: string; schemaName?: string; range: { startColumn: number; endColumn: number } }
    | { kind: 'materialized-view'; dbName: string; viewName: string; schemaName?: string; range: { startColumn: number; endColumn: number } }
    | { kind: 'trigger'; dbName: string; triggerName: string; tableName: string; schemaName?: string; range: { startColumn: number; endColumn: number } }
    | { kind: 'routine'; dbName: string; routineName: string; routineType: string; schemaName?: string; range: { startColumn: number; endColumn: number } }
    | { kind: 'column'; dbName: string; tableName: string; columnName: string; type?: string; comment?: string; schemaName?: string; range: { startColumn: number; endColumn: number } };

const QUERY_EDITOR_IDENTIFIER_CHAR_REGEX = /[A-Za-z0-9_$`"\[\].]/;
const QUERY_EDITOR_SQL_UNQUOTED_IDENTIFIER_PATTERN = '[A-Za-z_][A-Za-z0-9_$]*';
const QUERY_EDITOR_SQL_QUOTED_IDENTIFIER_PATTERN = '(?:`[^`]+`|"[^"]+"|\\[[^\\]]+\\])';
const QUERY_EDITOR_SQL_IDENTIFIER_PATTERN = `(?:${QUERY_EDITOR_SQL_QUOTED_IDENTIFIER_PATTERN}|${QUERY_EDITOR_SQL_UNQUOTED_IDENTIFIER_PATTERN})`;
const QUERY_EDITOR_SQL_IDENTIFIER_PATH_PATTERN = `${QUERY_EDITOR_SQL_IDENTIFIER_PATTERN}(?:\\s*\\.\\s*${QUERY_EDITOR_SQL_IDENTIFIER_PATTERN}){0,2}`;
const QUERY_EDITOR_SQL_THREE_PART_COMPLETION_REGEX = new RegExp(
    `(${QUERY_EDITOR_SQL_IDENTIFIER_PATTERN})\\s*\\.\\s*(${QUERY_EDITOR_SQL_IDENTIFIER_PATTERN})\\s*\\.\\s*([A-Za-z0-9_$]*)$`,
);
const QUERY_EDITOR_SQL_QUALIFIER_COMPLETION_REGEX = new RegExp(
    `(${QUERY_EDITOR_SQL_IDENTIFIER_PATTERN})\\s*\\.\\s*([A-Za-z0-9_$]*)$`,
);
const QUERY_EDITOR_SQL_TABLE_REFERENCE_REGEX = new RegExp(
    `\\b(?:FROM|JOIN|UPDATE|INTO|DELETE\\s+FROM)\\s+(${QUERY_EDITOR_SQL_IDENTIFIER_PATH_PATTERN})`,
    'gi',
);
const QUERY_EDITOR_SQL_ALIAS_REFERENCE_REGEX = new RegExp(
    `\\b(?:FROM|JOIN|UPDATE|INTO|DELETE\\s+FROM)\\s+(${QUERY_EDITOR_SQL_IDENTIFIER_PATH_PATTERN})(?:\\s+(?:AS\\s+)?(${QUERY_EDITOR_SQL_IDENTIFIER_PATTERN}))?`,
    'gi',
);
const QUERY_EDITOR_SQL_LEADING_IDENTIFIER_PATH_REGEX = new RegExp(`^(${QUERY_EDITOR_SQL_IDENTIFIER_PATH_PATTERN})([\\s\\S]*)$`);
const QUERY_EDITOR_HOVER_DELAY_MS = 1000;
const QUERY_EDITOR_OBJECT_DECORATION_MAX_TEXT_LENGTH = 200_000;
const QUERY_EDITOR_OBJECT_DECORATION_MAX_IDENTIFIERS = 800;
const QUERY_EDITOR_OBJECT_DECORATION_MAX_LINES = 1_000;
const QUERY_EDITOR_LIVE_DECORATION_MAX_TEXT_LENGTH = 50_000;
const QUERY_EDITOR_PERSISTED_DRAFT_MAX_TEXT_LENGTH = 50_000;

const getQueryEditorModelValueLength = (model: any): number | null => {
    if (!model || typeof model.getValueLength !== 'function') {
        return null;
    }
    try {
        const length = Number(model.getValueLength());
        return Number.isFinite(length) ? length : null;
    } catch {
        return null;
    }
};

type QueryIdentifierPathSegment = {
    raw: string;
    value: string;
    quoted: boolean;
};

const isQuotedQueryIdentifierPart = (part: string): boolean => {
    const text = String(part || '').trim();
    if (!text) return false;
    return (text.startsWith('`') && text.endsWith('`'))
        || (text.startsWith('"') && text.endsWith('"'))
        || (text.startsWith('[') && text.endsWith(']'));
};

const splitQueryIdentifierPathSegments = (qualifiedName: string): QueryIdentifierPathSegment[] => {
    const text = String(qualifiedName || '').trim();
    if (!text) return [];

    const segments: QueryIdentifierPathSegment[] = [];
    let current = '';
    let inDouble = false;
    let inBacktick = false;
    let inBracket = false;

    const flush = () => {
        const raw = current.trim();
        current = '';
        if (!raw) return;
        segments.push({
            raw,
            value: stripQueryIdentifierQuotes(raw),
            quoted: isQuotedQueryIdentifierPart(raw),
        });
    };

    for (let index = 0; index < text.length; index += 1) {
        const ch = text[index];
        const next = index + 1 < text.length ? text[index + 1] : '';

        if (inDouble) {
            current += ch;
            if (ch === '"' && next === '"') {
                current += next;
                index += 1;
                continue;
            }
            if (ch === '"') inDouble = false;
            continue;
        }

        if (inBacktick) {
            current += ch;
            if (ch === '`' && next === '`') {
                current += next;
                index += 1;
                continue;
            }
            if (ch === '`') inBacktick = false;
            continue;
        }

        if (inBracket) {
            current += ch;
            if (ch === ']' && next === ']') {
                current += next;
                index += 1;
                continue;
            }
            if (ch === ']') inBracket = false;
            continue;
        }

        if (ch === '"') {
            inDouble = true;
            current += ch;
            continue;
        }
        if (ch === '`') {
            inBacktick = true;
            current += ch;
            continue;
        }
        if (ch === '[') {
            inBracket = true;
            current += ch;
            continue;
        }
        if (ch === '.') {
            flush();
            continue;
        }
        current += ch;
    }

    flush();
    return segments;
};

const matchLeadingSelectTableReference = (sql: string): { prefix: string; tableText: string; suffix: string } | null => {
    const match = String(sql || '').match(new RegExp(`^(\\s*SELECT\\s+[\\s\\S]+?\\s+FROM\\s+)(${QUERY_EDITOR_SQL_IDENTIFIER_PATH_PATTERN})([\\s\\S]*)$`, 'i'));
    if (!match) return null;
    return {
        prefix: match[1],
        tableText: match[2],
        suffix: match[3] || '',
    };
};

const rewriteLeadingSelectTableReference = (sql: string, replacement: string): string | undefined => {
    const match = matchLeadingSelectTableReference(sql);
    if (!match || !replacement) return undefined;
    return `${match.prefix}${replacement}${match.suffix}`;
};

const resolveOracleExactCaseTableReference = (
    statement: string,
    currentDb: string,
    tables: CompletionTableMeta[],
): string | undefined => {
    const leadingTable = matchLeadingSelectTableReference(statement);
    if (!leadingTable) return undefined;

    const segments = splitQueryIdentifierPathSegments(leadingTable.tableText);
    if (segments.length === 0 || segments.length > 2 || segments.some((segment) => segment.quoted)) {
        return undefined;
    }
    if (!segments.some((segment) => /[a-z]/.test(segment.value))) {
        return undefined;
    }

    const rawSchemaName = segments.length === 2 ? String(segments[0]?.value || '').trim() : '';
    const rawObjectName = String(segments[segments.length - 1]?.value || '').trim();
    const targetDbName = String(rawSchemaName || currentDb || '').trim();
    if (!rawObjectName || !targetDbName) return undefined;

    const normalizedTargetDbName = targetDbName.toLowerCase();
    const matched = tables.find((table) => {
        if (String(table.dbName || '').trim().toLowerCase() !== normalizedTargetDbName) return false;
        const parsed = splitSidebarQualifiedName(String(table.tableName || ''));
        const objectName = String(parsed.objectName || table.tableName || '').trim();
        const schemaName = String(parsed.schemaName || table.dbName || '').trim();
        if (objectName !== rawObjectName) return false;
        if (!rawSchemaName) return true;
        return schemaName.toLowerCase() === rawSchemaName.toLowerCase();
    });
    if (!matched) return undefined;

    const matchedParsed = splitSidebarQualifiedName(String(matched.tableName || ''));
    const exactObjectName = String(matchedParsed.objectName || matched.tableName || '').trim();
    const exactSchemaName = String(matchedParsed.schemaName || matched.dbName || rawSchemaName).trim();
    const quotedParts = rawSchemaName
        ? [exactSchemaName, exactObjectName]
        : [exactObjectName];
    if (quotedParts.some((part) => !String(part || '').trim())) {
        return undefined;
    }
    return quotedParts.map((part) => quoteIdentPart('oracle', part)).join('.');
};

const resolveOracleLikeDefaultSchemaName = (config: any): string => {
    const rawUser = String(config?.user || '').trim();
    if (!rawUser) return '';
    const userPart = rawUser.split('@')[0] || rawUser;
    return String(userPart || '').trim();
};

const getQueryEditorModelTextIfWithinLimit = (model: any, maxTextLength: number): string | null => {
    const modelLength = getQueryEditorModelValueLength(model);
    if (modelLength !== null && modelLength > maxTextLength) {
        return null;
    }
    const text = String(model?.getValue?.() || '');
    return text.length <= maxTextLength ? text : null;
};

const getQueryEditorObjectResolveText = (
    model: any,
    lineContent: string,
    maxTextLength = QUERY_EDITOR_OBJECT_DECORATION_MAX_TEXT_LENGTH,
): string => getQueryEditorModelTextIfWithinLimit(model, maxTextLength) ?? lineContent;

const getQueryEditorDecorationModelTextIfLightweight = (
    model: any,
    maxTextLength: number,
): string | null => {
    if (!model || typeof model.getLineCount !== 'function' || typeof model.getLineContent !== 'function') {
        return getQueryEditorModelTextIfWithinLimit(model, maxTextLength);
    }

    const lineCount = Number(model.getLineCount());
    if (!Number.isFinite(lineCount) || lineCount <= 0 || lineCount > QUERY_EDITOR_OBJECT_DECORATION_MAX_LINES) {
        return null;
    }

    const lines: string[] = [];
    let textLength = 0;
    for (let lineNumber = 1; lineNumber <= lineCount; lineNumber += 1) {
        const lineContent = String(model.getLineContent(lineNumber) || '');
        textLength += lineContent.length + (lineNumber < lineCount ? 1 : 0);
        if (textLength > maxTextLength) {
            return null;
        }
        lines.push(lineContent);
    }

    return lines.join('\n');
};

const maskQueryEditorSqlLiteralsAndComments = (source: string): string => {
    const text = String(source || '').replace(/\r\n/g, '\n');
    if (!text) return '';

    const chars = text.split('');
    let inSingle = false;
    let inLineComment = false;
    let inBlockComment = false;
    let escaped = false;

    const maskAt = (index: number) => {
        if (chars[index] !== '\n') {
            chars[index] = ' ';
        }
    };

    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        const next = i + 1 < text.length ? text[i + 1] : '';
        const prev = i > 0 ? text[i - 1] : '';

        if (inLineComment) {
            if (ch === '\n') {
                inLineComment = false;
            } else {
                maskAt(i);
            }
            continue;
        }

        if (inBlockComment) {
            maskAt(i);
            if (ch === '*' && next === '/') {
                maskAt(i + 1);
                i += 1;
                inBlockComment = false;
            }
            continue;
        }

        if (inSingle) {
            maskAt(i);
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === '\\') {
                escaped = true;
                continue;
            }
            if (ch === '\'' && next === '\'') {
                maskAt(i + 1);
                i += 1;
                continue;
            }
            if (ch === '\'') {
                inSingle = false;
            }
            continue;
        }

        if (ch === '/' && next === '*') {
            maskAt(i);
            maskAt(i + 1);
            i += 1;
            inBlockComment = true;
            continue;
        }

        if (ch === '#') {
            maskAt(i);
            inLineComment = true;
            continue;
        }

        if (ch === '-' && next === '-' && (i === 0 || /\s/.test(prev))) {
            maskAt(i);
            maskAt(i + 1);
            i += 1;
            inLineComment = true;
            continue;
        }

        if (ch === '\'') {
            maskAt(i);
            inSingle = true;
        }
    }

    return chars.join('');
};

export const collectQueryEditorObjectDecorationCandidates = (
    source: string,
    maxIdentifiers = QUERY_EDITOR_OBJECT_DECORATION_MAX_IDENTIFIERS,
): Array<{ lineNumber: number; lineContent: string; positionColumn: number }> => {
    const text = String(source || '').replace(/\r\n/g, '\n');
    if (!text) return [];

    const maskedText = maskQueryEditorSqlLiteralsAndComments(text);
    const lines = text.split('\n');
    const maskedLines = maskedText.split('\n');
    const candidates: Array<{ lineNumber: number; lineContent: string; positionColumn: number }> = [];
    const identifierRegex = /[`"\[]?[A-Za-z_][A-Za-z0-9_$]*(?:[`"\]]?\s*\.\s*[`"\[]?[A-Za-z_][A-Za-z0-9_$]*){0,2}[`"\]]?/g;

    for (const [lineIndex, maskedLine] of maskedLines.entries()) {
        let match: RegExpExecArray | null;
        identifierRegex.lastIndex = 0;
        while ((match = identifierRegex.exec(maskedLine)) !== null) {
            candidates.push({
                lineNumber: lineIndex + 1,
                lineContent: lines[lineIndex] || '',
                positionColumn: match.index + 2,
            });
            if (candidates.length >= maxIdentifiers) {
                return candidates;
            }
        }
    }

    return candidates;
};

const findIdentifierWindowAtOffset = (
    lineContent: string,
    rawOffset: number,
): { start: number; end: number } | null => {
    const text = String(lineContent || '');
    if (!text) return null;
    const searchableText = maskQueryEditorSqlLiteralsAndComments(text);
    const maxIndex = text.length - 1;
    if (maxIndex < 0) return null;
    let offset = Math.max(0, Math.min(maxIndex, Number.isFinite(rawOffset) ? rawOffset : 0));

    if (!QUERY_EDITOR_IDENTIFIER_CHAR_REGEX.test(searchableText[offset] || '')) {
        if (offset > 0 && QUERY_EDITOR_IDENTIFIER_CHAR_REGEX.test(searchableText[offset - 1] || '')) {
            offset -= 1;
        } else if (offset < maxIndex && QUERY_EDITOR_IDENTIFIER_CHAR_REGEX.test(searchableText[offset + 1] || '')) {
            offset += 1;
        } else {
            return null;
        }
    }

    let start = offset;
    while (start > 0 && QUERY_EDITOR_IDENTIFIER_CHAR_REGEX.test(searchableText[start - 1] || '')) {
        start -= 1;
    }

    let end = offset + 1;
    while (end < text.length && QUERY_EDITOR_IDENTIFIER_CHAR_REGEX.test(searchableText[end] || '')) {
        end += 1;
    }

    return start < end ? { start, end } : null;
};

const normalizeNavigationIdentifierParts = (text: string): string[] => (
    String(text || '')
        .split('.')
        .map((part) => stripCompletionIdentifierQuotes(part))
        .map((part) => part.trim())
        .filter(Boolean)
);

const buildQueryEditorHoverMarkdown = (target: QueryEditorHoverTarget): string => {
    const appendComment = (comment?: string): string => {
        const normalized = normalizeCommentText(comment);
        return normalized ? `\n\n${normalized}` : '';
    };
    const objectInfoLabelSeparator = translate('query_editor.object_info.label.separator');
    const buildObjectInfoTitle = (key: string, value: string): string =>
        `**${translate(key)}** \`${value}\``;
    const buildObjectInfoLabel = (key: string, value: string): string =>
        `${translate(key)}${objectInfoLabelSeparator}\`${value}\``;
    switch (target.kind) {
        case 'database':
            return buildObjectInfoTitle('query_editor.object_info.database', target.dbName);
        case 'table':
            return `${buildObjectInfoTitle('query_editor.object_info.table', target.tableName)}\n\n${buildObjectInfoLabel('query_editor.object_info.label.database', target.dbName)}${target.schemaName ? `\n\n${buildObjectInfoLabel('query_editor.object_info.label.schema', target.schemaName)}` : ''}${appendComment(target.comment)}`;
        case 'view':
            return `${buildObjectInfoTitle('sidebar.object.view', target.viewName)}\n\n${buildObjectInfoLabel('query_editor.object_info.label.database', target.dbName)}${target.schemaName ? `\n\n${buildObjectInfoLabel('query_editor.object_info.label.schema', target.schemaName)}` : ''}`;
        case 'materialized-view':
            return `${buildObjectInfoTitle('query_editor.object_info.materialized_view', target.viewName)}\n\n${buildObjectInfoLabel('query_editor.object_info.label.database', target.dbName)}${target.schemaName ? `\n\n${buildObjectInfoLabel('query_editor.object_info.label.schema', target.schemaName)}` : ''}`;
        case 'trigger':
            return `${buildObjectInfoTitle('trigger_viewer.field.trigger', target.triggerName)}\n\n${buildObjectInfoLabel('query_editor.object_info.label.database', target.dbName)}\n\n${buildObjectInfoLabel('query_editor.object_info.label.table', target.tableName)}${target.schemaName ? `\n\n${buildObjectInfoLabel('query_editor.object_info.label.schema', target.schemaName)}` : ''}`;
        case 'routine':
            return `${buildObjectInfoTitle(target.routineType === 'PROCEDURE' ? 'sidebar.object.procedure' : 'sidebar.object.function', target.routineName)}\n\n${buildObjectInfoLabel('query_editor.object_info.label.database', target.dbName)}${target.schemaName ? `\n\n${buildObjectInfoLabel('query_editor.object_info.label.schema', target.schemaName)}` : ''}`;
        case 'column':
            return `${buildObjectInfoTitle('query_editor.object_info.column', target.columnName)}${target.type ? `\n\n${buildObjectInfoLabel('query_editor.object_info.label.type', target.type)}` : ''}\n\n${buildObjectInfoLabel('query_editor.object_info.label.table', target.tableName)}\n\n${buildObjectInfoLabel('query_editor.object_info.label.database', target.dbName)}${target.schemaName ? `\n\n${buildObjectInfoLabel('query_editor.object_info.label.schema', target.schemaName)}` : ''}${appendComment(target.comment)}`;
        default:
            return '';
    }
};

const buildQueryEditorAliasMap = (
    fullText: string,
    currentDb: string,
): Record<string, { dbName: string; tableName: string }> => {
    const aliasMap: Record<string, { dbName: string; tableName: string }> = {};
    const reserved = new Set([
        'where', 'on', 'group', 'order', 'limit', 'having',
        'left', 'right', 'inner', 'outer', 'full', 'cross', 'join',
        'union', 'except', 'intersect', 'as', 'set', 'values', 'returning',
    ]);
    const aliasRegex = QUERY_EDITOR_SQL_ALIAS_REFERENCE_REGEX;
    aliasRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = aliasRegex.exec(fullText)) !== null) {
        const tableIdent = normalizeCompletionQualifiedName(match[1] || '');
        if (!tableIdent) continue;
        const parts = tableIdent.split('.');
        let dbName = currentDb || '';
        let tableName = tableIdent;
        if (parts.length === 2) {
            dbName = parts[0];
            tableName = parts[1];
        } else if (parts.length >= 3) {
            dbName = parts[0];
            tableName = parts.slice(1).join('.');
        }
        const shortTable = getCompletionQualifiedNameLastPart(tableIdent);
        if (shortTable) aliasMap[shortTable.toLowerCase()] = { dbName, tableName };

        const alias = stripCompletionIdentifierQuotes(match[2] || '').trim();
        if (!alias) continue;
        const loweredAlias = alias.toLowerCase();
        if (reserved.has(loweredAlias)) continue;
        aliasMap[loweredAlias] = { dbName, tableName };
    }
    return aliasMap;
};

const collectQueryEditorReferencedDatabaseNames = (
    fullText: string,
    currentDb: string,
    visibleDbs: string[],
): string[] => {
    const result: string[] = [];
    const seen = new Set<string>();
    const addDb = (dbName: string) => {
        const normalized = String(dbName || '').trim();
        if (!normalized) return;
        const key = normalized.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        result.push(normalized);
    };

    addDb(currentDb);

    const visibleDbByLower = new Map(
        visibleDbs
            .map((db) => String(db || '').trim())
            .filter(Boolean)
            .map((db) => [db.toLowerCase(), db] as const),
    );
    const commonSchemaNames = new Set(['public', 'dbo', 'sys', 'information_schema', 'pg_catalog', 'mysql', 'performance_schema']);
    const tableRegex = QUERY_EDITOR_SQL_TABLE_REFERENCE_REGEX;
    tableRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = tableRegex.exec(String(fullText || ''))) !== null) {
        const tableIdent = normalizeCompletionQualifiedName(match[1] || '');
        if (!tableIdent) continue;
        const parts = tableIdent.split('.');
        if (parts.length < 2) continue;
        const candidate = visibleDbByLower.get(String(parts[0] || '').toLowerCase());
        if (candidate) {
            addDb(candidate);
        } else if (visibleDbByLower.size === 0) {
            const inferredDb = String(parts[0] || '').trim();
            const inferredKey = inferredDb.toLowerCase();
            if (inferredDb && inferredKey !== String(currentDb || '').trim().toLowerCase() && !commonSchemaNames.has(inferredKey)) {
                addDb(inferredDb);
            }
        }
    }
    return result;
};

export const resolveQueryEditorNavigationTarget = (
    lineContent: string,
    column: number,
    currentDb: string,
    visibleDbs: string[],
    tables: CompletionTableMeta[],
    views: CompletionViewMeta[] = [],
    materializedViews: CompletionViewMeta[] = [],
    triggers: CompletionTriggerMeta[] = [],
    routines: CompletionRoutineMeta[] = [],
): QueryEditorNavigationTarget | null => {
    const text = String(lineContent || '');
    if (!text) return null;

    const offset = Math.max(0, Number(column || 1) - 2);
    const windowRange = findIdentifierWindowAtOffset(text, offset);
    if (!windowRange) return null;

    const rawIdentifier = text.slice(windowRange.start, windowRange.end).trim();
    if (!rawIdentifier) return null;

    const parts = normalizeNavigationIdentifierParts(rawIdentifier);
    if (parts.length === 0 || parts.length > 3) return null;

    const currentDbName = String(currentDb || '').trim();
    const visibleDbSet = new Set(visibleDbs.map((db) => String(db || '').trim().toLowerCase()).filter(Boolean));
    const tableMetas = tables.map((table) => {
        const dbName = String(table.dbName || '').trim();
        const rawTableName = String(table.tableName || '').trim();
        const parsed = splitSidebarQualifiedName(rawTableName);
        return {
            dbName,
            rawTableName,
            normalizedDbName: dbName.toLowerCase(),
            normalizedRawTableName: rawTableName.toLowerCase(),
            normalizedObjectName: String(parsed.objectName || rawTableName).trim().toLowerCase(),
            schemaName: String(parsed.schemaName || '').trim(),
            normalizedSchemaName: String(parsed.schemaName || '').trim().toLowerCase(),
        };
    });

    const buildObjectNameMeta = (
        dbName: string,
        rawObjectName: string,
        explicitSchemaName = '',
    ) => {
        const parsed = splitSidebarQualifiedName(rawObjectName);
        const schemaName = String(explicitSchemaName || parsed.schemaName || '').trim();
        const objectName = String(parsed.objectName || rawObjectName).trim();
        return {
            dbName: String(dbName || '').trim(),
            rawObjectName: String(rawObjectName || '').trim(),
            objectName,
            schemaName,
            normalizedDbName: String(dbName || '').trim().toLowerCase(),
            normalizedRawObjectName: String(rawObjectName || '').trim().toLowerCase(),
            normalizedObjectName: objectName.toLowerCase(),
            normalizedSchemaName: schemaName.toLowerCase(),
        };
    };

    const viewMetas = views.map((view) => buildObjectNameMeta(view.dbName, view.viewName, view.schemaName));
    const materializedViewMetas = materializedViews.map((view) => buildObjectNameMeta(view.dbName, view.viewName, view.schemaName));
    const triggerMetas = triggers.map((trigger) => ({
        ...buildObjectNameMeta(trigger.dbName, trigger.triggerName, trigger.schemaName),
        tableName: String(trigger.tableName || '').trim(),
    }));
    const routineMetas = routines.map((routine) => ({
        ...buildObjectNameMeta(routine.dbName, routine.routineName, routine.schemaName),
        routineType: String(routine.routineType || 'FUNCTION').trim().toUpperCase() || 'FUNCTION',
    }));

    const findTable = (candidateDbName: string, candidateTableName: string, schemaName = ''): QueryEditorNavigationTarget | null => {
        const normalizedDbName = String(candidateDbName || '').trim().toLowerCase();
        const normalizedTableName = String(candidateTableName || '').trim().toLowerCase();
        const normalizedSchemaName = String(schemaName || '').trim().toLowerCase();
        if (!normalizedDbName || !normalizedTableName) return null;

        const exactQualifiedName = normalizedSchemaName ? `${normalizedSchemaName}.${normalizedTableName}` : normalizedTableName;
        const exact = tableMetas.find((meta) =>
            meta.normalizedDbName === normalizedDbName
            && meta.normalizedRawTableName === exactQualifiedName
        );
        if (exact) {
            return {
                type: 'table',
                dbName: exact.dbName,
                tableName: exact.rawTableName,
                schemaName: exact.schemaName || undefined,
            };
        }

        const matched = tableMetas.find((meta) =>
            meta.normalizedDbName === normalizedDbName
            && meta.normalizedObjectName === normalizedTableName
            && (!normalizedSchemaName || meta.normalizedSchemaName === normalizedSchemaName)
        );
        if (!matched) return null;
        return {
            type: 'table',
            dbName: matched.dbName,
            tableName: matched.rawTableName,
            schemaName: matched.schemaName || undefined,
        };
    };

    const findNamedObject = <TMeta extends {
        dbName: string;
        rawObjectName: string;
        objectName: string;
        normalizedDbName: string;
        normalizedRawObjectName: string;
        normalizedObjectName: string;
        normalizedSchemaName: string;
        schemaName: string;
    }>(
        metas: TMeta[],
        candidateDbName: string,
        candidateObjectName: string,
        schemaName = '',
    ): TMeta | null => {
        const normalizedDbName = String(candidateDbName || '').trim().toLowerCase();
        const normalizedObjectName = String(candidateObjectName || '').trim().toLowerCase();
        const normalizedSchemaName = String(schemaName || '').trim().toLowerCase();
        if (!normalizedDbName || !normalizedObjectName) return null;

        const exactQualifiedName = normalizedSchemaName ? `${normalizedSchemaName}.${normalizedObjectName}` : normalizedObjectName;
        const exact = metas.find((meta) =>
            meta.normalizedDbName === normalizedDbName
            && meta.normalizedRawObjectName === exactQualifiedName
        );
        if (exact) {
            if (!normalizedSchemaName && !exact.normalizedSchemaName) {
                const schemaQualifiedMatches = metas.filter((meta) =>
                    meta.normalizedDbName === normalizedDbName
                    && meta.normalizedObjectName === normalizedObjectName
                    && Boolean(meta.normalizedSchemaName)
                );
                if (schemaQualifiedMatches.length === 1) {
                    return schemaQualifiedMatches[0];
                }
            }
            return exact;
        }

        return metas.find((meta) =>
            meta.normalizedDbName === normalizedDbName
            && meta.normalizedObjectName === normalizedObjectName
            && (!normalizedSchemaName || meta.normalizedSchemaName === normalizedSchemaName)
        ) || null;
    };

    const findView = (candidateDbName: string, candidateViewName: string, schemaName = ''): QueryEditorNavigationTarget | null => {
        const matched = findNamedObject(viewMetas, candidateDbName, candidateViewName, schemaName);
        if (!matched) return null;
        return {
            type: 'view',
            dbName: matched.dbName,
            viewName: matched.rawObjectName,
            schemaName: matched.schemaName || undefined,
        };
    };

    const findMaterializedView = (candidateDbName: string, candidateViewName: string, schemaName = ''): QueryEditorNavigationTarget | null => {
        const matched = findNamedObject(materializedViewMetas, candidateDbName, candidateViewName, schemaName);
        if (!matched) return null;
        return {
            type: 'materialized-view',
            dbName: matched.dbName,
            viewName: matched.rawObjectName,
            schemaName: matched.schemaName || undefined,
        };
    };

    const findTrigger = (candidateDbName: string, candidateTriggerName: string, schemaName = ''): QueryEditorNavigationTarget | null => {
        const matched = findNamedObject(triggerMetas, candidateDbName, candidateTriggerName, schemaName);
        if (!matched) return null;
        return {
            type: 'trigger',
            dbName: matched.dbName,
            triggerName: matched.rawObjectName,
            tableName: matched.tableName,
            schemaName: matched.schemaName || undefined,
        };
    };

    const findRoutine = (candidateDbName: string, candidateRoutineName: string, schemaName = ''): QueryEditorNavigationTarget | null => {
        const matched = findNamedObject(routineMetas, candidateDbName, candidateRoutineName, schemaName);
        if (!matched) return null;
        return {
            type: 'routine',
            dbName: matched.dbName,
            routineName: matched.rawObjectName,
            routineType: matched.routineType,
            schemaName: matched.schemaName || undefined,
        };
    };

    const findObjectInPriorityOrder = (candidateDbName: string, candidateObjectName: string, schemaName = ''): QueryEditorNavigationTarget | null => (
        findTable(candidateDbName, candidateObjectName, schemaName)
        || findView(candidateDbName, candidateObjectName, schemaName)
        || findMaterializedView(candidateDbName, candidateObjectName, schemaName)
        || findTrigger(candidateDbName, candidateObjectName, schemaName)
        || findRoutine(candidateDbName, candidateObjectName, schemaName)
    );

    if (parts.length === 1) {
        const [singlePart] = parts;
        const normalizedSingle = singlePart.toLowerCase();
        if (visibleDbSet.has(normalizedSingle)) {
            return { type: 'database', dbName: singlePart };
        }
        return findObjectInPriorityOrder(currentDbName, singlePart);
    }

    if (parts.length === 2) {
        const [firstPart, secondPart] = parts;
        if (visibleDbSet.has(firstPart.toLowerCase())) {
            return findObjectInPriorityOrder(firstPart, secondPart);
        }
        return findObjectInPriorityOrder(currentDbName, secondPart, firstPart);
    }

    const [dbName, schemaName, tableName] = parts;
    if (!visibleDbSet.has(dbName.toLowerCase())) {
        return null;
    }
    return findObjectInPriorityOrder(dbName, tableName, schemaName);
};

const resolveQueryEditorHoverTarget = (
    fullText: string,
    lineContent: string,
    column: number,
    currentDb: string,
    visibleDbs: string[],
    tables: CompletionTableMeta[],
    allColumns: CompletionColumnMeta[],
    views: CompletionViewMeta[] = [],
    materializedViews: CompletionViewMeta[] = [],
    triggers: CompletionTriggerMeta[] = [],
    routines: CompletionRoutineMeta[] = [],
): QueryEditorHoverTarget | null => {
    const text = String(lineContent || '');
    if (!text) return null;

    const offset = Math.max(0, Number(column || 1) - 2);
    const windowRange = findIdentifierWindowAtOffset(text, offset);
    if (!windowRange) return null;

    const rawIdentifier = text.slice(windowRange.start, windowRange.end).trim();
    if (!rawIdentifier) return null;

    const range = { startColumn: windowRange.start + 1, endColumn: windowRange.end + 1 };
    const parts = normalizeNavigationIdentifierParts(rawIdentifier);
    if (parts.length === 0 || parts.length > 3) return null;

    const findMatchingTable = (dbName: string, rawTableName: string, schemaName = ''): CompletionTableMeta | null => {
        const normalizedDbName = String(dbName || '').trim().toLowerCase();
        const normalizedRawTableName = String(rawTableName || '').trim().toLowerCase();
        const normalizedSchemaName = String(schemaName || '').trim().toLowerCase();
        return tables.find((item) => {
            if (String(item.dbName || '').trim().toLowerCase() !== normalizedDbName) return false;
            const itemRawName = String(item.tableName || '').trim();
            const parsed = splitSidebarQualifiedName(itemRawName);
            const itemObjectName = String(parsed.objectName || itemRawName).trim().toLowerCase();
            const itemSchemaName = String(parsed.schemaName || '').trim().toLowerCase();
            if (normalizedSchemaName) {
                const normalizedItemRawName = String(itemRawName).trim().toLowerCase();
                return itemSchemaName === normalizedSchemaName
                    && (
                        itemObjectName === normalizedRawTableName
                        || normalizedItemRawName === normalizedRawTableName
                        || normalizedItemRawName === `${normalizedSchemaName}.${normalizedRawTableName}`
                    );
            }
            return itemObjectName === normalizedRawTableName || String(itemRawName).trim().toLowerCase() === normalizedRawTableName;
        }) || null;
    };

    const navigationTarget = resolveQueryEditorNavigationTarget(
        lineContent,
        column,
        currentDb,
        visibleDbs,
        tables,
        views,
        materializedViews,
        triggers,
        routines,
    );
    if (navigationTarget) {
        if (navigationTarget.type === 'database') {
            return { kind: 'database', dbName: navigationTarget.dbName, range };
        }
        if (navigationTarget.type === 'table') {
            const meta = findMatchingTable(navigationTarget.dbName, navigationTarget.tableName, navigationTarget.schemaName || '');
            return {
                kind: 'table',
                dbName: navigationTarget.dbName,
                tableName: navigationTarget.tableName,
                schemaName: navigationTarget.schemaName,
                comment: meta?.comment,
                range,
            };
        }
        if (navigationTarget.type === 'view') {
            return { kind: 'view', dbName: navigationTarget.dbName, viewName: navigationTarget.viewName, schemaName: navigationTarget.schemaName, range };
        }
        if (navigationTarget.type === 'materialized-view') {
            return { kind: 'materialized-view', dbName: navigationTarget.dbName, viewName: navigationTarget.viewName, schemaName: navigationTarget.schemaName, range };
        }
        if (navigationTarget.type === 'trigger') {
            return { kind: 'trigger', dbName: navigationTarget.dbName, triggerName: navigationTarget.triggerName, tableName: navigationTarget.tableName, schemaName: navigationTarget.schemaName, range };
        }
        return { kind: 'routine', dbName: navigationTarget.dbName, routineName: navigationTarget.routineName, routineType: navigationTarget.routineType, schemaName: navigationTarget.schemaName, range };
    }

    const findColumnTarget = (dbName: string, tableName: string, columnName: string): QueryEditorHoverTarget | null => {
        const normalizedDbName = String(dbName || '').trim().toLowerCase();
        const normalizedTableName = String(tableName || '').trim().toLowerCase();
        const normalizedColumnName = String(columnName || '').trim().toLowerCase();
        const column = allColumns.find((item) => {
            if (String(item.dbName || '').trim().toLowerCase() !== normalizedDbName) return false;
            if (String(item.name || '').trim().toLowerCase() !== normalizedColumnName) return false;
            const rawTable = String(item.tableName || '').trim().toLowerCase();
            const parsed = splitCompletionSchemaAndTable(item.tableName || '');
            return rawTable === normalizedTableName || String(parsed.table || '').trim().toLowerCase() === normalizedTableName;
        });
        if (!column) return null;
        const parsedTable = splitCompletionSchemaAndTable(column.tableName || '');
        return {
            kind: 'column',
            dbName: column.dbName,
            tableName: column.tableName,
            columnName: column.name,
            type: column.type,
            comment: column.comment,
            schemaName: parsedTable.schema || undefined,
            range,
        };
    };

    if (parts.length === 2) {
        const [firstPart, secondPart] = parts;
        const aliasMap = buildQueryEditorAliasMap(fullText, currentDb);
        const aliasInfo = aliasMap[firstPart.toLowerCase()];
        if (aliasInfo) {
            const aliasedColumn = findColumnTarget(aliasInfo.dbName, aliasInfo.tableName, secondPart);
            if (aliasedColumn) return aliasedColumn;
        }
        const qualifiedTable = findMatchingTable(currentDb, secondPart, firstPart);
        if (qualifiedTable) {
            return {
                kind: 'table',
                dbName: qualifiedTable.dbName,
                tableName: qualifiedTable.tableName,
                schemaName: firstPart,
                comment: qualifiedTable.comment,
                range,
            };
        }
    }

    if (parts.length === 1) {
        const [columnName] = parts;
        const normalizedCurrentDb = String(currentDb || '').trim().toLowerCase();
        const directColumns = allColumns.filter((item) =>
            String(item.dbName || '').trim().toLowerCase() === normalizedCurrentDb
            && String(item.name || '').trim().toLowerCase() === columnName.toLowerCase()
        );
        if (directColumns.length === 1) {
            const column = directColumns[0];
            const parsedTable = splitCompletionSchemaAndTable(column.tableName || '');
            return {
                kind: 'column',
                dbName: column.dbName,
                tableName: column.tableName,
                columnName: column.name,
                type: column.type,
                comment: column.comment,
                schemaName: parsedTable.schema || undefined,
                range,
            };
        }
    }

    return null;
};

export const resolveQueryEditorNavigationDecorations = (
    lineContent: string,
    column: number,
    currentDb: string,
    visibleDbs: string[],
    tables: CompletionTableMeta[],
    views: CompletionViewMeta[] = [],
    materializedViews: CompletionViewMeta[] = [],
    triggers: CompletionTriggerMeta[] = [],
    routines: CompletionRoutineMeta[] = [],
    shortcutModifierLabel = 'Ctrl/Cmd',
): Array<{ startColumn: number; endColumn: number; hoverMessage: string }> => {
    const text = String(lineContent || '');
    if (!text) return [];
    const offset = Math.max(0, Number(column || 1) - 2);
    const windowRange = findIdentifierWindowAtOffset(text, offset);
    if (!windowRange) return [];

    const navigationTarget = resolveQueryEditorNavigationTarget(
        lineContent,
        column,
        currentDb,
        visibleDbs,
        tables,
        views,
        materializedViews,
        triggers,
        routines,
    );
    if (!navigationTarget) return [];

    const hoverMessage = (() => {
        if (navigationTarget.type === 'database') {
            return translate('query_editor.hover.switch_database_with_shortcut', {
                shortcut: shortcutModifierLabel,
            });
        }
        if (navigationTarget.type === 'table') {
            return translate('query_editor.hover.open_table_with_shortcut', {
                shortcut: shortcutModifierLabel,
            });
        }
        if (navigationTarget.type === 'view') {
            return translate('query_editor.hover.open_view_with_shortcut', {
                shortcut: shortcutModifierLabel,
            });
        }
        if (navigationTarget.type === 'materialized-view') {
            return translate('query_editor.hover.open_materialized_view_with_shortcut', {
                shortcut: shortcutModifierLabel,
            });
        }
        if (navigationTarget.type === 'trigger') {
            return translate('query_editor.hover.open_trigger_with_shortcut', {
                shortcut: shortcutModifierLabel,
            });
        }
        return navigationTarget.routineType === 'PROCEDURE'
            ? translate('query_editor.hover.open_procedure_with_shortcut', {
                shortcut: shortcutModifierLabel,
            })
            : translate('query_editor.hover.open_function_with_shortcut', {
                shortcut: shortcutModifierLabel,
            });
    })();

    return [{
        startColumn: windowRange.start + 1,
        endColumn: windowRange.end + 1,
        hoverMessage,
    }];
};

const dispatchQueryEditorSidebarLocate = (detail: Record<string, unknown>) => {
    if (typeof window === 'undefined') {
        return;
    }
    const connectionId = String(detail.connectionId || '').trim();
    const dbName = String(detail.dbName || '').trim();
    const objectName = String(detail.tableName || detail.viewName || detail.triggerName || detail.routineName || detail.objectName || '').trim();
    if (!connectionId || !dbName || !objectName) {
        return;
    }
    window.dispatchEvent(new CustomEvent('gonavi:locate-sidebar-object', {
        detail,
    }));
};

const resolveEventTargetNode = (target: EventTarget | null): Node | null => (
    typeof Node !== 'undefined' && target instanceof Node ? target : null
);

const isDocumentLevelShortcutTarget = (targetNode: Node | null): boolean => {
    if (!targetNode) {
        return true;
    }
    if (typeof document === 'undefined') {
        return false;
    }
    return targetNode === document.body || targetNode === document.documentElement;
};

const clearQueryEditorLinkDecorations = (
    editor: any,
    decorationIdsRef: React.MutableRefObject<string[]>,
) => {
    if (!editor?.deltaDecorations) {
        decorationIdsRef.current = [];
        return;
    }
    decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, []);
};

const clearQueryEditorObjectDecorations = (
    editor: any,
    decorationIdsRef: React.MutableRefObject<string[]>,
) => {
    if (!editor?.deltaDecorations) {
        decorationIdsRef.current = [];
        return;
    }
    decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, []);
};

const resolveQueryLocatorPlan = async ({
    statement,
    originalStatement,
    dbType,
    currentDb,
    config,
    forceReadOnly,
}: {
    statement: string;
    originalStatement?: string;
    dbType: string;
    currentDb: string;
    config: any;
    forceReadOnly: boolean;
}): Promise<QueryStatementPlan> => {
    const plan: QueryStatementPlan = {
        originalSql: originalStatement || statement,
        executedSql: statement,
        pkColumns: [],
    };
    if (forceReadOnly) return plan;

    const defaultSchema = isOracleLikeDialect(dbType) ? resolveOracleLikeDefaultSchemaName(config) : '';
    let tableRef = extractQueryResultTableRef(statement, dbType, currentDb, defaultSchema);
    if (!tableRef) return plan;
    plan.tableRef = tableRef;
    if (isSystemMetadataQueryResult(tableRef, dbType)) {
        plan.editLocator = buildQueryReadOnlyLocator(translate('query_editor.message.read_only_system_metadata'));
        return plan;
    }

    const selectInfo = parseSimpleSelectInfo(statement);
    if (!selectInfo) {
        // 聚合、函数和表达式结果天然无法安全回写到单行，静默保持只读即可。
        return plan;
    }
    if (!selectInfo.selectsAll && Object.keys(selectInfo.writableColumns).length === 0) {
        return plan;
    }

    if (isOracleLikeDialect(dbType) && defaultSchema && !String(tableRef.tableName || '').includes('.')) {
        tableRef = {
            ...tableRef,
            tableName: `${tableRef.metadataDbName}.${tableRef.metadataTableName}`,
        };
        plan.tableRef = tableRef;
    }

    try {
        const [resCols, resIndexes] = await Promise.all([
            DBGetColumns(buildRpcConnectionConfig(config) as any, tableRef.metadataDbName, tableRef.metadataTableName),
            DBGetIndexes(buildRpcConnectionConfig(config) as any, tableRef.metadataDbName, tableRef.metadataTableName)
                .catch((error: any) => ({ success: false, message: String(error?.message || error || 'Failed to load indexes'), data: [] })),
        ]);
        if (!resCols?.success || !Array.isArray(resCols.data)) {
            const reason = translate('query_editor.message.read_only_table_locator_metadata_unavailable', {
                table: `${tableRef.metadataDbName}.${tableRef.metadataTableName}`,
            });
            plan.editLocator = buildQueryReadOnlyLocator(reason);
            plan.warning = translate('query_editor.message.read_only_warning_with_detail', { detail: reason });
            return plan;
        }

        const tableColumns = resCols.data as ColumnDefinition[];
        const tableColumnNames = tableColumns.map(getColumnDefinitionName).filter(Boolean);
        const primaryKeys = tableColumns
            .filter((column: any) => getColumnDefinitionKey(column) === 'PRI')
            .map(getColumnDefinitionName)
            .filter(Boolean);
        const indexes = resIndexes?.success && Array.isArray(resIndexes.data)
            ? resIndexes.data as IndexDefinition[]
            : [];
        const writableColumns: Record<string, string> = selectInfo.selectsAll
            ? Object.fromEntries(tableColumnNames.map((column) => [column, column]))
            : {};
        Object.entries(selectInfo.writableColumns).forEach(([resultColumn, sourceColumn]) => {
            const metadataColumn = resolveMetadataColumnName(tableColumnNames, sourceColumn);
            if (metadataColumn) writableColumns[resultColumn] = metadataColumn;
        });
        const appendExpressions: string[] = [];
        const hiddenColumns: string[] = [];
        let needsOracleRowIDExpression = false;
        let needsDuckDBRowIDExpression = false;

        const buildColumnLocator = (strategy: 'primary-key' | 'unique-key', locatorColumns: string[]): EditRowLocator => {
            const valueColumns = locatorColumns.map((column, index) => {
                const selectedColumn = findWritableResultColumnForSource(writableColumns, column);
                if (selectedColumn) return selectedColumn;
                const alias = buildQueryLocatorAlias(column, index + 1);
                appendExpressions.push(buildQueryLocatorColumnExpression(dbType, column, alias));
                hiddenColumns.push(alias);
                return alias;
            });
            return {
                strategy,
                columns: locatorColumns,
                valueColumns,
                hiddenColumns: hiddenColumns.length > 0 ? [...hiddenColumns] : undefined,
                writableColumns,
                readOnly: false,
            };
        };

        if (primaryKeys.length > 0) {
            plan.pkColumns = primaryKeys;
            plan.editLocator = buildColumnLocator('primary-key', primaryKeys);
        } else {
            const uniqueKeyGroups = resolveUniqueKeyGroupsFromIndexes(indexes);
            const uniqueKeyGroup = uniqueKeyGroups.find((group) => group.length > 0);
            if (uniqueKeyGroup) {
                plan.editLocator = buildColumnLocator('unique-key', uniqueKeyGroup);
            } else if (isOracleLikeDialect(dbType)) {
                needsOracleRowIDExpression = true;
                plan.editLocator = {
                    strategy: 'oracle-rowid',
                    columns: ['ROWID'],
                    valueColumns: [ORACLE_ROWID_LOCATOR_COLUMN],
                    hiddenColumns: [ORACLE_ROWID_LOCATOR_COLUMN],
                    writableColumns,
                    readOnly: false,
                };
            } else if (String(dbType || '').trim().toLowerCase() === 'duckdb') {
                needsDuckDBRowIDExpression = true;
                plan.editLocator = {
                    strategy: 'duckdb-rowid',
                    columns: ['rowid'],
                    valueColumns: [DUCKDB_ROWID_LOCATOR_COLUMN],
                    hiddenColumns: [DUCKDB_ROWID_LOCATOR_COLUMN],
                    writableColumns,
                    readOnly: false,
                };
            } else {
                if (!resIndexes?.success) {
                    const reason = translate('query_editor.message.read_only_index_metadata_unavailable');
                    plan.editLocator = buildQueryReadOnlyLocator(reason);
                    plan.warning = translate('query_editor.message.read_only_warning_with_detail', {
                        detail: `${tableRef.metadataDbName}.${tableRef.metadataTableName} ${reason}`,
                    });
                } else {
                    const reason = translate('query_editor.message.read_only_no_safe_locator');
                    plan.editLocator = buildQueryReadOnlyLocator(reason);
                    plan.warning = translate('query_editor.message.read_only_warning_with_detail', {
                        detail: `${tableRef.metadataDbName}.${tableRef.metadataTableName} ${reason}`,
                    });
                }
            }
        }

        const executableAppendExpressions = [
            ...(needsOracleRowIDExpression ? [buildQueryRowIDExpression(dbType)] : []),
            ...(needsDuckDBRowIDExpression ? [buildDuckDBRowIDExpression(dbType)] : []),
            ...appendExpressions,
        ];

        if (executableAppendExpressions.length > 0 && isOracleLikeDialect(dbType) && selectInfo.selectsBareAll) {
            const rewritten = rewriteOracleSelectAllWithExpressions(statement, executableAppendExpressions);
            if (rewritten) {
                plan.executedSql = rewritten;
                return plan;
            }

            const reason = translate('query_editor.message.read_only_oracle_rowid_injection_unavailable');
            plan.editLocator = buildQueryReadOnlyLocator(reason);
            plan.warning = translate('query_editor.message.read_only_warning_with_detail', { detail: reason });
            return plan;
        }

        plan.executedSql = appendQuerySelectExpressions(statement, executableAppendExpressions);
        return plan;
    } catch {
        const reason = translate('query_editor.message.read_only_table_locator_metadata_unavailable', {
            table: `${tableRef.metadataDbName}.${tableRef.metadataTableName}`,
        });
        plan.editLocator = buildQueryReadOnlyLocator(reason);
        plan.warning = translate('query_editor.message.read_only_warning_with_detail', { detail: reason });
        return plan;
    }
};

const QueryEditor: React.FC<{ tab: TabData; isActive?: boolean }> = ({ tab, isActive = true }) => {
  const [query, setQuery] = useState(getInitialEditorQuery(tab));
  const isExternalSQLFileTab = Boolean(String(tab.filePath || '').trim());
  const isObjectEditQueryTab = tab.type === 'query' && tab.queryMode === 'object-edit';
  
  type ResultSet = QueryEditorResultSet;

  // Result Sets
  const [resultSets, setResultSets] = useState<ResultSet[]>([]);
  const [activeResultKey, setActiveResultKey] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [executionError, setExecutionError] = useState<string>('');
  const [, setCurrentQueryId] = useState<string>('');
  const runSeqRef = useRef(0);
  const currentQueryIdRef = useRef('');
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveModalMode, setSaveModalMode] = useState<'save' | 'rename'>('save');
  const [saveForm] = Form.useForm();

  // SQL 诊断工作台：Ctrl+Shift+D 触发（Mac 为 Cmd+Shift+D）
  const [explainOpen, setExplainOpen] = useState(false);
  // 慢 SQL 历史：Ctrl+Shift+H 触发
  const [slowQueryOpen, setSlowQueryOpen] = useState(false);

  // Database Selection
  const [currentConnectionId, setCurrentConnectionId] = useState<string>(tab.connectionId);
  const [currentDb, setCurrentDb] = useState<string>(tab.dbName || '');
  const [dbList, setDbList] = useState<string[]>([]);

  // Resizing state
  const [editorHeight, setEditorHeight] = useState(300);
  const editorShellRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const runQueryActionRef = useRef<any>(null);
  const selectCurrentStatementActionRef = useRef<any>(null);
  const saveQueryActionRef = useRef<any>(null);
  const aiContextMenuActionDisposablesRef = useRef<any[]>([]);
  const toggleQueryResultsPanelActionRef = useRef<any>(null);
  const lastExternalQueryRef = useRef<string>(getTabQueryValue(tab));
  const lastEditorCursorPositionRef = useRef<any>(null);
  const lastHoverTargetPositionRef = useRef<{ lineNumber: number; column: number } | null>(null);
  const lastExecutedEditorQueryRef = useRef<string>('');
  const linkDecorationIdsRef = useRef<string[]>([]);
  const ctrlMetaPressedRef = useRef(false);
  const objectDecorationIdsRef = useRef<string[]>([]);
  const objectHoverActionRef = useRef<any>(null);
  const dragRef = useRef<{ startY: number, startHeight: number, currentHeight: number } | null>(null);
  const pendingEditorHeightRef = useRef(editorHeight);
  const resizeFrameRef = useRef<number | null>(null);
  const queryEditorRootRef = useRef<HTMLDivElement | null>(null);
  const editorPaneRef = useRef<HTMLDivElement | null>(null);
  const tablesRef = useRef<CompletionTableMeta[]>([]); // Store tables for autocomplete (cross-db)
  const allColumnsRef = useRef<CompletionColumnMeta[]>([]); // Store all columns (cross-db)
  const viewsRef = useRef<CompletionViewMeta[]>([]);
  const materializedViewsRef = useRef<CompletionViewMeta[]>([]);
  const triggersRef = useRef<CompletionTriggerMeta[]>([]);
  const routinesRef = useRef<CompletionRoutineMeta[]>([]);
  const visibleDbsRef = useRef<string[]>([]); // Store visible databases for cross-db intellisense
  const metadataFetchKeyRef = useRef<string>('');
  const metadataContextKeyRef = useRef<string>('');

  const connections = useStore(state => state.connections);
  const queryCapableConnections = useMemo(
      () => connections.filter(c => getDataSourceCapabilities(c.config).supportsQueryEditor),
      [connections]
  );

  // SQL 诊断工作台：从 currentConnectionId 解析 ConnectionConfig（复用 SavedConnection 模式）
  const explainConfig = useMemo(() => {
    if (!currentConnectionId) return null;
    const conn = connections.find(c => c.id === currentConnectionId);
    if (!conn) return null;
    return {
      ...conn.config,
      port: Number(conn.config.port),
      password: conn.config.password || '',
      database: conn.config.database || '',
      useSSH: conn.config.useSSH || false,
      ssh: conn.config.ssh || { host: '', port: 22, user: '', password: '', keyPath: '' },
    } as any;
  }, [connections, currentConnectionId]);

  useEffect(() => {
    if (!isActive) return;
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key === 'd') {
        e.preventDefault();
        setExplainOpen(true);
      } else if (key === 'h') {
        e.preventDefault();
        setSlowQueryOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isActive]);

  const addSqlLog = useStore(state => state.addSqlLog);
  const addTab = useStore(state => state.addTab);
  const setActiveContext = useStore(state => state.setActiveContext);
  const updateQueryTabDraft = useStore(state => state.updateQueryTabDraft);
  const savedQueries = useStore(state => state.savedQueries);
  const currentConnectionIdRef = useRef(currentConnectionId);
  const currentDbRef = useRef(currentDb);
  const connectionsRef = useRef(connections);
  const columnsCacheRef = useRef<Record<string, ColumnDefinition[]>>({});
  const saveQuery = useStore(state => state.saveQuery);
  const theme = useStore(state => state.theme);
  const languagePreference = useStore((state) => state.languagePreference);
  void languagePreference;
  const appearance = useStore(state => state.appearance);
  const darkMode = theme === 'dark';
  const isV2Ui = appearance.uiVersion === 'v2';
  const sqlFormatOptions = useStore(state => state.sqlFormatOptions);
  const setSqlFormatOptions = useStore(state => state.setSqlFormatOptions);
  const queryOptions = useStore(state => state.queryOptions);
  const setQueryOptions = useStore(state => state.setQueryOptions);
  const sqlEditorTransactionOptions = useStore(state => state.sqlEditorTransactionOptions);
  const setSqlEditorTransactionOptions = useStore(state => state.setSqlEditorTransactionOptions);
  const [isResultPanelVisible, setIsResultPanelVisible] = useState(
      () => tab.resultPanelVisible === true
  );
  const shortcutOptions = useStore(state => state.shortcutOptions);
  const activeShortcutPlatform = getShortcutPlatform(isMacLikePlatform());
  const runQueryShortcutBinding = useMemo(
      () => resolveShortcutBinding(shortcutOptions, 'runQuery', activeShortcutPlatform),
      [activeShortcutPlatform, shortcutOptions],
  );
  const selectCurrentStatementShortcutBinding = useMemo(
      () => resolveShortcutBinding(shortcutOptions, 'selectCurrentStatement', activeShortcutPlatform),
      [activeShortcutPlatform, shortcutOptions],
  );
  const saveQueryShortcutBinding = useMemo(
      () => resolveShortcutBinding(shortcutOptions, 'saveQuery', activeShortcutPlatform),
      [activeShortcutPlatform, shortcutOptions],
  );
  const toggleQueryResultsPanelShortcutBinding = useMemo(
      () => resolveShortcutBinding(shortcutOptions, 'toggleQueryResultsPanel', activeShortcutPlatform),
      [activeShortcutPlatform, shortcutOptions],
  );
  const primaryShortcutModifierLabel = useMemo(
      () => getShortcutPrimaryModifierDisplayLabel(activeShortcutPlatform),
      [activeShortcutPlatform],
  );
  useEffect(() => {
      setIsResultPanelVisible(tab.resultPanelVisible === true);
  }, [tab.id, tab.resultPanelVisible]);
  const updateResultPanelVisibility = useCallback((visible: boolean) => {
      setIsResultPanelVisible(visible);
      updateQueryTabDraft(tab.id, { resultPanelVisible: visible });
  }, [tab.id, updateQueryTabDraft]);
  const toggleResultPanelVisibility = useCallback(() => {
      setIsResultPanelVisible((previousVisible) => {
          const nextVisible = !previousVisible;
          updateQueryTabDraft(tab.id, { resultPanelVisible: nextVisible });
          return nextVisible;
      });
  }, [tab.id, updateQueryTabDraft]);
  const sqlEditorCommitMode = sqlEditorTransactionOptions?.commitMode === 'auto' ? 'auto' : 'manual';
  const sqlEditorAutoCommitDelayMs = SQL_EDITOR_AUTO_COMMIT_DELAY_OPTIONS.some((item) => item.value === sqlEditorTransactionOptions?.autoCommitDelayMs)
      ? Number(sqlEditorTransactionOptions?.autoCommitDelayMs)
      : 0;
  const {
      activatePendingSqlTransaction,
      autoCommitRemainingSeconds: sqlEditorAutoCommitRemainingSeconds,
      finishPendingSqlTransaction,
      pendingSqlTransaction,
      pendingSqlTransactionRef,
  } = useSqlEditorTransactionController({ tabId: tab.id });
  const autoFetchVisible = useAutoFetchVisibility();

  useEffect(() => {
      const nextContextKey = [
          String(currentConnectionId || '').trim(),
          String(currentDb || '').trim().toLowerCase(),
      ].join('\u0000');
      if (metadataContextKeyRef.current === nextContextKey) {
          return;
      }
      metadataContextKeyRef.current = nextContextKey;
      metadataFetchKeyRef.current = '';
      tablesRef.current = [];
      allColumnsRef.current = [];
      viewsRef.current = [];
      materializedViewsRef.current = [];
      triggersRef.current = [];
      routinesRef.current = [];
      columnsCacheRef.current = {};
      if (isActive) {
          resetSharedQueryEditorMetadata();
      }
  }, [currentConnectionId, currentDb, isActive]);

  const currentSavedQuery = useMemo(() => {
      const savedId = String(tab.savedQueryId || '').trim();
      if (savedId) {
          return savedQueries.find((item) => item.id === savedId) || null;
      }
      const tabId = String(tab.id || '').trim();
      if (!tabId) {
          return null;
      }
      return savedQueries.find((item) => item.id === tabId) || null;
  }, [savedQueries, tab.id, tab.savedQueryId]);

  const syncQueryDraft = useCallback((nextQuery: string) => {
      const next = String(nextQuery ?? '');
      if (isExternalSQLFileTab) {
          setSQLFileTabDraft(tab.id, next);
          return;
      }
      setQueryTabDraft(tab.id, next);
  }, [isExternalSQLFileTab, tab.id]);

  const applyQueryState = useCallback((nextQuery: string) => {
      const next = String(nextQuery ?? '');
      syncQueryDraft(next);
      if (!isExternalSQLFileTab || next.length <= QUERY_EDITOR_PERSISTED_DRAFT_MAX_TEXT_LENGTH) {
          setQuery(next);
      }
  }, [isExternalSQLFileTab, syncQueryDraft]);

  useEffect(() => {
      setQueryTabDraft(tab.id, query);
  }, [query, tab.id]);

  useEffect(() => {
      currentConnectionIdRef.current = currentConnectionId;
  }, [currentConnectionId]);

  useEffect(() => {
      if (!queryCapableConnections.some(c => c.id === currentConnectionId)) {
          const fallback = queryCapableConnections[0]?.id || '';
          if (fallback && fallback !== currentConnectionId) {
              setCurrentConnectionId(fallback);
              setCurrentDb('');
          }
      }
  }, [queryCapableConnections, currentConnectionId]);

  useEffect(() => {
      currentDbRef.current = currentDb;
  }, [currentDb]);

  useEffect(() => {
      const nextConnectionId = String(tab.connectionId || '').trim();
      const nextDb = String(tab.dbName || '').trim();
      if (nextConnectionId !== currentConnectionIdRef.current) {
          currentConnectionIdRef.current = nextConnectionId;
          setCurrentConnectionId(nextConnectionId);
      }
      if (nextDb !== currentDbRef.current) {
          currentDbRef.current = nextDb;
          setCurrentDb(nextDb);
      }
  }, [tab.id, tab.connectionId, tab.dbName]);

  useEffect(() => {
      if (isExternalSQLFileTab) return;
      const currentDraft = getQueryTabDraft(tab.id, query);
      const shouldPersistQuery = currentDraft.length <= QUERY_EDITOR_PERSISTED_DRAFT_MAX_TEXT_LENGTH;
      updateQueryTabDraft(tab.id, {
          ...(shouldPersistQuery ? { query: currentDraft } : {}),
          connectionId: currentConnectionId,
          dbName: currentDb,
      });
  }, [currentConnectionId, currentDb, isExternalSQLFileTab, query, tab.id, updateQueryTabDraft]);

  useEffect(() => {
      if (!isExternalSQLFileTab) return;
      updateQueryTabDraft(tab.id, {
          connectionId: currentConnectionId,
          dbName: currentDb,
      });
  }, [currentConnectionId, currentDb, isExternalSQLFileTab, tab.id, updateQueryTabDraft]);

  useEffect(() => {
      if (!isExternalSQLFileTab) return;
      setSQLFileTabDraft(tab.id, getCurrentQuery());
      return () => {
          setSQLFileTabDraft(tab.id, getCurrentQuery());
      };
  }, [isExternalSQLFileTab, tab.id]);

  // 当此 Tab 成为活跃 Tab 时，将本实例的状态同步到模块级共享变量
  // 确保 completion provider 始终使用当前活跃 Tab 的上下文
  useEffect(() => {
      if (!isActive) return;
      sharedCurrentDb = currentDb;
      sharedCurrentConnectionId = currentConnectionId;
      sharedConnections = connections;
      sharedTablesData = tablesRef.current;
      sharedAllColumnsData = allColumnsRef.current;
      sharedVisibleDbs = visibleDbsRef.current;
      sharedViewsData = viewsRef.current;
      sharedMaterializedViewsData = materializedViewsRef.current;
      sharedTriggersData = triggersRef.current;
      sharedRoutinesData = routinesRef.current;
      sharedColumnsCacheData = columnsCacheRef.current;
  }, [isActive, currentDb, currentConnectionId, connections]);

  useEffect(() => {
      connectionsRef.current = connections;
  }, [connections]);

  const refreshObjectDecorations = useCallback((maxTextLength = QUERY_EDITOR_OBJECT_DECORATION_MAX_TEXT_LENGTH) => {
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      const model = editor?.getModel?.();
      if (!editor || !monaco || !model) {
          return;
      }

      if (isObjectEditQueryTab) {
          objectDecorationIdsRef.current = editor.deltaDecorations(objectDecorationIdsRef.current, []);
          return;
      }

      const text = getQueryEditorDecorationModelTextIfLightweight(model, maxTextLength);
      if (text === null) {
          objectDecorationIdsRef.current = editor.deltaDecorations(objectDecorationIdsRef.current, []);
          return;
      }

      const decorations: any[] = [];
      const seen = new Set<string>();
      const candidates = collectQueryEditorObjectDecorationCandidates(text);

      for (const candidate of candidates) {
          const hoverTarget = resolveQueryEditorHoverTarget(
              text,
              candidate.lineContent,
              candidate.positionColumn,
              currentDbRef.current,
              visibleDbsRef.current,
              tablesRef.current,
              allColumnsRef.current,
              viewsRef.current,
              materializedViewsRef.current,
              triggersRef.current,
              routinesRef.current,
          );
          if (!hoverTarget) continue;

          const inlineClassName = hoverTarget.kind === 'column'
              ? 'gonavi-query-editor-column-token'
              : hoverTarget.kind === 'database'
                  ? 'gonavi-query-editor-db-token'
                  : 'gonavi-query-editor-object-token';
          const key = `${candidate.lineNumber}:${hoverTarget.range.startColumn}:${hoverTarget.range.endColumn}:${inlineClassName}`;
          if (seen.has(key)) continue;
          seen.add(key);
          decorations.push({
              range: new monaco.Range(
                  candidate.lineNumber,
                  hoverTarget.range.startColumn,
                  candidate.lineNumber,
                  hoverTarget.range.endColumn,
              ),
              options: { inlineClassName },
          });
      }

      objectDecorationIdsRef.current = editor.deltaDecorations(objectDecorationIdsRef.current, decorations);
  }, [isObjectEditQueryTab]);

  const showObjectInfoAtPosition = useCallback((position?: { lineNumber: number; column: number } | null) => {
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      const model = editor?.getModel?.();
      const normalizedPosition = normalizeEditorPosition(position || editor?.getPosition?.());
      if (!editor || !model || !normalizedPosition) {
          return false;
      }
      const lineContent = String(model.getLineContent?.(normalizedPosition.lineNumber) || '');
      const resolveText = getQueryEditorObjectResolveText(model, lineContent);
      const hoverTarget = resolveQueryEditorHoverTarget(
          resolveText,
          lineContent,
          normalizedPosition.column,
          currentDbRef.current,
          visibleDbsRef.current,
          tablesRef.current,
          allColumnsRef.current,
          viewsRef.current,
          materializedViewsRef.current,
          triggersRef.current,
          routinesRef.current,
      );
      if (!hoverTarget) {
          return false;
      }
      editor.focus?.();
      const hoverRange = monaco
          ? new monaco.Range(
              normalizedPosition.lineNumber,
              hoverTarget.range.startColumn,
              normalizedPosition.lineNumber,
              hoverTarget.range.endColumn,
          )
          : {
              startLineNumber: normalizedPosition.lineNumber,
              startColumn: hoverTarget.range.startColumn,
              endLineNumber: normalizedPosition.lineNumber,
              endColumn: hoverTarget.range.endColumn,
          };
      const contentHoverController = editor.getContribution?.('editor.contrib.contentHover');
      if (contentHoverController?.showContentHover) {
          contentHoverController.showContentHover(hoverRange, 1, 2, false);
          return true;
      }
      editor.setPosition?.({
          lineNumber: normalizedPosition.lineNumber,
          column: hoverTarget.range.startColumn,
      });
      editor.trigger?.('gonavi-hover', 'editor.action.showHover', null);
      return true;
  }, []);

  useEffect(() => {
      refreshObjectDecorations(QUERY_EDITOR_LIVE_DECORATION_MAX_TEXT_LENGTH);
  }, [currentDb, refreshObjectDecorations]);

  const getCurrentQuery = () => {
      const val = editorRef.current?.getValue?.();
      if (typeof val === 'string') return val;
      return query || '';
  };

  const insertTextIntoEditorAtPosition = useCallback((text: string, position?: { lineNumber: number; column: number } | null) => {
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      const targetPosition = normalizeEditorPosition(position || editor?.getPosition?.() || lastEditorCursorPositionRef.current);
      if (!editor || !monaco?.Range || !targetPosition || !text) {
          return false;
      }
      editor.focus?.();
      editor.setPosition?.(targetPosition);
      editor.executeEdits?.('gonavi-sidebar-drop', [{
          range: new monaco.Range(
              targetPosition.lineNumber,
              targetPosition.column,
              targetPosition.lineNumber,
              targetPosition.column,
          ),
          text,
          forceMoveMarkers: true,
      }]);
      editor.pushUndoStop?.();
      return true;
  }, []);

  const mergeSidebarDropObjectMetadata = useCallback((payload: ReturnType<typeof decodeSidebarSqlEditorDragPayload>) => {
      if (!payload?.text || !payload.dbName) {
          return;
      }
      const nodeType = String(payload.nodeType || '').trim().toLowerCase();
      if (nodeType && nodeType !== 'table') {
          return;
      }
      const dbName = String(payload.dbName || '').trim();
      const tableName = normalizeCompletionQualifiedName(payload.text);
      if (!dbName || !tableName) {
          return;
      }
      const visibleKey = dbName.toLowerCase();
      if (!visibleDbsRef.current.some((db) => String(db || '').toLowerCase() === visibleKey)) {
          visibleDbsRef.current = [...visibleDbsRef.current, dbName];
      }
      const tableKey = `${visibleKey}\u0000${tableName.toLowerCase()}`;
      if (!tablesRef.current.some((table) => `${String(table.dbName || '').toLowerCase()}\u0000${String(table.tableName || '').toLowerCase()}` === tableKey)) {
          tablesRef.current = [...tablesRef.current, { dbName, tableName }];
      }
      if (isActive) {
          sharedVisibleDbs = visibleDbsRef.current;
          sharedTablesData = tablesRef.current;
      }
  }, [isActive]);

  const handleSidebarObjectDrop = useCallback((event: DragEvent) => {
      if (!hasSidebarSqlEditorDragPayload(event.dataTransfer)) {
          return;
      }
      event.preventDefault();
      event.stopPropagation();
      const payload = decodeSidebarSqlEditorDragPayload(String(event.dataTransfer?.getData(SIDEBAR_SQL_EDITOR_DRAG_MIME) || ''));
      const dragText = readSidebarSqlDropText(event, currentConnectionIdRef.current, currentDbRef.current);
      if (!dragText) {
          return;
      }
      const editor = editorRef.current;
      const dropTarget = editor?.getTargetAtClientPoint?.(event.clientX, event.clientY);
      if (insertTextIntoEditorAtPosition(dragText, normalizeEditorPosition(dropTarget?.position))) {
          mergeSidebarDropObjectMetadata(payload);
          refreshObjectDecorations(QUERY_EDITOR_LIVE_DECORATION_MAX_TEXT_LENGTH);
      }
  }, [insertTextIntoEditorAtPosition, mergeSidebarDropObjectMetadata, refreshObjectDecorations]);

  const handleSelectCurrentStatement = () => {
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      const model = editor?.getModel?.();
      const position = editor?.getPosition?.();
      if (!editor || !monaco || !model || !position) {
          return;
      }

      const fullSQL = String(model.getValue?.() || '');
      const cursorOffset = model.getOffsetAt?.(position);
      const range = resolveCurrentSqlStatementRange(fullSQL, Number(cursorOffset));
      if (!range) {
          void message.info(translate('query_editor.message.no_selectable_sql'));
          return;
      }

      const start = model.getPositionAt(range.start);
      const end = model.getPositionAt(range.end);
      const selection = new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column);
      editor.setSelection(selection);
      editor.revealRangeInCenterIfOutsideViewport?.(selection);
      editor.focus?.();
  };

  const buildQueryEditorAiContextMenuActions = useCallback(() => ([
      {
          id: 'ai.generateSQL',
          label: `AI ${translate('query_editor.action.ai_generate_sql_menu')}`,
          prompt: translate('query_editor.ai_prompt.generate'),
      },
      {
          id: 'ai.explainSQL',
          label: `AI ${translate('query_editor.action.ai_explain_sql_menu')}`,
          useSelection: true,
          prompt: translate('query_editor.ai_prompt.explain', { sql: QUERY_EDITOR_SQL_PROMPT_PLACEHOLDER }),
      },
      {
          id: 'ai.optimizeSQL',
          label: `AI ${translate('query_editor.action.ai_optimize_sql_menu')}`,
          useSelection: true,
          prompt: translate('query_editor.ai_prompt.optimize', { sql: QUERY_EDITOR_SQL_PROMPT_PLACEHOLDER }),
      },
  ]), []);

  const disposeQueryEditorAiContextMenuActions = useCallback(() => {
      aiContextMenuActionDisposablesRef.current.forEach((disposable) => disposable?.dispose?.());
      aiContextMenuActionDisposablesRef.current = [];
  }, []);

  const registerQueryEditorAiContextMenuActions = useCallback((editor: any) => {
      disposeQueryEditorAiContextMenuActions();
      aiContextMenuActionDisposablesRef.current = buildQueryEditorAiContextMenuActions().map((action) => (
          editor.addAction({
              id: action.id,
              label: action.label,
              contextMenuGroupId: '9_ai',
              contextMenuOrder: 1,
              run: (ed: any) => {
                  const selection = ed.getModel()?.getValueInRange(ed.getSelection());
                  const conn = connectionsRef.current.find(c => c.id === currentConnectionIdRef.current);
                  const ctxText = buildQueryEditorAiContextPrompt(conn, currentDbRef.current);
                  let prompt = ctxText + action.prompt;
                  if (action.useSelection && selection) {
                      prompt = prompt.replace(QUERY_EDITOR_SQL_PROMPT_PLACEHOLDER, selection);
                  }
                  const store = useStore.getState();
                  if (!store.aiPanelVisible) {
                      store.setAIPanelVisible(true);
                  }
                  window.dispatchEvent(new CustomEvent('gonavi:ai:inject-prompt', { detail: { prompt } }));
              },
          })
      ));
  }, [buildQueryEditorAiContextMenuActions, disposeQueryEditorAiContextMenuActions]);

  const buildQueryEditorSlashCommandDefs = useCallback(() => ([
      {
          cmd: '/query',
          label: `🔍 ${translate('query_editor.slash_command.query.label')}`,
          desc: translate('query_editor.slash_command.query.description'),
          prompt: translate('query_editor.slash_command.query.prompt'),
      },
      {
          cmd: '/sql',
          label: `📝 ${translate('query_editor.slash_command.sql.label')}`,
          desc: translate('query_editor.slash_command.sql.description'),
          prompt: translate('query_editor.slash_command.sql.prompt'),
      },
      {
          cmd: '/explain',
          label: `💡 ${translate('query_editor.slash_command.explain.label')}`,
          desc: translate('query_editor.slash_command.explain.description'),
          prompt: translate('query_editor.slash_command.explain.prompt', { sql: QUERY_EDITOR_SQL_PROMPT_PLACEHOLDER }),
          useSelection: true,
      },
      {
          cmd: '/optimize',
          label: `⚡ ${translate('query_editor.slash_command.optimize.label')}`,
          desc: translate('query_editor.slash_command.optimize.description'),
          prompt: translate('query_editor.slash_command.optimize.prompt', { sql: QUERY_EDITOR_SQL_PROMPT_PLACEHOLDER }),
          useSelection: true,
      },
      {
          cmd: '/schema',
          label: `🏗️ ${translate('query_editor.slash_command.schema.label')}`,
          desc: translate('query_editor.slash_command.schema.description'),
          prompt: translate('query_editor.slash_command.schema.prompt'),
      },
      {
          cmd: '/index',
          label: `📊 ${translate('query_editor.slash_command.index.label')}`,
          desc: translate('query_editor.slash_command.index.description'),
          prompt: translate('query_editor.slash_command.index.prompt'),
      },
      {
          cmd: '/diff',
          label: `🔄 ${translate('query_editor.slash_command.diff.label')}`,
          desc: translate('query_editor.slash_command.diff.description'),
          prompt: translate('query_editor.slash_command.diff.prompt'),
      },
      {
          cmd: '/mock',
          label: `🎲 ${translate('query_editor.slash_command.mock.label')}`,
          desc: translate('query_editor.slash_command.mock.description'),
          prompt: translate('query_editor.slash_command.mock.prompt'),
      },
  ]), []);

  const refreshQueryEditorSlashCommandDefs = useCallback(() => {
      (window as any).__gonaviSlashCmdDefs = buildQueryEditorSlashCommandDefs();
  }, [buildQueryEditorSlashCommandDefs]);

  const syncQueryToEditor = (sql: string) => {
      const next = sql || '';
      applyQueryState(next);
      const editor = editorRef.current;
      if (editor && editor.getValue?.() !== next) {
          editor.setValue(next);
      }
  };

  // If opening a saved query, load its SQL
  useEffect(() => {
      const incoming = getTabQueryValue(tab);
      if (incoming === lastExternalQueryRef.current) {
          return;
      }
      lastExternalQueryRef.current = incoming;
      syncQueryToEditor(incoming);
  }, [tab.id, tab.query]);

  // Fetch Database List
  useEffect(() => {
      if (!autoFetchVisible) {
          return;
      }

      const fetchDbs = async () => {
          const conn = connections.find(c => c.id === currentConnectionId);
          if (!conn) return;

          const config = {
            ...conn.config,
            port: Number(conn.config.port),
            password: conn.config.password || "",
            database: conn.config.database || "",
            useSSH: conn.config.useSSH || false,
            ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
          };

          const res = await DBGetDatabases(buildRpcConnectionConfig(config) as any);
          if (res.success && Array.isArray(res.data)) {
              let dbs = res.data.map((row: any) => row.Database || row.database);

              // 过滤只显示 includeDatabases 中配置的数据库
              const includeDbs = conn.includeDatabases;
              if (includeDbs && includeDbs.length > 0) {
                  dbs = dbs.filter((db: string) => includeDbs.includes(db));
              }

              // 存储可见数据库列表用于跨库智能提示
              visibleDbsRef.current = dbs;
              if (isActive) {
                  sharedVisibleDbs = dbs;
              }

              setDbList(dbs);
              if (!currentDbRef.current) {
                  const configuredDb = String(conn.config.database || '').trim();
                  const fallbackDb = dbs.find((db: string) => String(db || '').toLowerCase() !== 'information_schema') || dbs[0] || '';
                  const nextDb = configuredDb && dbs.includes(configuredDb) ? configuredDb : fallbackDb;
                  if (nextDb) {
                      currentDbRef.current = nextDb;
                      setCurrentDb(nextDb);
                  }
              }
          } else {
              visibleDbsRef.current = [];
              if (isActive) {
                  sharedVisibleDbs = [];
              }
              setDbList([]);
          }
      };
      void fetchDbs();
  }, [autoFetchVisible, currentConnectionId, connections]);

  // Fetch Metadata for Autocomplete (Cross-database)
  useEffect(() => {
      if (!autoFetchVisible || isObjectEditQueryTab) {
          return;
      }

      let cancelled = false;
      const fetchMetadata = async () => {
          const conn = connections.find(c => c.id === currentConnectionId);
          if (!conn) return;

          const visibleDbs = visibleDbsRef.current;

          const config = {
            ...conn.config,
            port: Number(conn.config.port),
            password: conn.config.password || "",
            database: conn.config.database || "",
            useSSH: conn.config.useSSH || false,
            ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
          };

          const metadataDbName = String(currentDbRef.current || currentDb || '').trim();
          if (!metadataDbName) return;
          const metadataDbNames = collectQueryEditorReferencedDatabaseNames(
              getCurrentQuery(),
              metadataDbName,
              visibleDbs,
          );
          const metadataFetchKey = [
              currentConnectionId,
              ...metadataDbNames.map((dbName) => String(dbName || '').toLowerCase()),
          ].join('\u0000');
          if (metadataFetchKeyRef.current === metadataFetchKey) return;
          metadataFetchKeyRef.current = metadataFetchKey;

          const allTables: CompletionTableMeta[] = [];
          const allColumns: CompletionColumnMeta[] = [];
          const allViews: CompletionViewMeta[] = [];
          const allMaterializedViews: CompletionViewMeta[] = [];
          const allTriggers: CompletionTriggerMeta[] = [];
          const allRoutines: CompletionRoutineMeta[] = [];
          const metadataDialect = normalizeMetadataDialect(conn);
          const syncMetadataSnapshot = () => {
              if (cancelled) {
                  return false;
              }
              tablesRef.current = [...allTables];
              allColumnsRef.current = [...allColumns];
              viewsRef.current = [...allViews];
              materializedViewsRef.current = [...allMaterializedViews];
              triggersRef.current = [...allTriggers];
              routinesRef.current = [...allRoutines];
              if (isActive) {
                  sharedTablesData = tablesRef.current;
                  sharedAllColumnsData = allColumnsRef.current;
                  sharedViewsData = viewsRef.current;
                  sharedMaterializedViewsData = materializedViewsRef.current;
                  sharedTriggersData = triggersRef.current;
                  sharedRoutinesData = routinesRef.current;
              }
              return true;
          };

          for (const dbName of metadataDbNames) {
              if (cancelled) return;
              const tableComments = new Map<string, string>();
              const tableCommentSQL = buildCompletionTableCommentSQL(metadataDialect, dbName);
              if (tableCommentSQL) {
                  try {
                      const resTableComments = await DBQuery(buildRpcConnectionConfig(config) as any, dbName, tableCommentSQL);
                      if (cancelled) return;
                      if (resTableComments.success && Array.isArray(resTableComments.data)) {
                          resTableComments.data.forEach((row: any) => {
                              const tableName = normalizeCommentText(getCaseInsensitiveValue(row, ['table_name', 'TABLE_NAME', 'name', 'Name']));
                              if (!tableName) return;
                              tableComments.set(tableName.toLowerCase(), normalizeCommentText(getCaseInsensitiveValue(row, ['table_comment', 'TABLE_COMMENT', 'comment', 'comments', 'Comment', 'COMMENTS'])));
                          });
                      }
                  } catch {
                      // 表备注只是补全增强，失败时保留原有表名补全。
                  }
              }

              // 获取表
              const resTables = await DBGetTables(buildRpcConnectionConfig(config) as any, dbName);
              if (cancelled) return;
              if (resTables.success && Array.isArray(resTables.data)) {
                  const tableNames = resTables.data.map((row: any) => Object.values(row)[0] as string);
                  tableNames.forEach((tableName: string) => {
                      const parsed = splitCompletionSchemaAndTable(String(tableName || ''));
                      allTables.push({
                          dbName,
                          tableName,
                          comment: tableComments.get(String(tableName || '').toLowerCase())
                              || (parsed.table ? tableComments.get(parsed.table.toLowerCase()) : undefined)
                              || undefined
                      });
                  });
              }
              if (!syncMetadataSnapshot()) return;

              // 获取列 (所有数据库类型都支持 DBGetAllColumns)
              const resCols = await DBGetAllColumns(buildRpcConnectionConfig(config) as any, dbName);
              if (cancelled) return;
              if (resCols.success && Array.isArray(resCols.data)) {
                  resCols.data.forEach((col: any) => {
                      allColumns.push({
                          dbName,
                          tableName: col.tableName,
                          name: col.name,
                          type: col.type,
                          comment: normalizeCommentText(col.comment ?? col.Comment ?? col.COLUMN_COMMENT ?? col.column_comment ?? '')
                      });
                  });
              }
              if (!syncMetadataSnapshot()) return;

              const viewResults = await queryCompletionMetadataRowsBySpecs(
                  config,
                  dbName,
                  buildCompletionViewsMetadataQuerySpecs(metadataDialect, dbName),
              );
              if (cancelled) return;
              const seenViews = new Set<string>();
              viewResults.forEach((queryResult) => {
                  queryResult.rows.forEach((row) => {
                      const tableType = getCaseInsensitiveValue(row, ['table_type', 'table type', 'type']);
                      if (!isSidebarViewTableType(tableType)) return;
                      const schemaName = String(getCaseInsensitiveValue(row, ['schema_name', 'schemaname', 'owner', 'table_schema', 'db']) || '').trim();
                      const rawViewName = String(getCaseInsensitiveValue(row, ['view_name', 'viewname', 'table_name', 'name']) || '').trim()
                          || getMySQLShowTablesName(row)
                          || getFirstRowValue(row);
                      const normalizedViewName = normalizeSidebarViewName(metadataDialect, dbName, schemaName, rawViewName);
                      if (!normalizedViewName) return;
                      const uniqueKey = `${dbName.toLowerCase()}@@${normalizedViewName.toLowerCase()}`;
                      if (seenViews.has(uniqueKey)) return;
                      seenViews.add(uniqueKey);
                      const parsed = splitSidebarQualifiedName(normalizedViewName);
                      allViews.push({
                          dbName,
                          viewName: normalizedViewName,
                          schemaName: schemaName || parsed.schemaName || undefined,
                      });
                  });
              });
              if (!syncMetadataSnapshot()) return;

              const materializedViewResults = await queryCompletionMetadataRowsBySpecs(
                  config,
                  dbName,
                  buildCompletionMaterializedViewsMetadataQuerySpecs(metadataDialect, dbName),
              );
              if (cancelled) return;
              const seenMaterializedViews = new Set<string>();
              materializedViewResults.forEach((queryResult) => {
                  queryResult.rows.forEach((row) => {
                      const schemaName = String(getCaseInsensitiveValue(row, ['schema_name', 'table_schema', 'db', 'database']) || '').trim();
                      const rawViewName = String(getCaseInsensitiveValue(row, ['object_name', 'view_name', 'table_name', 'name', 'materialized_view_name', 'mv_name']) || '').trim() || getFirstRowValue(row);
                      const normalizedViewName = normalizeSidebarViewName(metadataDialect, dbName, schemaName, rawViewName);
                      if (!normalizedViewName) return;
                      const uniqueKey = `${dbName.toLowerCase()}@@${normalizedViewName.toLowerCase()}`;
                      if (seenMaterializedViews.has(uniqueKey)) return;
                      seenMaterializedViews.add(uniqueKey);
                      const parsed = splitSidebarQualifiedName(normalizedViewName);
                      allMaterializedViews.push({
                          dbName,
                          viewName: normalizedViewName,
                          schemaName: schemaName || parsed.schemaName || undefined,
                      });
                  });
              });
              if (!syncMetadataSnapshot()) return;

              const triggerResults = await queryCompletionMetadataRowsBySpecs(
                  config,
                  dbName,
                  buildCompletionTriggersMetadataQuerySpecs(metadataDialect, dbName),
              );
              if (cancelled) return;
              const seenTriggers = new Set<string>();
              triggerResults.forEach((queryResult) => {
                  queryResult.rows.forEach((row) => {
                      const rawTriggerName = String(getCaseInsensitiveValue(row, ['trigger_name', 'triggername', 'trigger', 'name']) || '').trim() || getFirstRowValue(row);
                      if (!rawTriggerName) return;
                      const rawSchemaName = String(getCaseInsensitiveValue(row, ['schema_name', 'schemaname', 'owner', 'event_object_schema', 'trigger_schema', 'db']) || '').trim();
                      const rawTableName = String(getCaseInsensitiveValue(row, ['table_name', 'event_object_table', 'tbl_name', 'table']) || '').trim();
                      const triggerParts = splitSidebarQualifiedName(rawTriggerName);
                      const tableParts = splitSidebarQualifiedName(rawTableName);
                      const resolvedSchemaName = String(rawSchemaName || tableParts.schemaName || triggerParts.schemaName || '').trim();
                      const resolvedTriggerName = String(triggerParts.objectName || rawTriggerName).trim();
                      const resolvedTableName = buildQualifiedCompletionName(resolvedSchemaName, tableParts.objectName || rawTableName);
                      const uniqueKey = (metadataDialect === 'mysql' || metadataDialect === 'starrocks')
                          ? `${dbName.toLowerCase()}@@${resolvedSchemaName.toLowerCase()}@@${resolvedTriggerName.toLowerCase()}`
                          : `${dbName.toLowerCase()}@@${resolvedSchemaName.toLowerCase()}@@${resolvedTriggerName.toLowerCase()}@@${resolvedTableName.toLowerCase()}`;
                      if (seenTriggers.has(uniqueKey)) return;
                      seenTriggers.add(uniqueKey);
                      allTriggers.push({
                          dbName,
                          triggerName: buildQualifiedCompletionName(resolvedSchemaName, resolvedTriggerName) || resolvedTriggerName,
                          tableName: resolvedTableName || rawTableName,
                          schemaName: resolvedSchemaName || undefined,
                      });
                  });
              });
              if (!syncMetadataSnapshot()) return;

              const routineResults = await queryCompletionMetadataRowsBySpecs(
                  config,
                  dbName,
                  buildCompletionFunctionsMetadataQuerySpecs(metadataDialect, dbName),
              );
              if (cancelled) return;
              const seenRoutines = new Set<string>();
              routineResults.forEach((queryResult) => {
                  queryResult.rows.forEach((row) => {
                      const rawRoutineName = String(getCaseInsensitiveValue(row, ['routine_name', 'object_name', 'proname', 'name']) || '').trim();
                      if (!rawRoutineName) return;
                      const schemaName = String(getCaseInsensitiveValue(row, ['schema_name', 'nspname', 'owner', 'db', 'database']) || '').trim();
                      const rawType = String(getCaseInsensitiveValue(row, ['routine_type', 'object_type', 'type']) || queryResult.inferredType || 'FUNCTION').trim();
                      const normalizedType = rawType.toUpperCase().includes('PROC') ? 'PROCEDURE' : 'FUNCTION';
                      const qualifiedRoutineName = buildQualifiedCompletionName(schemaName, rawRoutineName);
                      if (!qualifiedRoutineName) return;
                      const uniqueKey = `${dbName.toLowerCase()}@@${qualifiedRoutineName.toLowerCase()}@@${normalizedType}`;
                      if (seenRoutines.has(uniqueKey)) return;
                      seenRoutines.add(uniqueKey);
                      allRoutines.push({
                          dbName,
                          routineName: qualifiedRoutineName,
                          routineType: normalizedType,
                          schemaName: schemaName || splitSidebarQualifiedName(qualifiedRoutineName).schemaName || undefined,
                      });
                  });
              });
              if (!syncMetadataSnapshot()) return;
          }

          if (!syncMetadataSnapshot()) return;
          refreshObjectDecorations();
      };
      void fetchMetadata();
      return () => {
          cancelled = true;
      };
  }, [autoFetchVisible, currentConnectionId, currentDb, connections, isActive, isObjectEditQueryTab, refreshObjectDecorations]);

  // Query ID management helpers
  const setQueryId = (id: string) => {
      currentQueryIdRef.current = id;
      setCurrentQueryId(id);
  };

  const clearQueryId = () => {
      currentQueryIdRef.current = '';
      setCurrentQueryId('');
  };

  const clampEditorHeight = useCallback((height: number) => {
      const viewportHeight = Number.isFinite(window.innerHeight) ? window.innerHeight : 800;
      const maxHeight = Math.max(100, viewportHeight - 200);
      return Math.max(100, Math.min(maxHeight, height));
  }, []);

  const applyEditorHeightToDom = useCallback(() => {
      const nextHeight = pendingEditorHeightRef.current;
      if (editorShellRef.current) {
          editorShellRef.current.style.height = `${nextHeight}px`;
      }
      editorRef.current?.layout?.();
  }, []);

  const cancelEditorResizeFrame = useCallback(() => {
      if (resizeFrameRef.current === null) return;
      if (typeof window.cancelAnimationFrame === 'function') {
          window.cancelAnimationFrame(resizeFrameRef.current);
      } else {
          window.clearTimeout(resizeFrameRef.current);
      }
      resizeFrameRef.current = null;
  }, []);

  const scheduleEditorHeightDomUpdate = useCallback((height: number) => {
      pendingEditorHeightRef.current = height;
      if (resizeFrameRef.current !== null) return;

      const requestFrame = typeof window.requestAnimationFrame === 'function'
          ? window.requestAnimationFrame.bind(window)
          : (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 16);

      resizeFrameRef.current = requestFrame(() => {
          resizeFrameRef.current = null;
          applyEditorHeightToDom();
      });
  }, [applyEditorHeightToDom]);

  // Handle Resizing
  const handleMouseMove = useCallback((e: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = e.clientY - dragRef.current.startY;
      const newHeight = clampEditorHeight(dragRef.current.startHeight + delta);
      dragRef.current.currentHeight = newHeight;
      scheduleEditorHeightDomUpdate(newHeight);
  }, [clampEditorHeight, scheduleEditorHeightDomUpdate]);

  const handleMouseUp = useCallback(() => {
      const finalHeight = dragRef.current?.currentHeight;
      dragRef.current = null;
      cancelEditorResizeFrame();
      if (typeof finalHeight === 'number') {
          pendingEditorHeightRef.current = finalHeight;
          applyEditorHeightToDom();
          setEditorHeight(finalHeight);
      }
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
  }, [applyEditorHeightToDom, cancelEditorResizeFrame, handleMouseMove]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startY: e.clientY, startHeight: editorHeight, currentHeight: editorHeight };
      pendingEditorHeightRef.current = editorHeight;
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
  }, [editorHeight, handleMouseMove, handleMouseUp]);

  useEffect(() => {
      return () => {
          dragRef.current = null;
          cancelEditorResizeFrame();
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
      };
  }, [cancelEditorResizeFrame, handleMouseMove, handleMouseUp]);

  // Setup Autocomplete and Editor
  const handleEditorDidMount: OnMount = (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;
      lastEditorCursorPositionRef.current = normalizeEditorPosition(editor.getPosition?.());

      editor.updateOptions?.({
          fixedOverflowWidgets: true,
          hover: {
              enabled: true,
              delay: QUERY_EDITOR_HOVER_DELAY_MS,
              above: false,
          },
      });

      const applyNavigationHoverStateAtPosition = (targetPosition: { lineNumber: number; column: number } | null) => {
          if (!ctrlMetaPressedRef.current) {
              clearQueryEditorLinkDecorations(editor, linkDecorationIdsRef);
              editor.updateOptions?.({ mouseStyle: 'text' });
              setQueryEditorMouseCursor(editor, '');
              return;
          }
          if (!targetPosition) {
              clearQueryEditorLinkDecorations(editor, linkDecorationIdsRef);
              editor.updateOptions?.({ mouseStyle: 'text' });
              setQueryEditorMouseCursor(editor, '');
              return;
          }
          const model = editor.getModel?.();
          const lineContent = String(model?.getLineContent?.(targetPosition.lineNumber) || '');
          const decorations = resolveQueryEditorNavigationDecorations(
              lineContent,
              targetPosition.column,
              currentDbRef.current,
              visibleDbsRef.current,
              tablesRef.current,
              viewsRef.current,
              materializedViewsRef.current,
              triggersRef.current,
              routinesRef.current,
              primaryShortcutModifierLabel,
          );
          if (decorations.length === 0) {
              clearQueryEditorLinkDecorations(editor, linkDecorationIdsRef);
              editor.updateOptions?.({ mouseStyle: 'text' });
              setQueryEditorMouseCursor(editor, '');
              return;
          }
          linkDecorationIdsRef.current = editor.deltaDecorations(
              linkDecorationIdsRef.current,
              decorations.map((item) => ({
                  range: new monaco.Range(
                      targetPosition.lineNumber,
                      item.startColumn,
                      targetPosition.lineNumber,
                      item.endColumn,
                  ),
                  options: {
                      inlineClassName: 'gonavi-query-editor-link-hint',
                  },
              })),
          );
          setQueryEditorMouseCursor(editor, 'pointer');
      };

      const applyNavigationHoverState = (event: any) => {
          const targetPosition = normalizeEditorPosition(event?.target?.position);
          lastHoverTargetPositionRef.current = targetPosition;
          applyNavigationHoverStateAtPosition(targetPosition);
      };

      const syncModifierState = (keyboardEvent?: KeyboardEvent | MouseEvent | null) => {
          const wasPressed = ctrlMetaPressedRef.current;
          ctrlMetaPressedRef.current = !!(keyboardEvent?.ctrlKey || keyboardEvent?.metaKey);
          if (!ctrlMetaPressedRef.current) {
              clearQueryEditorLinkDecorations(editor, linkDecorationIdsRef);
              editor.updateOptions?.({ mouseStyle: 'text' });
              setQueryEditorMouseCursor(editor, '');
              return;
          }
          const isKeyboardLikeEvent = keyboardEvent
              && typeof keyboardEvent === 'object'
              && ('key' in keyboardEvent || 'code' in keyboardEvent || 'repeat' in keyboardEvent);
          if (!wasPressed || isKeyboardLikeEvent) {
              applyNavigationHoverStateAtPosition(lastHoverTargetPositionRef.current);
          }
      };
      const handleWindowBlur = () => {
          ctrlMetaPressedRef.current = false;
          clearQueryEditorLinkDecorations(editor, linkDecorationIdsRef);
          editor.updateOptions?.({ mouseStyle: 'text' });
          setQueryEditorMouseCursor(editor, '');
      };
      const editorDomNode = editor.getDomNode?.();
      const handleEditorDragOver = (rawEvent: Event) => {
          const event = rawEvent as DragEvent;
          if (!hasSidebarSqlEditorDragPayload(event.dataTransfer)) return;
          event.preventDefault();
          event.stopPropagation();
          if (event.dataTransfer) {
              event.dataTransfer.dropEffect = 'copy';
          }
      };
      const handleEditorDrop = (rawEvent: Event) => {
          handleSidebarObjectDrop(rawEvent as DragEvent);
      };

      // 应用透明主题（主题由 MonacoEditor 包装组件按需注册）
      monaco.editor.setTheme(darkMode ? 'transparent-dark' : 'transparent-light');

      objectHoverActionRef.current?.dispose?.();
      const showObjectInfoKeybinding = monaco.KeyMod?.CtrlCmd && monaco.KeyCode?.KeyQ
          ? [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyQ]
          : undefined;
      objectHoverActionRef.current = editor.addAction({
          id: 'gonavi.queryEditor.showObjectInfo',
          label: buildQueryEditorMonacoActionLabel('query_editor.action.show_object_info'),
          keybindings: showObjectInfoKeybinding,
          run: () => {
              const preferredPosition = lastHoverTargetPositionRef.current || editor.getPosition?.();
              const shown = showObjectInfoAtPosition(preferredPosition);
              if (!shown) {
                  void message.info({
                      key: 'gonavi-query-editor-object-info-miss',
                      content: translate('query_editor.message.object_info_target_not_found'),
                  });
              }
          },
      });

      editor.onDidChangeCursorPosition?.((event: any) => {
          const position = normalizeEditorPosition(event?.position);
          if (position) {
              lastEditorCursorPositionRef.current = position;
          }
      });

      editor.onDidChangeModelContent?.((event: any) => {
          const hasSlashCommandMarker = Array.isArray(event?.changes)
              && event.changes.some((change: any) => /__AI_\w+__/.test(String(change?.text || '')));
          if (!hasSlashCommandMarker) return;
          refreshObjectDecorations(QUERY_EDITOR_LIVE_DECORATION_MAX_TEXT_LENGTH);
      });

      editor.onMouseMove?.((event: any) => {
          syncModifierState(event?.event || null);
          applyNavigationHoverState(event);
      });
      editor.onMouseLeave?.(() => {
          lastHoverTargetPositionRef.current = null;
          clearQueryEditorLinkDecorations(editor, linkDecorationIdsRef);
          editor.updateOptions?.({ mouseStyle: 'text' });
          setQueryEditorMouseCursor(editor, '');
      });

      window.addEventListener('keydown', syncModifierState);
      window.addEventListener('keyup', syncModifierState);
      window.addEventListener('blur', handleWindowBlur);
      editorDomNode?.addEventListener('dragover', handleEditorDragOver, true);
      editorDomNode?.addEventListener('drop', handleEditorDrop, true);

      editor.onMouseDown?.((event: any) => {
          const browserEvent = event?.event;
          const targetPosition = normalizeEditorPosition(event?.target?.position);
          if (!browserEvent || !targetPosition) {
              return;
          }
          if (!isQueryEditorPrimaryMouseButton(browserEvent)) {
              return;
          }
          if (!browserEvent.ctrlKey && !browserEvent.metaKey) {
              return;
          }

          const model = editor.getModel?.();
          const lineContent = String(model?.getLineContent?.(targetPosition.lineNumber) || '');
          const navigationTarget = resolveQueryEditorNavigationTarget(
              lineContent,
              targetPosition.column,
              currentDbRef.current,
              visibleDbsRef.current,
              tablesRef.current,
              viewsRef.current,
              materializedViewsRef.current,
              triggersRef.current,
              routinesRef.current,
          );
          if (!navigationTarget) {
              return;
          }

          browserEvent.preventDefault?.();
          browserEvent.stopPropagation?.();

          const connectionId = String(currentConnectionIdRef.current || '').trim();
          if (!connectionId) {
              return;
          }

          if (navigationTarget.type === 'database') {
              const nextDbName = String(navigationTarget.dbName || '').trim();
              if (!nextDbName) {
                  return;
              }
              setCurrentDb(nextDbName);
              currentDbRef.current = nextDbName;
              setActiveContext({ connectionId, dbName: nextDbName });
              return;
          }

          const targetDbName = String(navigationTarget.dbName || '').trim();
          if (!targetDbName) {
              return;
          }

          setCurrentDb(targetDbName);
          currentDbRef.current = targetDbName;
          setActiveContext({ connectionId, dbName: targetDbName });
          if (navigationTarget.type === 'table') {
              const targetTableName = String(navigationTarget.tableName || '').trim();
              if (!targetTableName) return;
              addTab({
                  id: `${connectionId}-${targetDbName}-table-${targetTableName}`,
                  title: targetTableName,
                  type: 'table',
                  connectionId,
                  dbName: targetDbName,
                  tableName: targetTableName,
                  objectType: 'table',
              });
              dispatchQueryEditorSidebarLocate({
                  connectionId,
                  dbName: targetDbName,
                  tableName: targetTableName,
                  schemaName: navigationTarget.schemaName,
                  objectGroup: 'tables',
              });
              return;
          }

          if (navigationTarget.type === 'view' || navigationTarget.type === 'materialized-view') {
              const targetViewName = String(navigationTarget.viewName || '').trim();
              if (!targetViewName) return;
              const viewTitle = navigationTarget.type === 'materialized-view'
                  ? translate('sidebar.tab.materialized_view_definition', { name: targetViewName })
                  : translate('sidebar.tab.view_definition', { name: targetViewName });
              const targetSchemaName = String(navigationTarget.schemaName || '').trim();
              const sidebarLocateKey = navigationTarget.type === 'materialized-view'
                  ? `${connectionId}-${targetDbName}-materialized-view-${targetViewName}`
                  : `${connectionId}-${targetDbName}-view-${targetViewName}`;
              addTab({
                  id: `view-def-${connectionId}-${targetDbName}-${targetViewName}`,
                  title: viewTitle,
                  type: 'view-def',
                  connectionId,
                  dbName: targetDbName,
                  viewName: targetViewName,
                  viewKind: navigationTarget.type === 'materialized-view' ? 'materialized' : 'view',
                  schemaName: targetSchemaName || undefined,
                  sidebarLocateKey,
              });
              dispatchQueryEditorSidebarLocate({
                  tabId: sidebarLocateKey,
                  connectionId,
                  dbName: targetDbName,
                  viewName: targetViewName,
                  tableName: targetViewName,
                  schemaName: targetSchemaName,
                  objectGroup: navigationTarget.type === 'materialized-view' ? 'materializedViews' : 'views',
              });
              return;
          }

          if (navigationTarget.type === 'trigger') {
              const targetTriggerName = String(navigationTarget.triggerName || '').trim();
              if (!targetTriggerName) return;
              const targetTriggerTableName = String(navigationTarget.tableName || '').trim();
              const targetSchemaName = String(navigationTarget.schemaName || '').trim();
              const sidebarLocateKey = `${connectionId}-${targetDbName}-trigger-${targetTriggerName}-${targetTriggerTableName}`;
              addTab({
                  id: `trigger-${connectionId}-${targetDbName}-${targetTriggerName}`,
                  title: translate('sidebar.tab.trigger', { name: targetTriggerName }),
                  type: 'trigger',
                  connectionId,
                  dbName: targetDbName,
                  triggerName: targetTriggerName,
                  triggerTableName: targetTriggerTableName || undefined,
                  schemaName: targetSchemaName || undefined,
                  sidebarLocateKey,
              });
              dispatchQueryEditorSidebarLocate({
                  tabId: sidebarLocateKey,
                  connectionId,
                  dbName: targetDbName,
                  triggerName: targetTriggerName,
                  tableName: targetTriggerName,
                  schemaName: targetSchemaName,
                  objectGroup: 'triggers',
              });
              return;
          }

          const targetRoutineName = String(navigationTarget.routineName || '').trim();
          if (!targetRoutineName) return;
          const routineTypeLabel = navigationTarget.routineType === 'PROCEDURE'
              ? translate('sidebar.object.procedure')
              : translate('sidebar.object.function');
          const targetSchemaName = String(navigationTarget.schemaName || '').trim();
          const sidebarLocateKey = `${connectionId}-${targetDbName}-routine-${targetRoutineName}`;
          addTab({
              id: `routine-def-${connectionId}-${targetDbName}-${targetRoutineName}`,
              title: translate('sidebar.tab.routine_definition', {
                  type: routineTypeLabel,
                  name: targetRoutineName,
              }),
              type: 'routine-def',
              connectionId,
              dbName: targetDbName,
              routineName: targetRoutineName,
              routineType: navigationTarget.routineType,
              schemaName: targetSchemaName || undefined,
              sidebarLocateKey,
          });
          dispatchQueryEditorSidebarLocate({
              tabId: sidebarLocateKey,
              connectionId,
              dbName: targetDbName,
              routineName: targetRoutineName,
              tableName: targetRoutineName,
              schemaName: targetSchemaName,
              objectGroup: 'routines',
          });
      });

      editor.onDidDispose?.(() => {
          clearQueryEditorLinkDecorations(editor, linkDecorationIdsRef);
          clearQueryEditorObjectDecorations(editor, objectDecorationIdsRef);
          setQueryEditorMouseCursor(editor, '');
          objectHoverActionRef.current?.dispose?.();
          objectHoverActionRef.current = null;
          disposeQueryEditorAiContextMenuActions();
          window.removeEventListener('keydown', syncModifierState);
          window.removeEventListener('keyup', syncModifierState);
          window.removeEventListener('blur', handleWindowBlur);
          editorDomNode?.removeEventListener('dragover', handleEditorDragOver, true);
          editorDomNode?.removeEventListener('drop', handleEditorDrop, true);
      });

      refreshObjectDecorations();

      // 注册 AI 右键菜单操作
      registerQueryEditorAiContextMenuActions(editor);

      // Register runQuery shortcut inside Monaco so it overrides Monaco's default keybinding
      const runBinding = runQueryShortcutBinding;
      if (runBinding?.enabled && runBinding.combo) {
          const keyBinding = comboToMonacoKeyBinding(
              runBinding.combo, monaco.KeyMod, monaco.KeyCode
          );
          if (keyBinding) {
              runQueryActionRef.current = editor.addAction({
                  id: 'gonavi.runQuery',
                  label: buildQueryEditorMonacoActionLabel('app.shortcuts.action.runQuery.label'),
                  keybindings: [keyBinding.keyMod | keyBinding.keyCode],
                  run: () => {
                      window.dispatchEvent(new CustomEvent('gonavi:run-active-query'));
                  },
              });
          }
      }

      const selectStatementBinding = selectCurrentStatementShortcutBinding;
      if (selectStatementBinding?.enabled && selectStatementBinding.combo) {
          const keyBinding = comboToMonacoKeyBinding(
              selectStatementBinding.combo, monaco.KeyMod, monaco.KeyCode
          );
          if (keyBinding) {
              selectCurrentStatementActionRef.current = editor.addAction({
                  id: 'gonavi.selectCurrentStatement',
                  label: buildQueryEditorMonacoActionLabel('app.shortcuts.action.selectCurrentStatement.label'),
                  keybindings: [keyBinding.keyMod | keyBinding.keyCode],
                  run: handleSelectCurrentStatement,
              });
          }
      }

      const saveBinding = saveQueryShortcutBinding;
      if (saveBinding?.enabled && saveBinding.combo) {
          const keyBinding = comboToMonacoKeyBinding(
              saveBinding.combo, monaco.KeyMod, monaco.KeyCode
          );
          if (keyBinding) {
              saveQueryActionRef.current = editor.addAction({
                  id: 'gonavi.saveQuery',
                  label: buildQueryEditorMonacoActionLabel('app.shortcuts.action.saveQuery.label'),
                  keybindings: [keyBinding.keyMod | keyBinding.keyCode],
                  run: () => {
                      window.dispatchEvent(new CustomEvent('gonavi:save-active-query'));
                  },
              });
          }
      }

      // 注册 / 斜杠命令 AI 快捷补全
      refreshQueryEditorSlashCommandDefs();
      const toggleResultsBinding = toggleQueryResultsPanelShortcutBinding;
      if (toggleResultsBinding?.enabled && toggleResultsBinding.combo) {
          const keyBinding = comboToMonacoKeyBinding(
              toggleResultsBinding.combo, monaco.KeyMod, monaco.KeyCode
          );
          if (keyBinding) {
              toggleQueryResultsPanelActionRef.current = editor.addAction({
                  id: 'gonavi.toggleQueryResultsPanel',
                  label: buildQueryEditorMonacoActionLabel('app.shortcuts.action.toggleQueryResultsPanel.label'),
                  keybindings: [keyBinding.keyMod | keyBinding.keyCode],
                  run: toggleResultPanelVisibility,
              });
          }
      }

      // HMR 重载或测试重置时，以全局状态为准，避免本地闭包状态和 provider 列表不同步。
      sqlCompletionRegistered = Boolean(_g.__gonaviSqlCompletionState.registered);
      sqlCompletionDisposables = _g.__gonaviSqlCompletionState.disposables;
      const shouldRegisterSqlCompletion = !sqlCompletionRegistered
          || _g.__gonaviSqlCompletionState.version !== SQL_COMPLETION_PROVIDER_VERSION;

      // HMR 重载时释放旧注册避免补全项重复
      if (shouldRegisterSqlCompletion) {
      sqlCompletionRegistered = true;
      _g.__gonaviSqlCompletionState.registered = true;
      _g.__gonaviSqlCompletionState.version = SQL_COMPLETION_PROVIDER_VERSION;
      sqlCompletionDisposables.forEach((d: any) => d?.dispose?.());
      sqlCompletionDisposables.length = 0;
      sqlCompletionDisposables.push(monaco.languages.registerHoverProvider('sql', {
          provideHover: (model: any, position: any) => {
              const normalizedPosition = normalizeEditorPosition(position);
              if (!normalizedPosition) {
                  return null;
              }
              const lineContent = String(model?.getLineContent?.(normalizedPosition.lineNumber) || '');
              const resolveText = getQueryEditorObjectResolveText(model, lineContent);
              const hoverTarget = resolveQueryEditorHoverTarget(
                  resolveText,
                  lineContent,
                  normalizedPosition.column,
                  sharedCurrentDb,
                  sharedVisibleDbs,
                  sharedTablesData,
                  sharedAllColumnsData,
                  sharedViewsData,
                  sharedMaterializedViewsData,
                  sharedTriggersData,
                  sharedRoutinesData,
              );
              if (!hoverTarget) {
                  return null;
              }
              return {
                  range: new monaco.Range(
                      normalizedPosition.lineNumber,
                      hoverTarget.range.startColumn,
                      normalizedPosition.lineNumber,
                      hoverTarget.range.endColumn,
                  ),
                  contents: [{ value: buildQueryEditorHoverMarkdown(hoverTarget) }],
              };
          },
      }));
      sqlCompletionDisposables.push(monaco.languages.registerCompletionItemProvider('sql', {
          triggerCharacters: ['.'],
          provideCompletionItems: async (model: any, position: any, _context?: any, token?: { isCancellationRequested?: boolean }) => {
              if (isSqlCompletionRequestCancelled(token)) {
                  return createEmptySqlCompletionResult();
              }
              const word = model.getWordUntilPosition(position);
              const range = {
                  startLineNumber: position.lineNumber,
                  endLineNumber: position.lineNumber,
                  startColumn: word.startColumn,
                  endColumn: word.endColumn,
              };
              const activeConnection = sharedConnections.find(c => c.id === sharedCurrentConnectionId);
              const activeDialect = resolveSqlDialect(
                  String(activeConnection?.config?.type || ''),
                  String(activeConnection?.config?.driver || ''),
                  { oceanBaseProtocol: activeConnection?.config?.oceanBaseProtocol },
              );
              const shouldQuoteCompletionIdentifiers = isPostgresSchemaDialect(activeDialect);
              const quoteCompletionPart = (ident: string) => {
                  const raw = String(ident || '').trim();
                  if (!raw) return raw;
                  return shouldQuoteCompletionIdentifiers ? quoteIdentPart(activeDialect, raw) : raw;
              };
              const quoteCompletionPath = (ident: string) => {
                  const raw = String(ident || '').trim();
                  if (!raw) return raw;
                  return shouldQuoteCompletionIdentifiers ? quoteQualifiedIdent(activeDialect, raw) : raw;
              };
              const dialectKeywords = resolveSqlKeywords(activeDialect);
              const dialectFunctions = resolveSqlFunctions(activeDialect);

              const stripQuotes = stripCompletionIdentifierQuotes;
              const normalizeQualifiedName = normalizeCompletionQualifiedName;
              const splitSchemaAndTable = splitCompletionSchemaAndTable;

              const buildConnConfig = () => {
                  const connId = sharedCurrentConnectionId;
                  const conn = sharedConnections.find(c => c.id === connId);
                  if (!conn) return null;
                  return {
                      ...conn.config,
                      port: Number(conn.config.port),
                      password: conn.config.password || "",
                      database: conn.config.database || "",
                      useSSH: conn.config.useSSH || false,
                      ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
                  };
              };

              const getLazyTablesByDB = async (dbName: string) => {
                  const connId = sharedCurrentConnectionId;
                  if (!connId || !dbName) return [] as CompletionTableMeta[];
                  const key = `${connId}|${dbName}`;
                  if (sharedLazyTablesCache[key]) {
                      return sharedLazyTablesCache[key];
                  }
                  if (sharedLazyTablesInFlight[key]) {
                      return sharedLazyTablesInFlight[key];
                  }

                  const config = buildConnConfig();
                  if (!config) return [] as CompletionTableMeta[];

                  sharedLazyTablesInFlight[key] = DBGetTables(buildRpcConnectionConfig(config) as any, dbName)
                      .then((res) => {
                          const tables = res?.success && Array.isArray(res.data)
                              ? res.data
                                  .map((row: any) => String(Object.values(row || {})[0] || '').trim())
                                  .filter(Boolean)
                                  .map((tableName: string) => ({ dbName, tableName }))
                              : [];
                          sharedLazyTablesCache[key] = tables;
                          if (tables.length > 0) {
                              const existingKeys = new Set(sharedTablesData.map((table) => `${table.dbName.toLowerCase()}.${table.tableName.toLowerCase()}`));
                              const missingTables = tables.filter((table) => !existingKeys.has(`${table.dbName.toLowerCase()}.${table.tableName.toLowerCase()}`));
                              if (missingTables.length > 0) {
                                  sharedTablesData = [...sharedTablesData, ...missingTables];
                              }
                          }
                          return tables;
                      })
                      .catch(() => [])
                      .finally(() => {
                          delete sharedLazyTablesInFlight[key];
                      });
                  return sharedLazyTablesInFlight[key];
              };

              const toCompletionColumns = (
                  columns: ColumnDefinition[],
                  dbName: string,
                  tableName: string,
              ): CompletionColumnMeta[] => columns
                  .map((column) => ({
                      dbName,
                      tableName,
                      name: getColumnDefinitionName(column),
                      type: getColumnDefinitionType(column),
                      comment: getColumnDefinitionComment(column),
                  }))
                  .filter((column) => !!column.name);

              const findPreloadedColumns = (dbName: string, tableName: string) => {
                  const targetDbLower = String(dbName || '').toLowerCase();
                  const targetTableLower = String(tableName || '').toLowerCase();
                  return sharedAllColumnsData.filter((column) => {
                      if (String(column.dbName || '').toLowerCase() !== targetDbLower) return false;
                      const columnTableLower = String(column.tableName || '').toLowerCase();
                      if (columnTableLower === targetTableLower) return true;
                      const parsed = splitSchemaAndTable(column.tableName || '');
                      return String(parsed.table || '').toLowerCase() === targetTableLower;
                  });
              };

              const mergeSharedCompletionColumns = (columns: CompletionColumnMeta[]) => {
                  if (columns.length === 0) return;
                  const existingKeys = new Set(sharedAllColumnsData.map((column) => [
                      String(column.dbName || '').toLowerCase(),
                      String(column.tableName || '').toLowerCase(),
                      String(column.name || '').toLowerCase(),
                  ].join('\u0000')));
                  const missing = columns.filter((column) => {
                      const key = [
                          String(column.dbName || '').toLowerCase(),
                          String(column.tableName || '').toLowerCase(),
                          String(column.name || '').toLowerCase(),
                      ].join('\u0000');
                      if (existingKeys.has(key)) return false;
                      existingKeys.add(key);
                      return true;
                  });
                  if (missing.length > 0) {
                      sharedAllColumnsData = [...sharedAllColumnsData, ...missing];
                  }
              };

              const getCompletionColumnsByTable = async (dbName: string, tableIdent: string) => {
                  const connId = sharedCurrentConnectionId;
                  const targetDb = String(dbName || '').trim();
                  const targetTable = String(tableIdent || '').trim();
                  if (!connId || !targetDb || !targetTable) return [] as CompletionColumnMeta[];

                  const preloaded = findPreloadedColumns(targetDb, targetTable);
                  if (preloaded.length > 0) {
                      return preloaded;
                  }

                  const key = `${connId}|${targetDb}|${targetTable}`;
                  const cached = sharedColumnsCacheData[key] as ColumnDefinition[] | undefined;
                  if (cached) {
                      const cachedColumns = toCompletionColumns(cached, targetDb, targetTable);
                      mergeSharedCompletionColumns(cachedColumns);
                      return cachedColumns;
                  }

                  const config = buildConnConfig();
                  if (!config) return [] as CompletionColumnMeta[];

                  const res = await DBGetColumns(buildRpcConnectionConfig(config) as any, targetDb, targetTable);
                  if (res?.success && Array.isArray(res.data)) {
                      const cols = res.data as ColumnDefinition[];
                      sharedColumnsCacheData[key] = cols;
                      const completionColumns = toCompletionColumns(cols, targetDb, targetTable);
                      mergeSharedCompletionColumns(completionColumns);
                      return completionColumns;
                  }
                  return [] as CompletionColumnMeta[];
              };

              const fullText = model.getValue();

              // 获取当前行光标前的内容
              const linePrefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);

              // 0) 三段式 db.table.column 格式：当输入 db.table. 时提示列
              const threePartMatch = linePrefix.match(QUERY_EDITOR_SQL_THREE_PART_COMPLETION_REGEX);
              if (threePartMatch) {
                  const dbPart = stripQuotes(threePartMatch[1]);
                  const tablePart = stripQuotes(threePartMatch[2]);
                  const colPrefix = (threePartMatch[3] || '').toLowerCase();

                  const cols = await getCompletionColumnsByTable(dbPart, tablePart);
                  if (isSqlCompletionRequestCancelled(token)) {
                      return createEmptySqlCompletionResult();
                  }

                  const filtered = colPrefix
                      ? cols.filter(c => (c.name || '').toLowerCase().startsWith(colPrefix))
                      : cols;

                  const suggestions = filtered.map(c => ({
                      label: c.name,
                      kind: monaco.languages.CompletionItemKind.Field,
                      insertText: quoteCompletionPart(c.name),
                      detail: appendCommentToDetail(`${c.type} (${c.dbName}.${c.tableName})`, c.comment),
                      documentation: buildCompletionDocumentation(c.comment),
                      range,
                      sortText: '0' + c.name
                  }));
                  return { suggestions };
              }

              // 1) 两段式 qualifier.xxx 格式
              const qualifierMatch = linePrefix.match(QUERY_EDITOR_SQL_QUALIFIER_COMPLETION_REGEX);
              if (qualifierMatch) {
                  const qualifier = stripQuotes(qualifierMatch[1]);
                  const prefix = (qualifierMatch[2] || '').toLowerCase();
                  const qualifierLower = qualifier.toLowerCase();

                  // 首先检查 qualifier 是否是数据库名（跨库表提示）
                  const visibleDbs = sharedVisibleDbs;
                  if (visibleDbs.some(db => db.toLowerCase() === qualifierLower)) {
                      // qualifier 是数据库名，提示该库的表
                      let tables = sharedTablesData.filter(t =>
                          (t.dbName || '').toLowerCase() === qualifierLower
                      );
                      if (tables.length === 0) {
                          tables = await getLazyTablesByDB(qualifier);
                          if (isSqlCompletionRequestCancelled(token)) {
                              return createEmptySqlCompletionResult();
                          }
                      }
                      const filtered = prefix
                          ? tables.filter(t => (t.tableName || '').toLowerCase().startsWith(prefix))
                          : tables;

                      const suggestions = filtered.map(t => ({
                          label: t.tableName,
                          kind: monaco.languages.CompletionItemKind.Class,
                          insertText: quoteCompletionPath(t.tableName),
                          detail: appendCommentToDetail(`${translate('query_editor.object_info.table')} (${t.dbName})`, t.comment),
                          documentation: buildCompletionDocumentation(t.comment),
                          range,
                          sortText: '0' + t.tableName
                      }));
                      return { suggestions };
                  }

                  // qualifier 是 schema（如 dbo/public）时，仅补全表名，避免输入 dbo. 后再补成 dbo.dbo.table
                  const schemaTables = sharedTablesData
                      .map(t => {
                          const parsed = splitSchemaAndTable(t.tableName || '');
                          return {
                              dbName: t.dbName || '',
                              schema: parsed.schema,
                              table: parsed.table,
                              comment: t.comment,
                          };
                      })
                      .filter(t => t.schema.toLowerCase() === qualifierLower && !!t.table);

                  if (schemaTables.length > 0) {
                      const filtered = prefix
                          ? schemaTables.filter(t => t.table.toLowerCase().startsWith(prefix))
                          : schemaTables;

                      const suggestions = filtered.map(t => ({
                          label: t.table,
                          kind: monaco.languages.CompletionItemKind.Class,
                          insertText: quoteCompletionPart(t.table),
                          detail: appendCommentToDetail(`${translate('query_editor.object_info.table')} (${t.dbName}${t.schema ? '.' + t.schema : ''})`, t.comment),
                          documentation: buildCompletionDocumentation(t.comment),
                          range,
                          sortText: '0' + t.table
                      }));
                      return { suggestions };
                  }

                  // 否则检查是否是表别名或表名，提示列
                  const aliasMap = buildQueryEditorAliasMap(fullText, sharedCurrentDb || '');

                  const tableInfo = aliasMap[qualifier.toLowerCase()];
                  if (tableInfo) {
                      const cols = await getCompletionColumnsByTable(tableInfo.dbName, tableInfo.tableName);
                      if (isSqlCompletionRequestCancelled(token)) {
                          return createEmptySqlCompletionResult();
                      }

                      const filtered = prefix
                          ? cols.filter(c => (c.name || '').toLowerCase().startsWith(prefix))
                          : cols;

                      const suggestions = filtered.map(c => ({
                          label: c.name,
                          kind: monaco.languages.CompletionItemKind.Field,
                          insertText: quoteCompletionPart(c.name),
                          detail: appendCommentToDetail(
                              c.type ? `${c.type} (${c.dbName ? c.dbName + '.' : ''}${c.tableName})` : (c.tableName ? `(${c.tableName})` : ''),
                              c.comment,
                          ),
                          documentation: buildCompletionDocumentation(c.comment),
                          range,
                          sortText: '0' + c.name
                      }));
                      return { suggestions };
                  }
              }

              // 2) global/table/column completion
              const tableRegex = QUERY_EDITOR_SQL_TABLE_REFERENCE_REGEX;
              tableRegex.lastIndex = 0;
              const foundTables = new Set<string>();
              let match;
              while ((match = tableRegex.exec(fullText)) !== null) {
                  const t = normalizeQualifiedName(match[1] || '');
                  if (!t) continue;
                  // 存储完整标识 db.table 或 table
                  foundTables.add(t.toLowerCase());
              }

              const currentDatabase = sharedCurrentDb || '';
              const wordPrefix = (word.word || '').toLowerCase();
              const startsWithPrefix = (candidate: string) => !wordPrefix || candidate.toLowerCase().startsWith(wordPrefix);
              const includesWordPrefix = (candidate: string) => !wordPrefix || String(candidate || '').toLowerCase().includes(wordPrefix);
              const getPrefixMatchRank = (...candidates: string[]) => {
                  if (!wordPrefix) return '0';
                  const normalized = candidates
                      .map((candidate) => String(candidate || '').toLowerCase())
                      .filter(Boolean);
                  if (normalized.some((candidate) => candidate.startsWith(wordPrefix))) return '0';
                  if (normalized.some((candidate) => candidate.includes(wordPrefix))) return '1';
                  return '9';
              };
              const expectsTableName = /\b(?:FROM|JOIN|UPDATE|INTO|DELETE\s+FROM|TABLE|DESCRIBE|DESC|EXPLAIN)\s+[`"]?[\w.]*$/i.test(linePrefix.trim());
              const shouldBoostKeywords = !expectsTableName
                  && wordPrefix.length > 0
                  && dialectKeywords.some((keyword) => keyword.toLowerCase().startsWith(wordPrefix));
              const sortGroups = shouldBoostKeywords
                  ? { keyword: '00', func: '05', columnCurrent: '10', columnOther: '11', tableCurrent: '20', tableOther: '21', db: '30' }
                  : expectsTableName
                      ? { keyword: '20', func: '25', columnCurrent: '10', columnOther: '11', tableCurrent: '00', tableOther: '01', db: '30' }
                      : { keyword: '30', func: '25', columnCurrent: '00', columnOther: '01', tableCurrent: '10', tableOther: '11', db: '20' };
              let completionTables = sharedTablesData;
              if (
                  expectsTableName
                  && currentDatabase
                  && !sharedTablesData.some((t) => (t.dbName || '').toLowerCase() === currentDatabase.toLowerCase())
              ) {
                  const lazyTables = await getLazyTablesByDB(currentDatabase);
                  if (isSqlCompletionRequestCancelled(token)) {
                      return createEmptySqlCompletionResult();
                  }
                  if (lazyTables.length > 0) {
                      const seenTableKeys = new Set<string>();
                      completionTables = [...sharedTablesData, ...lazyTables].filter((table) => {
                          const key = `${String(table.dbName || '').toLowerCase()}.${String(table.tableName || '').toLowerCase()}`;
                          if (seenTableKeys.has(key)) return false;
                          seenTableKeys.add(key);
                          return true;
                      });
                  }
              }

              const referencedColumns: CompletionColumnMeta[] = [];
              if (!expectsTableName) {
                  const aliasMapForReferencedTables = buildQueryEditorAliasMap(fullText, currentDatabase);
                  const seenReferencedTables = new Set<string>();
                  for (const tableInfo of Object.values(aliasMapForReferencedTables)) {
                      const key = `${String(tableInfo.dbName || '').toLowerCase()}.${String(tableInfo.tableName || '').toLowerCase()}`;
                      if (!tableInfo.dbName || !tableInfo.tableName || seenReferencedTables.has(key)) continue;
                      seenReferencedTables.add(key);
                      const preloaded = findPreloadedColumns(tableInfo.dbName, tableInfo.tableName);
                      if (preloaded.length > 0) continue;
                      const cols = await getCompletionColumnsByTable(tableInfo.dbName, tableInfo.tableName);
                      if (isSqlCompletionRequestCancelled(token)) {
                          return createEmptySqlCompletionResult();
                      }
                      referencedColumns.push(...cols);
                  }
              }
              const completionColumns = referencedColumns.length > 0
                  ? [...sharedAllColumnsData, ...referencedColumns]
                  : sharedAllColumnsData;

              // 相关列提示：匹配 SQL 中引用的表（FROM/JOIN 等）
              // 权重最高，输入 WHERE 条件时优先显示
              const relevantColumns = (expectsTableName ? [] : completionColumns)
                  .filter(c => {
                      const fullIdent = `${c.dbName}.${c.tableName}`.toLowerCase();
                      const shortIdent = (c.tableName || '').toLowerCase();
                      // 对 schema.table 格式，也用纯表名部分匹配（如 public.users → users）
                      const parsed = splitSchemaAndTable(c.tableName || '');
                      const pureIdent = (parsed.table || '').toLowerCase();
                      return (foundTables.has(fullIdent) || foundTables.has(shortIdent) || (pureIdent && foundTables.has(pureIdent))) && startsWithPrefix(c.name || '');
                  })
                  .map(c => {
                      // 当前库的表字段优先级更高
                      const isCurrentDb = (c.dbName || '').toLowerCase() === currentDatabase.toLowerCase();
                      return {
                          label: c.name,
                          kind: monaco.languages.CompletionItemKind.Field,
                          insertText: quoteCompletionPart(c.name),
                          detail: appendCommentToDetail(`${c.type} (${c.dbName}.${c.tableName})`, c.comment),
                          documentation: buildCompletionDocumentation(c.comment),
                          range,
                          sortText: isCurrentDb ? sortGroups.columnCurrent + c.name : sortGroups.columnOther + c.name,
                      };
                  });

              // 表提示：当前库智能处理 schema.table 格式
              // 1. 构建纯表名到 schema 列表的映射，检测同名表
              const currentDbTables = completionTables.filter(t =>
                  (t.dbName || '').toLowerCase() === currentDatabase.toLowerCase()
              );
              const tableNameToSchemas = new Map<string, string[]>();
              for (const t of currentDbTables) {
                  const parsed = splitSchemaAndTable(t.tableName || '');
                  const pureTable = (parsed.table || t.tableName || '').toLowerCase();
                  const schemas = tableNameToSchemas.get(pureTable) || [];
                  schemas.push(parsed.schema || '');
                  tableNameToSchemas.set(pureTable, schemas);
              }

              const tableSuggestions = completionTables
                .filter(t => {
                    const isCurrentDb = (t.dbName || '').toLowerCase() === currentDatabase.toLowerCase();
                    const parsed = splitSchemaAndTable(t.tableName || '');
                    const pureTable = parsed.table || t.tableName || '';
                    if (!isCurrentDb) {
                        // 跨库：用 db.table 格式匹配
                        return includesWordPrefix(`${t.dbName}.${t.tableName}`)
                            || includesWordPrefix(t.tableName || '')
                            || includesWordPrefix(pureTable);
                    }
                    // 当前库：同时用完整名和纯表名匹配
                    return includesWordPrefix(t.tableName || '') || includesWordPrefix(pureTable);
                })
                .map(t => {
                  const isCurrentDb = (t.dbName || '').toLowerCase() === currentDatabase.toLowerCase();
                  const parsed = splitSchemaAndTable(t.tableName || '');
                  const pureTable = parsed.table || t.tableName || '';
                  if (!isCurrentDb) {
                      const label = `${t.dbName}.${t.tableName}`;
                      return {
                          label,
                          kind: monaco.languages.CompletionItemKind.Class,
                          insertText: quoteCompletionPath(label),
                          detail: appendCommentToDetail(`${translate('query_editor.object_info.table')} (${t.dbName})`, t.comment),
                          documentation: buildCompletionDocumentation(t.comment),
                          range,
                          sortText: sortGroups.tableOther + getPrefixMatchRank(`${t.dbName}.${t.tableName}`, t.tableName || '', pureTable) + t.tableName,
                      };
                  }
                  // 当前库：检查是否有跨 schema 同名表
                  const schemas = tableNameToSchemas.get(pureTable.toLowerCase()) || [];
                  const hasDuplicate = schemas.length > 1;
                  // 同名表存在于多个 schema → 显示 schema.table；否则只显示纯表名
                  const label = hasDuplicate ? t.tableName : pureTable;
                  const insertText = quoteCompletionPath(hasDuplicate ? t.tableName : pureTable);
                  const schemaInfo = parsed.schema ? ` (${parsed.schema})` : '';
                  return {
                      label,
                      kind: monaco.languages.CompletionItemKind.Class,
                      insertText,
                      detail: appendCommentToDetail(`${translate('query_editor.object_info.table')}${schemaInfo}`, t.comment),
                      documentation: buildCompletionDocumentation(t.comment),
                      range,
                      sortText: sortGroups.tableCurrent + getPrefixMatchRank(t.tableName || '', pureTable) + pureTable,
                  };
              });

              // 数据库提示
              const dbSuggestions = sharedVisibleDbs
                  .filter((db) => startsWithPrefix(db))
                  .map(db => ({
                      label: db,
                      kind: monaco.languages.CompletionItemKind.Module,
                      insertText: db,
                      detail: translate('query_editor.object_info.database'),
                      range,
                      sortText: sortGroups.db + db,
                  }));

              // 关键字提示
              const keywordSuggestions = dialectKeywords
                  .filter((k) => startsWithPrefix(k))
                  .map(k => ({
                  label: k,
                  kind: monaco.languages.CompletionItemKind.Keyword,
                  insertText: k,
                  range,
                  sortText: sortGroups.keyword + k,
              }));

              // 内置函数提示
              const funcSuggestions = dialectFunctions
                  .filter((f) => startsWithPrefix(f.name))
                  .map(f => ({
                      label: f.name,
                      kind: monaco.languages.CompletionItemKind.Function,
                      insertText: f.name + '($0)',
                      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                      detail: f.detail,
                      range,
                      sortText: sortGroups.func + f.name,
                  }));

              const suggestions = [
                  ...relevantColumns,   // FROM 表的列最优先
                  ...tableSuggestions,  // 表次之
                  ...dbSuggestions,     // 数据库
                  ...funcSuggestions,   // 内置函数
                  ...keywordSuggestions // 关键字最后
              ];
              return { suggestions };
          }
      }));
      sqlCompletionDisposables.push(monaco.languages.registerCompletionItemProvider('sql', {
          triggerCharacters: ['/'],
          provideCompletionItems: (model: any, position: any) => {
              const lineContent = model.getLineContent(position.lineNumber);
              const textBefore = lineContent.substring(0, position.column - 1).trimStart();
              if (!textBefore.startsWith('/')) {
                  return { suggestions: [] };
              }

              const range = {
                  startLineNumber: position.lineNumber,
                  endLineNumber: position.lineNumber,
                  startColumn: position.column - textBefore.length,
                  endColumn: position.column,
              };

              return {
                  suggestions: ((window as any).__gonaviSlashCmdDefs || []).map((c: any, i: number) => ({
                      label: `${c.cmd}  ${c.label}`,
                      kind: monaco.languages.CompletionItemKind.Event,
                      detail: c.desc,
                      insertText: `__AI_${c.cmd.slice(1).toUpperCase()}__`,
                      range,
                      sortText: String(i).padStart(2, '0'),
                  })),
              };
          },
      }));


      // SQL snippet completion provider
      sqlCompletionDisposables.push(monaco.languages.registerCompletionItemProvider('sql', {
          provideCompletionItems: (model: any, position: any) => {
              const word = model.getWordUntilPosition(position);
              const prefix = word.word.toLowerCase();
              if (!prefix) return createEmptySqlCompletionResult();

              const range = {
                  startLineNumber: position.lineNumber,
                  endLineNumber: position.lineNumber,
                  startColumn: word.startColumn,
                  endColumn: word.endColumn,
              };

              const allSnippets = useStore.getState().sqlSnippets || [];
              const matched = allSnippets.filter(s =>
                  s.prefix.toLowerCase().startsWith(prefix) ||
                  s.name.toLowerCase().includes(prefix)
              );

              return {
                  suggestions: matched.map(s => ({
                      label: s.prefix,
                      kind: monaco.languages.CompletionItemKind.Snippet,
                      insertText: s.body,
                      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                      detail: s.name,
                      documentation: s.syntaxHelp || s.description || s.body,
                      range,
                      sortText: '04' + s.prefix,
                  })),
              };
          },
      }));

      } // end sqlCompletionRegistered guard

      // 每个编辑器实例都注册内容变化监听（检测斜杠命令标记）
      let _handlingSlash = false;
      editor.onDidChangeModelContent((event: any) => {
          if (_handlingSlash) return;
          const hasSlashCommandMarker = Array.isArray(event?.changes)
              && event.changes.some((change: any) => /__AI_\w+__/.test(String(change?.text || '')));
          if (!hasSlashCommandMarker) return;
          const model = editor.getModel();
          if (!model) return;
          const content = model.getValue();
          const markerMatch = content.match(/__AI_(\w+)__/);
          if (!markerMatch) return;

          const cmdKey = markerMatch[1].toLowerCase();
          const defs = (window as any).__gonaviSlashCmdDefs || [];
          const cmdDef = defs.find((c: any) => c.cmd === `/${cmdKey}`);
          if (!cmdDef) return;

          // 清除标记文本（带递归保护）
          _handlingSlash = true;
          const fullText = model.getValue();
          const newText = fullText.replace(markerMatch[0], '').replace(/^\s*\n/, '');
          model.setValue(newText);
          _handlingSlash = false;

          // 组装 prompt
          const conn = connectionsRef.current.find(c => c.id === currentConnectionIdRef.current);
          const ctxText = buildQueryEditorAiContextPrompt(conn, currentDbRef.current);
          let finalPrompt = ctxText + cmdDef.prompt;
          if (cmdDef.useSelection) {
              const sel = editor.getSelection();
              const selText = sel ? model.getValueInRange(sel) : '';
              finalPrompt = finalPrompt.replace(QUERY_EDITOR_SQL_PROMPT_PLACEHOLDER, selText || getCurrentQuery());
          }

          // 打开 AI 面板并注入 prompt
          const store = useStore.getState();
          if (!store.aiPanelVisible) {
              store.setAIPanelVisible(true);
          }
          setTimeout(() => {
              window.dispatchEvent(new CustomEvent('gonavi:ai:inject-prompt', { detail: { prompt: finalPrompt } }));
          }, store.aiPanelVisible ? 0 : 350);
      });
  };

  const handleFormat = () => {
      try {
          const activeConnectionId = String(currentConnectionIdRef.current || '').trim();
          const tabConnectionId = String(tab.connectionId || '').trim();
          const conn = connectionsRef.current.find(c => c.id === activeConnectionId)
              || (tabConnectionId && tabConnectionId !== activeConnectionId
                  ? connectionsRef.current.find(c => c.id === tabConnectionId)
                  : undefined);
          const formatterLanguage = resolveQueryEditorFormatterLanguage(conn);
          const sourceSql = getCurrentQuery();
          const formatted = format(sourceSql, { language: formatterLanguage, keywordCase: sqlFormatOptions.keywordCase });
          if (sourceSql === formatted) {
              return;
          }
          updateQueryTabDraft(tab.id, {
              formatRestoreSnapshot: {
                  query: sourceSql,
                  createdAt: Date.now(),
              },
          });
          const editor = editorRef.current;
          const monaco = monacoRef.current;
          const model = editor?.getModel?.();
          if (editor && monaco && model) {
              const currentValue = String(model.getValue?.() || sourceSql);
              if (currentValue === formatted) {
                  return;
              }
              const fullRange = model.getFullModelRange?.()
                  || new monaco.Range(1, 1, model.getLineCount?.() || 1, model.getLineMaxColumn?.(model.getLineCount?.() || 1) || 1);
              editor.pushUndoStop?.();
              editor.executeEdits?.('gonavi-format-sql', [{
                  range: fullRange,
                  text: formatted,
                  forceMoveMarkers: true,
              }]);
              editor.pushUndoStop?.();
              const nextValue = editor.getValue?.();
              applyQueryState(typeof nextValue === 'string' ? nextValue : formatted);
              refreshObjectDecorations();
              return;
      }
      syncQueryToEditor(formatted);
  } catch (e) {
          void message.error(translate('query_editor.message.format_failed'));
      }
  };

  const handleRestoreLastFormat = () => {
      const previousQuery = tab.formatRestoreSnapshot?.query;
      if (!previousQuery) {
          void message.info(translate('query_editor.message.no_format_restore_snapshot'));
          return;
      }
      syncQueryToEditor(previousQuery);
      updateQueryTabDraft(tab.id, {
          query: previousQuery,
          formatRestoreSnapshot: undefined,
      });
      refreshObjectDecorations();
      void message.success(translate('query_editor.message.format_restore_success'));
  };

  const handleAIAction = (action: 'generate' | 'explain' | 'optimize' | 'schema') => {
      const editor = editorRef.current;
      const selection = editor?.getModel()?.getValueInRange(editor.getSelection()) || '';
      const fullSQL = getCurrentQuery();

      const conn = connections.find(c => c.id === currentConnectionId);
      const ctxText = buildQueryEditorAiContextPrompt(conn, currentDb);

      const prompts: Record<string, string> = {
          generate: `${ctxText}${translate('query_editor.ai_prompt.generate')}`,
          explain: `${ctxText}${translate('query_editor.ai_prompt.explain', { sql: selection || fullSQL || QUERY_EDITOR_SQL_PROMPT_PLACEHOLDER })}`,
          optimize: `${ctxText}${translate('query_editor.ai_prompt.optimize', { sql: selection || fullSQL || QUERY_EDITOR_SQL_PROMPT_PLACEHOLDER })}`,
          schema: `${ctxText}${translate('query_editor.ai_prompt.schema')}`,
      };

      const store = useStore.getState();
      if (!store.aiPanelVisible) {
          store.setAIPanelVisible(true);
      }
      window.dispatchEvent(new CustomEvent('gonavi:ai:inject-prompt', { detail: { prompt: prompts[action] } }));
  };

  const formatSettingsMenu: MenuProps['items'] = [
      { 
          key: 'upper', 
          label: translate('query_editor.format.keyword_upper'),
          icon: sqlFormatOptions.keywordCase === 'upper' ? '✓' : undefined,
          onClick: () => setSqlFormatOptions({ keywordCase: 'upper' }) 
      },
      { 
          key: 'lower', 
          label: translate('query_editor.format.keyword_lower'),
          icon: sqlFormatOptions.keywordCase === 'lower' ? '✓' : undefined,
          onClick: () => setSqlFormatOptions({ keywordCase: 'lower' }) 
      },
      { type: 'divider' },
      {
          key: 'restore-last-format',
          label: translate('query_editor.format.restore_last_format'),
          disabled: !tab.formatRestoreSnapshot?.query,
          onClick: handleRestoreLastFormat,
      },
      { type: 'divider' },
      {
          key: 'snippet-settings',
          label: translate('query_editor.format.snippet_settings'),
          onClick: () => window.dispatchEvent(new CustomEvent('gonavi:open-snippet-settings')),
      },
      {
          key: 'shortcut-settings',
          label: translate('query_editor.format.shortcut_settings'),
          onClick: () => window.dispatchEvent(new CustomEvent('gonavi:open-shortcut-settings')),
      },
  ];

  const splitSQLStatements = (sql: string): string[] => {
    return findSqlStatementRanges(sql).map((range) => range.text);
  };

  const getSelectedSQL = (): string => {
      const editor = editorRef.current;
      if (!editor) return '';
      const model = editor.getModel?.();
      const selection = editor.getSelection?.();
      if (!model || !selection) return '';

      const selected = model.getValueInRange?.(selection) || '';
      if (typeof selected !== 'string') return '';
      if (!selected.trim()) return '';
      return selected;
  };

  const buildResultSetMergeKey = (result: ResultSet): string => {
      const sqlKey = normalizeExecutedSqlKey(result.exportSql || result.sql);
      const sourceStatementIndex = Number(result.sourceStatementIndex || 1);
      const statementResultIndex = Number(result.statementResultIndex || 1);
      return `${sqlKey}::${sourceStatementIndex}::${statementResultIndex}`;
  };

  const mergeResultSets = (previous: ResultSet[], next: ResultSet[], replaceAll: boolean): ResultSet[] => {
      if (replaceAll || previous.length === 0) {
          return next.map((result, index) => ({ ...result, key: `result-${index + 1}` }));
      }

      const merged = [...previous];
      next.forEach((result) => {
          const incomingKey = buildResultSetMergeKey(result);
          const existingIndex = merged.findIndex((item) => buildResultSetMergeKey(item) === incomingKey);
          if (existingIndex >= 0) {
              merged[existingIndex] = { ...result, key: merged[existingIndex].key };
              return;
          }
          merged.push({ ...result, key: `result-${resolveNextResultSetIndex(merged)}` });
      });
      return merged;
  };

  const isDisplayableResultSet = (result?: ResultSet | null): boolean => {
      if (!result) {
          return false;
      }
      if (Array.isArray(result.messages) && result.messages.length > 0) {
          return true;
      }
      if (Array.isArray(result.columns) && result.columns.length > 0) {
          return true;
      }
      if (Array.isArray(result.rows) && result.rows.length > 0) {
          return true;
      }
      return false;
  };

  const isAffectedRowsResultSet = (result?: ResultSet | null): boolean =>
      Boolean(
          result &&
          Array.isArray(result.columns) &&
          result.columns.length === 1 &&
          result.columns[0] === 'affectedRows',
      );

  const isMessageLikeResultSet = (result?: ResultSet | null): boolean =>
      Boolean(
          result &&
          Array.isArray(result.messages) &&
          result.messages.length > 0 &&
          result.resultType !== 'grid',
      );

  const isConcreteGridResultSet = (result?: ResultSet | null): boolean =>
      Boolean(
          result &&
          result.resultType !== 'message' &&
          !isAffectedRowsResultSet(result) &&
          (
              (Array.isArray(result.columns) && result.columns.length > 0) ||
              (Array.isArray(result.rows) && result.rows.length > 0)
          ),
      );

  const resolveActiveResultKeyAfterMerge = (merged: ResultSet[], executed: ResultSet[]): string => {
      const firstExecutedResult = executed.find((result) => isConcreteGridResultSet(result))
          || executed.find((result) => isMessageLikeResultSet(result))
          || executed.find((result) => isDisplayableResultSet(result) && !isAffectedRowsResultSet(result))
          || executed.find((result) => isDisplayableResultSet(result))
          || executed[0];
      if (!firstExecutedResult) {
          return '';
      }
      const executedSqlKey = buildResultSetMergeKey(firstExecutedResult);
      return merged.find((item) => buildResultSetMergeKey(item) === executedSqlKey)?.key
          || firstExecutedResult.key
          || merged[0]?.key
          || '';
  };

  const resolveExecutableSQLAtEditorPosition = (model: any, sqlText: string, position: any): string => {
      const normalizedPosition = normalizeEditorPosition(position);
      if (!normalizedPosition) return '';
      const cursorOffset = getNormalizedOffsetAtPosition(sqlText, normalizedPosition);
      const resolved = resolveExecutableSql(sqlText, cursorOffset, '');
      return resolved?.sql || '';
  };

  const getExecutableSQLAtCurrentCursor = (model: any, sqlText: string): string => {
      const editor = editorRef.current;
      const liveSelection = normalizeEditorPosition(editor?.getSelection?.());
      if (liveSelection) {
          return resolveExecutableSQLAtEditorPosition(model, sqlText, liveSelection);
      }

      const livePosition = normalizeEditorPosition(editor?.getPosition?.());
      const cachedPosition = normalizeEditorPosition(lastEditorCursorPositionRef.current);
      const candidates: Array<{ lineNumber: number; column: number }> = [];
      if (cachedPosition) candidates.push(cachedPosition);
      if (livePosition) candidates.push(livePosition);
      const seen = new Set<string>();

      for (const position of candidates) {
          const key = `${position.lineNumber}:${position.column}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const sql = resolveExecutableSQLAtEditorPosition(model, sqlText, position);
          if (sql.trim()) return sql;
      }

      const fallbackPosition = cachedPosition || livePosition;
      return resolveExecutableSQLAtEditorPosition(model, sqlText, fallbackPosition);
  };

  const getExecutableSQL = (): string => {
      const editor = editorRef.current;
      const model = editor?.getModel?.();
      const currentQuery = getCurrentQuery();
      const selectedSQL = getSelectedSQL();
      const selected = selectedSQL.trim();
      if (!selected && resultSets.length > 0 && lastExecutedEditorQueryRef.current && currentQuery.startsWith(lastExecutedEditorQueryRef.current)) {
          const appendedSQL = currentQuery.slice(lastExecutedEditorQueryRef.current.length);
          if (appendedSQL.trim()) {
              return appendedSQL;
          }
      }
      if (!model || !editor) {
          return selectedSQL || currentQuery;
      }

      if (selected) {
          return selectedSQL;
      }
      return getExecutableSQLAtCurrentCursor(model, String(model.getValue?.() ?? currentQuery));
  };

  const captureEditorCursorPosition = (event?: React.MouseEvent<HTMLElement>) => {
      event?.preventDefault();
      const editor = editorRef.current;
      const position = normalizeEditorPosition(editor?.getSelection?.()) || normalizeEditorPosition(editor?.getPosition?.());
      if (position) {
          lastEditorCursorPositionRef.current = position;
      }
  };

  // 精准重查询单个结果集（提交事务 / 刷新按钮使用），不会重跑整个编辑器 SQL
  const handleReloadResult = async (resultKey: string, sql: string) => {
      if (!sql?.trim() || !currentDb) return;
      const conn = connections.find(c => c.id === currentConnectionId);
      if (!conn) return;
      const currentResult = resultSets.find((item) => item.key === resultKey);
      const statementResultIndex = Math.max(1, Number(currentResult?.statementResultIndex || 1));

      const config = {
          ...conn.config,
          port: Number(conn.config.port),
          password: conn.config.password || "",
          database: conn.config.database || "",
          useSSH: conn.config.useSSH || false,
          ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
      };

      try {
          setLoading(true);
          // 使用 DBQueryMulti 保持和首次查询一致的后端路径
          let queryId: string;
          try {
              queryId = await GenerateQueryID();
          } catch {
              queryId = 'reload-' + Date.now();
          }
          const res = await DBQueryMulti(buildRpcConnectionConfig(config) as any, currentDb, sql, queryId);
          if (!res?.success) {
              message.error(translate('query_editor.message.refresh_failed', {
                  error: formatSqlExecutionError(res?.message || translate('common.unknown')),
              }));
              return;
          }

          const resultSetDataArray = Array.isArray(res.data) ? (res.data as any[]) : [];
          const rsData = resultSetDataArray[Math.max(0, statementResultIndex - 1)];
          if (!rsData) return;
          const isAffectedResult = Array.isArray(rsData.rows) && rsData.rows.length === 1
              && rsData.columns && rsData.columns.length === 1
              && rsData.columns[0] === 'affectedRows';
          if (isAffectedResult) return; // 不应该出现，但保险起见

          let rows = Array.isArray(rsData.rows) ? rsData.rows : [];
          const maxRows = Number(queryOptions?.maxRows) || 0;
          let truncated = false;
          if (Number.isFinite(maxRows) && maxRows > 0 && rows.length > maxRows) {
              truncated = true;
              rows = rows.slice(0, maxRows);
          }
          const cols = (rsData.columns && rsData.columns.length > 0)
              ? rsData.columns
              : (rows.length > 0 ? Object.keys(rows[0]) : []);
          rows.forEach((row: any, i: number) => {
              if (row && typeof row === 'object') row[GONAVI_ROW_KEY] = i;
          });

          // 只更新匹配的结果集的 rows 和 columns，保留 tableName/pkColumns/readOnly 等元数据
          setResultSets(prev => prev.map(rs =>
              rs.key === resultKey
                  ? {
                      ...rs,
                      rows,
                      columns: cols,
                      messages: Array.isArray(rsData.messages) ? rsData.messages : [],
                      resultType: ((!Array.isArray(rsData.rows) || rsData.rows.length === 0) && (!Array.isArray(rsData.columns) || rsData.columns.length === 0) && Array.isArray(rsData.messages) && rsData.messages.length > 0)
                          ? 'message'
                          : 'grid',
                      truncated,
                  }
                  : rs
          ));
      } catch (err: any) {
          message.error(translate('query_editor.message.refresh_failed', {
              error: formatSqlExecutionError(err?.message || err || translate('common.unknown')),
          }));
      } finally {
          setLoading(false);
      }
  };

  const handleResultPageChange = async (resultKey: string, page: number, pageSize: number) => {
      const target = resultSets.find((item) => item.key === resultKey);
      if (!target?.page?.baseSql || !currentDb) return;
      const conn = connections.find(c => c.id === currentConnectionId);
      if (!conn) return;
      const safePage = Math.max(1, Math.floor(Number(page) || 1));
      const safePageSize = Math.max(1, Math.floor(Number(pageSize) || target.page.pageSize || 1));
      const config = {
          ...conn.config,
          port: Number(conn.config.port),
          password: conn.config.password || "",
          database: conn.config.database || "",
          useSSH: conn.config.useSSH || false,
          ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
      };
      const dbType = String(config.type || 'mysql');
      const driver = String((config as any).driver || '');
      const normalizedDbType = String(resolveSqlDialect(dbType, driver, {
          oceanBaseProtocol: String((config as any).oceanBaseProtocol || ''),
      })).toLowerCase();
      const pageSql = buildQueryResultPageSql({
          baseSql: target.page.baseSql,
          dbType: normalizedDbType,
          driver,
          page: safePage,
          pageSize: safePageSize,
          lookahead: true,
      });

      try {
          setLoading(true);
          setResultSets(prev => prev.map(rs =>
              rs.key === resultKey && rs.page
                  ? { ...rs, page: { ...rs.page, loading: true } }
                  : rs
          ));
          let queryId: string;
          try {
              queryId = await GenerateQueryID();
          } catch {
              queryId = 'query-page-' + Date.now();
          }
          const res = await DBQueryMulti(buildRpcConnectionConfig(config) as any, currentDb, pageSql, queryId);
          if (!res?.success) {
              message.error(translate('query_editor.message.page_query_failed', {
                  error: formatSqlExecutionError(res?.message || translate('common.unknown')),
              }));
              return;
          }

          const resultSetDataArray = Array.isArray(res.data) ? (res.data as any[]) : [];
          const rsData = resultSetDataArray[0];
          if (!rsData) {
              message.warning(translate('query_editor.message.page_query_empty'));
              return;
          }
          const rawRows = Array.isArray(rsData.rows) ? rsData.rows : [];
          const hasNext = rawRows.length > safePageSize;
          const rows = rawRows.slice(0, safePageSize);
          const rowKeyOffset = (safePage - 1) * safePageSize;
          rows.forEach((row: any, i: number) => {
              if (row && typeof row === 'object') row[GONAVI_ROW_KEY] = rowKeyOffset + i;
          });
          const cols = (rsData.columns && rsData.columns.length > 0)
              ? rsData.columns
              : (rows.length > 0 ? Object.keys(rows[0]) : target.columns);
          const totalState = resolveQueryResultPaginationTotal({
              current: safePage,
              pageSize: safePageSize,
              rowCount: rows.length,
              hasNext,
          });
          setResultSets(prev => prev.map(rs =>
              rs.key === resultKey && rs.page
                  ? {
                      ...rs,
                      rows,
                      columns: cols,
                      messages: Array.isArray(rsData.messages) ? rsData.messages : [],
                      resultType: 'grid',
                      truncated: false,
                      page: {
                          ...rs.page,
                          current: safePage,
                          pageSize: safePageSize,
                          ...totalState,
                          loading: false,
                      },
                  }
                  : rs
          ));
      } catch (err: any) {
          message.error(translate('query_editor.message.page_query_failed', {
              error: formatSqlExecutionError(err?.message || err || translate('common.unknown')),
          }));
      } finally {
          setLoading(false);
          setResultSets(prev => prev.map(rs =>
              rs.key === resultKey && rs.page?.loading
                  ? { ...rs, page: { ...rs.page, loading: false } }
                  : rs
          ));
      }
  };

  const handleRun = async () => {
    const currentQuery = getCurrentQuery();
    if (!currentQuery.trim()) return;
    const executableSQL = getExecutableSQL();
    if (!executableSQL.trim()) {
        message.info(translate('query_editor.message.no_executable_sql'));
        setResultSets([]);
        setActiveResultKey('');
        return;
    }
    if (!currentDb) {
        message.error(translate('query_editor.message.select_database_first'));
        return;
    }
    // 如果已有查询在运行，先取消它
    if (currentQueryIdRef.current) {
        try {
            await CancelQuery(currentQueryIdRef.current);
        } catch (error) {
            // 忽略取消错误，可能查询已完成
        }
        // 清除旧查询ID
        clearQueryId();
    }
      const runSeq = ++runSeqRef.current;
      setLoading(true);
      setExecutionError('');
      const runStartTime = Date.now();
    const conn = connections.find(c => c.id === currentConnectionId);
    if (!conn) {
        message.error(translate('query_editor.message.connection_not_found'));
        if (runSeqRef.current === runSeq) setLoading(false);
        return;
    }
    const connCaps = getDataSourceCapabilities(conn.config);
    if (!connCaps.supportsQueryEditor) {
        message.error(translate('query_editor.message.unsupported_source'));
        if (runSeqRef.current === runSeq) setLoading(false);
        return;
    }

    const config = {
        ...conn.config,
        port: Number(conn.config.port),
        password: conn.config.password || "",
        database: conn.config.database || "",
        useSSH: conn.config.useSSH || false,
        ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" },
        timeout: Math.max(Number(conn.config.timeout) || 30, 120),
    };

    try {
        const rawSQL = executableSQL;
        const rpcConfig = buildRpcConnectionConfig(config) as any;
        const dbType = String(rpcConfig.type || 'mysql');
        const driver = String((config as any).driver || '');
        const normalizedDbType = String(resolveSqlDialect(dbType, driver, {
            oceanBaseProtocol: (config as any).oceanBaseProtocol,
        })).trim().toLowerCase();
        const normalizedRawSQL = String(rawSQL || '').replace(/；/g, ';');

        // MongoDB 仍走逐条执行的旧路径
        const isMongoDB = normalizedDbType === 'mongodb';

        if (isMongoDB) {
            // MongoDB: 保持逐条执行
            const splitInput = normalizedRawSQL
                .replace(/^\s*\/\/.*$/gm, '')
                .replace(/^\s*#.*$/gm, '');
            const statements = splitSQLStatements(splitInput);
            const didExecuteAppendedSql = resultSets.length > 0
                && lastExecutedEditorQueryRef.current
                && currentQuery.startsWith(lastExecutedEditorQueryRef.current)
                && normalizedRawSQL.trim() === currentQuery.slice(lastExecutedEditorQueryRef.current.length).replace(/；/g, ';').trim();
            const didExecuteWholeEditor = areSqlStatementListsEqual(
                splitSQLStatements(currentQuery.replace(/；/g, ';')),
                statements,
            );
            if (statements.length === 0) {
                message.info(translate('query_editor.message.no_executable_sql'));
                setResultSets([]);
                setActiveResultKey('');
                return;
            }

            const nextResultSets: ResultSet[] = [];
            const maxRows = Number(queryOptions?.maxRows) || 0;
            const wantsLimitProbe = Number.isFinite(maxRows) && maxRows > 0;
            let anyTruncated = false;

            for (let idx = 0; idx < statements.length; idx++) {
                const rawStatement = statements[idx];
                let executedSql = rawStatement;
                const shellConvert = convertMongoShellToJsonCommand(executedSql);
                if (shellConvert.recognized) {
                    if (shellConvert.error) {
                        const prefix = statements.length > 1
                            ? translate('query_editor.message.statement_failed_prefix', { index: idx + 1 })
                            : '';
                        updateResultPanelVisibility(true);
                        setExecutionError(formatSqlExecutionError(shellConvert.error, { prefix }));
                        setResultSets([]);
                        setActiveResultKey('');
                        return;
                    }
                    if (shellConvert.command) {
                        executedSql = shellConvert.command;
                    }
                }
                if (wantsLimitProbe) {
                    const limitResult = applyMongoQueryAutoLimit(executedSql, maxRows);
                    if (limitResult.applied) {
                        executedSql = limitResult.command;
                    }
                }
                const startTime = Date.now();
                let queryId: string;
                try {
                    queryId = await GenerateQueryID();
                } catch (error) {
                    console.warn('GenerateQueryID failed, using local UUID fallback:', error);
                    queryId = 'query-' + uuidv4();
                }
                setQueryId(queryId);

                const res = await DBQueryWithCancel(buildRpcConnectionConfig(config) as any, currentDb, executedSql, queryId);
                const duration = Date.now() - startTime;
                addSqlLog({
                    id: `log-${Date.now()}-query-${idx + 1}`,
                    timestamp: Date.now(),
                    sql: executedSql,
                    status: res.success ? 'success' : 'error',
                    duration,
                    message: res.success ? '' : res.message,
                    affectedRows: (res.success && !Array.isArray(res.data)) ? (res.data as any).affectedRows : (Array.isArray(res.data) ? res.data.length : undefined),
                    dbName: currentDb
                });
                if (!res.success) {
                    const prefix = statements.length > 1
                        ? translate('query_editor.message.statement_failed_prefix', { index: idx + 1 })
                        : '';
                    updateResultPanelVisibility(true);
                    setExecutionError(formatSqlExecutionError(res.message, { prefix }));
                    setResultSets([]);
                    setActiveResultKey('');
                    return;
                }
                if (Array.isArray(res.data)) {
                    let rows = (res.data as any[]) || [];
                    let truncated = false;
                    if (wantsLimitProbe && Number.isFinite(maxRows) && maxRows > 0 && rows.length > maxRows) {
                        truncated = true;
                        anyTruncated = true;
                        rows = rows.slice(0, maxRows);
                    }
                    const cols = (res.fields && res.fields.length > 0)
                        ? (res.fields as string[])
                        : (rows.length > 0 ? Object.keys(rows[0]) : []);
                    rows.forEach((row: any, i: number) => {
                        if (row && typeof row === 'object') row[GONAVI_ROW_KEY] = i;
                    });
                    nextResultSets.push({
                        key: `result-${idx + 1}`,
                        sql: rawStatement,
                        exportSql: rawStatement,
                        sourceStatementIndex: idx + 1,
                        statementResultIndex: 1,
                        rows,
                        columns: cols,
                        messages: Array.isArray(res.messages) ? res.messages : [],
                        pkColumns: [],
                        readOnly: true,
                        truncated
                    });
                } else if (Array.isArray(res.messages) && res.messages.length > 0) {
                    nextResultSets.push({
                        key: `result-${idx + 1}`,
                        sql: rawStatement,
                        exportSql: rawStatement,
                        sourceStatementIndex: idx + 1,
                        statementResultIndex: 1,
                        rows: [],
                        columns: [],
                        messages: res.messages,
                        resultType: 'message',
                        pkColumns: [],
                        readOnly: true,
                    });
                } else {
                    const affected = Number((res.data as any)?.affectedRows);
                    if (Number.isFinite(affected)) {
                        const row = { affectedRows: affected };
                        (row as any)[GONAVI_ROW_KEY] = 0;
                        nextResultSets.push({
                            key: `result-${idx + 1}`,
                            sql: rawStatement,
                            exportSql: rawStatement,
                            sourceStatementIndex: idx + 1,
                            statementResultIndex: 1,
                            rows: [row],
                            columns: ['affectedRows'],
                            messages: Array.isArray(res.messages) ? res.messages : [],
                            pkColumns: [],
                            readOnly: true
                        });
                    }
                }
            }
            if (nextResultSets.length > 0) {
                updateResultPanelVisibility(true);
            }
            const shouldReplaceAllResults = didExecuteWholeEditor;
            setResultSets(prev => {
                const merged = mergeResultSets(prev, nextResultSets, shouldReplaceAllResults);
                setActiveResultKey(resolveActiveResultKeyAfterMerge(merged, nextResultSets));
                return merged;
            });
            if (didExecuteAppendedSql || didExecuteWholeEditor) {
                lastExecutedEditorQueryRef.current = currentQuery;
            }
            if (statements.length > 1) {
                message.success(translate('query_editor.message.execution_multi_success', {
                    statements: statements.length,
                    results: nextResultSets.length,
                }));
            } else if (nextResultSets.length === 0) {
                message.success(translate('query_editor.message.execution_success'));
            }

        } else {
            // 非 MongoDB：使用 DBQueryMulti 一次性执行多条 SQL，后端返回多结果集
            const sourceStatements = splitSQLStatements(normalizedRawSQL);
            const didExecuteAppendedSql = resultSets.length > 0
                && lastExecutedEditorQueryRef.current
                && currentQuery.startsWith(lastExecutedEditorQueryRef.current)
                && normalizedRawSQL.trim() === currentQuery.slice(lastExecutedEditorQueryRef.current.length).replace(/；/g, ';').trim();
            const didExecuteWholeEditor = areSqlStatementListsEqual(
                splitSQLStatements(currentQuery.replace(/；/g, ';')),
                sourceStatements,
            );
            if (sourceStatements.length === 0) {
                message.info(translate('query_editor.message.no_executable_sql'));
                setResultSets([]);
                setActiveResultKey('');
                return;
            }
            const useManagedTransaction = shouldUseSqlEditorManagedTransaction(sourceStatements);
            if (useManagedTransaction && pendingSqlTransactionRef.current) {
                message.warning(translate('query_editor.transaction.message.pending_managed_transaction'));
                return;
            }
            const managedTransactionStatementCount = sourceStatements
                .filter((statement) => shouldUseSqlEditorManagedTransaction([statement]))
                .length || sourceStatements.length;

            const forceReadOnlyResult = connCaps.forceReadOnlyQueryResult;
            const showRowNumberColumn = shouldShowOceanBaseRowNumberColumn(config);
            const defaultOracleSchema = isOracleLikeDialect(normalizedDbType)
                ? resolveOracleLikeDefaultSchemaName(config)
                : '';
            const oracleTableCache = new Map<string, CompletionTableMeta[]>();
            const getOracleTablesForDb = async (dbName: string): Promise<CompletionTableMeta[]> => {
                const normalizedDbName = String(dbName || '').trim();
                if (!normalizedDbName) return [];
                const cacheKey = normalizedDbName.toLowerCase();
                const cached = oracleTableCache.get(cacheKey);
                if (cached) return cached;

                const existing = tablesRef.current.filter((table) => String(table.dbName || '').trim().toLowerCase() === cacheKey);
                if (existing.length > 0) {
                    oracleTableCache.set(cacheKey, existing);
                    return existing;
                }

                try {
                    const resTables = await DBGetTables(buildRpcConnectionConfig(config) as any, normalizedDbName);
                    if (!resTables?.success || !Array.isArray(resTables.data)) {
                        oracleTableCache.set(cacheKey, []);
                        return [];
                    }
                    const fetchedTables = resTables.data
                        .map((row: any) => {
                            const tableName = String(Object.values(row || {})[0] || '').trim();
                            if (!tableName) return null;
                            return {
                                dbName: normalizedDbName,
                                tableName,
                            } as CompletionTableMeta;
                        })
                        .filter(Boolean) as CompletionTableMeta[];
                    if (fetchedTables.length > 0) {
                        const knownKeys = new Set(tablesRef.current.map((table) => `${String(table.dbName || '').trim().toLowerCase()}\u0000${String(table.tableName || '').trim()}`));
                        const missing = fetchedTables.filter((table) => !knownKeys.has(`${String(table.dbName || '').trim().toLowerCase()}\u0000${String(table.tableName || '').trim()}`));
                        if (missing.length > 0) {
                            tablesRef.current = [...tablesRef.current, ...missing];
                            if (isActive) {
                                sharedTablesData = tablesRef.current;
                            }
                        }
                    }
                    oracleTableCache.set(cacheKey, fetchedTables);
                    return fetchedTables;
                } catch {
                    oracleTableCache.set(cacheKey, []);
                    return [];
                }
            };
            const executedSourceStatements: string[] = [];
            for (const statement of sourceStatements) {
                let executableStatement = statement;
                if (isOracleLikeDialect(normalizedDbType)) {
                    const leadingTable = matchLeadingSelectTableReference(statement);
                    if (leadingTable) {
                        const leadingSegments = splitQueryIdentifierPathSegments(leadingTable.tableText);
                        const oracleLookupDbName = String(
                            (leadingSegments.length >= 2 ? leadingSegments[0]?.value : '')
                            || defaultOracleSchema
                            || currentDb
                            || '',
                        ).trim();
                        const oracleTables = oracleLookupDbName ? await getOracleTablesForDb(oracleLookupDbName) : [];
                        const exactQualifiedTable = resolveOracleExactCaseTableReference(statement, oracleLookupDbName, oracleTables);
                        if (exactQualifiedTable) {
                            executableStatement = rewriteLeadingSelectTableReference(statement, exactQualifiedTable) || statement;
                        }
                    }
                }
                executedSourceStatements.push(executableStatement);
            }
            const statementPlans: QueryStatementPlan[] = [];
            for (let index = 0; index < sourceStatements.length; index += 1) {
                statementPlans.push(await resolveQueryLocatorPlan({
                    statement: executedSourceStatements[index] || sourceStatements[index],
                    originalStatement: sourceStatements[index],
                    dbType: normalizedDbType,
                    currentDb,
                    config,
                    forceReadOnly: forceReadOnlyResult,
                }));
            }

            // 自动给 SELECT 语句注入行数限制（防止大结果集卡死）
            const maxRowsForLimit = Number(queryOptions?.maxRows) || 0;
            let anyLimitApplied = false;
            const executablePlans = statementPlans.map((plan) => {
                if (!Number.isFinite(maxRowsForLimit) || maxRowsForLimit <= 0) return plan;
                const result = applyQueryAutoLimit(plan.executedSql, normalizedDbType, maxRowsForLimit, driver);
                if (result.applied) anyLimitApplied = true;
                return { ...plan, executedSql: result.sql };
            });
            const fullSQL = executablePlans.map((plan) => plan.executedSql).join(';\n');

            const startTime = Date.now();
            let queryId: string;
            try {
                queryId = await GenerateQueryID();
            } catch (error) {
                console.warn('GenerateQueryID failed, using local UUID fallback:', error);
                queryId = 'query-' + uuidv4();
            }
            setQueryId(queryId);

            const queryExecutor = useManagedTransaction ? DBQueryMultiTransactional : DBQueryMulti;
            const res = await queryExecutor(buildRpcConnectionConfig(config) as any, currentDb, fullSQL, queryId);
            const duration = Date.now() - startTime;

            addSqlLog({
                id: `log-${Date.now()}-query-multi`,
                timestamp: Date.now(),
                sql: sourceStatements.join(';\n'),
                status: res.success ? 'success' : 'error',
                duration,
                message: res.success ? '' : res.message,
                dbName: currentDb
            });

            if (!res.success) {
                const errorMsg = res.message.toLowerCase();
                const isCancelledError = errorMsg.includes('context canceled') ||
                                         errorMsg.includes('查询已取消') ||
                                         errorMsg.includes('canceled') ||
                                         errorMsg.includes('cancelled') ||
                                         errorMsg.includes('statement canceled') ||
                                         errorMsg.includes('sql: statement canceled');
                const isTimeoutError = errorMsg.includes('context deadline exceeded') ||
                                       errorMsg.includes('timeout') ||
                                       errorMsg.includes('超时') ||
                                       errorMsg.includes('deadline exceeded');

                if (isCancelledError && !isTimeoutError) {
                    setResultSets([]);
                    setActiveResultKey('');
                    if (currentQueryIdRef.current) {
                        clearQueryId();
                    }
                    return;
                }

                updateResultPanelVisibility(true);
                setExecutionError(formatSqlExecutionError(res.message));
                setResultSets([]);
                setActiveResultKey('');
                return;
            }

            if (useManagedTransaction && res.transactionPending && res.transactionId) {
                activatePendingSqlTransaction({
                    id: String(res.transactionId),
                    commitMode: sqlEditorCommitMode,
                    autoCommitDelayMs: sqlEditorAutoCommitDelayMs,
                    createdAt: Date.now(),
                    statementCount: managedTransactionStatementCount,
                });
            }

            // res.data 是 ResultSetData[] 数组
            const resultSetDataArray = Array.isArray(res.data) ? (res.data as any[]) : [];
            const topLevelMessages = Array.isArray(res.messages)
                ? (res.messages as any[]).map((item) => String(item ?? '').trim()).filter(Boolean)
                : [];
            const nextResultSets: ResultSet[] = [];
            const maxRows = Number(queryOptions?.maxRows) || 0;
            let anyTruncated = false;
            const statementResultCounts = new Map<number, number>();

            for (let idx = 0; idx < resultSetDataArray.length; idx++) {
                const rsData = resultSetDataArray[idx];
                const sourceStatementIndex = Number(rsData?.statementIndex || idx + 1);
                const statementResultIndex = (statementResultCounts.get(sourceStatementIndex) || 0) + 1;
                statementResultCounts.set(sourceStatementIndex, statementResultIndex);
                const plan = executablePlans[Math.max(0, sourceStatementIndex - 1)];
                const originalSql = plan?.originalSql || '';
                const executedSql = plan?.executedSql || originalSql;
                const resultMessages = Array.isArray(rsData?.messages) ? rsData.messages : [];

                // 检查是否为 affectedRows 类结果集
                const isAffectedResult = Array.isArray(rsData.rows) && rsData.rows.length === 1
                    && rsData.columns && rsData.columns.length === 1
                    && rsData.columns[0] === 'affectedRows';

                if (isAffectedResult) {
                    const affected = Number(rsData.rows[0]?.affectedRows);
                    const row = { affectedRows: Number.isFinite(affected) ? affected : 0 };
                    (row as any)[GONAVI_ROW_KEY] = 0;
                    nextResultSets.push({
                        key: `result-${idx + 1}`,
                        sql: executedSql,
                        exportSql: originalSql,
                        sourceStatementIndex,
                        statementResultIndex,
                        rows: [row],
                        columns: ['affectedRows'],
                        messages: resultMessages,
                        pkColumns: [],
                        readOnly: true
                    });
                } else if ((!Array.isArray(rsData.rows) || rsData.rows.length === 0) && (!Array.isArray(rsData.columns) || rsData.columns.length === 0) && resultMessages.length > 0) {
                    nextResultSets.push({
                        key: `result-${idx + 1}`,
                        sql: executedSql,
                        exportSql: originalSql,
                        sourceStatementIndex,
                        statementResultIndex,
                        rows: [],
                        columns: [],
                        messages: resultMessages,
                        resultType: 'message',
                        pkColumns: [],
                        readOnly: true,
                    });
                } else {
                    let rows = Array.isArray(rsData.rows) ? rsData.rows : [];
                    let truncated = false;
                    // 仅当前端自动注入了 LIMIT 时才做兜底截断；用户手写 LIMIT 时尊重原始结果
                    if (anyLimitApplied && Number.isFinite(maxRows) && maxRows > 0 && rows.length > maxRows) {
                        truncated = true;
                        anyTruncated = true;
                        rows = rows.slice(0, maxRows);
                    }
                    const cols = (rsData.columns && rsData.columns.length > 0)
                        ? rsData.columns
                        : (rows.length > 0 ? Object.keys(rows[0]) : []);

                    rows.forEach((row: any, i: number) => {
                        if (row && typeof row === 'object') row[GONAVI_ROW_KEY] = i;
                    });

                    const tableRef = plan?.tableRef;
                    const editLocator = plan?.editLocator;
                    const page = createInitialQueryResultPagination({
                        executedSql,
                        exportSql: originalSql,
                        dbType: normalizedDbType,
                        driver,
                        returnedRowCount: rows.length,
                        fallbackPageSize: maxRows,
                    });
                    nextResultSets.push({
                        key: `result-${idx + 1}`,
                        sql: executedSql,
                        exportSql: originalSql,
                        sourceStatementIndex,
                        statementResultIndex,
                        rows,
                        columns: cols,
                        messages: resultMessages,
                        tableName: tableRef?.tableName,
                        pkColumns: plan?.pkColumns || [],
                        editLocator,
                        readOnly: forceReadOnlyResult || !editLocator || editLocator.readOnly,
                        showRowNumberColumn,
                        truncated,
                        page,
                    });
                }
            }

            if (topLevelMessages.length > 0 && !nextResultSets.some((result) => Array.isArray(result.messages) && result.messages.length > 0)) {
                nextResultSets.push({
                    key: `result-${nextResultSets.length + 1}`,
                    sql: fullSQL,
                    exportSql: sourceStatements.join(';\n'),
                    sourceStatementIndex: 1,
                    statementResultIndex: (statementResultCounts.get(1) || 0) + 1,
                    rows: [],
                    columns: [],
                    messages: topLevelMessages,
                    resultType: 'message',
                    pkColumns: [],
                    readOnly: true,
                });
            }

            if (nextResultSets.length > 0) {
                updateResultPanelVisibility(true);
            }
            const shouldReplaceAllResults = didExecuteWholeEditor;
            setResultSets(prev => {
                const merged = mergeResultSets(prev, nextResultSets, shouldReplaceAllResults);
                setActiveResultKey(resolveActiveResultKeyAfterMerge(merged, nextResultSets));
                return merged;
            });
            if (didExecuteAppendedSql || didExecuteWholeEditor) {
                lastExecutedEditorQueryRef.current = currentQuery;
            }

            executablePlans.forEach((plan) => {
                if (plan.warning) message.warning(plan.warning);
            });

            // 后端附带的提示信息（如数据源不支持原生多语句执行的回退提示）
            if (res.message) {
                message.info(res.message);
            }
            if (resultSetDataArray.length > 1) {
                message.success(translate('query_editor.message.execution_result_sets_success', {
                    results: nextResultSets.length,
                }));
            } else if (nextResultSets.length === 0) {
                message.success(translate('query_editor.message.execution_success'));
            }

        }
    } catch (e: any) {
        const formattedError = formatSqlExecutionError(e?.message || e);
        message.error(translate('query_editor.message.execution_failed_with_error', { error: formattedError }));
        addSqlLog({
            id: `log-${Date.now()}-error`,
            timestamp: Date.now(),
            sql: executableSQL || getExecutableSQL() || getCurrentQuery(),
            status: 'error',
            duration: Date.now() - runStartTime,
            message: e.message,
            dbName: currentDb
        });
        updateResultPanelVisibility(true);
        setExecutionError(formattedError);
        setResultSets([]);
        setActiveResultKey('');
    } finally {
        if (runSeqRef.current === runSeq) setLoading(false);
        // Clear query ID after execution completes
        clearQueryId();
    }
  };

  const handleCancel = async () => {
    if (!currentQueryIdRef.current) {
      message.warning(translate('query_editor.message.cancel_no_running'));
      return;
    }
    const queryIdToCancel = currentQueryIdRef.current;
    try {
      const res = await CancelQuery(queryIdToCancel);
      if (res.success) {
        message.success(translate('query_editor.message.cancel_success'));
        // Clear query ID after successful cancellation
        if (currentQueryIdRef.current === queryIdToCancel) {
          clearQueryId()
        }
      } else {
        message.warning(res.message);
      }
    } catch (error: any) {
      message.error(translate('query_editor.message.cancel_failed', { error: error.message }));
    }
  };

  useEffect(() => {
      const handleSelectAllInEditor = (event: KeyboardEvent) => {
          if (!isActive) {
              return;
          }
          if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'a') {
              return;
          }

          const editor = editorRef.current;
          if (!editor) {
              return;
          }

          const targetNode = resolveEventTargetNode(event.target);
          const editorHasFocus = !!editor.hasTextFocus?.();
          const inEditorPane = !!(targetNode && editorPaneRef.current?.contains(targetNode));
          const inQueryEditor = !!(targetNode && queryEditorRootRef.current?.contains(targetNode));
          if (!editorHasFocus && !inEditorPane) {
              return;
          }
          if (!editorHasFocus && isEditableElement(event.target) && !inEditorPane) {
              return;
          }
          if (!editorHasFocus && !inQueryEditor) {
              return;
          }

          event.preventDefault();
          event.stopPropagation();
          editor.focus?.();
          editor.trigger('keyboard', 'editor.action.selectAll', null);
      };

      window.addEventListener('keydown', handleSelectAllInEditor, true);
      return () => {
          window.removeEventListener('keydown', handleSelectAllInEditor, true);
      };
  }, [isActive]);

  useEffect(() => {
      const binding = runQueryShortcutBinding;
      if (!binding?.enabled || !binding.combo) {
          return;
      }

      const handleRunShortcut = (event: KeyboardEvent) => {
          if (!isActive) {
              return;
          }
          if (!isShortcutMatch(event, binding.combo)) {
              return;
          }
          const editorHasFocus = !!editorRef.current?.hasTextFocus?.();
          if (!editorHasFocus && !isEditableElement(event.target)) {
              return;
          }
          event.preventDefault();
          event.stopPropagation();
          void handleRun();
      };

      window.addEventListener('keydown', handleRunShortcut, true);
      return () => {
          window.removeEventListener('keydown', handleRunShortcut, true);
      };
  }, [isActive, runQueryShortcutBinding, handleRun]);

  // Re-register Monaco internal keybinding when runQuery shortcut changes
  useEffect(() => {
      if (runQueryActionRef.current) {
          runQueryActionRef.current.dispose();
          runQueryActionRef.current = null;
      }

      const editor = editorRef.current;
      const monaco = monacoRef.current;
      if (!editor || !monaco) return;

      const binding = runQueryShortcutBinding;
      if (!binding?.enabled || !binding.combo) return;

      const keyBinding = comboToMonacoKeyBinding(binding.combo, monaco.KeyMod, monaco.KeyCode);
      if (keyBinding) {
          runQueryActionRef.current = editor.addAction({
              id: 'gonavi.runQuery',
              label: buildQueryEditorMonacoActionLabel('app.shortcuts.action.runQuery.label'),
              keybindings: [keyBinding.keyMod | keyBinding.keyCode],
              run: () => {
                  window.dispatchEvent(new CustomEvent('gonavi:run-active-query'));
              },
          });
      }

      return () => {
          if (runQueryActionRef.current) {
              runQueryActionRef.current.dispose();
              runQueryActionRef.current = null;
          }
      };
  }, [languagePreference, runQueryShortcutBinding]);

  useEffect(() => {
      if (selectCurrentStatementActionRef.current) {
          selectCurrentStatementActionRef.current.dispose();
          selectCurrentStatementActionRef.current = null;
      }

      const editor = editorRef.current;
      const monaco = monacoRef.current;
      if (!editor || !monaco) return;

      const binding = selectCurrentStatementShortcutBinding;
      if (!binding?.enabled || !binding.combo) return;

      const keyBinding = comboToMonacoKeyBinding(binding.combo, monaco.KeyMod, monaco.KeyCode);
      if (keyBinding) {
          selectCurrentStatementActionRef.current = editor.addAction({
              id: 'gonavi.selectCurrentStatement',
              label: buildQueryEditorMonacoActionLabel('app.shortcuts.action.selectCurrentStatement.label'),
              keybindings: [keyBinding.keyMod | keyBinding.keyCode],
              run: handleSelectCurrentStatement,
          });
      }

      return () => {
          if (selectCurrentStatementActionRef.current) {
              selectCurrentStatementActionRef.current.dispose();
              selectCurrentStatementActionRef.current = null;
          }
      };
  }, [languagePreference, selectCurrentStatementShortcutBinding, handleSelectCurrentStatement]);

  useEffect(() => {
      if (saveQueryActionRef.current) {
          saveQueryActionRef.current.dispose();
          saveQueryActionRef.current = null;
      }

      const editor = editorRef.current;
      const monaco = monacoRef.current;
      if (!editor || !monaco) return;

      const binding = saveQueryShortcutBinding;
      if (!binding?.enabled || !binding.combo) return;

      const keyBinding = comboToMonacoKeyBinding(binding.combo, monaco.KeyMod, monaco.KeyCode);
      if (keyBinding) {
          saveQueryActionRef.current = editor.addAction({
              id: 'gonavi.saveQuery',
              label: buildQueryEditorMonacoActionLabel('app.shortcuts.action.saveQuery.label'),
              keybindings: [keyBinding.keyMod | keyBinding.keyCode],
              run: () => {
                  window.dispatchEvent(new CustomEvent('gonavi:save-active-query'));
              },
          });
      }

      return () => {
          if (saveQueryActionRef.current) {
              saveQueryActionRef.current.dispose();
              saveQueryActionRef.current = null;
          }
      };
  }, [languagePreference, saveQueryShortcutBinding]);

  useEffect(() => {
      const editor = editorRef.current;
      if (!editor) return;

      registerQueryEditorAiContextMenuActions(editor);

      return () => {
          disposeQueryEditorAiContextMenuActions();
      };
  }, [languagePreference, disposeQueryEditorAiContextMenuActions, registerQueryEditorAiContextMenuActions]);

  useEffect(() => {
      refreshQueryEditorSlashCommandDefs();
  }, [languagePreference, refreshQueryEditorSlashCommandDefs]);

  useEffect(() => {
      if (toggleQueryResultsPanelActionRef.current) {
          toggleQueryResultsPanelActionRef.current.dispose();
          toggleQueryResultsPanelActionRef.current = null;
      }

      const editor = editorRef.current;
      const monaco = monacoRef.current;
      if (!editor || !monaco) return;

      const binding = toggleQueryResultsPanelShortcutBinding;
      if (!binding?.enabled || !binding.combo) return;

      const keyBinding = comboToMonacoKeyBinding(binding.combo, monaco.KeyMod, monaco.KeyCode);
      if (keyBinding) {
          toggleQueryResultsPanelActionRef.current = editor.addAction({
              id: 'gonavi.toggleQueryResultsPanel',
              label: buildQueryEditorMonacoActionLabel('app.shortcuts.action.toggleQueryResultsPanel.label'),
              keybindings: [keyBinding.keyMod | keyBinding.keyCode],
              run: toggleResultPanelVisibility,
          });
      }

      return () => {
          if (toggleQueryResultsPanelActionRef.current) {
              toggleQueryResultsPanelActionRef.current.dispose();
              toggleQueryResultsPanelActionRef.current = null;
          }
      };
  }, [languagePreference, toggleQueryResultsPanelShortcutBinding, toggleResultPanelVisibility]);

  useEffect(() => {
      const handleRunActiveQuery = () => {
          if (!isActive) {
              return;
          }
          void handleRun();
      };

      window.addEventListener('gonavi:run-active-query', handleRunActiveQuery as EventListener);
      return () => {
          window.removeEventListener('gonavi:run-active-query', handleRunActiveQuery as EventListener);
      };
  }, [isActive, handleRun]);

  // 监听由 TabManager 分发的专用注入事件
  useEffect(() => {
      const handleInsertSql = (e: any) => {
          if (e.detail?.tabId !== tab.id || !e.detail?.sql) return;
          const { sql: sqlText, connectionId, dbName } = e.detail;

          // 同步更新 ref，防止异步 fetchDbs 竞态覆盖正确的 dbName
          if (connectionId && connectionId !== currentConnectionId) {
              if (dbName) {
                  currentDbRef.current = dbName;
                  setCurrentDb(dbName);
              }
              setCurrentConnectionId(connectionId);
          } else if (dbName && dbName !== currentDb) {
              currentDbRef.current = dbName;
              setCurrentDb(dbName);
          }


          const editor = editorRef.current;
          const monaco = monacoRef.current;
          if (editor && monaco) {
              const model = editor.getModel();
              const existingContent = editor.getValue?.() || '';

              // runImmediately 模式下，如果编辑器内容已是待注入的 SQL（TabManager 创建时已传入），
              // 跳过追加，直接选中全部内容并执行
              if (e.detail.runImmediately && existingContent.trim() === sqlText.trim()) {
                  if (model) {
                      const lineCount = model.getLineCount();
                      const maxCol = model.getLineMaxColumn(lineCount);
                      editor.setSelection(new monaco.Range(1, 1, lineCount, maxCol));
                      editor.focus();
                      setTimeout(() => handleRun(), 500);
                  }
              } else {
              let position = editor.getPosition();
              if (!position && model) {
                  const lineCount = model.getLineCount();
                  const maxCol = model.getLineMaxColumn(lineCount);
                  position = new monaco.Position(lineCount, maxCol);
              }

              if (position) {
                  const mText = (sqlText.endsWith('\n') ? sqlText : sqlText + '\n');
                  const startRange = new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column);
                  
                  editor.executeEdits('ai-insert', [{
                      range: startRange,
                      text: (position.column > 1 ? '\n' : '') + mText,
                      forceMoveMarkers: true
                  }]);
                  const nextValue = editor.getValue?.();
                  if (typeof nextValue === 'string') {
                      applyQueryState(nextValue);
                  }
                  
                  // 定位并滚动到可见区域
                  const targetLine = position.lineNumber + (position.column > 1 ? 1 : 0);
                  editor.revealLineInCenterIfOutsideViewport(targetLine);
                  editor.setPosition({ lineNumber: targetLine + mText.split('\n').length - 1, column: 1 });
                  editor.focus();
                  
                  if (!e.detail.runImmediately) {
                      message.success(translate('query_editor.message.insert_success'));
                  }

                  if (e.detail.runImmediately) {
                      const endPosition = editor.getPosition();
                      editor.setSelection(new monaco.Range(
                          targetLine, 1,
                          endPosition.lineNumber, endPosition.column
                      ));
                      // 🔧 延迟 500ms 等待连接/数据库切换的 setState 生效后再执行
                      setTimeout(() => handleRun(), 500);
                  }
              }
              }
          } else {
              applyQueryState(getCurrentQuery() ? `${getCurrentQuery()}\n${sqlText}` : sqlText);
              message.success(translate('query_editor.message.append_success'));
          }
      };
      window.addEventListener('gonavi:insert-sql-to-tab', handleInsertSql as EventListener);
      return () => window.removeEventListener('gonavi:insert-sql-to-tab', handleInsertSql as EventListener);
  }, [tab.id, handleRun]);

  const resolveDefaultQueryName = () => {
      const rawTitle = String(tab.title || '').trim();
      if (!rawTitle || UNTITLED_QUERY_TITLE_PREFIXES.some((title) => rawTitle.startsWith(title))) {
          return translate('query_editor.save_modal.unnamed');
      }
      return rawTitle;
  };

  const persistQuery = async (payload: { id: string; name: string; createdAt?: number }) => {
      const sql = getCurrentQuery();
      const saved = {
          id: payload.id,
          name: payload.name,
          sql,
          connectionId: currentConnectionId,
          dbName: currentDb || tab.dbName || '',
          createdAt: payload.createdAt ?? Date.now(),
      };
      const persisted = await saveQuery(saved);
      addTab({
          ...tab,
          title: persisted.name,
          query: sql,
          connectionId: currentConnectionId,
          dbName: currentDb || tab.dbName || '',
          savedQueryId: persisted.id,
      });
      return persisted;
  };

  const openSaveQueryModal = (mode: 'save' | 'rename') => {
      setSaveModalMode(mode);
      saveForm.setFieldsValue({ name: currentSavedQuery?.name || resolveDefaultQueryName() });
      setIsSaveModalOpen(true);
  };

  const handleQuickSave = async () => {
      const filePath = String(tab.filePath || '').trim();
      if (filePath) {
          const sql = getCurrentQuery();
          try {
              const res = await WriteSQLFile(filePath, sql);
              if (!res.success) {
                  message.error(translate('query_editor.message.save_sql_file_failed', {
                      error: res.message || translate('common.unknown'),
                  }));
                  return;
              }
              addTab({
                  ...tab,
                  query: sql,
                  connectionId: currentConnectionId,
                  dbName: currentDb || tab.dbName || '',
                  filePath,
                  savedQueryId: undefined,
              });
              setSQLFileTabDraft(tab.id, sql);
              message.success(translate('query_editor.message.sql_file_saved'));
          } catch (error) {
              message.error(translate('query_editor.message.save_sql_file_failed', {
                  error: error instanceof Error ? error.message : String(error),
              }));
          }
          return;
      }

      const existed = currentSavedQuery || null;
      const fallbackSavedId = String(tab.savedQueryId || '').trim();
      const saveId = existed?.id || fallbackSavedId || '';
      if (!saveId) {
          openSaveQueryModal('save');
          return;
      }
      const saveName = existed?.name || resolveDefaultQueryName();
      await persistQuery({ id: saveId, name: saveName, createdAt: existed?.createdAt });
      message.success(translate('query_editor.message.saved'));
  };

  const handleRenameQuery = () => {
      const existed = currentSavedQuery || null;
      const fallbackSavedId = String(tab.savedQueryId || '').trim();
      if (!existed && !fallbackSavedId) {
          message.warning(translate('query_editor.message.save_first_before_rename'));
          openSaveQueryModal('save');
          return;
      }
      openSaveQueryModal('rename');
  };

  const handleExportSQLFile = async () => {
      try {
          const res = await ExportSQLFile(currentSavedQuery?.name || resolveDefaultQueryName(), getCurrentQuery());
          if (!res.success) {
              if ((res.message || '') !== '已取消') {
                  message.error(translate('query_editor.message.export_sql_file_failed', {
                      error: res.message || translate('common.unknown'),
                  }));
              }
              return;
          }
          message.success(translate('query_editor.message.export_sql_file_success'));
      } catch (error) {
          const errorDetail = error instanceof Error
              ? error.message || translate('common.unknown')
              : (typeof (error as any)?.message === 'string' && (error as any).message)
                  || (typeof error === 'string' && error)
                  || translate('common.unknown');
          message.error(translate('query_editor.message.export_sql_file_failed', {
              error: errorDetail,
          }));
      }
  };

  const saveMoreMenuItems: MenuProps['items'] = [
      {
          key: 'rename-query',
          label: translate('query_editor.action.rename_query'),
          disabled: !!tab.filePath,
          onClick: handleRenameQuery,
      },
      {
          key: 'export-sql-file',
          label: translate('query_editor.action.export_sql_file'),
          onClick: () => void handleExportSQLFile(),
      },
  ];

  useEffect(() => {
      const binding = saveQueryShortcutBinding;
      if (!binding?.enabled || !binding.combo) {
          return;
      }

      const handleSaveShortcut = (event: KeyboardEvent) => {
          if (!isActive) {
              return;
          }
          if (!isShortcutMatch(event, binding.combo)) {
              return;
          }

          const editor = editorRef.current;
          const targetNode = resolveEventTargetNode(event.target);
          const editorHasFocus = !!editor?.hasTextFocus?.();
          const inQueryEditor = !!(targetNode && queryEditorRootRef.current?.contains(targetNode));
          if (!editorHasFocus && !inQueryEditor) {
              return;
          }

          event.preventDefault();
          event.stopPropagation();
          void handleQuickSave();
      };

      window.addEventListener('keydown', handleSaveShortcut, true);
      return () => {
          window.removeEventListener('keydown', handleSaveShortcut, true);
      };
  }, [isActive, saveQueryShortcutBinding, handleQuickSave]);

  useEffect(() => {
      const binding = toggleQueryResultsPanelShortcutBinding;
      if (!binding?.enabled || !binding.combo) {
          return;
      }

      const handleToggleResultsShortcut = (event: KeyboardEvent) => {
          if (!isActive) {
              return;
          }
          if (!isShortcutMatch(event, binding.combo)) {
              return;
          }

          const editor = editorRef.current;
          const targetNode = resolveEventTargetNode(event.target);
          const editorHasFocus = !!editor?.hasTextFocus?.();
          const inQueryEditor = !!(targetNode && queryEditorRootRef.current?.contains(targetNode));
          if (!editorHasFocus && !inQueryEditor && !isDocumentLevelShortcutTarget(targetNode)) {
              return;
          }

          event.preventDefault();
          event.stopPropagation();
          toggleResultPanelVisibility();
      };

      window.addEventListener('keydown', handleToggleResultsShortcut, true);
      return () => {
          window.removeEventListener('keydown', handleToggleResultsShortcut, true);
      };
  }, [isActive, toggleQueryResultsPanelShortcutBinding, toggleResultPanelVisibility]);

  useEffect(() => {
      const handleSaveActiveQuery = () => {
          if (!isActive) {
              return;
          }
          void handleQuickSave();
      };

      window.addEventListener('gonavi:save-active-query', handleSaveActiveQuery as EventListener);
      return () => {
          window.removeEventListener('gonavi:save-active-query', handleSaveActiveQuery as EventListener);
      };
  }, [isActive, handleQuickSave]);

  const handleSave = async () => {
      try {
          const values = await saveForm.validateFields();
          const existed = currentSavedQuery || null;
          const fallbackSavedId = String(tab.savedQueryId || '').trim();
          const nextSavedId = existed?.id || fallbackSavedId || `saved-${Date.now()}`;
          await persistQuery({
              id: nextSavedId,
              name: String(values.name || '').trim() || translate('query_editor.save_modal.unnamed'),
              createdAt: existed?.createdAt,
          });
          message.success(translate(
              saveModalMode === 'rename' ? 'query_editor.message.renamed' : 'query_editor.message.saved'
          ));
          setIsSaveModalOpen(false);
      } catch (e) {
          if (e instanceof Error) {
              message.error(translate('query_editor.message.save_query_failed', {
                  error: e.message,
              }));
          }
      }
  };

  const handleCloseResult = (key: string) => {
      setResultSets(prev => {
          const idx = prev.findIndex(r => r.key === key);
          if (idx < 0) return prev;
          const next = prev.filter(r => r.key !== key);

          setActiveResultKey(prevActive => {
              if (prevActive && prevActive !== key) return prevActive;
              return next[idx]?.key || next[idx - 1]?.key || next[0]?.key || '';
          });

          return next;
      });
  };

  const replaceResultSetsAfterMenuClose = (next: ResultSet[], preferredKey?: string) => {
      setResultSets(next);
      setActiveResultKey(prevActive => {
          if (preferredKey && next.some(result => result.key === preferredKey)) return preferredKey;
          if (prevActive && next.some(result => result.key === prevActive)) return prevActive;
          return next[0]?.key || '';
      });
  };

  const closeOtherResultTabs = (key: string) => {
      const target = resultSets.find(result => result.key === key);
      replaceResultSetsAfterMenuClose(target ? [target] : resultSets, key);
  };

  const closeResultTabsToLeft = (key: string) => {
      const index = resultSets.findIndex(result => result.key === key);
      if (index <= 0) return;
      replaceResultSetsAfterMenuClose(resultSets.slice(index), key);
  };

  const closeResultTabsToRight = (key: string) => {
      const index = resultSets.findIndex(result => result.key === key);
      if (index < 0 || index >= resultSets.length - 1) return;
      replaceResultSetsAfterMenuClose(resultSets.slice(0, index + 1), key);
  };

  const closeAllResultTabs = () => {
      setResultSets([]);
      setActiveResultKey('');
  };

  const toggleQueryResultsPanelShortcutLabel =
      toggleQueryResultsPanelShortcutBinding.enabled && toggleQueryResultsPanelShortcutBinding.combo
          ? getShortcutDisplayLabel(toggleQueryResultsPanelShortcutBinding.combo, activeShortcutPlatform)
          : '';

  const handleDiagnoseExecutionError = () => {
      const errSql = getCurrentQuery();
      const prompt = translate('query_editor.ai_prompt.diagnose', {
          sql: errSql,
          error: executionError,
      });
      const store = useStore.getState();
      const wasClosed = !store.aiPanelVisible;
      if (wasClosed) store.setAIPanelVisible(true);
      setTimeout(() => {
          window.dispatchEvent(new CustomEvent('gonavi:ai:inject-prompt', { detail: { prompt } }));
      }, wasClosed ? 350 : 0);
  };

  const sqlEditorTransactionToolbar = (
      <QueryEditorTransactionToolbar
          isV2Ui={isV2Ui}
          darkMode={darkMode}
          transaction={pendingSqlTransaction}
          autoCommitRemainingSeconds={sqlEditorAutoCommitRemainingSeconds}
          onFinish={(action) => void finishPendingSqlTransaction(action, 'manual')}
      />
  );

  return (
    <div ref={queryEditorRootRef} className={isV2Ui ? 'gn-v2-query-editor' : undefined} style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div
        ref={editorPaneRef}
        className={isV2Ui ? 'gn-v2-query-editor-pane' : undefined}
        style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: isResultPanelVisible ? '0 0 auto' : '1 1 auto' }}
      >
      <QueryEditorToolbar
        isV2Ui={isV2Ui}
        currentConnectionId={currentConnectionId}
        currentDb={currentDb}
        queryCapableConnections={queryCapableConnections}
        dbList={dbList}
        maxRows={queryOptions?.maxRows ?? 5000}
        sqlEditorCommitMode={sqlEditorCommitMode}
        sqlEditorAutoCommitDelayMs={sqlEditorAutoCommitDelayMs}
        pendingTransactionToolbar={pendingSqlTransaction ? sqlEditorTransactionToolbar : null}
        runQueryShortcutBinding={runQueryShortcutBinding}
        saveQueryShortcutBinding={saveQueryShortcutBinding}
        toggleQueryResultsPanelShortcutBinding={toggleQueryResultsPanelShortcutBinding}
        activeShortcutPlatform={activeShortcutPlatform}
        isResultPanelVisible={isResultPanelVisible}
        loading={loading}
        saveMoreMenuItems={saveMoreMenuItems}
        formatSettingsMenu={formatSettingsMenu}
        onConnectionChange={(val) => {
            setCurrentConnectionId(val);
            setCurrentDb('');
        }}
        onDatabaseChange={setCurrentDb}
        onMaxRowsChange={(maxRows) => setQueryOptions({ maxRows })}
        onCommitModeChange={(mode) => setSqlEditorTransactionOptions(
            mode === 'auto'
                ? { commitMode: mode, autoCommitDelayMs: 0 }
                : { commitMode: mode },
        )}
        onAutoCommitDelayMsChange={(delayMs) => setSqlEditorTransactionOptions({ autoCommitDelayMs: delayMs })}
        onCaptureEditorCursorPosition={captureEditorCursorPosition}
        onRun={handleRun}
        onCancel={handleCancel}
        onQuickSave={handleQuickSave}
        onFormat={handleFormat}
        onToggleResultPanelVisibility={toggleResultPanelVisibility}
        onAIAction={handleAIAction}
      />
      
      <div
        ref={editorShellRef}
        className={isV2Ui ? 'gn-v2-query-monaco-shell' : undefined}
        style={isResultPanelVisible ? { height: editorHeight, minHeight: '100px' } : { flex: '1 1 auto', minHeight: 0 }}
      >
        <Editor 
          height="100%" 
          gonaviTypography="code"
          defaultLanguage="sql" 
          theme={darkMode ? "transparent-dark" : "transparent-light"}
          defaultValue={query}
          onChange={(val) => {
              const nextValue = val || '';
              syncQueryDraft(nextValue);
          }}
          onMount={handleEditorDidMount}
          options={{ 
            minimap: { enabled: false }, 
            automaticLayout: true,
            fixedOverflowWidgets: true,
            hover: {
              enabled: true,
              delay: QUERY_EDITOR_HOVER_DELAY_MS,
              above: false,
            },
            scrollBeyondLastLine: false,
            quickSuggestions: { other: true, comments: false, strings: false },
            suggestOnTriggerCharacters: true,
          }}
        />
      </div>

      {isResultPanelVisible && (
        <div
          className={isV2Ui ? 'gn-v2-query-resizer' : undefined}
          onMouseDown={handleMouseDown}
          style={{
              height: '5px',
              cursor: 'row-resize',
              background: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
              flexShrink: 0,
              zIndex: 10
          }}
          title={translate('query_editor.action.resize_editor')}
        />
      )}
      </div>

      {isResultPanelVisible && (
        <QueryEditorResultsPanel
          resultSets={resultSets}
          activeResultKey={activeResultKey}
          loading={loading}
          executionError={executionError}
          darkMode={darkMode}
          isV2Ui={isV2Ui}
          currentDb={currentDb}
          currentConnectionId={currentConnectionId}
          toggleShortcutLabel={toggleQueryResultsPanelShortcutLabel}
          onActiveResultKeyChange={setActiveResultKey}
          onHide={() => updateResultPanelVisibility(false)}
          onCloseResult={handleCloseResult}
          onCloseOtherResultTabs={closeOtherResultTabs}
          onCloseResultTabsToLeft={closeResultTabsToLeft}
          onCloseResultTabsToRight={closeResultTabsToRight}
          onCloseAllResultTabs={closeAllResultTabs}
          onReloadResult={handleReloadResult}
          onResultPageChange={handleResultPageChange}
          onDiagnoseExecutionError={handleDiagnoseExecutionError}
        />
      )}

      <Modal 
        title={translate(saveModalMode === 'rename' ? 'query_editor.save_modal.rename_title' : 'query_editor.save_modal.title')}
        open={isSaveModalOpen} 
        onOk={handleSave} 
        onCancel={() => setIsSaveModalOpen(false)}
        okText={translate(saveModalMode === 'rename' ? 'query_editor.save_modal.rename_ok' : 'common.save')}
        cancelText={translate('common.cancel')}
      >
          <Form form={saveForm} layout="vertical">
              <Form.Item name="name" label={translate('query_editor.save_modal.name_label')} rules={[{ required: true, message: translate('query_editor.save_modal.name_required') }]}>
                  <Input placeholder={translate('query_editor.save_modal.name_placeholder')} />
              </Form.Item>
          </Form>
      </Modal>

      {/* SQL 诊断工作台：Ctrl+Shift+D 触发，lazy 加载避免 reactflow 进入主 bundle */}
      <Suspense fallback={null}>
        {explainOpen && explainConfig && (
          <ExplainWorkbench
            open={explainOpen}
            onClose={() => setExplainOpen(false)}
            config={explainConfig}
            dbName={currentDb}
            sql={query}
          />
        )}
      </Suspense>

      {/* 慢 SQL 历史：Ctrl+Shift+H 触发 */}
      <Suspense fallback={null}>
        {slowQueryOpen && explainConfig && (
          <SlowQueryPanel
            open={slowQueryOpen}
            onClose={() => setSlowQueryOpen(false)}
            config={explainConfig}
            dbName={currentDb}
            onPickQuery={(sql) => setQuery(sql)}
          />
        )}
      </Suspense>
    </div>
    );
};

const setQueryEditorMouseCursor = (
    editor: any,
    cursor: '' | 'pointer',
) => {
    const domNode = editor?.getDomNode?.();
    if (domNode?.style) {
        domNode.style.cursor = cursor;
    }
};

export default React.memo(QueryEditor);
