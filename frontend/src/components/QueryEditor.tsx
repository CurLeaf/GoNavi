import Modal from './common/ResizableDraggableModal';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Editor, { type OnMount } from './MonacoEditor';
import { message, Input, Form, MenuProps, Button } from 'antd';
import { format } from 'sql-formatter';
import { v4 as uuidv4 } from 'uuid';
import { TabData, ColumnDefinition, type SqlSnippet } from '../types';
import { useStore } from '../store';
import { DBQuery, DBQueryWithCancel, DBQueryMulti, DBQueryMultiInTransaction, DBQueryMultiTransactional, DBGetTables, DBGetAllColumns, DBGetDatabases, DBGetColumns, CancelQuery, GenerateQueryID, WriteSQLFile, ExportSQLFile } from '../../wailsjs/go/app/App';
import { GONAVI_ROW_KEY } from './DataGrid';
import { EventsOn } from '../../wailsjs/runtime';
import { findConnectionMutatingStatements } from '../utils/connectionReadOnly';
import { getDataSourceCapabilities, shouldShowOceanBaseRowNumberColumn } from '../utils/dataSourceCapabilities';
import { applyMongoQueryAutoLimit, convertMongoShellToJsonCommand } from "../utils/mongodb";
import { getShortcutDisplayLabel, getShortcutPlatform, getShortcutPrimaryModifierDisplayLabel, isEditableElement, isImeComposingKeyEvent, isShortcutMatch, comboToMonacoKeyBinding, normalizeShortcutCombo, resolveShortcutBinding } from "../utils/shortcuts";
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
import { formatSqlExecutionError, hasLocalizedSqlTimeoutKeyword } from '../utils/sqlErrorSemantics';
import { canReusePendingSqlEditorTransactionForType, shouldUseSqlEditorManagedTransactionForType } from '../utils/sqlEditorTransaction';
import { findSqlStatementRanges, resolveCurrentSqlStatementRange, resolveExecutableSql } from '../utils/sqlStatementSelection';
import { isMacLikePlatform } from '../utils/appearance';
import { splitSidebarQualifiedName } from '../utils/sidebarLocate';
import { buildMySQLCompatibleViewMetadataSqls, isSidebarViewTableType, normalizeSidebarViewName } from '../utils/sidebarMetadata';
import { SIDEBAR_SQL_EDITOR_DRAG_MIME, decodeSidebarSqlEditorDragPayload, hasSidebarSqlEditorDragPayload } from '../utils/sidebarSqlDrag';
import { resolveUniqueKeyGroupsFromIndexes } from './dataGridCopyInsert';
import { t as translate } from '../i18n';
import { buildSqlAnalysisWorkbenchTab } from '../utils/sqlAnalysisTab';
import { isLocalizedUntitledQueryTitle } from '../utils/queryTabTitle';
import { buildSqlServerObjectDefinitionQueries } from '../utils/sqlServerObjectDefinition';
import {
    clampQueryEditorEditorHeight,
    resolveQueryEditorEditorHeightFromRatio,
    resolveQueryEditorEditorHeightRatio,
    sanitizeQueryEditorEditorHeightRatio,
} from '../utils/queryEditorSplitLayout';
import {
    DUCKDB_ROWID_LOCATOR_COLUMN,
    ORACLE_ROWID_LOCATOR_COLUMN,
    type EditRowLocator,
} from '../utils/rowLocator';
import {
    clearQueryTabDraft,
    getQueryTabDraft,
    hasQueryTabDraft,
    persistQueryTabDraftSnapshot,
} from '../utils/sqlFileTabDrafts';
import { buildEditableTriggerSql } from '../utils/triggerEditSql';
import {
    getColumnDefinitionComment,
    getColumnDefinitionKey,
    getColumnDefinitionName,
    getColumnDefinitionType,
} from '../utils/columnDefinition';
import QueryEditorResultsPanel, {
    QUERY_EDITOR_SQL_LOG_TAB_KEY,
    type QueryEditorResultSet,
} from './QueryEditorResultsPanel';
import { SQL_EDITOR_AUTO_COMMIT_DELAY_OPTIONS } from './QueryEditorTransactionSettings';
import QueryEditorTransactionToolbar from './QueryEditorTransactionToolbar';
import QueryEditorToolbar from './QueryEditorToolbar';
import { useSqlEditorTransactionController } from './useSqlEditorTransactionController';
import {
    type CompletionColumnMeta,
    type CompletionPackageMeta,
    type CompletionRoutineMeta,
    type CompletionSequenceMeta,
    type CompletionTableMeta,
    type CompletionTriggerMeta,
    type CompletionViewMeta,
    type QueryEditorNavigationTarget,
    type QueryStatementPlan,
    QUERY_EDITOR_HOVER_DELAY_MS,
    QUERY_EDITOR_LIVE_DECORATION_MAX_TEXT_LENGTH,
    QUERY_EDITOR_OBJECT_DECORATION_MAX_TEXT_LENGTH,
    QUERY_EDITOR_PERSISTED_DRAFT_MAX_TEXT_LENGTH,
    QUERY_EDITOR_SQL_QUALIFIER_COMPLETION_REGEX,
    QUERY_EDITOR_SQL_TABLE_REFERENCE_REGEX,
    QUERY_EDITOR_SQL_THREE_PART_COMPLETION_REGEX,
    appendCommentToDetail,
    areSqlStatementListsEqual,
    buildCompletionDocumentation,
    buildColumnCompletionDetail,
    buildColumnCompletionDocumentation,
    buildCompletionFunctionsMetadataQuerySpecs,
    buildCompletionMaterializedViewsMetadataQuerySpecs,
    buildCompletionPackagesMetadataQuerySpecs,
    buildCompletionSequencesMetadataQuerySpecs,
    buildCompletionTableCommentSQL,
    buildCompletionTriggersMetadataQuerySpecs,
    buildCompletionViewsMetadataQuerySpecs,
    buildQueryEditorAliasMap,
    buildQueryEditorHoverMarkdown,
    buildQualifiedCompletionName,
    clearQueryEditorLinkDecorations,
    clearQueryEditorObjectDecorations,
    collectQueryEditorObjectDecorationCandidates,
    collectQueryEditorReferencedDatabaseNames,
    getCaseInsensitiveValue,
    getFirstRowValue,
    getNormalizedPositionAtOffset,
    hasQueryEditorCtrlMetaModifier,
    getInitialEditorQuery,
    getMySQLShowTablesName,
    getNormalizedOffsetAtPosition,
    getQueryEditorDecorationModelTextIfLightweight,
    getQueryEditorObjectResolveText,
    getTabQueryValue,
    isDocumentLevelShortcutTarget,
    isQueryEditorPrimaryMouseButton,
    normalizeCommentText,
    normalizeQueryResultMessages,
    normalizeCompletionQualifiedName,
    normalizeEditorPosition,
    normalizeExecutedSqlKey,
    normalizeMetadataDialect,
    queryCompletionMetadataRowsBySpecs,
    readSidebarSqlDropText,
    matchLeadingSelectTableReference,
    resolveNewQueryDefaultTemplate,
    resolveEventTargetNode,
    resolveNextResultSetIndex,
    resolveOracleExactCaseTableReference,
    resolveOracleLikeDefaultSchemaName,
    resolveOracleLikeExecutionSchemaName,
    resolveQueryEditorFormatterLanguage,
    resolveQueryEditorHoverTarget,
    resolveQueryEditorNavigationDecorations,
    resolveQueryEditorNavigationTarget,
    resolveQueryLocatorPlan,
    rewriteLeadingSelectTableReference,
    splitCompletionSchemaAndTable,
    splitQueryIdentifierPathSegments,
    stripCompletionIdentifierQuotes,
} from './queryEditor/QueryEditorHelpers';
export {
    collectQueryEditorObjectDecorationCandidates,
    resolveQueryEditorNavigationDecorations,
    resolveQueryEditorNavigationTarget,
} from './queryEditor/QueryEditorHelpers';

const buildQueryEditorMonacoActionLabel = (key: string): string =>
    `GoNavi: ${translate(key)}`;

const QUERY_EDITOR_MONACO_FIND_OPTIONS = {
    addExtraSpaceOnTop: true,
} as const;
const QUERY_EDITOR_NATIVE_SELECT_CURRENT_LINE_EVENT = 'gonavi:native-select-current-line';

const buildQueryEditorMonacoOptions = (isObjectEditQueryTab: boolean) => ({
    minimap: { enabled: false },
    automaticLayout: true,
    fixedOverflowWidgets: true,
    find: QUERY_EDITOR_MONACO_FIND_OPTIONS,
    hover: {
        enabled: true,
        delay: QUERY_EDITOR_HOVER_DELAY_MS,
        above: false,
    },
    scrollBeyondLastLine: false,
    quickSuggestions: { other: true, comments: false, strings: false },
    suggestOnTriggerCharacters: true,
    ...(isObjectEditQueryTab
        ? {
            fontSize: 14,
            lineHeight: 24,
            lineNumbersMinChars: 4,
            stickyScroll: { enabled: false },
        }
        : {}),
});

const QUERY_EDITOR_SQL_PROMPT_PLACEHOLDER = '{SQL}';

const escapeQueryEditorObjectEditSqlLiteral = (value: unknown): string => (
    String(value || '').replace(/'/g, "''")
);

const CLIPBOARD_WRITE_TIMEOUT_MS = 2000;

const copyQueryEditorTextToClipboard = async (text: string): Promise<boolean> => {
    const tryAsyncClipboardWrite = async (): Promise<boolean> => {
        if (typeof navigator?.clipboard?.writeText !== 'function') {
            return false;
        }

        try {
            const written = await Promise.race([
                navigator.clipboard.writeText(text).then(() => true as const),
                new Promise<false>((resolve) => setTimeout(() => resolve(false), CLIPBOARD_WRITE_TIMEOUT_MS)),
            ]);
            return written;
        } catch {
            return false;
        }
    };

    if (typeof document?.createElement === 'function' && typeof document?.execCommand === 'function') {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', 'true');
        textarea.setAttribute('aria-hidden', 'true');
        Object.assign(textarea.style, {
            position: 'fixed',
            top: '0',
            left: '-9999px',
            opacity: '0',
            pointerEvents: 'none',
        });

        try {
            document.body?.appendChild?.(textarea);
            textarea.focus?.();
            textarea.select?.();
            textarea.setSelectionRange?.(0, text.length);
            if (document.execCommand('copy')) {
                return true;
            }
        } catch {
            // Fall through to async clipboard APIs when execCommand is unavailable.
        } finally {
            textarea.remove?.();
        }
    }

    if (await tryAsyncClipboardWrite()) {
        return true;
    }
    return false;
};

const getQueryEditorObjectEditRawValue = (row: Record<string, any>, candidateKeys: string[]): any => {
    const keyMap = new Map<string, any>();
    Object.keys(row || {}).forEach((key) => keyMap.set(key.toLowerCase(), row[key]));
    for (const key of candidateKeys) {
        if (keyMap.has(key.toLowerCase())) {
            const value = keyMap.get(key.toLowerCase());
            if (value !== undefined && value !== null) return value;
        }
    }
    return undefined;
};

const normalizeQueryEditorRoutineDefinitionForEdit = (
    definition: string,
    routineName: string,
    routineType: string,
): string => {
    const text = String(definition || '').trim();
    if (!text) return '';
    if (/^\s*create\b/i.test(text)) return text;
    if (/^\s*(function|procedure)\b/i.test(text)) {
        return `CREATE OR REPLACE ${text}`;
    }
    const normalizedType = String(routineType || 'FUNCTION').trim().toUpperCase().includes('PROC')
        ? 'PROCEDURE'
        : 'FUNCTION';
    return `CREATE OR REPLACE ${normalizedType} ${routineName}\n${text}`;
};

const buildQueryEditorRoutineEditFallbackSql = (
    routineName: string,
    routineType: string,
): string => {
    const normalizedType = String(routineType || 'FUNCTION').trim().toUpperCase().includes('PROC')
        ? 'PROCEDURE'
        : 'FUNCTION';
    if (normalizedType === 'PROCEDURE') {
        return `CREATE OR REPLACE PROCEDURE ${routineName}()\nBEGIN\n    -- TODO: edit procedure body\nEND;`;
    }
    return `CREATE OR REPLACE FUNCTION ${routineName}()\nRETURNS INTEGER\nBEGIN\n    -- TODO: edit function body\n    RETURN 0;\nEND;`;
};

const normalizeQueryEditorMySQLViewDDL = (rawDefinition: unknown): string => {
    const text = String(rawDefinition || '').trim();
    if (!text) return '';

    const normalized = text.replace(/\r\n/g, '\n').trim().replace(/;+\s*$/, '');
    const createViewPrefixPattern = /^\s*create\s+(?:algorithm\s*=\s*\w+\s+)?(?:definer\s*=\s*(?:`[^`]+`|\S+)\s*@\s*(?:`[^`]+`|\S+)\s+)?(?:sql\s+security\s+(?:definer|invoker)\s+)?view\s+/i;
    if (createViewPrefixPattern.test(normalized)) {
        return `${normalized.replace(createViewPrefixPattern, 'CREATE OR REPLACE VIEW ')};`;
    }

    if (/^\s*(select|with)\b/i.test(normalized)) {
        return normalized;
    }

    return `${normalized};`;
};

const normalizeQueryEditorSqlPlusSlashTerminator = (sql: string): string => (
    String(sql || '').trim().replace(/(^|\n)([ \t]*\/[ \t]*);+([ \t]*(?:--[^\n]*)?)\s*$/i, '$1$2$3')
);

const hasQueryEditorSqlPlusSlashTerminator = (sql: string): boolean => (
    /(?:^|\n)[ \t]*\/[ \t]*(?:--[^\n]*)?\s*$/i.test(String(sql || '').trim())
);

const ensureQueryEditorObjectEditSqlTerminator = (sql: string): string => {
    const normalized = normalizeQueryEditorSqlPlusSlashTerminator(sql);
    if (!normalized) return '';
    if (hasQueryEditorSqlPlusSlashTerminator(normalized)) return normalized;
    return /;\s*$/.test(normalized) ? normalized : `${normalized};`;
};

const isQueryEditorCommentOnlyDefinition = (definition: string): boolean => {
    const normalized = String(definition || '').replace(/\r\n/g, '\n').trim();
    if (!normalized) return false;
    const lines = normalized
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    return lines.length > 0 && lines.every((line) => line.startsWith('--'));
};

const withQueryEditorCreateOrReplacePackageHeaders = (definition: string): string => {
    const normalized = String(definition || '').replace(/\r\n/g, '\n').trim();
    if (!normalized) return '';
    return normalized
        .split(/(?=^\s*PACKAGE(?:\s+BODY)?\b)/gim)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => (/^\s*CREATE\b/i.test(part) ? part : `CREATE OR REPLACE ${part}`))
        .join('\n/\n');
};

const buildQueryEditorQualifiedObjectName = (objectName: string, schemaName?: string): string => {
    const normalizedObjectName = String(objectName || '').trim();
    const normalizedSchemaName = String(schemaName || '').trim();
    if (!normalizedObjectName || !normalizedSchemaName || normalizedObjectName.includes('.')) {
        return normalizedObjectName;
    }
    return `${normalizedSchemaName}.${normalizedObjectName}`;
};

const buildQueryEditorEditableDefinitionSql = (
    objectType: 'view-def' | 'sequence-def' | 'package-def',
    definition: string,
    objectName: string,
    objectLabel: string,
): string => {
    const normalizedDefinition = String(definition || '').trim();
    const header = [
        `-- ${translate('definition_viewer.edit.comment_title', { object: objectLabel, name: objectName })}`,
        `-- ${translate('definition_viewer.edit.comment_compatibility')}`,
    ].join('\n') + '\n';
    if (!normalizedDefinition) {
        return `${header}-- ${translate('definition_viewer.edit.comment_empty_definition', { name: objectName })}\n`;
    }

    if (isQueryEditorCommentOnlyDefinition(normalizedDefinition)) {
        return `${header}${ensureQueryEditorObjectEditSqlTerminator(normalizedDefinition)}`;
    }

    if (objectType === 'view-def' && !/^\s*create\b/i.test(normalizedDefinition)) {
        if (/^\s*view\b/i.test(normalizedDefinition)) {
            return `${header}${ensureQueryEditorObjectEditSqlTerminator(normalizedDefinition.replace(/^\s*view\b/i, 'CREATE OR REPLACE VIEW'))}`;
        }
        return `${header}CREATE OR REPLACE VIEW ${objectName} AS\n${ensureQueryEditorObjectEditSqlTerminator(normalizedDefinition)}`;
    }

    if (objectType === 'sequence-def' && !/^\s*create\b/i.test(normalizedDefinition)) {
        return `${header}${ensureQueryEditorObjectEditSqlTerminator(`CREATE SEQUENCE ${objectName}\n${normalizedDefinition}`)}`;
    }

    if (
        objectType === 'package-def'
        && !/^\s*create\b/i.test(normalizedDefinition)
        && /^\s*package\b/i.test(normalizedDefinition)
    ) {
        return `${header}${withQueryEditorCreateOrReplacePackageHeaders(normalizedDefinition)}`;
    }

    return `${header}${ensureQueryEditorObjectEditSqlTerminator(normalizedDefinition)}`;
};

