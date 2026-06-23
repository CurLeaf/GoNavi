import type { SqlLanguage } from 'sql-formatter';
import type { TabData, ColumnDefinition, IndexDefinition } from '../../types';
import { DBGetColumns, DBGetIndexes, DBQuery } from '../../../wailsjs/go/app/App';
import { buildRpcConnectionConfig } from '../../utils/connectionRpcConfig';
import { isOracleLikeDialect, resolveSqlDialect } from '../../utils/sqlDialect';
import { extractQueryResultTableRef, type QueryResultTableRef } from '../../utils/queryResultTable';
import { quoteIdentPart } from '../../utils/sql';
import { splitSidebarQualifiedName } from '../../utils/sidebarLocate';
import { buildMySQLCompatibleViewMetadataSqls } from '../../utils/sidebarMetadata';
import { SIDEBAR_SQL_EDITOR_DRAG_MIME, decodeSidebarSqlEditorDragPayload } from '../../utils/sidebarSqlDrag';
import {
    DUCKDB_ROWID_LOCATOR_COLUMN,
    ORACLE_ROWID_LOCATOR_COLUMN,
    type EditRowLocator,
} from '../../utils/rowLocator';
import { getQueryTabDraft, hasQueryTabDraft } from '../../utils/sqlFileTabDrafts';
import { getColumnDefinitionKey, getColumnDefinitionName } from '../../utils/columnDefinition';
import { resolveUniqueKeyGroupsFromIndexes } from '../dataGridCopyInsert';
import { t as translate } from '../../i18n';

export type CompletionTableMeta = {dbName: string, tableName: string, comment?: string};
export type CompletionColumnMeta = {dbName: string, tableName: string, name: string, type: string, comment?: string};
export type CompletionViewMeta = {dbName: string, viewName: string, schemaName?: string};
export type CompletionTriggerMeta = {dbName: string, triggerName: string, tableName: string, schemaName?: string};
export type CompletionRoutineMeta = {dbName: string, routineName: string, routineType: string, schemaName?: string};

export const QUERY_LOCATOR_ALIAS_PREFIX = '__gonavi_locator_';

export const buildQueryReadOnlyLocator = (reason: string): EditRowLocator => ({
    strategy: 'none',
    columns: [],
    valueColumns: [],
    readOnly: true,
    reason,
});

export type SimpleSelectInfo = {
    selectsAll: boolean;
    selectsBareAll: boolean;
    writableColumns: Record<string, string>;
};

export type QueryStatementPlan = {
    originalSql: string;
    executedSql: string;
    tableRef?: QueryResultTableRef;
    pkColumns: string[];
    editLocator?: EditRowLocator;
    warning?: string;
};

export const stripSidebarDropIdentifierQuotes = (part: string): string => {
    const text = String(part || '').trim();
    if (!text) return '';
    if ((text.startsWith('`') && text.endsWith('`')) || (text.startsWith('"') && text.endsWith('"')) || (text.startsWith('[') && text.endsWith(']'))) {
        return text.slice(1, -1).trim();
    }
    return text;
};