const buildQueryEditorObjectDefinitionConnectionConfig = (conn: any): Record<string, any> => ({
    ...conn.config,
    port: Number(conn.config?.port),
    password: conn.config?.password || '',
    database: conn.config?.database || '',
    useSSH: conn.config?.useSSH || false,
    ssh: conn.config?.ssh || { host: '', port: 22, user: '', password: '', keyPath: '' },
});

const runQueryEditorObjectDefinitionCandidates = async (
    config: Record<string, any>,
    dbName: string,
    queries: string[],
    collectAll = false,
): Promise<any[]> => {
    const collectedRows: any[] = [];
    for (const query of queries) {
        const sql = String(query || '').trim();
        if (!sql || sql.startsWith('--')) continue;
        try {
            const result = await DBQuery(buildRpcConnectionConfig(config) as any, dbName, sql);
            if (!result.success || !Array.isArray(result.data) || result.data.length === 0) {
                continue;
            }
            if (!collectAll) {
                return result.data;
            }
            collectedRows.push(...result.data);
        } catch {
            // 元数据定义读取失败时保留编辑模板。
        }
    }
    return collectedRows;
};

const buildQueryEditorViewDefinitionQueries = (
    dialect: string,
    viewName: string,
    dbName: string,
    schemaName?: string,
    viewKind?: 'view' | 'materialized',
): string[] => {
    const parsed = splitSidebarQualifiedName(viewName);
    const objectName = parsed.objectName || viewName;
    const schema = String(schemaName || parsed.schemaName || '').trim();
    const safeName = escapeQueryEditorObjectEditSqlLiteral(objectName);
    const safeDbName = escapeQueryEditorObjectEditSqlLiteral(dbName);

    switch (dialect) {
        case 'mysql':
        case 'starrocks': {
            const viewRef = schema
                ? `\`${schema.replace(/`/g, '``')}\`.\`${objectName.replace(/`/g, '``')}\``
                : `\`${objectName.replace(/`/g, '``')}\``;
            if (dialect === 'starrocks' && viewKind === 'materialized') {
                return [
                    `SHOW CREATE MATERIALIZED VIEW ${viewRef}`,
                    `SHOW CREATE TABLE ${viewRef}`,
                ];
            }
            return [
                `SHOW CREATE VIEW ${viewRef}`,
                safeDbName
                    ? `SELECT VIEW_DEFINITION AS view_definition FROM information_schema.views WHERE table_schema = '${safeDbName}' AND table_name = '${safeName}' LIMIT 1`
                    : '',
                `SHOW CREATE TABLE ${viewRef}`,
            ].filter(Boolean);
        }
        case 'postgres':
        case 'kingbase':
        case 'highgo':
        case 'vastbase':
        case 'opengauss':
        case 'gaussdb': {
            const schemaRef = schema || 'public';
            return [`SELECT pg_get_viewdef('${escapeQueryEditorObjectEditSqlLiteral(schemaRef)}.${safeName}'::regclass, true) AS view_definition`];
        }
        case 'sqlserver':
            return buildSqlServerObjectDefinitionQueries('view', viewName, dbName, 'view_definition');
        case 'oracle': {
            const owner = schema ? escapeQueryEditorObjectEditSqlLiteral(schema).toUpperCase() : (safeDbName ? safeDbName.toUpperCase() : '');
            if (owner) {
                return [`SELECT TEXT AS view_definition FROM ALL_VIEWS WHERE OWNER = '${owner}' AND VIEW_NAME = '${safeName.toUpperCase()}'`];
            }
            return [`SELECT TEXT AS view_definition FROM USER_VIEWS WHERE VIEW_NAME = '${safeName.toUpperCase()}'`];
        }
        case 'sqlite':
            return [`SELECT sql AS view_definition FROM sqlite_master WHERE type='view' AND name='${safeName}'`];
        case 'duckdb': {
            const schemaRef = schema || 'main';
            return [`SELECT view_definition FROM information_schema.views WHERE table_schema = '${escapeQueryEditorObjectEditSqlLiteral(schemaRef)}' AND table_name = '${safeName}' LIMIT 1`];
        }
        default:
            return [];
    }
};

const extractQueryEditorViewDefinition = (dialect: string, data: any[]): string => {
    if (!Array.isArray(data) || data.length === 0) return '';
    const row = data[0] as Record<string, any>;
    if (dialect === 'mysql' || dialect === 'starrocks') {
        const direct = getQueryEditorObjectEditRawValue(row, ['view_definition', 'VIEW_DEFINITION']);
        if (direct !== undefined && direct !== null && String(direct).trim()) {
            return normalizeQueryEditorMySQLViewDDL(direct);
        }
        const sqlKey = Object.keys(row).find((key) => {
            const lowerKey = key.toLowerCase();
            return lowerKey.includes('create view') || lowerKey === 'create view' || lowerKey.includes('create table');
        });
        if (sqlKey) {
            return normalizeQueryEditorMySQLViewDDL(row[sqlKey]);
        }
        const createValue = Object.values(row).find((value) => {
            const text = String(value || '').toUpperCase();
            return text.includes('CREATE') && (text.includes('VIEW') || text.includes('TABLE'));
        });
        return createValue ? normalizeQueryEditorMySQLViewDDL(createValue) : '';
    }
    if (dialect === 'sqlserver') {
        const direct = getQueryEditorObjectEditRawValue(row, ['view_definition', 'definition']);
        if (direct !== undefined && direct !== null && String(direct).trim()) {
            return String(direct);
        }
        return data
            .map((item) => getQueryEditorObjectEditRawValue(item, ['Text', 'text']))
            .filter((value) => value !== undefined && value !== null)
            .map((value) => String(value))
            .join('');
    }
    const direct = getQueryEditorObjectEditRawValue(row, ['view_definition', 'definition', 'sql', 'text', 'TEXT', 'SQL']);
    return direct !== undefined && direct !== null ? String(direct) : String(Object.values(row)[0] || '');
};

const buildQueryEditorSequenceDefinitionQueries = (
    dialect: string,
    sequenceName: string,
    dbName: string,
    schemaName?: string,
): string[] => {
    const parsed = splitSidebarQualifiedName(sequenceName);
    const objectName = parsed.objectName || sequenceName;
    const schema = String(schemaName || parsed.schemaName || '').trim();
    const safeName = escapeQueryEditorObjectEditSqlLiteral(objectName);
    const safeDbName = escapeQueryEditorObjectEditSqlLiteral(dbName);
    const owner = schema ? escapeQueryEditorObjectEditSqlLiteral(schema).toUpperCase() : (safeDbName ? safeDbName.toUpperCase() : '');

    switch (dialect) {
        case 'oracle':
            if (owner) {
                return [`SELECT SEQUENCE_OWNER, SEQUENCE_NAME, MIN_VALUE, MAX_VALUE, INCREMENT_BY, CYCLE_FLAG, ORDER_FLAG, CACHE_SIZE, LAST_NUMBER FROM ALL_SEQUENCES WHERE SEQUENCE_OWNER = '${owner}' AND SEQUENCE_NAME = '${safeName.toUpperCase()}'`];
            }
            return [`SELECT SEQUENCE_NAME, MIN_VALUE, MAX_VALUE, INCREMENT_BY, CYCLE_FLAG, ORDER_FLAG, CACHE_SIZE, LAST_NUMBER FROM USER_SEQUENCES WHERE SEQUENCE_NAME = '${safeName.toUpperCase()}'`];
        case 'postgres':
        case 'kingbase':
        case 'highgo':
        case 'vastbase':
        case 'opengauss':
        case 'gaussdb': {
            const schemaRef = schema || 'public';
            return [`SELECT sequence_schema, sequence_name, data_type, start_value, minimum_value, maximum_value, increment FROM information_schema.sequences WHERE sequence_schema = '${escapeQueryEditorObjectEditSqlLiteral(schemaRef)}' AND sequence_name = '${safeName}' LIMIT 1`];
        }
        default:
            return [];
    }
};

const buildQueryEditorSequenceDefinitionFromRow = (
    row: Record<string, any>,
    fallbackSequenceName: string,
    fallbackSchemaName?: string,
): string => {
    const sequenceName = String(getQueryEditorObjectEditRawValue(row, ['sequence_name']) || splitSidebarQualifiedName(fallbackSequenceName).objectName || fallbackSequenceName).trim();
    const owner = String(getQueryEditorObjectEditRawValue(row, ['sequence_owner', 'owner', 'sequence_schema']) || fallbackSchemaName || splitSidebarQualifiedName(fallbackSequenceName).schemaName || '').trim();
    const name = buildQueryEditorQualifiedObjectName(sequenceName, owner);
    if (!name) return '';

    const clauses: string[] = [];
    const increment = getQueryEditorObjectEditRawValue(row, ['increment_by', 'increment']);
    const minValue = getQueryEditorObjectEditRawValue(row, ['min_value', 'minimum_value']);
    const maxValue = getQueryEditorObjectEditRawValue(row, ['max_value', 'maximum_value']);
    const cacheSize = Number(getQueryEditorObjectEditRawValue(row, ['cache_size']));
    const cycleFlag = String(getQueryEditorObjectEditRawValue(row, ['cycle_flag']) || '').trim().toUpperCase();
    const orderFlag = String(getQueryEditorObjectEditRawValue(row, ['order_flag']) || '').trim().toUpperCase();

    if (increment !== undefined && increment !== null && String(increment).trim() !== '') {
        clauses.push(`INCREMENT BY ${increment}`);
    }
    if (minValue !== undefined && minValue !== null && String(minValue).trim() !== '') {
        clauses.push(`MINVALUE ${minValue}`);
    }
    if (maxValue !== undefined && maxValue !== null && String(maxValue).trim() !== '') {
        clauses.push(`MAXVALUE ${maxValue}`);
    }
    if (Number.isFinite(cacheSize)) {
        clauses.push(cacheSize > 0 ? `CACHE ${cacheSize}` : 'NOCACHE');
    }
    if (cycleFlag) clauses.push(cycleFlag === 'Y' ? 'CYCLE' : 'NOCYCLE');
    if (orderFlag) clauses.push(orderFlag === 'Y' ? 'ORDER' : 'NOORDER');

    return [`CREATE SEQUENCE ${name}`, ...clauses.map((clause) => `  ${clause}`)].join('\n');
};

const extractQueryEditorSequenceDefinition = (
    data: any[],
    sequenceName: string,
    schemaName?: string,
): string => {
    if (!Array.isArray(data) || data.length === 0) return '';
    return buildQueryEditorSequenceDefinitionFromRow(data[0] as Record<string, any>, sequenceName, schemaName);
};

const buildQueryEditorPackageDefinitionQueries = (
    dialect: string,
    packageName: string,
    dbName: string,
    schemaName?: string,
): string[] => {
    const parsed = splitSidebarQualifiedName(packageName);
    const objectName = parsed.objectName || packageName;
    const schema = String(schemaName || parsed.schemaName || '').trim();
    const safeName = escapeQueryEditorObjectEditSqlLiteral(objectName);
    const safeDbName = escapeQueryEditorObjectEditSqlLiteral(dbName);

    if (dialect !== 'oracle') {
        return [];
    }

    const owner = schema ? escapeQueryEditorObjectEditSqlLiteral(schema).toUpperCase() : (safeDbName ? safeDbName.toUpperCase() : '');
    if (owner) {
        return [
            `SELECT TEXT FROM ALL_SOURCE WHERE OWNER = '${owner}' AND NAME = '${safeName.toUpperCase()}' AND TYPE = 'PACKAGE' ORDER BY LINE`,
            `SELECT TEXT FROM ALL_SOURCE WHERE OWNER = '${owner}' AND NAME = '${safeName.toUpperCase()}' AND TYPE = 'PACKAGE BODY' ORDER BY LINE`,
        ];
    }
    return [
        `SELECT TEXT FROM USER_SOURCE WHERE NAME = '${safeName.toUpperCase()}' AND TYPE = 'PACKAGE' ORDER BY LINE`,
        `SELECT TEXT FROM USER_SOURCE WHERE NAME = '${safeName.toUpperCase()}' AND TYPE = 'PACKAGE BODY' ORDER BY LINE`,
    ];
};

const extractQueryEditorPackageDefinition = (data: any[]): string => {
    if (!Array.isArray(data) || data.length === 0) return '';
    return data
        .map((row: any) => getQueryEditorObjectEditRawValue(row, ['text', 'TEXT']) ?? Object.values(row || {})[0] ?? '')
        .map((value) => String(value))
        .join('');
};

const buildQueryEditorTriggerDefinitionQueries = (
    dialect: string,
    triggerName: string,
    dbName: string,
    schemaName?: string,
): string[] => {
    const parsed = splitSidebarQualifiedName(triggerName);
    const objectName = parsed.objectName || triggerName;
    const schema = String(schemaName || parsed.schemaName || '').trim();
    const safeName = escapeQueryEditorObjectEditSqlLiteral(objectName);
    const safeDbName = escapeQueryEditorObjectEditSqlLiteral(dbName);

    switch (dialect) {
        case 'mysql':
        case 'starrocks': {
            const triggerRef = schema
                ? `\`${schema.replace(/`/g, '``')}\`.\`${objectName.replace(/`/g, '``')}\``
                : `\`${objectName.replace(/`/g, '``')}\``;
            return [
                `SHOW CREATE TRIGGER ${triggerRef}`,
                safeDbName
                    ? `SELECT TRIGGER_NAME, TRIGGER_SCHEMA, EVENT_OBJECT_SCHEMA, EVENT_OBJECT_TABLE, ACTION_TIMING, EVENT_MANIPULATION, ACTION_ORIENTATION, ACTION_STATEMENT FROM information_schema.triggers WHERE trigger_schema = '${safeDbName}' AND trigger_name = '${safeName}' LIMIT 1`
                    : '',
            ].filter(Boolean);
        }
        case 'postgres':
        case 'kingbase':
        case 'highgo':
        case 'vastbase':
        case 'opengauss':
        case 'gaussdb':
            return [`SELECT pg_get_triggerdef(t.oid, true) AS trigger_definition
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
WHERE t.tgname = '${safeName}'
  AND NOT t.tgisinternal
LIMIT 1`];
        case 'sqlserver':
            return buildSqlServerObjectDefinitionQueries('trigger', triggerName, dbName, 'trigger_definition');
        case 'oracle': {
            if (schema) {
                return [
                    `SELECT DBMS_METADATA.GET_DDL('TRIGGER', '${safeName.toUpperCase()}', '${escapeQueryEditorObjectEditSqlLiteral(schema).toUpperCase()}') AS trigger_definition FROM DUAL`,
                    `SELECT TRIGGER_BODY FROM ALL_TRIGGERS WHERE OWNER = '${escapeQueryEditorObjectEditSqlLiteral(schema).toUpperCase()}' AND TRIGGER_NAME = '${safeName.toUpperCase()}'`,
                ];
            }
            if (safeDbName) {
                return [
                    `SELECT DBMS_METADATA.GET_DDL('TRIGGER', '${safeName.toUpperCase()}', '${safeDbName.toUpperCase()}') AS trigger_definition FROM DUAL`,
                    `SELECT TRIGGER_BODY FROM ALL_TRIGGERS WHERE OWNER = '${safeDbName.toUpperCase()}' AND TRIGGER_NAME = '${safeName.toUpperCase()}'`,
                ];
            }
            return [
                `SELECT DBMS_METADATA.GET_DDL('TRIGGER', '${safeName.toUpperCase()}') AS trigger_definition FROM DUAL`,
                `SELECT TRIGGER_BODY FROM USER_TRIGGERS WHERE TRIGGER_NAME = '${safeName.toUpperCase()}'`,
            ];
        }
        case 'sqlite':
            return [`SELECT sql AS trigger_definition FROM sqlite_master WHERE type = 'trigger' AND name = '${safeName}'`];
        default:
            return [];
    }
};

const extractQueryEditorTriggerDefinition = (dialect: string, data: any[]): string => {
    if (!Array.isArray(data) || data.length === 0) return '';
    const row = data[0] as Record<string, any>;
    const direct = getQueryEditorObjectEditRawValue(row, ['trigger_definition', 'definition', 'sql', 'SQL']);
    if (direct !== undefined && direct !== null && String(direct).trim()) {
        return String(direct);
    }
    if (dialect === 'mysql' || dialect === 'starrocks') {
        const statementKey = Object.keys(row).find((key) => {
            const lowerKey = key.toLowerCase();
            return lowerKey.includes('statement') || lowerKey.includes('create trigger');
        });
        if (statementKey) return String(row[statementKey] || '');
        const createValue = Object.values(row).find((value) => String(value || '').toUpperCase().includes('CREATE TRIGGER'));
        return createValue ? String(createValue) : String(getQueryEditorObjectEditRawValue(row, ['ACTION_STATEMENT', 'action_statement']) || '');
    }
    return String(getQueryEditorObjectEditRawValue(row, ['TRIGGER_BODY', 'trigger_body', 'TEXT', 'text']) || Object.values(row)[0] || '');
};

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
let sharedTablesData: CompletionTableMeta[] = [];
let sharedAllColumnsData: CompletionColumnMeta[] = [];
let sharedVisibleDbs: string[] = [];
let sharedViewsData: CompletionViewMeta[] = [];
let sharedMaterializedViewsData: CompletionViewMeta[] = [];
let sharedTriggersData: CompletionTriggerMeta[] = [];
let sharedRoutinesData: CompletionRoutineMeta[] = [];
let sharedSequencesData: CompletionSequenceMeta[] = [];
let sharedPackagesData: CompletionPackageMeta[] = [];
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
const QUERY_EDITOR_SQL_SNIPPET_SUGGEST_DETAIL_MIN_HEIGHT = 260;

const getCompletionTableNameFromRow = (row: any): string => (
    normalizeCommentText(
        getCaseInsensitiveValue(row, ['table_name', 'TABLE_NAME', 'Table', 'table', 'name', 'Name'])
            ?? Object.values(row || {})[0],
    )
);

const getCompletionTableCommentFromRow = (row: any): string => (
    normalizeCommentText(getCaseInsensitiveValue(row, [
        'table_comment',
        'TABLE_COMMENT',
        'comment',
        'comments',
        'Comment',
        'COMMENTS',
        'description',
        'Description',
    ]))
);

const getCompletionTableComment = (
    tableComments: Map<string, string>,
    tableName: string,
    rowComment = '',
): string => {
    const parsed = splitCompletionSchemaAndTable(String(tableName || ''));
    return tableComments.get(String(tableName || '').toLowerCase())
        || (parsed.table ? tableComments.get(parsed.table.toLowerCase()) : '')
        || normalizeCommentText(rowComment);
};

const buildCompletionTableMeta = (
    dbName: string,
    row: any,
    tableComments: Map<string, string>,
): CompletionTableMeta | null => {
    const tableName = getCompletionTableNameFromRow(row);
    if (!tableName) return null;
    return {
        dbName,
        tableName,
        comment: getCompletionTableComment(tableComments, tableName, getCompletionTableCommentFromRow(row)) || undefined,
    };
};

const fetchCompletionTableCommentMap = async (
    config: any,
    dbName: string,
    metadataDialect: string,
): Promise<Map<string, string>> => {
    const tableComments = new Map<string, string>();
    const tableCommentSQL = buildCompletionTableCommentSQL(metadataDialect, dbName);
    if (!tableCommentSQL) return tableComments;

    try {
        const resTableComments = await DBQuery(buildRpcConnectionConfig(config) as any, dbName, tableCommentSQL);
        if (resTableComments.success && Array.isArray(resTableComments.data)) {
            resTableComments.data.forEach((row: any) => {
                const tableName = normalizeCommentText(getCaseInsensitiveValue(row, ['table_name', 'TABLE_NAME', 'name', 'Name']));
                if (!tableName) return;
                tableComments.set(tableName.toLowerCase(), getCompletionTableCommentFromRow(row));
            });
        }
    } catch {
        // 表备注只是补全增强，失败时保留原有表名补全。
    }
    return tableComments;
};

const buildSqlSnippetVariableMap = (now: Date): Record<string, string> => {
    const pad = (value: number) => String(value).padStart(2, '0');
    return {
        CURRENT_YEAR: String(now.getFullYear()),
        CURRENT_MONTH: pad(now.getMonth() + 1),
        CURRENT_DATE: pad(now.getDate()),
        CURRENT_HOUR: pad(now.getHours()),
        CURRENT_MINUTE: pad(now.getMinutes()),
        CURRENT_SECOND: pad(now.getSeconds()),
        CURRENT_SECONDS_UNIX: String(Math.floor(now.getTime() / 1000)),
        UUID: uuidv4(),
        RANDOM: String(Math.floor(100000 + Math.random() * 900000)),
    };
};

const materializeSqlSnippetText = (body: string): string => {
    const tabstopValues = new Map<string, string>();
    const variableMap = buildSqlSnippetVariableMap(new Date());
    return String(body || '')
        .replace(/\$\{(\d+)\|([^}]+)\|\}/g, (_match, index: string, rawChoices: string) => {
            const choice = String(rawChoices || '')
                .split(',')
                .map((item) => item.trim())
                .find(Boolean) || '';
            if (index !== '0') {
                tabstopValues.set(index, choice);
            }
            return choice;
        })
        .replace(/\$\{([A-Z_]+)\}/g, (match, variableName: string) => (
            Object.prototype.hasOwnProperty.call(variableMap, variableName)
                ? variableMap[variableName]
                : match
        ))
        .replace(/\$\{(\d+):([^}]+)\}/g, (_match, index: string, placeholder: string) => {
            const value = String(placeholder || '');
            if (index !== '0') {
                tabstopValues.set(index, value);
            }
            return value;
        })
        .replace(/\$(\d+)/g, (_match, index: string) => (
            index === '0' ? '' : (tabstopValues.get(index) ?? '')
        ));
};

const resetSharedQueryEditorMetadata = () => {
    sharedCurrentDb = '';
    sharedTablesData = [];
    sharedAllColumnsData = [];
    sharedVisibleDbs = [];
    sharedViewsData = [];
    sharedMaterializedViewsData = [];
    sharedTriggersData = [];
    sharedRoutinesData = [];
    sharedSequencesData = [];
    sharedPackagesData = [];
    sharedColumnsCacheData = {};
    clearRecord(sharedLazyTablesCache);
    clearRecord(sharedLazyTablesInFlight);
};