export const shouldPrefixSidebarDropDatabase = (
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

export const isQueryEditorPrimaryMouseButton = (event: any): boolean => {
    if (event?.leftButton === true) return true;
    if (event?.leftButton === false) return false;

    const browserEvent = event?.browserEvent || event?.nativeEvent || event;
    if (browserEvent?.button === 0) return true;
    if (event?.button === 0) return true;
    if (browserEvent?.buttons === 1) return true;
    if (event?.buttons === 1) return true;
    return false;
};

export const readSidebarSqlDropText = (
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

export const stripQueryIdentifierQuotes = (part: string): string => {
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

export const MYSQL_SYSTEM_METADATA_SCHEMAS = new Set(['information_schema', 'performance_schema', 'mysql', 'sys']);
export const POSTGRES_SYSTEM_METADATA_SCHEMAS = new Set(['information_schema', 'pg_catalog']);
export const SQLITE_SYSTEM_METADATA_TABLES = new Set(['sqlite_master', 'sqlite_schema', 'sqlite_temp_master', 'sqlite_temp_schema']);

export const isSystemMetadataQueryResult = (tableRef: QueryResultTableRef, dbType: string): boolean => {
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

export const splitTopLevelComma = (text: string): string[] => {
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

export const SIMPLE_IDENTIFIER_PATH_RE = /^(?:[`"\[]?[A-Za-z_][\w$]*[`"\]]?\s*\.\s*){0,2}[`"\[]?[A-Za-z_][\w$]*[`"\]]?$/;
export const QUERY_ALIAS_RESERVED = new Set([
    'where', 'group', 'order', 'having', 'limit', 'fetch', 'offset', 'join', 'left', 'right', 'inner', 'outer', 'on', 'union',
    'for', 'connect', 'start', 'window', 'sample', 'pivot', 'unpivot', 'qualify', 'model',
]);

export const getLastIdentifierPart = (path: string): string => {
    const parts = String(path || '').split('.').map((part) => stripQueryIdentifierQuotes(part.trim())).filter(Boolean);
    return parts[parts.length - 1] || '';
};

export type SelectItemInfo = {
    expression: string;
    resultName: string;
    sourceName?: string;
};

export const resolveSelectItemInfo = (item: string): SelectItemInfo | 'all' | undefined => {
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

    if (!alias && !SIMPLE_IDENTIFIER_PATH_RE.test(expr)) return undefined;
    const sourceName = SIMPLE_IDENTIFIER_PATH_RE.test(expr) ? getLastIdentifierPart(expr) : '';
    const resultName = alias || sourceName;
    return resultName ? { expression: expr, resultName, sourceName: sourceName || undefined } : undefined;
};

export const resolveSimpleSelectItemColumn = (item: string): { resultName: string; sourceName: string } | 'all' | undefined => {
    const resolved = resolveSelectItemInfo(item);
    if (!resolved || resolved === 'all' || !resolved.sourceName) return resolved === 'all' ? 'all' : undefined;
    return { resultName: resolved.resultName, sourceName: resolved.sourceName };
};

export const parseSimpleSelectInfo = (sql: string): SimpleSelectInfo | undefined => {
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

export const appendQuerySelectExpressions = (sql: string, expressions: string[]): string => {
    if (expressions.length === 0) return sql;
    return String(sql || '').replace(
        /^(\s*SELECT\s+)([\s\S]+?)(\s+FROM\s+[\s\S]*)$/i,
        (_match, prefix, selectList, rest) => `${prefix}${String(selectList).trimEnd()}, ${expressions.join(', ')}${rest}`,
    );
};

export const QUERY_LOCATOR_SOURCE_ALIAS = 'gonavi_query_source';

export const rewriteOracleSelectAllWithExpressions = (sql: string, expressions: string[]): string | undefined => {
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

export const rewriteOracleDuplicateSelectColumns = (sql: string, tableColumnNames: string[]): string | undefined => {
    const metadataNames = new Set(
        tableColumnNames
            .map((name) => String(name || '').trim().toLowerCase())
            .filter(Boolean),
    );
    if (metadataNames.size === 0) return undefined;

    const match = String(sql || '').match(/^(\s*SELECT\s+)([\s\S]+?)(\s+FROM\s+[\s\S]*)$/i);
    if (!match) return undefined;

    const prefix = match[1];
    const selectList = match[2].trim();
    const rest = match[3];
    const selectItems = splitTopLevelComma(selectList);
    if (selectItems.length === 0) return undefined;

    const parsedItems = selectItems.map((item) => ({
        raw: String(item || '').trimEnd(),
        info: resolveSelectItemInfo(item),
    }));
    const hasWildcard = parsedItems.some(({ info }) => info === 'all');
    if (!hasWildcard) return undefined;

    const usedResultNames = new Set<string>(metadataNames);
    parsedItems.forEach(({ info }) => {
        if (!info || info === 'all') return;
        const normalizedResult = String(info.resultName || '').trim().toLowerCase();
        if (normalizedResult) usedResultNames.add(normalizedResult);
    });

    let changed = false;
    const rewrittenItems = parsedItems.map(({ raw, info }) => {
        if (!info || info === 'all') return raw;
        const normalizedResult = String(info.resultName || '').trim().toLowerCase();
        if (!metadataNames.has(normalizedResult)) return raw;

        let nextIndex = 1;
        let alias = `${info.resultName}_${nextIndex}`;
        while (usedResultNames.has(alias.toLowerCase())) {
            nextIndex++;
            alias = `${info.resultName}_${nextIndex}`;
        }
        usedResultNames.add(alias.toLowerCase());
        changed = true;
        return `${info.expression} AS ${alias}`;
    });

    return changed ? `${prefix}${rewrittenItems.join(', ')}${rest}` : undefined;
};

export const findWritableResultColumnForSource = (writableColumns: Record<string, string>, target: string): string | undefined => {
    const normalizedTarget = String(target || '').trim().toLowerCase();
    return Object.entries(writableColumns || {}).find(([, sourceColumn]) => (
        String(sourceColumn || '').trim().toLowerCase() === normalizedTarget
    ))?.[0];
};

export const resolveMetadataColumnName = (tableColumnNames: string[], sourceColumn: string): string => {
    const normalizedSource = String(sourceColumn || '').trim();
    if (!normalizedSource) return '';
    return tableColumnNames.find((column) => String(column || '').trim().toLowerCase() === normalizedSource.toLowerCase())
        || normalizedSource;
};

export const buildQueryLocatorAlias = (column: string, index: number): string => {
    const normalized = String(column || '').trim().replace(/[^A-Za-z0-9_]/g, '_').slice(0, 48) || 'column';
    return `${QUERY_LOCATOR_ALIAS_PREFIX}${index}_${normalized}`;
};

export const buildQueryLocatorColumnExpression = (dbType: string, column: string, alias: string): string => (
    `${quoteIdentPart(dbType, column)} AS ${quoteIdentPart(dbType, alias)}`
);

export const buildQueryRowIDExpression = (dbType: string, sourceAlias?: string): string => (
    `${sourceAlias ? `${sourceAlias}.` : ''}ROWID AS ${quoteIdentPart(dbType, ORACLE_ROWID_LOCATOR_COLUMN)}`
);

export const buildDuckDBRowIDExpression = (dbType: string, sourceAlias?: string): string => (
    `${sourceAlias ? `${sourceAlias}.` : ''}rowid AS ${quoteIdentPart(dbType, DUCKDB_ROWID_LOCATOR_COLUMN)}`
);

export const escapeMetadataSqlLiteral = (raw: string): string => String(raw || '').replace(/'/g, "''");

export const quoteSqlServerDbIdentifier = (raw: string): string => `[${String(raw || '').replace(/]/g, ']]')}]`;

export type MetadataQuerySpec = {
    sql: string;
    inferredType?: 'FUNCTION' | 'PROCEDURE';
};

export type MetadataQueryResult = {
    rows: Record<string, any>[];
    inferredType?: 'FUNCTION' | 'PROCEDURE';
};

export const normalizeMetadataDialect = (conn: any): string => {
    const type = String(conn?.config?.type || '').trim().toLowerCase();
    const driver = String(conn?.config?.driver || '').trim();
    const dialect = resolveSqlDialect(type, driver, {
        oceanBaseProtocol: conn?.config?.oceanBaseProtocol,
    });
    if (dialect === 'diros' || dialect === 'sphinx' || dialect === 'mariadb' || dialect === 'oceanbase') return 'mysql';
    if (dialect === 'dameng') return 'oracle';
    return String(dialect || '').toLowerCase();
};

export const resolveQueryEditorFormatterLanguage = (conn: any): SqlLanguage => {
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

export const buildCompletionTableCommentSQL = (dialect: string, dbName: string): string => {
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

export const getCaseInsensitiveValue = (row: Record<string, any>, keys: string[]): any => {
    for (const key of keys) {
        for (const rowKey of Object.keys(row || {})) {
            if (rowKey.toLowerCase() === key.toLowerCase()) {
                return row[rowKey];
            }
        }
    }
    return undefined;
};

export const normalizeCommentText = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const text = String(value).trim();
    if (!text || text.toLowerCase() === '<nil>') return '';
    return text;
};

export const buildCompletionDocumentation = (comment?: string): string | undefined => {
    const text = normalizeCommentText(comment);
    return text ? translate('query_editor.completion.documentation.comment', { comment: text }) : undefined;
};

export const appendCommentToDetail = (detail: string, comment?: string): string => {
    const text = normalizeCommentText(comment);
    return text ? `${detail} - ${text}` : detail;
};

export const stripCompletionIdentifierQuotes = (ident: string): string => {
    let raw = String(ident || '').trim();
    if (!raw) return raw;
    const first = raw[0];
    const last = raw[raw.length - 1];
    if ((first === '`' && last === '`') || (first === '"' && last === '"')) {
        raw = raw.slice(1, -1);
    }
    return raw.trim();
};

export const normalizeCompletionQualifiedName = (ident: string): string => {
    const raw = String(ident || '').trim();
    if (!raw) return raw;
    return raw
        .split('.')
        .map(p => stripCompletionIdentifierQuotes(p.trim()))
        .filter(Boolean)
        .join('.');
};

export const getCompletionQualifiedNameLastPart = (qualified: string): string => {
    const raw = normalizeCompletionQualifiedName(qualified);
    if (!raw) return raw;
    const parts = raw.split('.').filter(Boolean);
    return parts[parts.length - 1] || raw;
};

export const splitCompletionSchemaAndTable = (qualified: string): { schema: string; table: string } => {
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

export const DEFAULT_QUERY_TEMPLATE = 'SELECT * FROM ';

export const getTabQueryValue = (tab: TabData): string => (
    typeof tab.query === 'string' ? tab.query : ''
);

export const getInitialEditorQuery = (tab: TabData): string => {
    if (hasQueryTabDraft(tab.id)) {
        return getQueryTabDraft(tab.id);
    }
    const tabQuery = getTabQueryValue(tab);
    if (tabQuery || tab.filePath || tab.savedQueryId || tab.readOnly) {
        return tabQuery;
    }
    return DEFAULT_QUERY_TEMPLATE;
};

export const resolveNextResultSetIndex = (sets: Array<{ key?: string }>): number => {
    const maxIndex = sets.reduce((max, item) => {
        const match = String(item?.key || '').match(/^result-(\d+)$/);
        const index = match ? Number(match[1]) : 0;
        return Number.isFinite(index) ? Math.max(max, index) : max;
    }, 0);
    return maxIndex + 1;
};

export const normalizeExecutedSqlKey = (sql: string): string => String(sql || '')
    .replace(/\r\n/g, '\n')
    .replace(/；/g, ';')
    .trim()
    .replace(/;+\s*$/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

export const areSqlStatementListsEqual = (left: string[], right: string[]): boolean => (
    left.length === right.length
    && left.every((statement, index) => normalizeExecutedSqlKey(statement) === normalizeExecutedSqlKey(right[index]))
);

export const normalizeEditorPosition = (position: any): { lineNumber: number; column: number } | null => {
    if (!position) return null;
    const lineNumber = Number(position.positionLineNumber ?? position.lineNumber ?? position.endLineNumber ?? position.startLineNumber ?? position.selectionStartLineNumber);
    const column = Number(position.positionColumn ?? position.column ?? position.endColumn ?? position.startColumn ?? position.selectionStartColumn);
    if (!Number.isFinite(lineNumber) || !Number.isFinite(column) || lineNumber < 1 || column < 1) {
        return null;
    }
    return { lineNumber, column };
};

export const getNormalizedOffsetAtPosition = (
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

export const getNormalizedPositionAtOffset = (
    sqlText: string,
    offset: number,
): { lineNumber: number; column: number } => {
    const text = String(sqlText || '').replace(/\r\n/g, '\n');
    const safeOffset = Math.max(0, Math.min(text.length, Number.isFinite(offset) ? Math.trunc(offset) : 0));
    const prefix = text.slice(0, safeOffset);
    const lines = prefix.split('\n');
    return {
        lineNumber: Math.max(1, lines.length),
        column: (lines[lines.length - 1]?.length || 0) + 1,
    };
};

export const getFirstRowValue = (row: Record<string, any>): string => {
    for (const value of Object.values(row || {})) {
        if (value !== undefined && value !== null) {
            const normalized = String(value).trim();
            if (normalized !== '') return normalized;
        }
    }
    return '';
};

export const getMySQLShowTablesName = (row: Record<string, any>): string => {
    for (const key of Object.keys(row || {})) {
        if (!key.toLowerCase().startsWith('tables_in_')) continue;
        const value = row[key];
        if (value === undefined || value === null) continue;
        const normalized = String(value).trim();
        if (normalized !== '') return normalized;
    }
    return '';
};

export const normalizeMetadataQuerySpecs = (specs: MetadataQuerySpec[]): MetadataQuerySpec[] => {
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

export const buildQualifiedCompletionName = (schemaName: string, objectName: string): string => {
    const schema = String(schemaName || '').trim();
    const object = String(objectName || '').trim();
    if (!object) return '';
    if (!schema || object.includes('.')) return object;
    return `${schema}.${object}`;
};

export const buildCompletionViewsMetadataQuerySpecs = (dialect: string, dbName: string): MetadataQuerySpec[] => {
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

export const buildCompletionMaterializedViewsMetadataQuerySpecs = (dialect: string, dbName: string): MetadataQuerySpec[] => {
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

export const buildCompletionTriggersMetadataQuerySpecs = (dialect: string, dbName: string): MetadataQuerySpec[] => {
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

export const buildCompletionFunctionsMetadataQuerySpecs = (dialect: string, dbName: string): MetadataQuerySpec[] => {
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

export const queryCompletionMetadataRowsBySpecs = async (
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

export type QueryEditorNavigationTarget =
    | { type: 'database'; dbName: string }
    | { type: 'table'; dbName: string; tableName: string; schemaName?: string }
    | { type: 'view'; dbName: string; viewName: string; schemaName?: string }
    | { type: 'materialized-view'; dbName: string; viewName: string; schemaName?: string }
    | { type: 'trigger'; dbName: string; triggerName: string; tableName: string; schemaName?: string }
    | { type: 'routine'; dbName: string; routineName: string; routineType: string; schemaName?: string };

export type QueryEditorHoverTarget =
    | { kind: 'database'; dbName: string; range: { startColumn: number; endColumn: number } }
    | { kind: 'table'; dbName: string; tableName: string; schemaName?: string; comment?: string; range: { startColumn: number; endColumn: number } }
    | { kind: 'view'; dbName: string; viewName: string; schemaName?: string; range: { startColumn: number; endColumn: number } }
    | { kind: 'materialized-view'; dbName: string; viewName: string; schemaName?: string; range: { startColumn: number; endColumn: number } }
    | { kind: 'trigger'; dbName: string; triggerName: string; tableName: string; schemaName?: string; range: { startColumn: number; endColumn: number } }
    | { kind: 'routine'; dbName: string; routineName: string; routineType: string; schemaName?: string; range: { startColumn: number; endColumn: number } }
    | { kind: 'column'; dbName: string; tableName: string; columnName: string; type?: string; comment?: string; schemaName?: string; range: { startColumn: number; endColumn: number } };

export const QUERY_EDITOR_IDENTIFIER_CHAR_REGEX = /[A-Za-z0-9_$`"\[\].]/;
export const QUERY_EDITOR_SQL_UNQUOTED_IDENTIFIER_PATTERN = '[A-Za-z_][A-Za-z0-9_$]*';
export const QUERY_EDITOR_SQL_QUOTED_IDENTIFIER_PATTERN = '(?:`[^`]+`|"[^"]+"|\\[[^\\]]+\\])';
export const QUERY_EDITOR_SQL_IDENTIFIER_PATTERN = `(?:${QUERY_EDITOR_SQL_QUOTED_IDENTIFIER_PATTERN}|${QUERY_EDITOR_SQL_UNQUOTED_IDENTIFIER_PATTERN})`;
export const QUERY_EDITOR_SQL_IDENTIFIER_PATH_PATTERN = `${QUERY_EDITOR_SQL_IDENTIFIER_PATTERN}(?:\\s*\\.\\s*${QUERY_EDITOR_SQL_IDENTIFIER_PATTERN}){0,2}`;
export const QUERY_EDITOR_SQL_THREE_PART_COMPLETION_REGEX = new RegExp(
    `(${QUERY_EDITOR_SQL_IDENTIFIER_PATTERN})\\s*\\.\\s*(${QUERY_EDITOR_SQL_IDENTIFIER_PATTERN})\\s*\\.\\s*([A-Za-z0-9_$]*)$`,
);
export const QUERY_EDITOR_SQL_QUALIFIER_COMPLETION_REGEX = new RegExp(
    `(${QUERY_EDITOR_SQL_IDENTIFIER_PATTERN})\\s*\\.\\s*([A-Za-z0-9_$]*)$`,
);
export const QUERY_EDITOR_SQL_TABLE_REFERENCE_REGEX = new RegExp(
    `\\b(?:FROM|JOIN|UPDATE|INTO|DELETE\\s+FROM)\\s+(${QUERY_EDITOR_SQL_IDENTIFIER_PATH_PATTERN})`,
    'gi',
);
export const QUERY_EDITOR_SQL_ALIAS_REFERENCE_REGEX = new RegExp(
    `\\b(?:FROM|JOIN|UPDATE|INTO|DELETE\\s+FROM)\\s+(${QUERY_EDITOR_SQL_IDENTIFIER_PATH_PATTERN})(?:\\s+(?:AS\\s+)?(${QUERY_EDITOR_SQL_IDENTIFIER_PATTERN}))?`,
    'gi',
);
export const QUERY_EDITOR_SQL_LEADING_IDENTIFIER_PATH_REGEX = new RegExp(`^(${QUERY_EDITOR_SQL_IDENTIFIER_PATH_PATTERN})([\\s\\S]*)$`);
export const QUERY_EDITOR_HOVER_DELAY_MS = 1000;
export const QUERY_EDITOR_OBJECT_DECORATION_MAX_TEXT_LENGTH = 200_000;
export const QUERY_EDITOR_OBJECT_DECORATION_MAX_IDENTIFIERS = 800;
export const QUERY_EDITOR_OBJECT_DECORATION_MAX_LINES = 1_000;
export const QUERY_EDITOR_LIVE_DECORATION_MAX_TEXT_LENGTH = 50_000;
export const QUERY_EDITOR_PERSISTED_DRAFT_MAX_TEXT_LENGTH = 50_000;

export const getQueryEditorModelValueLength = (model: any): number | null => {
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

export type QueryIdentifierPathSegment = {
    raw: string;
    value: string;
    quoted: boolean;
};

export const isQuotedQueryIdentifierPart = (part: string): boolean => {
    const text = String(part || '').trim();
    if (!text) return false;
    return (text.startsWith('`') && text.endsWith('`'))
        || (text.startsWith('"') && text.endsWith('"'))
        || (text.startsWith('[') && text.endsWith(']'));
};

export const splitQueryIdentifierPathSegments = (qualifiedName: string): QueryIdentifierPathSegment[] => {
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

export const matchLeadingSelectTableReference = (sql: string): { prefix: string; tableText: string; suffix: string } | null => {
    const match = String(sql || '').match(new RegExp(`^(\\s*SELECT\\s+[\\s\\S]+?\\s+FROM\\s+)(${QUERY_EDITOR_SQL_IDENTIFIER_PATH_PATTERN})([\\s\\S]*)$`, 'i'));
    if (!match) return null;
    return {
        prefix: match[1],
        tableText: match[2],
        suffix: match[3] || '',
    };
};

export const rewriteLeadingSelectTableReference = (sql: string, replacement: string): string | undefined => {
    const match = matchLeadingSelectTableReference(sql);
    if (!match || !replacement) return undefined;
    return `${match.prefix}${replacement}${match.suffix}`;
};

export const resolveOracleExactCaseTableReference = (
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

export const resolveOracleLikeDefaultSchemaName = (config: any): string => {
    const rawUser = String(config?.user || '').trim();
    if (!rawUser) return '';
    const userPart = rawUser.split('@')[0] || rawUser;
    return String(userPart || '').trim();
};

export const getQueryEditorModelTextIfWithinLimit = (model: any, maxTextLength: number): string | null => {
    const modelLength = getQueryEditorModelValueLength(model);
    if (modelLength !== null && modelLength > maxTextLength) {
        return null;
    }
    const text = String(model?.getValue?.() || '');
    return text.length <= maxTextLength ? text : null;
};

export const getQueryEditorObjectResolveText = (
    model: any,
    lineContent: string,
    maxTextLength = QUERY_EDITOR_OBJECT_DECORATION_MAX_TEXT_LENGTH,
): string => getQueryEditorModelTextIfWithinLimit(model, maxTextLength) ?? lineContent;

export const getQueryEditorDecorationModelTextIfLightweight = (
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

export const maskQueryEditorSqlLiteralsAndComments = (source: string): string => {
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

export const findIdentifierWindowAtOffset = (
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

export const normalizeNavigationIdentifierParts = (text: string): string[] => (
    String(text || '')
        .split('.')
        .map((part) => stripCompletionIdentifierQuotes(part))
        .map((part) => part.trim())
        .filter(Boolean)
);

export const buildQueryEditorHoverMarkdown = (target: QueryEditorHoverTarget): string => {
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

export const buildQueryEditorAliasMap = (
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

export const collectQueryEditorReferencedDatabaseNames = (
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

export const resolveQueryEditorHoverTarget = (
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

export const dispatchQueryEditorSidebarLocate = (detail: Record<string, unknown>) => {
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

export const resolveEventTargetNode = (target: EventTarget | null): Node | null => (
    typeof Node !== 'undefined' && target instanceof Node ? target : null
);

export const isDocumentLevelShortcutTarget = (targetNode: Node | null): boolean => {
    if (!targetNode) {
        return true;
    }
    if (typeof document === 'undefined') {
        return false;
    }
    return targetNode === document.body || targetNode === document.documentElement;
};

export const clearQueryEditorLinkDecorations = (
    editor: any,
    decorationIdsRef: React.MutableRefObject<string[]>,
) => {
    if (!editor?.deltaDecorations) {
        decorationIdsRef.current = [];
        return;
    }
    decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, []);
};

export const clearQueryEditorObjectDecorations = (
    editor: any,
    decorationIdsRef: React.MutableRefObject<string[]>,
) => {
    if (!editor?.deltaDecorations) {
        decorationIdsRef.current = [];
        return;
    }
    decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, []);
};

export const resolveQueryLocatorPlan = async ({
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
        let executableStatement = statement;
        if (isOracleLikeDialect(dbType) && selectInfo.selectsAll) {
            const rewritten = rewriteOracleDuplicateSelectColumns(executableStatement, tableColumnNames);
            if (rewritten) executableStatement = rewritten;
        }
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
            const rewritten = rewriteOracleSelectAllWithExpressions(executableStatement, executableAppendExpressions);
            if (rewritten) {
                plan.executedSql = rewritten;
                return plan;
            }

            const reason = translate('query_editor.message.read_only_oracle_rowid_injection_unavailable');
            plan.editLocator = buildQueryReadOnlyLocator(reason);
            plan.warning = translate('query_editor.message.read_only_warning_with_detail', { detail: reason });
            return plan;
        }

        plan.executedSql = appendQuerySelectExpressions(executableStatement, executableAppendExpressions);
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