const QueryEditor: React.FC<{ tab: TabData; isActive?: boolean }> = ({ tab, isActive = true }) => {
  const appearance = useStore(state => state.appearance);
  const [query, setQuery] = useState(() => getInitialEditorQuery(
      tab,
      resolveNewQueryDefaultTemplate(appearance.newQuerySqlTemplate),
  ));
  const isExternalSQLFileTab = Boolean(String(tab.filePath || '').trim());
  const isObjectEditQueryTab = tab.type === 'query' && tab.queryMode === 'object-edit';
  const queryEditorMonacoOptions = useMemo(
      () => buildQueryEditorMonacoOptions(isObjectEditQueryTab),
      [isObjectEditQueryTab],
  );
  
  type ResultSet = QueryEditorResultSet;

  // Result Sets
  const [resultSets, setResultSets] = useState<ResultSet[]>([]);
  const [activeResultKey, setActiveResultKey] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [executionError, setExecutionError] = useState<string>('');
  const [, setCurrentQueryId] = useState<string>('');
  const [isSqlSnippetPickerOpen, setIsSqlSnippetPickerOpen] = useState(false);
  const [sqlSnippetPickerKeyword, setSqlSnippetPickerKeyword] = useState('');
  const runSeqRef = useRef(0);
  const currentQueryIdRef = useRef('');
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveModalMode, setSaveModalMode] = useState<'save' | 'rename'>('save');
  const [saveForm] = Form.useForm();

  // Database Selection
  const [currentConnectionId, setCurrentConnectionId] = useState<string>(tab.connectionId);
  const [currentDb, setCurrentDb] = useState<string>(tab.dbName || '');
  const [dbList, setDbList] = useState<string[]>([]);

  // Resizing state
  const [editorHeight, setEditorHeight] = useState(300);
  const editorStageRef = useRef<HTMLDivElement | null>(null);
  const editorShellRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const runQueryActionRef = useRef<any>(null);
  const selectCurrentStatementActionRef = useRef<any>(null);
  const duplicateCurrentLineActionRef = useRef<any>(null);
  const saveQueryActionRef = useRef<any>(null);
  const findInEditorActionRef = useRef<any>(null);
  const formatSqlActionRef = useRef<any>(null);
  const insertSqlSnippetActionRef = useRef<any>(null);
  const aiContextMenuActionDisposablesRef = useRef<any[]>([]);
  const toggleQueryResultsPanelActionRef = useRef<any>(null);
  const lastExternalQueryRef = useRef<string>(getTabQueryValue(tab));
  const lastLocalQueryRef = useRef<string>(query);
  const imeCompositionFallbackRef = useRef<{
      editor: any;
      valueBefore: string;
      selectionBefore: any;
      positionBefore: { lineNumber: number; column: number } | null;
      committedText: string;
  } | null>(null);
  const imeCompositionFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const sequencesRef = useRef<CompletionSequenceMeta[]>([]);
  const packagesRef = useRef<CompletionPackageMeta[]>([]);
  const visibleDbsRef = useRef<string[]>([]); // Store visible databases for cross-db intellisense
  const metadataFetchKeyRef = useRef<string>('');
  const metadataContextKeyRef = useRef<string>('');

  const connections = useStore(state => state.connections);
  const queryCapableConnections = useMemo(
      () => connections.filter(c => getDataSourceCapabilities(c.config).supportsQueryEditor),
      [connections]
  );

  const addSqlLog = useStore(state => state.addSqlLog);
  const sqlLogCount = useStore(state => state.sqlLogs.length);
  const addTab = useStore(state => state.addTab);
  const setActiveContext = useStore(state => state.setActiveContext);
  const updateQueryTabDraft = useStore(state => state.updateQueryTabDraft);
  const activeTabId = useStore(state => state.activeTabId);
  const savedQueries = useStore(state => state.savedQueries);
  const sqlSnippets = useStore(state => state.sqlSnippets);
  const currentConnectionIdRef = useRef(currentConnectionId);
  const currentDbRef = useRef(currentDb);
  const draftSnapshotTab = useMemo(() => ({
      id: tab.id,
      title: tab.title,
      connectionId: tab.connectionId,
      dbName: tab.dbName,
      filePath: tab.filePath,
      savedQueryId: tab.savedQueryId,
      readOnly: tab.readOnly,
  }), [tab.connectionId, tab.dbName, tab.filePath, tab.id, tab.readOnly, tab.savedQueryId, tab.title]);
  const connectionsRef = useRef(connections);
  const columnsCacheRef = useRef<Record<string, ColumnDefinition[]>>({});
  const saveQuery = useStore(state => state.saveQuery);
  const theme = useStore(state => state.theme);
  const languagePreference = useStore((state) => state.languagePreference);
  void languagePreference;
  const darkMode = theme === 'dark';
  const isV2Ui = appearance.uiVersion === 'v2';
  const sqlFormatOptions = useStore(state => state.sqlFormatOptions);
  const setSqlFormatOptions = useStore(state => state.setSqlFormatOptions);
  const queryOptions = useStore(state => state.queryOptions);
  const setQueryOptions = useStore(state => state.setQueryOptions);
  const queryEditorEditorHeightRatio = sanitizeQueryEditorEditorHeightRatio(
      queryOptions?.queryEditorEditorHeightRatio,
  );
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
  // SQL 诊断 / 慢 SQL 历史的快捷键绑定（从 store 读取，用户可在快捷键管理面板自定义）
  const diagnoseQueryShortcutBinding = useMemo(
      () => resolveShortcutBinding(shortcutOptions, 'diagnoseQuery', activeShortcutPlatform),
      [activeShortcutPlatform, shortcutOptions],
  );
  const showSlowQueriesShortcutBinding = useMemo(
      () => resolveShortcutBinding(shortcutOptions, 'showSlowQueries', activeShortcutPlatform),
      [activeShortcutPlatform, shortcutOptions],
  );
  const sortedSqlSnippets = useMemo(
      () => [...sqlSnippets].sort((left, right) => (
          left.prefix.localeCompare(right.prefix) || left.name.localeCompare(right.name)
      )),
      [sqlSnippets],
  );
  const filteredSqlSnippets = useMemo(() => {
      const keyword = String(sqlSnippetPickerKeyword || '').trim().toLowerCase();
      if (!keyword) {
          return sortedSqlSnippets;
      }
      return sortedSqlSnippets.filter((snippet) => (
          [
              snippet.prefix,
              snippet.name,
              snippet.description,
              snippet.syntaxHelp,
              snippet.body,
          ].some((field) => String(field || '').toLowerCase().includes(keyword))
      ));
  }, [sortedSqlSnippets, sqlSnippetPickerKeyword]);
  const sqlSnippetPickerEmptyLabel = useMemo(
      () => (
          String(sqlSnippetPickerKeyword || '').trim()
              ? translate('query_editor.snippet_picker.empty_filtered')
              : translate('query_editor.snippet_picker.empty')
      ),
      [sqlSnippetPickerKeyword],
  );

  const openSqlAnalysisWorkbench = useCallback(
      (view: 'diagnose' | 'slow-query', nextSql?: string) => {
          const connectionId = String(currentConnectionId || '').trim();
          if (!connectionId) {
              message.warning(translate('query_editor.message.connection_not_found'));
              return;
          }
          const dbName = String(currentDb || tab.dbName || '').trim();
          addTab(buildSqlAnalysisWorkbenchTab({
              connectionId,
              dbName: dbName || undefined,
              query: typeof nextSql === 'string' && nextSql.trim() ? nextSql : undefined,
              view,
          }));
      },
      [addTab, currentConnectionId, currentDb, tab.dbName],
  );

  const handleCloseSqlSnippetPicker = useCallback(() => {
      setIsSqlSnippetPickerOpen(false);
      setSqlSnippetPickerKeyword('');
  }, []);

  const handleOpenSqlSnippetPicker = useCallback(() => {
      setSqlSnippetPickerKeyword('');
      setIsSqlSnippetPickerOpen(true);
  }, []);

  const handleOpenSnippetSettingsFromPicker = useCallback(() => {
      handleCloseSqlSnippetPicker();
      window.dispatchEvent(new CustomEvent('gonavi:open-snippet-settings'));
  }, [handleCloseSqlSnippetPicker]);

  const registerInsertSqlSnippetContextMenuAction = useCallback((editor: any) => {
      if (insertSqlSnippetActionRef.current) {
          insertSqlSnippetActionRef.current.dispose();
          insertSqlSnippetActionRef.current = null;
      }
      if (!editor) {
          return;
      }

      insertSqlSnippetActionRef.current = editor.addAction({
          id: 'gonavi.insertSqlSnippet',
          label: translate('query_editor.action.insert_sql_snippet'),
          contextMenuGroupId: '8_snippet',
          contextMenuOrder: 1,
          run: handleOpenSqlSnippetPicker,
      });
  }, [handleOpenSqlSnippetPicker]);

  // SQL 诊断 / 慢 SQL 历史的快捷键监听（必须在 binding 声明之后）
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: KeyboardEvent) => {
      if (diagnoseQueryShortcutBinding?.enabled && isShortcutMatch(e, diagnoseQueryShortcutBinding.combo)) {
        e.preventDefault();
        openSqlAnalysisWorkbench('diagnose', getCurrentQuery());
        return;
      }
      if (showSlowQueriesShortcutBinding?.enabled && isShortcutMatch(e, showSlowQueriesShortcutBinding.combo)) {
        e.preventDefault();
        openSqlAnalysisWorkbench('slow-query');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [diagnoseQueryShortcutBinding, isActive, openSqlAnalysisWorkbench, showSlowQueriesShortcutBinding]);
  const selectCurrentStatementShortcutBinding = useMemo(
      () => resolveShortcutBinding(shortcutOptions, 'selectCurrentStatement', activeShortcutPlatform),
      [activeShortcutPlatform, shortcutOptions],
  );
  const duplicateCurrentLineShortcutBinding = useMemo(
      () => resolveShortcutBinding(shortcutOptions, 'duplicateCurrentLine', activeShortcutPlatform),
      [activeShortcutPlatform, shortcutOptions],
  );
  const saveQueryShortcutBinding = useMemo(
      () => resolveShortcutBinding(shortcutOptions, 'saveQuery', activeShortcutPlatform),
      [activeShortcutPlatform, shortcutOptions],
  );
  const formatSqlShortcutBinding = useMemo(
      () => resolveShortcutBinding(shortcutOptions, 'formatSql', activeShortcutPlatform),
      [activeShortcutPlatform, shortcutOptions],
  );
  const toggleQueryResultsPanelShortcutBinding = useMemo(
      () => resolveShortcutBinding(shortcutOptions, 'toggleQueryResultsPanel', activeShortcutPlatform),
      [activeShortcutPlatform, shortcutOptions],
  );
  const findInEditorShortcutCombo = useMemo(
      () => activeShortcutPlatform === 'mac' ? 'Meta+F' : 'Ctrl+F',
      [activeShortcutPlatform],
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
  const handleOpenEditorFind = useCallback(() => {
      const editor = editorRef.current;
      if (!editor) {
          return;
      }

      editor.focus?.();
      try {
          const findAction = editor.getAction?.('actions.find');
          if (findAction?.run) {
              void findAction.run();
              return;
          }
      } catch {
          // Fall back to Monaco's built-in command id if the action lookup fails.
      }

      editor.trigger?.('keyboard', 'actions.find', null);
  }, []);
  const handleShowSqlExecutionLog = useCallback((mode: 'open' | 'toggle' = 'toggle') => {
      if (!isActive) {
          return;
      }
      if (mode !== 'open' && isResultPanelVisible && activeResultKey === QUERY_EDITOR_SQL_LOG_TAB_KEY) {
          updateResultPanelVisibility(false);
          return;
      }
      updateResultPanelVisibility(true);
      setActiveResultKey(QUERY_EDITOR_SQL_LOG_TAB_KEY);
  }, [activeResultKey, isActive, isResultPanelVisible, updateResultPanelVisibility]);
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
  } = useSqlEditorTransactionController({
      tabId: tab.id,
      translate: (key, params) => translate(key, params),
  });
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
      lastLocalQueryRef.current = next;
      persistQueryTabDraftSnapshot(draftSnapshotTab, next, {
          connectionId: currentConnectionIdRef.current,
          dbName: currentDbRef.current,
      });
  }, [draftSnapshotTab]);

  const applyQueryState = useCallback((nextQuery: string) => {
      const next = String(nextQuery ?? '');
      syncQueryDraft(next);
      if (!isExternalSQLFileTab || next.length <= QUERY_EDITOR_PERSISTED_DRAFT_MAX_TEXT_LENGTH) {
          setQuery(next);
      }
  }, [isExternalSQLFileTab, syncQueryDraft]);

  const handleInsertSqlSnippet = useCallback((snippet: SqlSnippet) => {
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      if (!editor) {
          return;
      }

      const snippetController = editor.getContribution?.('snippetController2');
      if (snippetController && typeof snippetController.insert === 'function') {
          editor.focus?.();
          snippetController.insert(snippet.body);
          const nextValue = editor.getValue?.();
          if (typeof nextValue === 'string') {
              applyQueryState(nextValue);
          }
          handleCloseSqlSnippetPicker();
          editor.focus?.();
          return;
      }

      const model = editor.getModel?.();
      if (!model || !monaco?.Range) {
          return;
      }

      const selection = editor.getSelection?.();
      const position = editor.getPosition?.()
          || { lineNumber: model.getLineCount?.() || 1, column: model.getLineMaxColumn?.(model.getLineCount?.() || 1) || 1 };
      const hasSelection = selection
          && (
              selection.startLineNumber !== selection.endLineNumber
              || selection.startColumn !== selection.endColumn
          );
      const range = hasSelection
          ? selection
          : new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column);
      const startOffset = model.getOffsetAt?.({
          lineNumber: range.startLineNumber,
          column: range.startColumn,
      });
      const plainText = materializeSqlSnippetText(snippet.body);

      editor.pushUndoStop?.();
      editor.executeEdits?.('gonavi-insert-sql-snippet', [{
          range,
          text: plainText,
          forceMoveMarkers: true,
      }]);
      editor.pushUndoStop?.();

      if (Number.isFinite(Number(startOffset)) && typeof model.getPositionAt === 'function') {
          const nextPosition = model.getPositionAt(Number(startOffset) + plainText.length);
          editor.setPosition?.(nextPosition);
          editor.setSelection?.(new monaco.Range(
              nextPosition.lineNumber,
              nextPosition.column,
              nextPosition.lineNumber,
              nextPosition.column,
          ));
      }

      const nextValue = editor.getValue?.();
      if (typeof nextValue === 'string') {
          applyQueryState(nextValue);
      }
      handleCloseSqlSnippetPicker();
      editor.focus?.();
  }, [applyQueryState, handleCloseSqlSnippetPicker]);

  useEffect(() => {
      persistQueryTabDraftSnapshot(draftSnapshotTab, query, {
          connectionId: currentConnectionIdRef.current || currentConnectionId,
          dbName: currentDbRef.current || currentDb,
      });
  }, [currentConnectionId, currentDb, draftSnapshotTab, query]);

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

  const getCurrentQuery = useCallback(() => {
      const val = editorRef.current?.getValue?.();
      if (typeof val === 'string') return val;
      return query || '';
  }, [query]);

  useEffect(() => {
      if (!isExternalSQLFileTab) return;
      persistQueryTabDraftSnapshot(draftSnapshotTab, getCurrentQuery(), {
          connectionId: currentConnectionIdRef.current,
          dbName: currentDbRef.current,
      });
      return () => {
          persistQueryTabDraftSnapshot(draftSnapshotTab, getCurrentQuery(), {
              connectionId: currentConnectionIdRef.current,
              dbName: currentDbRef.current,
          });
      };
  }, [draftSnapshotTab, getCurrentQuery, isExternalSQLFileTab]);

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
      sharedSequencesData = sequencesRef.current;
      sharedPackagesData = packagesRef.current;
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
              sequencesRef.current,
              packagesRef.current,
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
          sequencesRef.current,
          packagesRef.current,
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

  const registerShowObjectInfoAction = useCallback(() => {
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      if (!editor || !monaco) {
          return;
      }

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
  }, [showObjectInfoAtPosition]);

  useEffect(() => {
      refreshObjectDecorations(QUERY_EDITOR_LIVE_DECORATION_MAX_TEXT_LENGTH);
  }, [currentDb, refreshObjectDecorations]);

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

  const handleSelectCurrentStatement = async () => {
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      const model = editor?.getModel?.();
      if (!editor || !monaco?.Range || !model) {
          return;
      }

      const normalizedPosition = normalizeEditorPosition(editor.getPosition?.())
          || normalizeEditorPosition(lastEditorCursorPositionRef.current);
      if (!normalizedPosition) {
          return;
      }
      lastEditorCursorPositionRef.current = normalizedPosition;
      const lineNumber = normalizedPosition.lineNumber;
      const lineText = String(model.getLineContent?.(lineNumber) || '');
      if (!lineText.trim()) {
          void message.info(translate('query_editor.message.current_line_no_copyable_content'));
          return;
      }

      const maxColumn = Number(model.getLineMaxColumn?.(lineNumber) || 1);
      const selection = new monaco.Range(lineNumber, 1, lineNumber, maxColumn);
      editor.setPosition?.(normalizedPosition);
      editor.setSelection(selection);
      editor.revealRangeInCenterIfOutsideViewport?.(selection);

      const copied = await copyQueryEditorTextToClipboard(lineText);
      editor.setSelection(selection);
      editor.focus?.();
      if (copied) {
          void message.success(translate('data_grid.message.copied_to_clipboard'));
          return;
      }

      void message.error(translate('connection_modal.message.copy_failed'));
  };

  const handleDuplicateCurrentLine = () => {
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      const model = editor?.getModel?.();
      const normalizedPosition = normalizeEditorPosition(editor?.getPosition?.());
      if (!editor || !monaco?.Range || !model || !normalizedPosition) {
          return;
      }

      const lineNumber = normalizedPosition.lineNumber;
      const lineText = String(model.getLineContent?.(lineNumber) || '');
      const maxColumn = Number(model.getLineMaxColumn?.(lineNumber) || (lineText.length + 1));
      const modelValue = String(model.getValue?.() || '');
      const lineBreak = typeof model.getEOL?.() === 'string'
          ? model.getEOL()
          : (modelValue.includes('\r\n') ? '\r\n' : '\n');
      const insertRange = new monaco.Range(lineNumber, maxColumn, lineNumber, maxColumn);
      const nextColumn = Math.min(normalizedPosition.column, lineText.length + 1);

      editor.executeEdits?.('gonavi-duplicate-current-line', [{
          range: insertRange,
          text: `${lineBreak}${lineText}`,
          forceMoveMarkers: true,
      }]);
      editor.pushUndoStop?.();

      const nextPosition = { lineNumber: lineNumber + 1, column: nextColumn };
      const cursorSelection = new monaco.Range(
          nextPosition.lineNumber,
          nextPosition.column,
          nextPosition.lineNumber,
          nextPosition.column,
      );
      editor.setSelections?.([cursorSelection]);
      editor.setSelection?.(cursorSelection);
      editor.setPosition?.(nextPosition);
      editor.revealLineInCenterIfOutsideViewport?.(nextPosition.lineNumber);
      editor.focus?.();

      const nextValue = editor.getValue?.();
      if (typeof nextValue === 'string') {
          applyQueryState(nextValue);
      }
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
      const editorHasFocus = editorRef.current?.hasTextFocus?.() === true;
      if (editorHasFocus && incoming === lastLocalQueryRef.current) {
          setQuery(incoming);
          return;
      }
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
          if (isActive) {
              sharedCurrentDb = metadataDbName;
          }
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
          const allSequences: CompletionSequenceMeta[] = [];
          const allPackages: CompletionPackageMeta[] = [];
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
              sequencesRef.current = [...allSequences];
              packagesRef.current = [...allPackages];
              if (isActive) {
                  sharedCurrentDb = metadataDbName;
                  sharedTablesData = tablesRef.current;
                  sharedAllColumnsData = allColumnsRef.current;
                  sharedViewsData = viewsRef.current;
                  sharedMaterializedViewsData = materializedViewsRef.current;
                  sharedTriggersData = triggersRef.current;
                  sharedRoutinesData = routinesRef.current;
                  sharedSequencesData = sequencesRef.current;
                  sharedPackagesData = packagesRef.current;
              }
              return true;
          };

          for (const dbName of metadataDbNames) {
              if (cancelled) return;
              const tableComments = await fetchCompletionTableCommentMap(config, dbName, metadataDialect);
              if (cancelled) return;

              // 获取表
              const resTables = await DBGetTables(buildRpcConnectionConfig(config) as any, dbName);
              if (cancelled) return;
              if (resTables.success && Array.isArray(resTables.data)) {
                  resTables.data.forEach((row: any) => {
                      const tableMeta = buildCompletionTableMeta(dbName, row, tableComments);
                      if (tableMeta) {
                          allTables.push(tableMeta);
                      }
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

              const sequenceResults = await queryCompletionMetadataRowsBySpecs(
                  config,
                  dbName,
                  buildCompletionSequencesMetadataQuerySpecs(metadataDialect, dbName),
              );
              if (cancelled) return;
              const seenSequences = new Set<string>();
              sequenceResults.forEach((queryResult) => {
                  queryResult.rows.forEach((row) => {
                      const rawSequenceName = String(getCaseInsensitiveValue(row, ['sequence_name', 'name']) || '').trim() || getFirstRowValue(row);
                      if (!rawSequenceName) return;
                      const schemaName = String(getCaseInsensitiveValue(row, ['schema_name', 'sequence_owner', 'owner', 'db', 'database']) || '').trim();
                      const sequenceParts = splitSidebarQualifiedName(rawSequenceName);
                      const resolvedSchemaName = String(schemaName || sequenceParts.schemaName || '').trim();
                      const resolvedSequenceName = String(sequenceParts.objectName || rawSequenceName).trim();
                      const qualifiedSequenceName = buildQualifiedCompletionName(resolvedSchemaName, resolvedSequenceName);
                      if (!qualifiedSequenceName) return;
                      const uniqueKey = `${dbName.toLowerCase()}@@${qualifiedSequenceName.toLowerCase()}`;
                      if (seenSequences.has(uniqueKey)) return;
                      seenSequences.add(uniqueKey);
                      allSequences.push({
                          dbName,
                          sequenceName: qualifiedSequenceName,
                          schemaName: resolvedSchemaName || splitSidebarQualifiedName(qualifiedSequenceName).schemaName || undefined,
                      });
                  });
              });
              if (!syncMetadataSnapshot()) return;

              const packageResults = await queryCompletionMetadataRowsBySpecs(
                  config,
                  dbName,
                  buildCompletionPackagesMetadataQuerySpecs(metadataDialect, dbName),
              );
              if (cancelled) return;
              const seenPackages = new Set<string>();
              packageResults.forEach((queryResult) => {
                  queryResult.rows.forEach((row) => {
                      const rawPackageName = String(getCaseInsensitiveValue(row, ['package_name', 'object_name', 'name']) || '').trim() || getFirstRowValue(row);
                      if (!rawPackageName) return;
                      const schemaName = String(getCaseInsensitiveValue(row, ['schema_name', 'owner', 'db', 'database']) || '').trim();
                      const packageParts = splitSidebarQualifiedName(rawPackageName);
                      const resolvedSchemaName = String(schemaName || packageParts.schemaName || '').trim();
                      const resolvedPackageName = String(packageParts.objectName || rawPackageName).trim();
                      const qualifiedPackageName = buildQualifiedCompletionName(resolvedSchemaName, resolvedPackageName);
                      if (!qualifiedPackageName) return;
                      const uniqueKey = `${dbName.toLowerCase()}@@${qualifiedPackageName.toLowerCase()}`;
                      if (seenPackages.has(uniqueKey)) return;
                      seenPackages.add(uniqueKey);
                      allPackages.push({
                          dbName,
                          packageName: qualifiedPackageName,
                          schemaName: resolvedSchemaName || splitSidebarQualifiedName(qualifiedPackageName).schemaName || undefined,
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

  const resolveEditorSplitAvailableHeight = useCallback(() => {
      const rootRect = queryEditorRootRef.current?.getBoundingClientRect?.();
      const paneRect = editorPaneRef.current?.getBoundingClientRect?.();
      const editorContainerRect = (editorStageRef.current || editorShellRef.current)?.getBoundingClientRect?.();
      const rootHeight = Number(rootRect?.height || 0);
      const paneHeight = Number(paneRect?.height || 0);
      const editorContainerHeight = Number(editorContainerRect?.height || 0);
      if (!Number.isFinite(rootHeight) || rootHeight <= 0) {
          return 0;
      }
      const nonEditorPaneHeight = paneHeight > 0 && editorContainerHeight > 0
          ? Math.max(0, paneHeight - editorContainerHeight)
          : 0;
      const availableHeight = rootHeight - nonEditorPaneHeight;
      return Number.isFinite(availableHeight) && availableHeight > 0 ? availableHeight : 0;
  }, []);

  const clampEditorHeight = useCallback((height: number) => {
      const availableHeight = resolveEditorSplitAvailableHeight();
      if (availableHeight > 0) {
          return clampQueryEditorEditorHeight(height, availableHeight);
      }
      const viewportHeight = Number.isFinite(window.innerHeight) ? window.innerHeight : 800;
      const maxHeight = Math.max(100, viewportHeight - 200);
      return Math.max(100, Math.min(maxHeight, height));
  }, [resolveEditorSplitAvailableHeight]);

  const applyEditorHeightRatio = useCallback(() => {
      const availableHeight = resolveEditorSplitAvailableHeight();
      if (availableHeight <= 0 || dragRef.current) return;
      const nextHeight = resolveQueryEditorEditorHeightFromRatio(
          queryEditorEditorHeightRatio,
          availableHeight,
      );
      pendingEditorHeightRef.current = nextHeight;
      setEditorHeight(previousHeight => previousHeight === nextHeight ? previousHeight : nextHeight);
  }, [queryEditorEditorHeightRatio, resolveEditorSplitAvailableHeight]);

  useEffect(() => {
      if (!isResultPanelVisible || !isActive) return;
      let frame: number | null = null;
      const requestFrame = typeof window.requestAnimationFrame === 'function'
          ? window.requestAnimationFrame.bind(window)
          : (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 16);
      const cancelFrame = typeof window.cancelAnimationFrame === 'function'
          ? window.cancelAnimationFrame.bind(window)
          : window.clearTimeout.bind(window);
      const scheduleApply = () => {
          if (frame !== null) return;
          frame = requestFrame(() => {
              frame = null;
              applyEditorHeightRatio();
          });
      };

      scheduleApply();
      const ResizeObserverCtor = typeof ResizeObserver === 'function' ? ResizeObserver : null;
      const resizeObserver = ResizeObserverCtor ? new ResizeObserverCtor(scheduleApply) : null;
      if (resizeObserver) {
          if (queryEditorRootRef.current) resizeObserver.observe(queryEditorRootRef.current);
          if (editorPaneRef.current) resizeObserver.observe(editorPaneRef.current);
      }
      window.addEventListener('resize', scheduleApply);
      return () => {
          if (frame !== null) {
              cancelFrame(frame);
              frame = null;
          }
          resizeObserver?.disconnect();
          window.removeEventListener('resize', scheduleApply);
      };
  }, [applyEditorHeightRatio, isActive, isResultPanelVisible, tab.id]);

  const applyEditorHeightToDom = useCallback(() => {
      const nextHeight = pendingEditorHeightRef.current;
      const editorContainer = editorStageRef.current || editorShellRef.current;
      if (editorContainer) {
          editorContainer.style.height = `${nextHeight}px`;
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
          const availableHeight = resolveEditorSplitAvailableHeight();
          if (availableHeight > 0) {
              setQueryOptions({
                  queryEditorEditorHeightRatio: resolveQueryEditorEditorHeightRatio(
                      finalHeight,
                      availableHeight,
                  ),
              });
          }
      }
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
  }, [applyEditorHeightToDom, cancelEditorResizeFrame, handleMouseMove, resolveEditorSplitAvailableHeight, setQueryOptions]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      const currentEditorHeight = Number((editorStageRef.current || editorShellRef.current)?.getBoundingClientRect?.().height || editorHeight);
      const startHeight = Number.isFinite(currentEditorHeight) && currentEditorHeight > 0 ? currentEditorHeight : editorHeight;
      dragRef.current = { startY: e.clientY, startHeight, currentHeight: startHeight };
      pendingEditorHeightRef.current = startHeight;
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

  const openRoutineObjectEditTab = useCallback(async (
      navigationTarget: Extract<QueryEditorNavigationTarget, { type: 'routine' }>,
      connectionId: string,
      targetDbName: string,
  ) => {
      const targetRoutineName = String(navigationTarget.routineName || '').trim();
      if (!targetRoutineName) return;

      const normalizedRoutineType = String(navigationTarget.routineType || 'FUNCTION').trim().toUpperCase().includes('PROC')
          ? 'PROCEDURE'
          : 'FUNCTION';
      const routineTypeLabel = normalizedRoutineType === 'PROCEDURE'
          ? translate('sidebar.object.procedure')
          : translate('sidebar.object.function');
      const sqlTemplateHeader = `-- ${translate('sidebar.sql_template.edit_routine', {
          type: routineTypeLabel,
          name: targetRoutineName,
      })}`;
      let editSql = `${sqlTemplateHeader}\n-- ${translate('sidebar.sql_template.modify_then_execute')}\n${buildQueryEditorRoutineEditFallbackSql(targetRoutineName, normalizedRoutineType)}`;

      const conn = connectionsRef.current.find((item) => item.id === connectionId);
      if (conn) {
          const dialect = normalizeMetadataDialect(conn);
          const parsedRoutine = splitSidebarQualifiedName(targetRoutineName);
          const routineObjectName = parsedRoutine.objectName || targetRoutineName;
          const routineSchemaName = String(navigationTarget.schemaName || parsedRoutine.schemaName || '').trim();
          const safeName = escapeQueryEditorObjectEditSqlLiteral(routineObjectName);
          const safeSchema = escapeQueryEditorObjectEditSqlLiteral(routineSchemaName);
          const safeDbName = escapeQueryEditorObjectEditSqlLiteral(targetDbName);
          const config = {
              ...conn.config,
              port: Number(conn.config?.port),
              password: conn.config?.password || '',
              database: conn.config?.database || '',
              useSSH: conn.config?.useSSH || false,
              ssh: conn.config?.ssh || { host: '', port: 22, user: '', password: '', keyPath: '' },
          };
          const queries = (() => {
              switch (dialect) {
                  case 'mysql':
                  case 'starrocks':
                      return [
                          `SHOW CREATE ${normalizedRoutineType} \`${routineObjectName.replace(/`/g, '``')}\``,
                          safeDbName
                              ? `SELECT ROUTINE_DEFINITION AS routine_definition FROM information_schema.routines WHERE routine_schema = '${safeDbName}' AND routine_name = '${safeName}' AND UPPER(routine_type) = '${normalizedRoutineType}' LIMIT 1`
                              : '',
                      ].filter(Boolean);
                  case 'postgres':
                  case 'kingbase':
                  case 'highgo':
                  case 'vastbase':
                  case 'opengauss':
                  case 'gaussdb': {
                      const schemaRef = safeSchema || 'public';
                      return [`SELECT pg_get_functiondef(p.oid) AS routine_definition FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = '${schemaRef}' AND p.proname = '${safeName}' LIMIT 1`];
                  }
                  case 'sqlserver':
                      return buildSqlServerObjectDefinitionQueries('routine', targetRoutineName, targetDbName, 'routine_definition');
                  case 'oracle':
                  case 'dm':
                  case 'dameng': {
                      const owner = safeSchema || safeDbName;
                      return [
                          owner
                              ? `SELECT TEXT FROM ALL_SOURCE WHERE OWNER = '${owner.toUpperCase()}' AND NAME = '${safeName.toUpperCase()}' AND TYPE = '${normalizedRoutineType}' ORDER BY LINE`
                              : `SELECT TEXT FROM USER_SOURCE WHERE NAME = '${safeName.toUpperCase()}' AND TYPE = '${normalizedRoutineType}' ORDER BY LINE`,
                      ];
                  }
                  case 'duckdb': {
                      const schemaRef = safeSchema || 'main';
                      return [
                          `SELECT schema_name, function_name, parameters, macro_definition FROM duckdb_functions() WHERE internal = false AND lower(function_type) = 'macro' AND schema_name = '${schemaRef}' AND function_name = '${safeName}' LIMIT 1`,
                      ];
                  }
                  default:
                      return [];
              }
          })();

          for (const queryText of queries) {
              try {
                  const result = await DBQuery(buildRpcConnectionConfig(config) as any, targetDbName, queryText);
                  if (!result.success || !Array.isArray(result.data) || result.data.length === 0) {
                      continue;
                  }
                  let definition = '';
                  if (dialect === 'oracle' || dialect === 'dm' || dialect === 'dameng') {
                      definition = result.data.map((row: any) => row.text || row.TEXT || Object.values(row)[0] || '').join('');
                  } else if (dialect === 'duckdb') {
                      const row = result.data[0] as Record<string, any>;
                      const schemaName = String(getQueryEditorObjectEditRawValue(row, ['schema_name']) || routineSchemaName || '').trim();
                      const functionName = String(getQueryEditorObjectEditRawValue(row, ['function_name', 'routine_name', 'name']) || routineObjectName || '').trim();
                      const parametersRaw = getQueryEditorObjectEditRawValue(row, ['parameters']);
                      const macroDefinition = String(getQueryEditorObjectEditRawValue(row, ['macro_definition']) || '').trim();
                      const parameters = Array.isArray(parametersRaw)
                          ? parametersRaw.map((item) => String(item ?? '').trim()).filter(Boolean).join(', ')
                          : String(parametersRaw ?? '').replace(/^\[|\]$/g, '').trim();
                      const qualifiedName = schemaName ? `${schemaName}.${functionName}` : functionName;
                      if (qualifiedName && macroDefinition) {
                          definition = macroDefinition.startsWith('(')
                              ? `CREATE OR REPLACE MACRO ${qualifiedName}(${parameters}) AS ${macroDefinition};`
                              : `CREATE OR REPLACE MACRO ${qualifiedName}(${parameters}) AS TABLE ${macroDefinition};`;
                      }
                  } else if (dialect === 'sqlserver') {
                      definition = result.data
                          .map((row: any) => getQueryEditorObjectEditRawValue(row, ['routine_definition', 'definition', 'text', 'Text']) ?? '')
                          .map((value) => String(value))
                          .join('');
                  } else {
                      const row = result.data[0] as Record<string, any>;
                      const direct = getQueryEditorObjectEditRawValue(row, ['routine_definition', 'definition']);
                      if (direct !== undefined && direct !== null && String(direct).trim()) {
                          definition = String(direct);
                      } else {
                          const createKey = Object.keys(row).find((key) => /create\s+(function|procedure)/i.test(key));
                          definition = createKey ? String(row[createKey] || '') : '';
                      }
                  }

                  const normalizedDefinition = normalizeQueryEditorRoutineDefinitionForEdit(
                      definition,
                      targetRoutineName,
                      normalizedRoutineType,
                  );
                  if (normalizedDefinition) {
                      editSql = `${sqlTemplateHeader}\n${normalizedDefinition}`;
                      break;
                  }
              } catch {
                  // 查询最新定义失败时保留可编辑模板。
              }
          }
      }

      addTab({
          id: `query-edit-routine-${connectionId}-${targetDbName}-${targetRoutineName}-${Date.now()}`,
          title: translate('sidebar.tab.edit_routine', {
              type: routineTypeLabel,
              name: targetRoutineName,
          }),
          type: 'query',
          connectionId,
          dbName: targetDbName,
          query: editSql,
          queryMode: 'object-edit',
          returnToTabId: activeTabId || undefined,
      });
  }, [activeTabId, addTab]);

  const openDefinitionObjectEditTab = useCallback(async (
      navigationTarget: Extract<QueryEditorNavigationTarget, { type: 'view' | 'materialized-view' | 'sequence' | 'package' }>,
      connectionId: string,
      targetDbName: string,
  ) => {
      const targetSchemaName = String(navigationTarget.schemaName || '').trim();
      const conn = connectionsRef.current.find((item) => item.id === connectionId);
      const dialect = conn ? normalizeMetadataDialect(conn) : '';
      let targetObjectName = '';
      let objectEditName = '';
      let objectLabel = '';
      let definitionTabType: 'view-def' | 'sequence-def' | 'package-def' = 'view-def';
      let definitionQueries: string[] = [];
      let collectAllDefinitionRows = false;
      let latestDefinition = '';

      if (navigationTarget.type === 'view' || navigationTarget.type === 'materialized-view') {
          targetObjectName = String(navigationTarget.viewName || '').trim();
          if (!targetObjectName) return;
          definitionTabType = 'view-def';
          objectEditName = buildQueryEditorQualifiedObjectName(targetObjectName, targetSchemaName);
          objectLabel = navigationTarget.type === 'materialized-view'
              ? translate('definition_viewer.object.materialized_view')
              : translate('definition_viewer.object.view');
          definitionQueries = conn
              ? buildQueryEditorViewDefinitionQueries(
                  dialect,
                  targetObjectName,
                  targetDbName,
                  targetSchemaName,
                  navigationTarget.type === 'materialized-view' ? 'materialized' : 'view',
              )
              : [];
      } else if (navigationTarget.type === 'sequence') {
          targetObjectName = String(navigationTarget.sequenceName || '').trim();
          if (!targetObjectName) return;
          definitionTabType = 'sequence-def';
          objectEditName = buildQueryEditorQualifiedObjectName(targetObjectName, targetSchemaName);
          objectLabel = translate('definition_viewer.object.sequence');
          definitionQueries = conn
              ? buildQueryEditorSequenceDefinitionQueries(dialect, targetObjectName, targetDbName, targetSchemaName)
              : [];
      } else {
          targetObjectName = String(navigationTarget.packageName || '').trim();
          if (!targetObjectName) return;
          definitionTabType = 'package-def';
          objectEditName = buildQueryEditorQualifiedObjectName(targetObjectName, targetSchemaName);
          objectLabel = translate('definition_viewer.object.package');
          collectAllDefinitionRows = true;
          definitionQueries = conn
              ? buildQueryEditorPackageDefinitionQueries(dialect, targetObjectName, targetDbName, targetSchemaName)
              : [];
      }

      if (conn && definitionQueries.length > 0) {
          const rows = await runQueryEditorObjectDefinitionCandidates(
              buildQueryEditorObjectDefinitionConnectionConfig(conn),
              targetDbName,
              definitionQueries,
              collectAllDefinitionRows,
          );
          if (definitionTabType === 'view-def') {
              latestDefinition = extractQueryEditorViewDefinition(dialect, rows);
          } else if (definitionTabType === 'sequence-def') {
              latestDefinition = extractQueryEditorSequenceDefinition(rows, targetObjectName, targetSchemaName);
          } else {
              latestDefinition = extractQueryEditorPackageDefinition(rows);
          }
      }

      addTab({
          id: `query-edit-object-${connectionId}-${targetDbName}-${objectEditName}-${Date.now()}`,
          title: translate('definition_viewer.edit.tab_title', {
              object: objectLabel,
              name: objectEditName,
          }),
          type: 'query',
          connectionId,
          dbName: targetDbName,
          query: buildQueryEditorEditableDefinitionSql(
              definitionTabType,
              latestDefinition,
              objectEditName,
              objectLabel,
          ),
          queryMode: 'object-edit',
          returnToTabId: activeTabId || undefined,
      });
  }, [activeTabId, addTab]);

  const openTriggerObjectEditTab = useCallback(async (
      navigationTarget: Extract<QueryEditorNavigationTarget, { type: 'trigger' }>,
      connectionId: string,
      targetDbName: string,
  ) => {
      const targetTriggerName = String(navigationTarget.triggerName || '').trim();
      if (!targetTriggerName) return;

      const conn = connectionsRef.current.find((item) => item.id === connectionId);
      let latestDefinition = '';
      if (conn) {
          const dialect = normalizeMetadataDialect(conn);
          const rows = await runQueryEditorObjectDefinitionCandidates(
              buildQueryEditorObjectDefinitionConnectionConfig(conn),
              targetDbName,
              buildQueryEditorTriggerDefinitionQueries(
                  dialect,
                  targetTriggerName,
                  targetDbName,
                  navigationTarget.schemaName,
              ),
          );
          latestDefinition = extractQueryEditorTriggerDefinition(dialect, rows);
      }

      addTab({
          id: `query-edit-trigger-${connectionId}-${targetDbName}-${targetTriggerName}-${Date.now()}`,
          title: translate('trigger_viewer.tab.edit_trigger_title', { name: targetTriggerName }),
          type: 'query',
          connectionId,
          dbName: targetDbName,
          query: buildEditableTriggerSql(targetTriggerName, latestDefinition, { translate }),
          queryMode: 'object-edit',
          returnToTabId: activeTabId || undefined,
      });
  }, [activeTabId, addTab]);

  // Setup Autocomplete and Editor
  const handleEditorDidMount: OnMount = (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      const suggestController = editor.getContribution?.('editor.contrib.suggestController') as {
          widget?: { value?: { _details?: { widget?: { layout?: (width: number, height: number) => void } } } };
      } | null;
      const suggestDetailsWidget = suggestController?.widget?.value?._details?.widget;
      if (suggestDetailsWidget?.layout) {
          const originalSuggestDetailsLayout = suggestDetailsWidget.layout.bind(suggestDetailsWidget);
          suggestDetailsWidget.layout = (width: number, height: number) => {
              originalSuggestDetailsLayout(width, Math.max(height, QUERY_EDITOR_SQL_SNIPPET_SUGGEST_DETAIL_MIN_HEIGHT));
          };
      }
      lastEditorCursorPositionRef.current = normalizeEditorPosition(editor.getPosition?.());

      editor.updateOptions?.(buildQueryEditorMonacoOptions(isObjectEditQueryTab));

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
              sequencesRef.current,
              packagesRef.current,
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
          const isKeyboardLikeEvent = keyboardEvent
              && typeof keyboardEvent === 'object'
              && ('key' in keyboardEvent || 'code' in keyboardEvent || 'repeat' in keyboardEvent);
          if (isKeyboardLikeEvent && isImeComposingKeyEvent(keyboardEvent as KeyboardEvent)) {
              return;
          }
          const keyboardEventType = isKeyboardLikeEvent ? String((keyboardEvent as KeyboardEvent).type || '').toLowerCase() : '';
          const keyboardKey = isKeyboardLikeEvent ? String((keyboardEvent as KeyboardEvent).key || '').trim().toLowerCase() : '';
          const keyboardCode = isKeyboardLikeEvent ? String((keyboardEvent as KeyboardEvent).code || '').trim().toLowerCase() : '';
          const isModifierKeyDown = isKeyboardLikeEvent
              && keyboardEventType !== 'keyup'
              && (
                  keyboardKey === 'control'
                  || keyboardKey === 'ctrl'
                  || keyboardKey === 'meta'
                  || keyboardKey === 'os'
                  || keyboardKey === 'command'
                  || keyboardCode.startsWith('control')
                  || keyboardCode.startsWith('meta')
                  || keyboardCode.startsWith('os')
              );
          const eventHasModifierFlag = hasQueryEditorCtrlMetaModifier(keyboardEvent);
          const nextPressed = isKeyboardLikeEvent
              ? !!(eventHasModifierFlag || isModifierKeyDown)
              : !!(eventHasModifierFlag || wasPressed);
          ctrlMetaPressedRef.current = nextPressed;
          if (!nextPressed && !wasPressed) {
              return;
          }
          if (!nextPressed) {
              clearQueryEditorLinkDecorations(editor, linkDecorationIdsRef);
              editor.updateOptions?.({ mouseStyle: 'text' });
              setQueryEditorMouseCursor(editor, '');
              return;
          }
          if (!wasPressed || isKeyboardLikeEvent) {
              const keyboardFallbackPosition = isKeyboardLikeEvent
                  ? normalizeEditorPosition(editor.getPosition?.()) || lastEditorCursorPositionRef.current
                  : null;
              applyNavigationHoverStateAtPosition(lastHoverTargetPositionRef.current || keyboardFallbackPosition);
          }
      };
      const handleWindowBlur = () => {
          ctrlMetaPressedRef.current = false;
          clearQueryEditorLinkDecorations(editor, linkDecorationIdsRef);
          editor.updateOptions?.({ mouseStyle: 'text' });
          setQueryEditorMouseCursor(editor, '');
      };
      const editorDomNode = editor.getDomNode?.();
      const clearImeCompositionFallbackTimer = () => {
          if (imeCompositionFallbackTimerRef.current !== null) {
              clearTimeout(imeCompositionFallbackTimerRef.current);
              imeCompositionFallbackTimerRef.current = null;
          }
      };
      const getEditorText = () => String(
          editor.getValue?.()
          ?? editor.getModel?.()?.getValue?.()
          ?? '',
      );
      const buildImeFallbackRange = (snapshot: NonNullable<typeof imeCompositionFallbackRef.current>) => {
          const selection = snapshot.selectionBefore;
          const startFromSelection = typeof selection?.getStartPosition === 'function'
              ? normalizeEditorPosition(selection.getStartPosition())
              : null;
          const endFromSelection = typeof selection?.getEndPosition === 'function'
              ? normalizeEditorPosition(selection.getEndPosition())
              : null;
          const startPosition = startFromSelection || normalizeEditorPosition({
              lineNumber: selection?.startLineNumber ?? selection?.selectionStartLineNumber,
              column: selection?.startColumn ?? selection?.selectionStartColumn,
          }) || snapshot.positionBefore || lastEditorCursorPositionRef.current || { lineNumber: 1, column: 1 };
          const endPosition = endFromSelection || normalizeEditorPosition({
              lineNumber: selection?.endLineNumber ?? selection?.positionLineNumber,
              column: selection?.endColumn ?? selection?.positionColumn,
          }) || startPosition;
          return new monaco.Range(
              startPosition.lineNumber,
              startPosition.column,
              endPosition.lineNumber,
              endPosition.column,
          );
      };
      const handleImeCompositionStart = () => {
          clearImeCompositionFallbackTimer();
          imeCompositionFallbackRef.current = {
              editor,
              valueBefore: getEditorText(),
              selectionBefore: editor.getSelection?.() || null,
              positionBefore: normalizeEditorPosition(editor.getPosition?.()) || lastEditorCursorPositionRef.current || null,
              committedText: '',
          };
      };
      const handleImeBeforeInput = (rawEvent: Event) => {
          const snapshot = imeCompositionFallbackRef.current;
          if (!snapshot || snapshot.editor !== editor) {
              return;
          }
          const inputEvent = rawEvent as InputEvent;
          const nextText = String(inputEvent.data ?? '');
          if (nextText && (inputEvent.isComposing || String(inputEvent.inputType || '').includes('Composition'))) {
              snapshot.committedText = nextText;
          }
      };
      const handleImeCompositionEnd = (rawEvent: Event) => {
          const snapshot = imeCompositionFallbackRef.current;
          imeCompositionFallbackRef.current = null;
          const committedText = String((rawEvent as CompositionEvent).data ?? '') || snapshot?.committedText || '';
          if (!committedText || !snapshot || snapshot.editor !== editor) {
              return;
          }

          const fallbackRange = buildImeFallbackRange(snapshot);
          clearImeCompositionFallbackTimer();
          imeCompositionFallbackTimerRef.current = setTimeout(() => {
              imeCompositionFallbackTimerRef.current = null;
              if (editorRef.current !== editor) {
                  return;
              }
              const currentValue = getEditorText();
              if (currentValue !== snapshot.valueBefore) {
                  syncQueryDraft(currentValue);
                  return;
              }

              editor.executeEdits?.('gonavi-ime-composition-fallback', [{
                  range: fallbackRange,
                  text: committedText,
                  forceMoveMarkers: true,
              }]);
              const nextValue = getEditorText();
              syncQueryDraft(nextValue);

              const model = editor.getModel?.();
              const startOffset = Number(model?.getOffsetAt?.({
                  lineNumber: fallbackRange.startLineNumber,
                  column: fallbackRange.startColumn,
              }));
              const nextPosition = Number.isFinite(startOffset)
                  ? normalizeEditorPosition(model?.getPositionAt?.(startOffset + committedText.length))
                  : null;
              if (nextPosition) {
                  editor.setPosition?.(nextPosition);
              }
          }, 0);
      };
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
      editorDomNode?.addEventListener('beforeinput', handleImeBeforeInput, true);
      editorDomNode?.addEventListener('compositionstart', handleImeCompositionStart, true);
      editorDomNode?.addEventListener('compositionend', handleImeCompositionEnd, true);
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
          if (!hasQueryEditorCtrlMetaModifier(browserEvent) && !ctrlMetaPressedRef.current) {
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
              sequencesRef.current,
              packagesRef.current,
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
                  initialViewMode: 'fields',
                  initialViewModeRequestId: String(Date.now()),
                  objectType: 'table',
                  returnToTabId: activeTabId || undefined,
              });
              return;
          }

          if (navigationTarget.type === 'view' || navigationTarget.type === 'materialized-view') {
              void openDefinitionObjectEditTab(navigationTarget, connectionId, targetDbName);
              return;
          }

          if (navigationTarget.type === 'trigger') {
              void openTriggerObjectEditTab(navigationTarget, connectionId, targetDbName);
              return;
          }

          if (navigationTarget.type === 'sequence') {
              void openDefinitionObjectEditTab(navigationTarget, connectionId, targetDbName);
              return;
          }

          if (navigationTarget.type === 'package') {
              void openDefinitionObjectEditTab(navigationTarget, connectionId, targetDbName);
              return;
          }

          void openRoutineObjectEditTab(navigationTarget, connectionId, targetDbName);
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
          clearImeCompositionFallbackTimer();
          editorDomNode?.removeEventListener('beforeinput', handleImeBeforeInput, true);
          editorDomNode?.removeEventListener('compositionstart', handleImeCompositionStart, true);
          editorDomNode?.removeEventListener('compositionend', handleImeCompositionEnd, true);
          editorDomNode?.removeEventListener('dragover', handleEditorDragOver, true);
          editorDomNode?.removeEventListener('drop', handleEditorDrop, true);
      });

      refreshObjectDecorations();

      // 注册 AI 右键菜单操作
      registerQueryEditorAiContextMenuActions(editor);
      registerInsertSqlSnippetContextMenuAction(editor);

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
                      window.dispatchEvent(new CustomEvent('gonavi:run-active-query', {
                          detail: { requireSelection: true },
                      }));
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

      const duplicateLineBinding = duplicateCurrentLineShortcutBinding;
      if (duplicateLineBinding?.enabled && duplicateLineBinding.combo) {
          const keyBinding = comboToMonacoKeyBinding(
              duplicateLineBinding.combo, monaco.KeyMod, monaco.KeyCode,
          );
          if (keyBinding) {
              duplicateCurrentLineActionRef.current = editor.addAction({
                  id: 'gonavi.duplicateCurrentLine',
                  label: buildQueryEditorMonacoActionLabel('app.shortcuts.action.duplicateCurrentLine.label'),
                  keybindings: [keyBinding.keyMod | keyBinding.keyCode],
                  run: handleDuplicateCurrentLine,
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

      const findInEditorKeyBinding = comboToMonacoKeyBinding(
          findInEditorShortcutCombo, monaco.KeyMod, monaco.KeyCode
      );
      if (findInEditorKeyBinding) {
          findInEditorActionRef.current = editor.addAction({
              id: 'gonavi.findInEditor',
              label: buildQueryEditorMonacoActionLabel('query_editor.action.find_in_editor'),
              keybindings: [findInEditorKeyBinding.keyMod | findInEditorKeyBinding.keyCode],
              run: () => {
                  window.dispatchEvent(new CustomEvent('gonavi:find-active-query'));
              },
          });
      }

      const formatBinding = formatSqlShortcutBinding;
      if (formatBinding?.enabled && formatBinding.combo) {
          const keyBinding = comboToMonacoKeyBinding(
              formatBinding.combo, monaco.KeyMod, monaco.KeyCode
          );
          if (keyBinding) {
              formatSqlActionRef.current = editor.addAction({
                  id: 'gonavi.formatSql',
                  label: buildQueryEditorMonacoActionLabel('app.shortcuts.action.formatSql.label'),
                  keybindings: [keyBinding.keyMod | keyBinding.keyCode],
                  run: () => {
                      window.dispatchEvent(new CustomEvent('gonavi:format-active-query'));
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
                  sharedSequencesData,
                  sharedPackagesData,
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
              const getActiveCompletionDbName = () => String(sharedCurrentDb || currentDbRef.current || currentDb || tab.dbName || '').trim();
              const dialectKeywords = resolveSqlKeywords(activeDialect);
              const dialectFunctions = resolveSqlFunctions(activeDialect);

              const stripQuotes = stripCompletionIdentifierQuotes;
              const normalizeQualifiedName = normalizeCompletionQualifiedName;
              const splitSchemaAndTable = splitCompletionSchemaAndTable;
              const buildDbQualifiedTableSuggestionMeta = (dbName: string, tableName: string) => {
                  const rawDbName = String(dbName || '').trim();
                  const rawTableName = String(tableName || '').trim();
                  const parsed = splitSchemaAndTable(rawTableName);
                  const schemaMatchesDb = !!parsed.schema
                      && !!parsed.table
                      && parsed.schema.toLowerCase() === rawDbName.toLowerCase();
                  const displayName = schemaMatchesDb ? parsed.table : rawTableName;
                  const insertText = schemaMatchesDb
                      ? quoteCompletionPart(parsed.table)
                      : quoteCompletionPath(rawTableName);
                  const dbQualifiedLabel = rawDbName
                      ? `${rawDbName}.${displayName || rawTableName}`
                      : (displayName || rawTableName);
                  return {
                      displayName: displayName || rawTableName,
                      insertText,
                      dbQualifiedLabel,
                  };
              };
              const normalizeRoutineType = (routineType: string) => (
                  String(routineType || '').trim().toUpperCase().includes('PROC') ? 'PROCEDURE' : 'FUNCTION'
              );
              const getRoutineTypeLabel = (routineType: string) => (
                  normalizeRoutineType(routineType) === 'PROCEDURE'
                      ? translate('sidebar.object.procedure')
                      : translate('sidebar.object.function')
              );
              const buildRoutineSuggestionMeta = (routine: CompletionRoutineMeta) => {
                  const rawDbName = String(routine.dbName || '').trim();
                  const rawRoutineName = String(routine.routineName || '').trim();
                  const parsed = splitSchemaAndTable(rawRoutineName);
                  const schemaName = String(routine.schemaName || parsed.schema || '').trim();
                  const objectName = String(parsed.table || rawRoutineName).trim();
                  const schemaMatchesDb = !!schemaName
                      && !!rawDbName
                      && schemaName.toLowerCase() === rawDbName.toLowerCase();
                  const isCurrentDb = rawDbName.toLowerCase() === getActiveCompletionDbName().toLowerCase();
                  const displayName = isCurrentDb && schemaMatchesDb
                      ? objectName
                      : (parsed.schema ? rawRoutineName : objectName);
                  const dbQualifiedLabel = rawDbName && !isCurrentDb
                      ? `${rawDbName}.${displayName}`
                      : displayName;
                  const insertName = rawDbName && !isCurrentDb
                      ? dbQualifiedLabel
                      : displayName;
                  return {
                      displayName,
                      dbQualifiedLabel,
                      insertText: `${quoteCompletionPath(insertName)}($0)`,
                      objectName,
                      schemaName,
                      routineType: normalizeRoutineType(routine.routineType),
                  };
              };

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
                  const conn = sharedConnections.find(c => c.id === connId);

                  sharedLazyTablesInFlight[key] = Promise.all([
                      fetchCompletionTableCommentMap(config, dbName, normalizeMetadataDialect(conn)),
                      DBGetTables(buildRpcConnectionConfig(config) as any, dbName),
                  ])
                      .then(([tableComments, res]) => {
                          const tables = res?.success && Array.isArray(res.data)
                              ? res.data
                                  .map((row: any) => buildCompletionTableMeta(dbName, row, tableComments))
                                  .filter((table): table is CompletionTableMeta => !!table)
                              : [];
                          sharedLazyTablesCache[key] = tables;
                          if (tables.length > 0) {
                              const lazyTableByKey = new Map(tables.map((table) => [
                                  `${table.dbName.toLowerCase()}.${table.tableName.toLowerCase()}`,
                                  table,
                              ]));
                              const existingKeys = new Set<string>();
                              let changed = false;
                              const nextSharedTables = sharedTablesData.map((table) => {
                                  const tableKey = `${table.dbName.toLowerCase()}.${table.tableName.toLowerCase()}`;
                                  existingKeys.add(tableKey);
                                  const lazyTable = lazyTableByKey.get(tableKey);
                                  if (lazyTable?.comment && lazyTable.comment !== table.comment) {
                                      changed = true;
                                      return { ...table, comment: lazyTable.comment };
                                  }
                                  return table;
                              });
                              const missingTables = tables.filter((table) => !existingKeys.has(`${table.dbName.toLowerCase()}.${table.tableName.toLowerCase()}`));
                              if (missingTables.length > 0) {
                                  changed = true;
                                  nextSharedTables.push(...missingTables);
                              }
                              if (changed) {
                                  sharedTablesData = nextSharedTables;
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
              const cursorOffset = getNormalizedOffsetAtPosition(fullText, {
                  lineNumber: Number(position?.lineNumber || 1),
                  column: Number(position?.column || 1),
              });
              const currentStatementRange = resolveCurrentSqlStatementRange(fullText, cursorOffset);

              // 获取当前行光标前的内容
              const linePrefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
              const currentStatementPrefix = currentStatementRange
                  ? fullText.slice(currentStatementRange.start, cursorOffset)
                  : fullText.slice(0, cursorOffset);
              const completionScopeText = currentStatementPrefix || linePrefix;
              const currentStatementText = currentStatementRange?.text || '';
              const completionReferenceText = currentStatementText || completionScopeText;

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
                      detail: buildColumnCompletionDetail(c),
                      documentation: buildColumnCompletionDocumentation(c),
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
                          ? tables.filter(t => {
                              const suggestionMeta = buildDbQualifiedTableSuggestionMeta(t.dbName || qualifier, t.tableName || '');
                              return String(suggestionMeta.displayName || '').toLowerCase().startsWith(prefix)
                                  || String(t.tableName || '').toLowerCase().startsWith(prefix);
                          })
                          : tables;

                      const suggestions = filtered.map(t => {
                          const suggestionMeta = buildDbQualifiedTableSuggestionMeta(t.dbName || qualifier, t.tableName || '');
                          return {
                          label: suggestionMeta.displayName,
                          kind: monaco.languages.CompletionItemKind.Class,
                          insertText: suggestionMeta.insertText,
                          detail: appendCommentToDetail(`${translate('query_editor.object_info.table')} (${t.dbName})`, t.comment),
                          documentation: buildCompletionDocumentation(t.comment),
                          range,
                          sortText: '0' + suggestionMeta.displayName
                      };
                      });
                      const routineSuggestions = sharedRoutinesData
                          .filter((routine) => String(routine.dbName || '').toLowerCase() === qualifierLower)
                          .map((routine) => ({ routine, meta: buildRoutineSuggestionMeta(routine) }))
                          .filter(({ routine, meta }) => (
                              !prefix
                              || meta.displayName.toLowerCase().startsWith(prefix)
                              || meta.objectName.toLowerCase().startsWith(prefix)
                              || String(routine.routineName || '').toLowerCase().startsWith(prefix)
                          ))
                          .map(({ routine, meta }) => ({
                              label: meta.displayName,
                              kind: monaco.languages.CompletionItemKind.Function,
                              insertText: meta.insertText,
                              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                              detail: `${getRoutineTypeLabel(routine.routineType)} (${routine.dbName})`,
                              range,
                              sortText: '1' + meta.displayName,
                          }));
                      return { suggestions: [...suggestions, ...routineSuggestions] };
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
                      const routineSuggestions = sharedRoutinesData
                          .filter((routine) => {
                              const meta = buildRoutineSuggestionMeta(routine);
                              return meta.schemaName.toLowerCase() === qualifierLower;
                          })
                          .map((routine) => ({ routine, meta: buildRoutineSuggestionMeta(routine) }))
                          .filter(({ meta }) => !prefix || meta.objectName.toLowerCase().startsWith(prefix))
                          .map(({ routine, meta }) => ({
                              label: meta.objectName,
                              kind: monaco.languages.CompletionItemKind.Function,
                              insertText: `${quoteCompletionPart(meta.objectName)}($0)`,
                              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                              detail: `${getRoutineTypeLabel(routine.routineType)} (${routine.dbName}${meta.schemaName ? '.' + meta.schemaName : ''})`,
                              range,
                              sortText: '1' + meta.objectName,
                          }));
                      return { suggestions: [...suggestions, ...routineSuggestions] };
                  }

                  // 否则检查是否是表别名或表名，提示列
                  const aliasMap = buildQueryEditorAliasMap(completionReferenceText, sharedCurrentDb || '');

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
                          detail: buildColumnCompletionDetail(c),
                          documentation: buildColumnCompletionDocumentation(c),
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
              while ((match = tableRegex.exec(completionReferenceText)) !== null) {
                  const t = normalizeQualifiedName(match[1] || '');
                  if (!t) continue;
                  // 存储完整标识 db.table 或 table
                  foundTables.add(t.toLowerCase());
              }

              const currentDatabase = getActiveCompletionDbName();
              const isCurrentCompletionDatabase = (dbName: string) =>
                  String(dbName || '').toLowerCase() === currentDatabase.toLowerCase();
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
              const expectsTableName = /\b(?:FROM|JOIN|UPDATE|INTO|DELETE\s+FROM|TABLE|DESCRIBE|DESC|EXPLAIN)\s+[`"]?[\w.]*$/i.test(linePrefix);
              const expectsRoutineName = /\bCALL\s+[`"]?[\w.]*$/i.test(linePrefix);
              const matchesKeywordPrefix = wordPrefix.length > 0
                  && dialectKeywords.some((keyword) => keyword.toLowerCase().startsWith(wordPrefix));
              const statementPrefixBeforeWord = currentStatementPrefix.slice(
                  0,
                  Math.max(0, currentStatementPrefix.length - String(word.word || '').length),
              );
              const isNewStatementKeywordContext = !expectsTableName
                  && !expectsRoutineName
                  && matchesKeywordPrefix
                  && !statementPrefixBeforeWord.trim();
              const shouldBoostKeywords = !expectsTableName
                  && !expectsRoutineName
                  && matchesKeywordPrefix;
              const sortGroups = isNewStatementKeywordContext
                  ? { keyword: '00', func: '10', routineCurrent: '11', routineOther: '12', tableCurrent: '20', tableOther: '21', columnCurrent: '30', columnOther: '31', db: '40' }
                  : shouldBoostKeywords
                  ? { keyword: '00', func: '05', routineCurrent: '06', routineOther: '07', columnCurrent: '10', columnOther: '11', tableCurrent: '20', tableOther: '21', db: '30' }
                  : expectsRoutineName
                      ? { keyword: '30', func: '40', routineCurrent: '00', routineOther: '01', columnCurrent: '20', columnOther: '21', tableCurrent: '10', tableOther: '11', db: '35' }
                  : expectsTableName
                      ? { keyword: '20', func: '25', routineCurrent: '26', routineOther: '27', columnCurrent: '10', columnOther: '11', tableCurrent: '00', tableOther: '01', db: '30' }
                      : { keyword: '30', func: '25', routineCurrent: '26', routineOther: '27', columnCurrent: '00', columnOther: '01', tableCurrent: '10', tableOther: '11', db: '20' };
              let completionTables = sharedTablesData;
              if (
                  expectsTableName
                  && currentDatabase
                  && !sharedTablesData.some((t) => isCurrentCompletionDatabase(t.dbName || ''))
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
              if (
                  expectsTableName
                  && currentDatabase
                  && sharedTablesData.some((table) => isCurrentCompletionDatabase(table.dbName || ''))
                  && sharedTablesData.some((table) => isCurrentCompletionDatabase(table.dbName || '') && !normalizeCommentText(table.comment))
              ) {
                  const enrichedTables = await getLazyTablesByDB(currentDatabase);
                  if (isSqlCompletionRequestCancelled(token)) {
                      return createEmptySqlCompletionResult();
                  }
                  if (enrichedTables.length > 0) {
                      completionTables = sharedTablesData;
                  }
              }
              if (expectsTableName && currentDatabase) {
                  completionTables = completionTables.filter((table) => isCurrentCompletionDatabase(table.dbName || ''));
              }

              const referencedColumns: CompletionColumnMeta[] = [];
              if (!expectsTableName) {
                  const aliasMapForReferencedTables = buildQueryEditorAliasMap(completionReferenceText, currentDatabase);
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
                      const isCurrentDb = isCurrentCompletionDatabase(c.dbName || '');
                      return {
                          label: c.name,
                          kind: monaco.languages.CompletionItemKind.Field,
                          insertText: quoteCompletionPart(c.name),
                          detail: buildColumnCompletionDetail(c),
                          documentation: buildColumnCompletionDocumentation(c),
                          range,
                          sortText: isCurrentDb ? sortGroups.columnCurrent + c.name : sortGroups.columnOther + c.name,
                      };
                  });

              // 表提示：当前库智能处理 schema.table 格式
              // 1. 构建纯表名到 schema 列表的映射，检测同名表
              const currentDbTables = completionTables.filter(t =>
                  isCurrentCompletionDatabase(t.dbName || '')
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
                    const isCurrentDb = isCurrentCompletionDatabase(t.dbName || '');
                    const parsed = splitSchemaAndTable(t.tableName || '');
                    const pureTable = parsed.table || t.tableName || '';
                  if (!isCurrentDb) {
                      const suggestionMeta = buildDbQualifiedTableSuggestionMeta(t.dbName || '', t.tableName || '');
                      const label = suggestionMeta.dbQualifiedLabel;
                      // 跨库：用 db.table 格式匹配
                        return includesWordPrefix(label)
                            || includesWordPrefix(t.tableName || '')
                            || includesWordPrefix(pureTable);
                    }
                    // 当前库：同时用完整名和纯表名匹配
                    return includesWordPrefix(t.tableName || '') || includesWordPrefix(pureTable);
                })
                .map(t => {
                  const isCurrentDb = isCurrentCompletionDatabase(t.dbName || '');
                  const parsed = splitSchemaAndTable(t.tableName || '');
                  const pureTable = parsed.table || t.tableName || '';
                  if (!isCurrentDb) {
                      const suggestionMeta = buildDbQualifiedTableSuggestionMeta(t.dbName || '', t.tableName || '');
                      const label = suggestionMeta.dbQualifiedLabel;
                      return {
                          label,
                          kind: monaco.languages.CompletionItemKind.Class,
                          insertText: quoteCompletionPath(label),
                          detail: appendCommentToDetail(`${translate('query_editor.object_info.table')} (${t.dbName})`, t.comment),
                          documentation: buildCompletionDocumentation(t.comment),
                          range,
                          sortText: sortGroups.tableOther + getPrefixMatchRank(label, t.tableName || '', pureTable) + label,
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

              const routineSuggestions = sharedRoutinesData
                  .map((routine) => ({ routine, meta: buildRoutineSuggestionMeta(routine) }))
                  .filter(({ routine, meta }) => {
                      if (expectsRoutineName && meta.routineType !== 'PROCEDURE') return false;
                      return includesWordPrefix(meta.dbQualifiedLabel)
                          || includesWordPrefix(meta.displayName)
                          || includesWordPrefix(meta.objectName)
                          || includesWordPrefix(routine.routineName || '');
                  })
                  .map(({ routine, meta }) => {
                      const isCurrentDb = isCurrentCompletionDatabase(routine.dbName || '');
                      const schemaInfo = meta.schemaName && meta.schemaName.toLowerCase() !== String(routine.dbName || '').toLowerCase()
                          ? `.${meta.schemaName}`
                          : '';
                      return {
                          label: meta.dbQualifiedLabel,
                          kind: monaco.languages.CompletionItemKind.Function,
                          insertText: meta.insertText,
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          detail: `${getRoutineTypeLabel(routine.routineType)} (${routine.dbName}${schemaInfo})`,
                          range,
                          sortText: (isCurrentDb ? sortGroups.routineCurrent : sortGroups.routineOther)
                              + getPrefixMatchRank(meta.dbQualifiedLabel, meta.displayName, meta.objectName, routine.routineName || '')
                              + meta.dbQualifiedLabel,
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

              const suggestions = isNewStatementKeywordContext
                  ? [
                      ...keywordSuggestions,
                      ...funcSuggestions,
                      ...tableSuggestions,
                      ...dbSuggestions,
                      ...routineSuggestions,
                      ...relevantColumns,
                  ]
                  : [
                      ...relevantColumns,   // FROM 表的列最优先
                      ...tableSuggestions,  // 表次之
                      ...dbSuggestions,     // 数据库
                      ...routineSuggestions, // 存储过程/函数
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

  const handleFormatRef = useRef(handleFormat);
  useEffect(() => {
      handleFormatRef.current = handleFormat;
  });

  useEffect(() => {
      const handleFormatActiveQuery = () => {
          if (!isActive) {
              return;
          }
          handleFormatRef.current();
      };

      window.addEventListener('gonavi:format-active-query', handleFormatActiveQuery as EventListener);
      return () => {
          window.removeEventListener('gonavi:format-active-query', handleFormatActiveQuery as EventListener);
      };
  }, [isActive]);

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

  const containsOraclePlsqlDefinition = (statements: string[]): boolean => (
      statements.some((statement) => /^\s*(?:(?:--[^\n]*|\/\*[\s\S]*?\*\/)\s*)*CREATE\s+(?:OR\s+REPLACE\s+)?(?:EDITIONABLE\s+|NONEDITIONABLE\s+)?(?:PROCEDURE|FUNCTION|PACKAGE|TRIGGER)\b/i.test(statement))
  );

  const normalizeOracleSqlPlusSlashTerminators = (sql: string): string => (
      String(sql || '').replace(/(^|\n)([ \t]*\/[ \t]*);+([ \t]*(?:--[^\n]*)?)(?=\n|$)/g, '$1$2$3')
  );

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

  const isAffectedRowsResultSetData = (result?: any): boolean =>
      Boolean(
          result &&
          Array.isArray(result.rows) &&
          result.rows.length === 1 &&
          Array.isArray(result.columns) &&
          result.columns.length === 1 &&
          result.columns[0] === 'affectedRows',
      );

  const hasConcreteQueryResultSetData = (result: any, messages: string[]): boolean => {
      if (!result || isAffectedRowsResultSetData(result)) return false;
      if (messages.length > 0) return true;
      if (Array.isArray(result.columns) && result.columns.length > 0) return true;
      if (Array.isArray(result.rows) && result.rows.length > 0) return true;
      return false;
  };

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

  const executeSqlEditorMultiQuery = useCallback((
      config: Record<string, any>,
      dbName: string,
      sql: string,
      queryId: string,
      sourceStatements: string[],
  ) => {
      const pendingTransaction = pendingSqlTransactionRef.current;
      if (pendingTransaction && canReusePendingSqlEditorTransactionForType(String(config.type || ''), sourceStatements)) {
          return DBQueryMultiInTransaction(pendingTransaction.id, sql, queryId);
      }
      return DBQueryMulti(buildRpcConnectionConfig(config) as any, dbName, sql, queryId);
  }, []);

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
          // 保持与首次执行一致的后端路径，必要时复用挂起事务
          let queryId: string;
          try {
              queryId = await GenerateQueryID();
          } catch {
              queryId = 'reload-' + Date.now();
          }
          const res = await executeSqlEditorMultiQuery(
              config,
              currentDb,
              sql,
              queryId,
              splitSQLStatements(sql),
          );
          if (!res?.success) {
              message.error(translate('query_editor.message.refresh_failed', {
                  error: formatSqlExecutionError(res?.message || translate('common.unknown'), { translate }),
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
          const refreshedMessages = normalizeQueryResultMessages(rsData?.messages);
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
                      messages: refreshedMessages,
                      resultType: ((!Array.isArray(rsData.rows) || rsData.rows.length === 0) && (!Array.isArray(rsData.columns) || rsData.columns.length === 0) && refreshedMessages.length > 0)
                          ? 'message'
                          : 'grid',
                      truncated,
                  }
                  : rs
          ));
      } catch (err: any) {
          message.error(translate('query_editor.message.refresh_failed', {
              error: formatSqlExecutionError(err?.message || err || translate('common.unknown'), { translate }),
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
          const res = await executeSqlEditorMultiQuery(
              config,
              currentDb,
              pageSql,
              queryId,
              splitSQLStatements(pageSql),
          );
          if (!res?.success) {
              message.error(translate('query_editor.message.page_query_failed', {
                  error: formatSqlExecutionError(res?.message || translate('common.unknown'), { translate }),
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
          const pageMessages = normalizeQueryResultMessages(rsData?.messages);
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
                      messages: pageMessages,
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
              error: formatSqlExecutionError(err?.message || err || translate('common.unknown'), { translate }),
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
	    if (findConnectionMutatingStatements(conn.config, executableSQL).length > 0) {
	        message.warning(translate('query_editor.message.connection_readonly_blocked'));
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
                        setExecutionError(formatSqlExecutionError(shellConvert.error, { prefix, translate }));
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
                const legacyResultMessages = normalizeQueryResultMessages(res?.messages);
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
                    setExecutionError(formatSqlExecutionError(res.message, { prefix, translate }));
                    setResultSets([]);
                    setActiveResultKey(QUERY_EDITOR_SQL_LOG_TAB_KEY);
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
                        messages: legacyResultMessages,
                        pkColumns: [],
                        readOnly: true,
                        truncated
                    });
                } else if (legacyResultMessages.length > 0) {
                    nextResultSets.push({
                        key: `result-${idx + 1}`,
                        sql: rawStatement,
                        exportSql: rawStatement,
                        sourceStatementIndex: idx + 1,
                        statementResultIndex: 1,
                        rows: [],
                        columns: [],
                        messages: legacyResultMessages,
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
                            messages: legacyResultMessages,
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
            const mergedResultSets = mergeResultSets(resultSets, nextResultSets, shouldReplaceAllResults);
            setResultSets(mergedResultSets);
            setActiveResultKey(resolveActiveResultKeyAfterMerge(mergedResultSets, nextResultSets));
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
            const useManagedTransaction = shouldUseSqlEditorManagedTransactionForType(connCaps.type, sourceStatements);
            if (useManagedTransaction && pendingSqlTransactionRef.current) {
                message.warning(translate('query_editor.transaction.message.pending_managed_transaction'));
                return;
            }
            const managedTransactionStatementCount = sourceStatements
                .filter((statement) => shouldUseSqlEditorManagedTransactionForType(connCaps.type, [statement]))
                .length || sourceStatements.length;

            const forceReadOnlyResult = connCaps.forceReadOnlyQueryResult;
            const showRowNumberColumn = shouldShowOceanBaseRowNumberColumn(config);
            const defaultOracleSchema = isOracleLikeDialect(normalizedDbType)
                ? resolveOracleLikeDefaultSchemaName(config)
                : '';
            const oracleExecutionSchema = isOracleLikeDialect(normalizedDbType)
                ? resolveOracleLikeExecutionSchemaName(config, currentDb)
                : '';
            const shouldQualifyOracleUnqualifiedTables = Boolean(
                oracleExecutionSchema
                && oracleExecutionSchema.toLowerCase() !== String(defaultOracleSchema || '').trim().toLowerCase(),
            );
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
                            || oracleExecutionSchema
                            || currentDb
                            || '',
                        ).trim();
                        const oracleTables = oracleLookupDbName ? await getOracleTablesForDb(oracleLookupDbName) : [];
                        const exactQualifiedTable = resolveOracleExactCaseTableReference(statement, oracleLookupDbName, oracleTables, {
                            qualifyUnqualified: shouldQualifyOracleUnqualifiedTables,
                        });
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
            const executableStatements = executablePlans.map((plan) => plan.executedSql);
            const shouldPreserveOraclePlsqlBatch = isOracleLikeDialect(normalizedDbType) && containsOraclePlsqlDefinition(sourceStatements);
            const fullSQL = shouldPreserveOraclePlsqlBatch
                ? normalizeOracleSqlPlusSlashTerminators(normalizedRawSQL)
                : executableStatements.join(';\n');

            const startTime = Date.now();
            let queryId: string;
            try {
                queryId = await GenerateQueryID();
            } catch (error) {
                console.warn('GenerateQueryID failed, using local UUID fallback:', error);
                queryId = 'query-' + uuidv4();
            }
            setQueryId(queryId);

            const res = useManagedTransaction
                ? await DBQueryMultiTransactional(buildRpcConnectionConfig(config) as any, currentDb, fullSQL, queryId)
                : await executeSqlEditorMultiQuery(
                    config,
                    currentDb,
                    fullSQL,
                    queryId,
                    executableStatements,
                );
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
                                       hasLocalizedSqlTimeoutKeyword(errorMsg) ||
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
                setExecutionError(formatSqlExecutionError(res.message, { translate }));
                setResultSets([]);
                setActiveResultKey(QUERY_EDITOR_SQL_LOG_TAB_KEY);
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
            const topLevelMessages = normalizeQueryResultMessages(res.messages);
            const nextResultSets: ResultSet[] = [];
            const maxRows = Number(queryOptions?.maxRows) || 0;
            let anyTruncated = false;
            const statementResultCounts = new Map<number, number>();
            const resolveSourceStatementIndex = (rsData: any, idx: number): number => {
                const explicitStatementIndex = Number(rsData?.statementIndex || 0);
                if (explicitStatementIndex > 0) {
                    return explicitStatementIndex;
                }
                if (normalizedDbType === 'sqlserver' && sourceStatements.length === 1) {
                    return 1;
                }
                return idx + 1;
            };
            const sqlServerStatementsWithConcreteResults = new Set<number>();
            if (normalizedDbType === 'sqlserver') {
                resultSetDataArray.forEach((rsData, idx) => {
                    const sourceStatementIndex = resolveSourceStatementIndex(rsData, idx);
                    const resultMessages = normalizeQueryResultMessages(rsData?.messages);
                    if (hasConcreteQueryResultSetData(rsData, resultMessages)) {
                        sqlServerStatementsWithConcreteResults.add(sourceStatementIndex);
                    }
                });
            }
            const shouldUseTopLevelSqlServerMessages = normalizedDbType === 'sqlserver'
                && topLevelMessages.length > 0
                && sqlServerStatementsWithConcreteResults.size === 0;

            for (let idx = 0; idx < resultSetDataArray.length; idx++) {
                const rsData = resultSetDataArray[idx];
                const sourceStatementIndex = resolveSourceStatementIndex(rsData, idx);
                const plan = executablePlans[Math.max(0, sourceStatementIndex - 1)];
                const originalSql = plan?.originalSql || '';
                const executedSql = plan?.executedSql || originalSql;
                const resultMessages = normalizeQueryResultMessages(rsData?.messages);

                // 检查是否为 affectedRows 类结果集
                const isAffectedResult = isAffectedRowsResultSetData(rsData);
                const shouldHideSqlServerAffectedResult = normalizedDbType === 'sqlserver'
                    && isAffectedResult
                    && (
                        sqlServerStatementsWithConcreteResults.has(sourceStatementIndex)
                        || shouldUseTopLevelSqlServerMessages
                    );
                if (shouldHideSqlServerAffectedResult) {
                    continue;
                }

                const statementResultIndex = (statementResultCounts.get(sourceStatementIndex) || 0) + 1;
                statementResultCounts.set(sourceStatementIndex, statementResultIndex);

                if (isAffectedResult) {
                    const affected = Number(rsData.rows[0]?.affectedRows);
                    const row = { affectedRows: Number.isFinite(affected) ? affected : 0 };
                    (row as any)[GONAVI_ROW_KEY] = 0;
                    nextResultSets.push({
                        key: `result-${nextResultSets.length + 1}`,
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
                        key: `result-${nextResultSets.length + 1}`,
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
                        key: `result-${nextResultSets.length + 1}`,
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
            const mergedResultSets = mergeResultSets(resultSets, nextResultSets, shouldReplaceAllResults);
            setResultSets(mergedResultSets);
            setActiveResultKey(resolveActiveResultKeyAfterMerge(mergedResultSets, nextResultSets));
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
        const formattedError = formatSqlExecutionError(e?.message || e, { translate });
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
        setActiveResultKey(QUERY_EDITOR_SQL_LOG_TAB_KEY);
    } finally {
        if (runSeqRef.current === runSeq) setLoading(false);
        // Clear query ID after execution completes
        clearQueryId();
    }
  };

  const handleRunSelectedShortcut = async () => {
      await handleRun();
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
          if (isEditableElement(event.target) && !inEditorPane) {
              return;
          }
          if (!editorHasFocus && !inEditorPane) {
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
          void handleRunSelectedShortcut();
      };

      window.addEventListener('keydown', handleRunShortcut, true);
      return () => {
          window.removeEventListener('keydown', handleRunShortcut, true);
      };
  }, [isActive, runQueryShortcutBinding, handleRun]);

  // Re-register Monaco internal keybinding when runQuery shortcut changes
  useEffect(() => {
      if (objectHoverActionRef.current) {
          objectHoverActionRef.current.dispose();
          objectHoverActionRef.current = null;
      }

      if (!editorRef.current || !monacoRef.current) return;

      registerShowObjectInfoAction();

      return () => {
          if (objectHoverActionRef.current) {
              objectHoverActionRef.current.dispose();
              objectHoverActionRef.current = null;
          }
      };
  }, [languagePreference, registerShowObjectInfoAction]);

  useEffect(() => {
      const editor = editorRef.current;
      if (!editor) return;

      registerInsertSqlSnippetContextMenuAction(editor);

      return () => {
          if (insertSqlSnippetActionRef.current) {
              insertSqlSnippetActionRef.current.dispose();
              insertSqlSnippetActionRef.current = null;
          }
      };
  }, [languagePreference, registerInsertSqlSnippetContextMenuAction]);

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
                  window.dispatchEvent(new CustomEvent('gonavi:run-active-query', {
                      detail: { requireSelection: true },
                  }));
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
      if (duplicateCurrentLineActionRef.current) {
          duplicateCurrentLineActionRef.current.dispose();
          duplicateCurrentLineActionRef.current = null;
      }

      const editor = editorRef.current;
      const monaco = monacoRef.current;
      if (!editor || !monaco) return;

      const binding = duplicateCurrentLineShortcutBinding;
      if (!binding?.enabled || !binding.combo) return;

      const keyBinding = comboToMonacoKeyBinding(binding.combo, monaco.KeyMod, monaco.KeyCode);
      if (keyBinding) {
          duplicateCurrentLineActionRef.current = editor.addAction({
              id: 'gonavi.duplicateCurrentLine',
              label: buildQueryEditorMonacoActionLabel('app.shortcuts.action.duplicateCurrentLine.label'),
              keybindings: [keyBinding.keyMod | keyBinding.keyCode],
              run: handleDuplicateCurrentLine,
          });
      }

      return () => {
          if (duplicateCurrentLineActionRef.current) {
              duplicateCurrentLineActionRef.current.dispose();
              duplicateCurrentLineActionRef.current = null;
          }
      };
  }, [duplicateCurrentLineShortcutBinding, handleDuplicateCurrentLine, languagePreference]);

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
      if (findInEditorActionRef.current) {
          findInEditorActionRef.current.dispose();
          findInEditorActionRef.current = null;
      }

      const editor = editorRef.current;
      const monaco = monacoRef.current;
      if (!editor || !monaco) return;

      const keyBinding = comboToMonacoKeyBinding(
          findInEditorShortcutCombo,
          monaco.KeyMod,
          monaco.KeyCode,
      );
      if (keyBinding) {
          findInEditorActionRef.current = editor.addAction({
              id: 'gonavi.findInEditor',
              label: buildQueryEditorMonacoActionLabel('query_editor.action.find_in_editor'),
              keybindings: [keyBinding.keyMod | keyBinding.keyCode],
              run: () => {
                  window.dispatchEvent(new CustomEvent('gonavi:find-active-query'));
              },
          });
      }

      return () => {
          if (findInEditorActionRef.current) {
              findInEditorActionRef.current.dispose();
              findInEditorActionRef.current = null;
          }
      };
  }, [findInEditorShortcutCombo, languagePreference]);

  useEffect(() => {
      if (formatSqlActionRef.current) {
          formatSqlActionRef.current.dispose();
          formatSqlActionRef.current = null;
      }

      const editor = editorRef.current;
      const monaco = monacoRef.current;
      if (!editor || !monaco) return;

      const binding = formatSqlShortcutBinding;
      if (!binding?.enabled || !binding.combo) return;

      const keyBinding = comboToMonacoKeyBinding(binding.combo, monaco.KeyMod, monaco.KeyCode);
      if (keyBinding) {
          formatSqlActionRef.current = editor.addAction({
              id: 'gonavi.formatSql',
              label: buildQueryEditorMonacoActionLabel('app.shortcuts.action.formatSql.label'),
              keybindings: [keyBinding.keyMod | keyBinding.keyCode],
              run: () => {
                  window.dispatchEvent(new CustomEvent('gonavi:format-active-query'));
              },
          });
      }

      return () => {
          if (formatSqlActionRef.current) {
              formatSqlActionRef.current.dispose();
              formatSqlActionRef.current = null;
          }
      };
  }, [languagePreference, formatSqlShortcutBinding]);

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
      const handleRunActiveQuery = (event: Event) => {
          if (!isActive) {
              return;
          }
          if ((event as CustomEvent<{ requireSelection?: boolean }>).detail?.requireSelection) {
              void handleRunSelectedShortcut();
              return;
          }
          void handleRun();
      };

      window.addEventListener('gonavi:run-active-query', handleRunActiveQuery as EventListener);
      return () => {
          window.removeEventListener('gonavi:run-active-query', handleRunActiveQuery as EventListener);
      };
  }, [isActive, handleRun, handleRunSelectedShortcut]);

  useEffect(() => {
      const handleFindActiveQuery = () => {
          if (!isActive) {
              return;
          }
          handleOpenEditorFind();
      };

      window.addEventListener('gonavi:find-active-query', handleFindActiveQuery as EventListener);
      return () => {
          window.removeEventListener('gonavi:find-active-query', handleFindActiveQuery as EventListener);
      };
  }, [handleOpenEditorFind, isActive]);

  useEffect(() => {
      const binding = selectCurrentStatementShortcutBinding;
      if (!binding?.enabled || !binding.combo) {
          return;
      }

      const handleSelectCurrentStatementShortcut = (event: KeyboardEvent) => {
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
          void handleSelectCurrentStatement();
      };

      window.addEventListener('keydown', handleSelectCurrentStatementShortcut, true);
      return () => {
          window.removeEventListener('keydown', handleSelectCurrentStatementShortcut, true);
      };
  }, [handleSelectCurrentStatement, isActive, selectCurrentStatementShortcutBinding]);

  useEffect(() => {
      const binding = selectCurrentStatementShortcutBinding;
      if (
          activeShortcutPlatform !== 'mac'
          || !binding?.enabled
          || normalizeShortcutCombo(binding.combo) !== 'Meta+E'
      ) {
          return;
      }

      try {
          return EventsOn(QUERY_EDITOR_NATIVE_SELECT_CURRENT_LINE_EVENT, () => {
              if (!isActive) {
                  return;
              }
              void handleSelectCurrentStatement();
          });
      } catch {
          return;
      }
  }, [activeShortcutPlatform, handleSelectCurrentStatement, isActive, selectCurrentStatementShortcutBinding]);

  useEffect(() => {
      const binding = duplicateCurrentLineShortcutBinding;
      if (!binding?.enabled || !binding.combo) {
          return;
      }

      const handleDuplicateCurrentLineShortcut = (event: KeyboardEvent) => {
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
          handleDuplicateCurrentLine();
      };

      window.addEventListener('keydown', handleDuplicateCurrentLineShortcut, true);
      return () => {
          window.removeEventListener('keydown', handleDuplicateCurrentLineShortcut, true);
      };
  }, [duplicateCurrentLineShortcutBinding, handleDuplicateCurrentLine, isActive]);

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
      if (isLocalizedUntitledQueryTitle(rawTitle)) {
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
      clearQueryTabDraft(tab.id);
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
              clearQueryTabDraft(tab.id);
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
      { type: 'divider' },
      {
          key: 'diagnose-query',
          label: (
              <span>
                  {translate('app.shortcuts.action.diagnoseQuery.label' as any)}
                  {diagnoseQueryShortcutBinding?.enabled && diagnoseQueryShortcutBinding.combo && (
                      <span style={{ marginLeft: 8, color: 'var(--gn-text-muted, #6c757d)', fontSize: 11 }}>
                          {getShortcutDisplayLabel(diagnoseQueryShortcutBinding.combo, activeShortcutPlatform)}
                      </span>
                  )}
              </span>
          ),
          onClick: () => openSqlAnalysisWorkbench('diagnose', getCurrentQuery()),
      },
      {
          key: 'show-slow-queries',
          label: (
              <span>
                  {translate('app.shortcuts.action.showSlowQueries.label' as any)}
                  {showSlowQueriesShortcutBinding?.enabled && showSlowQueriesShortcutBinding.combo && (
                      <span style={{ marginLeft: 8, color: 'var(--gn-text-muted, #6c757d)', fontSize: 11 }}>
                          {getShortcutDisplayLabel(showSlowQueriesShortcutBinding.combo, activeShortcutPlatform)}
                      </span>
                  )}
              </span>
          ),
          onClick: () => openSqlAnalysisWorkbench('slow-query'),
      },
  ];

  useEffect(() => {
      const handleFindShortcut = (event: KeyboardEvent) => {
          if (!isActive) {
              return;
          }
          if (!isShortcutMatch(event, findInEditorShortcutCombo)) {
              return;
          }

          const editor = editorRef.current;
          const targetNode = resolveEventTargetNode(event.target);
          const editorHasFocus = !!editor?.hasTextFocus?.();
          const inEditorPane = !!(targetNode && editorPaneRef.current?.contains(targetNode));
          const inQueryEditor = !!(targetNode && queryEditorRootRef.current?.contains(targetNode));
          if (isEditableElement(event.target) && !inEditorPane) {
              return;
          }
          if (!editorHasFocus && !inEditorPane && !inQueryEditor && !isDocumentLevelShortcutTarget(targetNode)) {
              return;
          }

          event.preventDefault();
          event.stopPropagation();
          handleOpenEditorFind();
      };

      window.addEventListener('keydown', handleFindShortcut, true);
      return () => {
          window.removeEventListener('keydown', handleFindShortcut, true);
      };
  }, [findInEditorShortcutCombo, handleOpenEditorFind, isActive]);

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
          if (!editorHasFocus && !inQueryEditor && !isDocumentLevelShortcutTarget(targetNode)) {
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
      const binding = formatSqlShortcutBinding;
      if (!binding?.enabled || !binding.combo) {
          return;
      }

      const handleFormatShortcut = (event: KeyboardEvent) => {
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
          handleFormatRef.current();
      };

      window.addEventListener('keydown', handleFormatShortcut, true);
      return () => {
          window.removeEventListener('keydown', handleFormatShortcut, true);
      };
  }, [isActive, formatSqlShortcutBinding]);

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

  useEffect(() => {
      const handleOpenSqlExecutionLog = (event: Event) => {
          const mode = event instanceof CustomEvent && event.detail?.mode === 'open' ? 'open' : 'toggle';
          handleShowSqlExecutionLog(mode);
      };

      window.addEventListener('gonavi:show-sql-execution-log', handleOpenSqlExecutionLog as EventListener);
      return () => {
          window.removeEventListener('gonavi:show-sql-execution-log', handleOpenSqlExecutionLog as EventListener);
      };
  }, [handleShowSqlExecutionLog]);

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
  const queryEditorStageStyle: React.CSSProperties = isResultPanelVisible
      ? {
          height: editorHeight,
          minHeight: '100px',
      }
      : {
          flex: '1 1 auto',
          minHeight: 0,
      };
  const resolvedQueryEditorStageStyle: React.CSSProperties = isV2Ui
      ? {
          ...queryEditorStageStyle,
      } as React.CSSProperties
      : queryEditorStageStyle;

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
        formatSqlShortcutBinding={formatSqlShortcutBinding}
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
        onFindInEditor={handleOpenEditorFind}
        onFormat={handleFormat}
        onToggleResultPanelVisibility={toggleResultPanelVisibility}
        onAIAction={handleAIAction}
      />
      
      <div
        ref={editorStageRef}
        className={isV2Ui ? 'gn-v2-query-monaco-stage gn-query-monaco-stage' : 'gn-query-monaco-stage'}
        style={resolvedQueryEditorStageStyle}
      >
        <div
          ref={editorShellRef}
          className={isV2Ui ? 'gn-v2-query-monaco-shell' : undefined}
          style={isV2Ui ? { flex: '1 1 auto', minHeight: 0 } : undefined}
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
            options={queryEditorMonacoOptions}
          />
        </div>
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
          sqlLogCount={sqlLogCount}
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
        title={translate('query_editor.snippet_picker.title')}
        open={isSqlSnippetPickerOpen}
        centered
        mask={false}
        maskClosable={false}
        width={620}
        draggable
        resizable
        minResizableWidth={460}
        minResizableHeight={320}
        onCancel={handleCloseSqlSnippetPicker}
        footer={null}
        styles={{
          content: {
            borderRadius: 16,
            border: darkMode ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(15,23,42,0.12)',
            background: darkMode ? 'rgba(18,18,20,0.98)' : 'rgba(255,255,255,0.98)',
            boxShadow: darkMode ? '0 24px 60px rgba(0,0,0,0.45)' : '0 24px 60px rgba(15,23,42,0.16)',
            backdropFilter: 'blur(12px)',
          },
          header: {
            background: 'transparent',
            borderBottom: 'none',
            paddingBottom: 8,
          },
          body: {
            paddingTop: 8,
            paddingBottom: 16,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'hidden',
          },
        }}
      >
        <div
          data-query-editor-snippet-picker="true"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            flex: '1 1 420px',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          <div style={{ fontSize: 12, lineHeight: 1.6, color: darkMode ? 'rgba(255,255,255,0.65)' : 'rgba(16,24,40,0.6)' }}>
            {translate('query_editor.snippet_picker.description')}
          </div>
          <Input
            autoFocus
            data-query-editor-snippet-search="true"
            value={sqlSnippetPickerKeyword}
            onChange={(event) => setSqlSnippetPickerKeyword(event.target.value)}
            onPressEnter={() => {
              if (filteredSqlSnippets[0]) {
                handleInsertSqlSnippet(filteredSqlSnippets[0]);
              }
            }}
            placeholder={translate('query_editor.snippet_picker.search_placeholder')}
          />
          <div
            style={{
              flex: '1 1 auto',
              minHeight: 0,
              overflowY: 'auto',
              paddingRight: 4,
              display: 'grid',
              gap: 8,
            }}
          >
            {filteredSqlSnippets.map((snippet) => {
              const preview = String(snippet.description || snippet.syntaxHelp || snippet.body || '')
                .replace(/\s+/g, ' ')
                .trim();
              return (
                <button
                  key={snippet.id}
                  type="button"
                  data-query-editor-snippet-item={snippet.id}
                  onClick={() => handleInsertSqlSnippet(snippet)}
                  style={{
                    textAlign: 'left',
                    borderRadius: 12,
                    border: darkMode ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(15,23,42,0.1)',
                    background: darkMode ? 'rgba(255,255,255,0.03)' : '#fff',
                    padding: '12px 14px',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span style={{ fontFamily: 'var(--gn-font-mono)', fontSize: 12, fontWeight: 700, color: '#1677ff' }}>
                      {snippet.prefix}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: darkMode ? 'rgba(255,255,255,0.9)' : 'rgba(15,23,42,0.88)' }}>
                      {snippet.name}
                    </span>
                    {snippet.isBuiltin ? (
                      <span
                        style={{
                          fontSize: 11,
                          padding: '1px 8px',
                          borderRadius: 999,
                          background: darkMode ? 'rgba(22,119,255,0.18)' : 'rgba(22,119,255,0.1)',
                          color: '#1677ff',
                        }}
                      >
                        {translate('snippet_settings.tag.builtin')}
                      </span>
                    ) : null}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      lineHeight: 1.6,
                      color: darkMode ? 'rgba(255,255,255,0.65)' : 'rgba(16,24,40,0.6)',
                      fontFamily: preview.includes('${') ? 'var(--gn-font-mono)' : undefined,
                    }}
                  >
                    {preview}
                  </div>
                </button>
              );
            })}
            {!filteredSqlSnippets.length ? (
              <div
                data-query-editor-snippet-empty="true"
                style={{
                  borderRadius: 12,
                  padding: '18px 16px',
                  border: darkMode ? '1px dashed rgba(255,255,255,0.14)' : '1px dashed rgba(15,23,42,0.12)',
                  color: darkMode ? 'rgba(255,255,255,0.6)' : 'rgba(16,24,40,0.55)',
                  fontSize: 13,
                  lineHeight: 1.7,
                }}
              >
                {sqlSnippetPickerEmptyLabel}
              </div>
            ) : null}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <Button onClick={handleOpenSnippetSettingsFromPicker}>
              {translate('query_editor.snippet_picker.manage')}
            </Button>
            <Button onClick={handleCloseSqlSnippetPicker}>
              {translate('common.cancel')}
            </Button>
          </div>
        </div>
      </Modal>

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
