import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Editor, { type OnMount } from './MonacoEditor';
import { Button, message, Modal, Input, Form, Dropdown, MenuProps, Tooltip, Select, Tabs } from 'antd';
import { PlayCircleOutlined, SaveOutlined, FormatPainterOutlined, SettingOutlined, CloseOutlined, StopOutlined, RobotOutlined } from '@ant-design/icons';
import { format } from 'sql-formatter';
import { v4 as uuidv4 } from 'uuid';
import { TabData, ColumnDefinition, IndexDefinition } from '../types';
import { useStore } from '../store';
import { DBQuery, DBQueryWithCancel, DBQueryMulti, DBGetTables, DBGetAllColumns, DBGetDatabases, DBGetColumns, DBGetIndexes, CancelQuery, GenerateQueryID, WriteSQLFile, ExportSQLFile } from '../../wailsjs/go/app/App';
import DataGrid, { GONAVI_ROW_KEY } from './DataGrid';
import { getDataSourceCapabilities } from '../utils/dataSourceCapabilities';
import { applyMongoQueryAutoLimit, convertMongoShellToJsonCommand } from "../utils/mongodb";
import { getShortcutDisplayLabel, getShortcutPlatform, getShortcutPrimaryModifierDisplayLabel, isEditableElement, isShortcutMatch, comboToMonacoKeyBinding, resolveShortcutBinding } from "../utils/shortcuts";
import { useAutoFetchVisibility } from '../utils/autoFetchVisibility';
import { buildRpcConnectionConfig } from '../utils/connectionRpcConfig';
import { isOracleLikeDialect, resolveSqlDialect, resolveSqlFunctions, resolveSqlKeywords } from '../utils/sqlDialect';
import { applyQueryAutoLimit } from '../utils/queryAutoLimit';
import { extractQueryResultTableRef, type QueryResultTableRef } from '../utils/queryResultTable';
import { quoteIdentPart } from '../utils/sql';
import { resolveCurrentSqlStatementRange, resolveExecutableSql } from '../utils/sqlStatementSelection';
import { isMacLikePlatform } from '../utils/appearance';
import { splitSidebarQualifiedName } from '../utils/sidebarLocate';
import { normalizeSidebarViewName } from '../utils/sidebarMetadata';
import { SIDEBAR_SQL_EDITOR_DRAG_MIME, decodeSidebarSqlEditorDragPayload, hasSidebarSqlEditorDragPayload } from '../utils/sidebarSqlDrag';
import { resolveUniqueKeyGroupsFromIndexes } from './dataGridCopyInsert';
import { ORACLE_ROWID_LOCATOR_COLUMN, type EditRowLocator } from '../utils/rowLocator';
import { getQueryTabDraft, hasQueryTabDraft, setQueryTabDraft, setSQLFileTabDraft } from '../utils/sqlFileTabDrafts';
import {
    getColumnDefinitionKey,
    getColumnDefinitionName,
} from '../utils/columnDefinition';

const SQL_KEYWORDS = [
    'SELECT', 'FROM', 'WHERE', 'LIMIT', 'INSERT', 'UPDATE', 'DELETE', 'JOIN', 'LEFT', 'RIGHT',
    'INNER', 'OUTER', 'ON', 'GROUP BY', 'ORDER BY', 'AS', 'AND', 'OR', 'NOT', 'NULL', 'IS',
    'IN', 'VALUES', 'SET', 'CREATE', 'TABLE', 'DROP', 'ALTER', 'ADD', 'MODIFY', 'CHANGE',
    'COLUMN', 'KEY', 'PRIMARY', 'FOREIGN', 'REFERENCES', 'CONSTRAINT', 'DEFAULT', 'AUTO_INCREMENT',
    'COMMENT', 'SHOW', 'DESCRIBE', 'EXPLAIN',
];

// SQL 常用内置函数（通用，适用于 MySQL/PostgreSQL/Oracle/SQL Server 等主流数据源）
const SQL_FUNCTIONS: { name: string; detail: string }[] = [
    // 聚合函数
    { name: 'COUNT', detail: '聚合 - 计数' },
    { name: 'SUM', detail: '聚合 - 求和' },
    { name: 'AVG', detail: '聚合 - 平均值' },
    { name: 'MAX', detail: '聚合 - 最大值' },
    { name: 'MIN', detail: '聚合 - 最小值' },
    { name: 'GROUP_CONCAT', detail: '聚合 - 拼接分组值' },
    // 字符串函数
    { name: 'CONCAT', detail: '字符串 - 拼接' },
    { name: 'CONCAT_WS', detail: '字符串 - 带分隔符拼接' },
    { name: 'SUBSTRING', detail: '字符串 - 截取子串' },
    { name: 'SUBSTR', detail: '字符串 - 截取子串' },
    { name: 'LEFT', detail: '字符串 - 从左截取' },
    { name: 'RIGHT', detail: '字符串 - 从右截取' },
    { name: 'LENGTH', detail: '字符串 - 字节长度' },
    { name: 'CHAR_LENGTH', detail: '字符串 - 字符长度' },
    { name: 'UPPER', detail: '字符串 - 转大写' },
    { name: 'LOWER', detail: '字符串 - 转小写' },
    { name: 'TRIM', detail: '字符串 - 去空格' },
    { name: 'LTRIM', detail: '字符串 - 去左空格' },
    { name: 'RTRIM', detail: '字符串 - 去右空格' },
    { name: 'REPLACE', detail: '字符串 - 替换' },
    { name: 'REVERSE', detail: '字符串 - 反转' },
    { name: 'REPEAT', detail: '字符串 - 重复' },
    { name: 'LPAD', detail: '字符串 - 左填充' },
    { name: 'RPAD', detail: '字符串 - 右填充' },
    { name: 'INSTR', detail: '字符串 - 查找位置' },
    { name: 'LOCATE', detail: '字符串 - 查找位置' },
    { name: 'FIND_IN_SET', detail: '字符串 - 在集合中查找' },
    { name: 'FORMAT', detail: '字符串 - 数字格式化' },
    { name: 'SPACE', detail: '字符串 - 生成空格' },
    { name: 'INSERT', detail: '字符串 - 插入替换' },
    { name: 'FIELD', detail: '字符串 - 返回位置索引' },
    { name: 'ELT', detail: '字符串 - 按索引返回' },
    { name: 'HEX', detail: '字符串 - 十六进制编码' },
    { name: 'UNHEX', detail: '字符串 - 十六进制解码' },
    // 数学函数
    { name: 'ABS', detail: '数学 - 绝对值' },
    { name: 'CEIL', detail: '数学 - 向上取整' },
    { name: 'CEILING', detail: '数学 - 向上取整' },
    { name: 'FLOOR', detail: '数学 - 向下取整' },
    { name: 'ROUND', detail: '数学 - 四舍五入' },
    { name: 'TRUNCATE', detail: '数学 - 截断小数' },
    { name: 'MOD', detail: '数学 - 取模' },
    { name: 'RAND', detail: '数学 - 随机数' },
    { name: 'SIGN', detail: '数学 - 符号' },
    { name: 'POWER', detail: '数学 - 幂运算' },
    { name: 'POW', detail: '数学 - 幂运算' },
    { name: 'SQRT', detail: '数学 - 平方根' },
    { name: 'LOG', detail: '数学 - 对数' },
    { name: 'LOG2', detail: '数学 - 以2为底对数' },
    { name: 'LOG10', detail: '数学 - 以10为底对数' },
    { name: 'LN', detail: '数学 - 自然对数' },
    { name: 'EXP', detail: '数学 - e的次方' },
    { name: 'PI', detail: '数学 - 圆周率' },
    { name: 'GREATEST', detail: '数学 - 返回最大值' },
    { name: 'LEAST', detail: '数学 - 返回最小值' },
    // 日期时间函数
    { name: 'NOW', detail: '日期 - 当前日期时间' },
    { name: 'CURDATE', detail: '日期 - 当前日期' },
    { name: 'CURRENT_DATE', detail: '日期 - 当前日期' },
    { name: 'CURTIME', detail: '日期 - 当前时间' },
    { name: 'CURRENT_TIME', detail: '日期 - 当前时间' },
    { name: 'CURRENT_TIMESTAMP', detail: '日期 - 当前时间戳' },
    { name: 'SYSDATE', detail: '日期 - 系统当前时间' },
    { name: 'DATE', detail: '日期 - 提取日期部分' },
    { name: 'TIME', detail: '日期 - 提取时间部分' },
    { name: 'YEAR', detail: '日期 - 提取年份' },
    { name: 'MONTH', detail: '日期 - 提取月份' },
    { name: 'DAY', detail: '日期 - 提取天' },
    { name: 'DAYOFWEEK', detail: '日期 - 星期几(1=周日)' },
    { name: 'DAYOFYEAR', detail: '日期 - 年中第几天' },
    { name: 'HOUR', detail: '日期 - 提取小时' },
    { name: 'MINUTE', detail: '日期 - 提取分钟' },
    { name: 'SECOND', detail: '日期 - 提取秒' },
    { name: 'DATE_FORMAT', detail: '日期 - 格式化' },
    { name: 'DATE_ADD', detail: '日期 - 加日期' },
    { name: 'DATE_SUB', detail: '日期 - 减日期' },
    { name: 'DATEDIFF', detail: '日期 - 日期差(天)' },
    { name: 'TIMEDIFF', detail: '日期 - 时间差' },
    { name: 'TIMESTAMPDIFF', detail: '日期 - 时间戳差' },
    { name: 'TIMESTAMPADD', detail: '日期 - 时间戳加' },
    { name: 'STR_TO_DATE', detail: '日期 - 字符串转日期' },
    { name: 'UNIX_TIMESTAMP', detail: '日期 - Unix时间戳' },
    { name: 'FROM_UNIXTIME', detail: '日期 - 从Unix时间戳转换' },
    { name: 'LAST_DAY', detail: '日期 - 月末日期' },
    { name: 'WEEK', detail: '日期 - 第几周' },
    { name: 'QUARTER', detail: '日期 - 第几季度' },
    { name: 'ADDDATE', detail: '日期 - 加日期' },
    { name: 'SUBDATE', detail: '日期 - 减日期' },
    // 条件/流程控制函数
    { name: 'IF', detail: '条件 - 如果' },
    { name: 'IFNULL', detail: '条件 - NULL替换' },
    { name: 'NULLIF', detail: '条件 - 相等返回NULL' },
    { name: 'COALESCE', detail: '条件 - 返回第一个非NULL' },
    { name: 'CASE', detail: '条件 - 分支表达式' },
    // 类型转换
    { name: 'CAST', detail: '转换 - 类型转换' },
    { name: 'CONVERT', detail: '转换 - 类型/字符集转换' },
    // JSON 函数
    { name: 'JSON_EXTRACT', detail: 'JSON - 提取值' },
    { name: 'JSON_UNQUOTE', detail: 'JSON - 去引号' },
    { name: 'JSON_SET', detail: 'JSON - 设置值' },
    { name: 'JSON_INSERT', detail: 'JSON - 插入值' },
    { name: 'JSON_REPLACE', detail: 'JSON - 替换值' },
    { name: 'JSON_REMOVE', detail: 'JSON - 删除值' },
    { name: 'JSON_CONTAINS', detail: 'JSON - 包含判断' },
    { name: 'JSON_OBJECT', detail: 'JSON - 构建对象' },
    { name: 'JSON_ARRAY', detail: 'JSON - 构建数组' },
    { name: 'JSON_LENGTH', detail: 'JSON - 元素个数' },
    { name: 'JSON_TYPE', detail: 'JSON - 值类型' },
    { name: 'JSON_VALID', detail: 'JSON - 验证' },
    { name: 'JSON_KEYS', detail: 'JSON - 获取键列表' },
    // 加密/哈希函数
    { name: 'MD5', detail: '加密 - MD5哈希' },
    { name: 'SHA1', detail: '加密 - SHA1哈希' },
    { name: 'SHA2', detail: '加密 - SHA2哈希' },
    { name: 'UUID', detail: '工具 - 生成UUID' },
    // 信息函数
    { name: 'DATABASE', detail: '信息 - 当前数据库' },
    { name: 'USER', detail: '信息 - 当前用户' },
    { name: 'VERSION', detail: '信息 - MySQL版本' },
    { name: 'CONNECTION_ID', detail: '信息 - 连接ID' },
    { name: 'LAST_INSERT_ID', detail: '信息 - 最后插入ID' },
    { name: 'ROW_COUNT', detail: '信息 - 影响行数' },
    { name: 'FOUND_ROWS', detail: '信息 - 匹配总行数' },
    { name: 'CHARSET', detail: '信息 - 字符集' },
    { name: 'COLLATION', detail: '信息 - 排序规则' },
    // 窗口函数
    { name: 'ROW_NUMBER', detail: '窗口 - 行号' },
    { name: 'RANK', detail: '窗口 - 排名(有间隔)' },
    { name: 'DENSE_RANK', detail: '窗口 - 排名(无间隔)' },
    { name: 'NTILE', detail: '窗口 - 分桶' },
    { name: 'LAG', detail: '窗口 - 前一行' },
    { name: 'LEAD', detail: '窗口 - 后一行' },
    { name: 'FIRST_VALUE', detail: '窗口 - 第一个值' },
    { name: 'LAST_VALUE', detail: '窗口 - 最后一个值' },
    { name: 'NTH_VALUE', detail: '窗口 - 第N个值' },
    // 其他
    { name: 'DISTINCT', detail: '修饰 - 去重' },
    { name: 'EXISTS', detail: '修饰 - 存在判断' },
    { name: 'BETWEEN', detail: '修饰 - 范围判断' },
    { name: 'LIKE', detail: '修饰 - 模式匹配' },
    { name: 'REGEXP', detail: '修饰 - 正则匹配' },
    { name: 'BENCHMARK', detail: '工具 - 性能测试' },
    { name: 'SLEEP', detail: '工具 - 延时' },
];

// HMR 重载时释放旧注册避免补全和 hover 内容重复
const _g = globalThis as any;
const SQL_COMPLETION_PROVIDER_VERSION = '20260603-hover-singleton-v1';
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

    if (['mysql', 'mariadb', 'oceanbase', 'diros', 'starrocks', 'sphinx', 'tidb'].includes(normalizedDbType)) {
        return MYSQL_SYSTEM_METADATA_SCHEMAS.has(metadataDbName);
    }
    if (['postgres', 'kingbase', 'highgo', 'vastbase', 'opengauss'].includes(normalizedDbType)) {
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
    const tableMatch = fromTrimmed.match(/^((?:[`"\[]?\w+[`"\]]?)(?:\s*\.\s*(?:[`"\[]?\w+[`"\]]?)){0,2})([\s\S]*)$/);
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
    return text ? `备注：${text}` : undefined;
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

const isSqlIdentifierStart = (ch: string): boolean => /^[A-Za-z_]$/.test(ch);

const isSqlIdentifierPart = (ch: string): boolean => /^[A-Za-z0-9_$#]$/.test(ch);

const skipSqlWhitespaceAndComments = (text: string, position: number): number => {
    let index = position;
    while (index < text.length) {
        const ch = text[index];
        const next = index + 1 < text.length ? text[index + 1] : '';
        if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f') {
            index += 1;
            continue;
        }
        if (ch === '-' && next === '-') {
            index += 2;
            while (index < text.length && text[index] !== '\n') index += 1;
            continue;
        }
        if (ch === '/' && next === '*') {
            index += 2;
            while (index + 1 < text.length && !(text[index] === '*' && text[index + 1] === '/')) {
                index += 1;
            }
            if (index + 1 < text.length) index += 2;
            continue;
        }
        break;
    }
    return index;
};

const nextSqlSignificantToken = (text: string, position: number): string => {
    const index = skipSqlWhitespaceAndComments(text, position);
    if (index >= text.length || !isSqlIdentifierStart(text[index])) return '';
    let end = index + 1;
    while (end < text.length && isSqlIdentifierPart(text[end])) end += 1;
    return text.slice(index, end).toLowerCase();
};

const nextSqlSignificantChar = (text: string, position: number): string => {
    const index = skipSqlWhitespaceAndComments(text, position);
    return index >= text.length ? '' : text[index];
};

const shouldEnterPlsqlBeginBlock = (text: string, tokenEnd: number): boolean => {
    const nextChar = nextSqlSignificantChar(text, tokenEnd);
    if (!nextChar || nextChar === ';') return false;
    return !['transaction', 'work', 'isolation', 'read', 'write'].includes(nextSqlSignificantToken(text, tokenEnd));
};

const shouldEnterPlsqlDeclareBlock = (text: string, tokenEnd: number): boolean => {
    const nextToken = nextSqlSignificantToken(text, tokenEnd);
    return Boolean(nextToken);
};

const isPlsqlControlEnd = (text: string, tokenEnd: number): boolean => (
    ['if', 'loop', 'case'].includes(nextSqlSignificantToken(text, tokenEnd))
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
            const dbIdent = String(dbName || '').replace(/`/g, '``').trim();
            return normalizeMetadataQuerySpecs([
                {
                    sql: safeDbName
                        ? `SELECT TABLE_NAME AS view_name, TABLE_SCHEMA AS schema_name FROM information_schema.views WHERE table_schema = '${safeDbName}' ORDER BY TABLE_NAME`
                        : '',
                },
                { sql: dbIdent ? `SHOW FULL TABLES FROM \`${dbIdent}\`` : '' },
                { sql: 'SHOW FULL TABLES' },
            ]);
        }
        case 'postgres':
        case 'kingbase':
        case 'highgo':
        case 'vastbase':
        case 'opengauss':
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
const QUERY_EDITOR_HOVER_DELAY_MS = 1000;
const QUERY_EDITOR_OBJECT_DECORATION_MAX_TEXT_LENGTH = 200_000;
const QUERY_EDITOR_OBJECT_DECORATION_MAX_IDENTIFIERS = 800;
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

const findIdentifierWindowAtOffset = (
    lineContent: string,
    rawOffset: number,
): { start: number; end: number } | null => {
    const text = String(lineContent || '');
    if (!text) return null;
    const maxIndex = text.length - 1;
    if (maxIndex < 0) return null;
    let offset = Math.max(0, Math.min(maxIndex, Number.isFinite(rawOffset) ? rawOffset : 0));

    if (!QUERY_EDITOR_IDENTIFIER_CHAR_REGEX.test(text[offset] || '')) {
        if (offset > 0 && QUERY_EDITOR_IDENTIFIER_CHAR_REGEX.test(text[offset - 1] || '')) {
            offset -= 1;
        } else if (offset < maxIndex && QUERY_EDITOR_IDENTIFIER_CHAR_REGEX.test(text[offset + 1] || '')) {
            offset += 1;
        } else {
            return null;
        }
    }

    let start = offset;
    while (start > 0 && QUERY_EDITOR_IDENTIFIER_CHAR_REGEX.test(text[start - 1] || '')) {
        start -= 1;
    }

    let end = offset + 1;
    while (end < text.length && QUERY_EDITOR_IDENTIFIER_CHAR_REGEX.test(text[end] || '')) {
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
    switch (target.kind) {
        case 'database':
            return `**数据库**\n\n\`${target.dbName}\``;
        case 'table':
            return `**表** \`${target.tableName}\`\n\n库：\`${target.dbName}\`${target.schemaName ? `\n\nSchema：\`${target.schemaName}\`` : ''}${appendComment(target.comment)}`;
        case 'view':
            return `**视图** \`${target.viewName}\`\n\n库：\`${target.dbName}\`${target.schemaName ? `\n\nSchema：\`${target.schemaName}\`` : ''}`;
        case 'materialized-view':
            return `**物化视图** \`${target.viewName}\`\n\n库：\`${target.dbName}\`${target.schemaName ? `\n\nSchema：\`${target.schemaName}\`` : ''}`;
        case 'trigger':
            return `**触发器** \`${target.triggerName}\`\n\n库：\`${target.dbName}\`\n\n表：\`${target.tableName}\`${target.schemaName ? `\n\nSchema：\`${target.schemaName}\`` : ''}`;
        case 'routine':
            return `**${target.routineType === 'PROCEDURE' ? '存储过程' : '函数'}** \`${target.routineName}\`\n\n库：\`${target.dbName}\`${target.schemaName ? `\n\nSchema：\`${target.schemaName}\`` : ''}`;
        case 'column':
            return `**字段** \`${target.columnName}\`${target.type ? `\n\n类型：\`${target.type}\`` : ''}\n\n表：\`${target.tableName}\`\n\n库：\`${target.dbName}\`${target.schemaName ? `\n\nSchema：\`${target.schemaName}\`` : ''}${appendComment(target.comment)}`;
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
    const aliasRegex = /\b(?:FROM|JOIN|UPDATE|INTO|DELETE\s+FROM)\s+([`"]?\w+[`"]?(?:\s*\.\s*[`"]?\w+[`"]?)?)(?:\s+(?:AS\s+)?([`"]?\w+[`"]?))?/gi;
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
                return itemSchemaName === normalizedSchemaName && (itemObjectName === normalizedRawTableName || String(itemRawName).trim().toLowerCase() === `${normalizedSchemaName}.${normalizedRawTableName}`);
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
            return `${shortcutModifierLabel} + 点击切换到该数据库`;
        }
        if (navigationTarget.type === 'table') {
            return `${shortcutModifierLabel} + 点击打开该表`;
        }
        if (navigationTarget.type === 'view') {
            return `${shortcutModifierLabel} + 点击打开该视图`;
        }
        if (navigationTarget.type === 'materialized-view') {
            return `${shortcutModifierLabel} + 点击打开该物化视图`;
        }
        if (navigationTarget.type === 'trigger') {
            return `${shortcutModifierLabel} + 点击打开该触发器`;
        }
        return navigationTarget.routineType === 'PROCEDURE'
            ? `${shortcutModifierLabel} + 点击打开该存储过程`
            : `${shortcutModifierLabel} + 点击打开该函数`;
    })();

    return [{
        startColumn: windowRange.start + 1,
        endColumn: windowRange.end + 1,
        hoverMessage,
    }];
};

const buildQueryEditorNavigationHoverMarkdown = (
    hoverTarget: QueryEditorHoverTarget | null,
    actionHint: string,
): string => {
    const hoverContent = hoverTarget ? buildQueryEditorHoverMarkdown(hoverTarget) : '';
    return hoverContent
        ? `${hoverContent}\n\n---\n\n${actionHint}`
        : actionHint;
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
    dbType,
    currentDb,
    config,
    forceReadOnly,
}: {
    statement: string;
    dbType: string;
    currentDb: string;
    config: any;
    forceReadOnly: boolean;
}): Promise<QueryStatementPlan> => {
    const plan: QueryStatementPlan = {
        originalSql: statement,
        executedSql: statement,
        pkColumns: [],
    };
    if (forceReadOnly) return plan;

    const tableRef = extractQueryResultTableRef(statement, dbType, currentDb);
    if (!tableRef) return plan;
    plan.tableRef = tableRef;
    if (isSystemMetadataQueryResult(tableRef, dbType)) {
        plan.editLocator = buildQueryReadOnlyLocator('系统元数据查询结果保持只读。');
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

    try {
        const [resCols, resIndexes] = await Promise.all([
            DBGetColumns(buildRpcConnectionConfig(config) as any, tableRef.metadataDbName, tableRef.metadataTableName),
            DBGetIndexes(buildRpcConnectionConfig(config) as any, tableRef.metadataDbName, tableRef.metadataTableName)
                .catch((error: any) => ({ success: false, message: String(error?.message || error || '加载索引失败'), data: [] })),
        ]);
        if (!resCols?.success || !Array.isArray(resCols.data)) {
            const reason = `无法加载 ${tableRef.metadataDbName}.${tableRef.metadataTableName} 的主键/唯一索引元数据，无法安全提交修改。`;
            plan.editLocator = buildQueryReadOnlyLocator(reason);
            plan.warning = `查询结果保持只读：${reason}`;
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
            } else {
                const reason = !resIndexes?.success
                    ? '无法加载唯一索引元数据，无法安全提交修改。'
                    : '未检测到主键或可用唯一索引，无法安全提交修改。';
                plan.editLocator = buildQueryReadOnlyLocator(reason);
                plan.warning = `查询结果保持只读：${tableRef.metadataDbName}.${tableRef.metadataTableName} ${reason}`;
            }
        }

        const executableAppendExpressions = [
            ...(needsOracleRowIDExpression ? [buildQueryRowIDExpression(dbType)] : []),
            ...appendExpressions,
        ];

        if (executableAppendExpressions.length > 0 && isOracleLikeDialect(dbType) && selectInfo.selectsBareAll) {
            const rewritten = rewriteOracleSelectAllWithExpressions(statement, executableAppendExpressions);
            if (rewritten) {
                plan.executedSql = rewritten;
                return plan;
            }

            const reason = 'Oracle 查询使用 * 时无法自动注入 ROWID 定位列，已保持只读。';
            plan.editLocator = buildQueryReadOnlyLocator(reason);
            plan.warning = `查询结果保持只读：${reason}`;
            return plan;
        }

        plan.executedSql = appendQuerySelectExpressions(statement, executableAppendExpressions);
        return plan;
    } catch {
        const reason = `无法加载 ${tableRef.metadataDbName}.${tableRef.metadataTableName} 的主键/唯一索引元数据，无法安全提交修改。`;
        plan.editLocator = buildQueryReadOnlyLocator(reason);
        plan.warning = `查询结果保持只读：${reason}`;
        return plan;
    }
};

const QueryEditor: React.FC<{ tab: TabData; isActive?: boolean }> = ({ tab, isActive = true }) => {
  const [query, setQuery] = useState(getInitialEditorQuery(tab));
  const isExternalSQLFileTab = Boolean(String(tab.filePath || '').trim());
  
  type ResultSet = {
      key: string;
      sql: string;
      exportSql?: string;
      rows: any[];
      columns: string[];
      tableName?: string;
      pkColumns: string[];
      editLocator?: EditRowLocator;
      readOnly: boolean;
      truncated?: boolean;
      pkLoading?: boolean;
  };

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

  const connections = useStore(state => state.connections);
  const queryCapableConnections = useMemo(
      () => connections.filter(c => getDataSourceCapabilities(c.config).supportsQueryEditor),
      [connections]
  );
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
  const appearance = useStore(state => state.appearance);
  const darkMode = theme === 'dark';
  const isV2Ui = appearance.uiVersion === 'v2';
  const sqlFormatOptions = useStore(state => state.sqlFormatOptions);
  const setSqlFormatOptions = useStore(state => state.setSqlFormatOptions);
  const queryOptions = useStore(state => state.queryOptions);
  const setQueryOptions = useStore(state => state.setQueryOptions);
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
  const primaryShortcutModifierLabel = useMemo(
      () => getShortcutPrimaryModifierDisplayLabel(activeShortcutPlatform),
      [activeShortcutPlatform],
  );
  const autoFetchVisible = useAutoFetchVisibility();

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

      const text = getQueryEditorModelTextIfWithinLimit(model, maxTextLength);
      if (text === null) {
          objectDecorationIdsRef.current = editor.deltaDecorations(objectDecorationIdsRef.current, []);
          return;
      }

      const decorations: any[] = [];
      const seen = new Set<string>();
      let scannedIdentifiers = 0;
      const identifierRegex = /[`"\[]?[A-Za-z_][A-Za-z0-9_$]*(?:[`"\]]?\s*\.\s*[`"\[]?[A-Za-z_][A-Za-z0-9_$]*){0,2}[`"\]]?/g;
      const lines = text.replace(/\r\n/g, '\n').split('\n');

      for (const [lineIndex, lineContent] of lines.entries()) {
          let match: RegExpExecArray | null;
          identifierRegex.lastIndex = 0;
          while ((match = identifierRegex.exec(lineContent)) !== null) {
              scannedIdentifiers += 1;
              if (scannedIdentifiers > QUERY_EDITOR_OBJECT_DECORATION_MAX_IDENTIFIERS) {
                  break;
              }
              const positionColumn = match.index + 2;
              const hoverTarget = resolveQueryEditorHoverTarget(
                  text,
                  lineContent,
                  positionColumn,
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
              const key = `${lineIndex + 1}:${hoverTarget.range.startColumn}:${hoverTarget.range.endColumn}:${inlineClassName}`;
              if (seen.has(key)) continue;
              seen.add(key);
              decorations.push({
                  range: new monaco.Range(
                      lineIndex + 1,
                      hoverTarget.range.startColumn,
                      lineIndex + 1,
                      hoverTarget.range.endColumn,
                  ),
                  options: { inlineClassName },
              });
          }
          if (scannedIdentifiers > QUERY_EDITOR_OBJECT_DECORATION_MAX_IDENTIFIERS) {
              break;
          }
      }

      objectDecorationIdsRef.current = editor.deltaDecorations(objectDecorationIdsRef.current, decorations);
  }, []);

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

  const handleSidebarObjectDrop = useCallback((event: DragEvent) => {
      if (!hasSidebarSqlEditorDragPayload(event.dataTransfer)) {
          return;
      }
      event.preventDefault();
      event.stopPropagation();
      const dragText = readSidebarSqlDropText(event, currentConnectionIdRef.current, currentDbRef.current);
      if (!dragText) {
          return;
      }
      const editor = editorRef.current;
      const dropTarget = editor?.getTargetAtClientPoint?.(event.clientX, event.clientY);
      if (insertTextIntoEditorAtPosition(dragText, normalizeEditorPosition(dropTarget?.position))) {
          refreshObjectDecorations(QUERY_EDITOR_LIVE_DECORATION_MAX_TEXT_LENGTH);
      }
  }, [insertTextIntoEditorAtPosition, refreshObjectDecorations]);

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
          void message.info('没有可选择的 SQL 语句。');
          return;
      }

      const start = model.getPositionAt(range.start);
      const end = model.getPositionAt(range.end);
      const selection = new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column);
      editor.setSelection(selection);
      editor.revealRangeInCenterIfOutsideViewport?.(selection);
      editor.focus?.();
  };

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
      if (!autoFetchVisible) {
          return;
      }

      const fetchMetadata = async () => {
          const conn = connections.find(c => c.id === currentConnectionId);
          if (!conn) return;

          const visibleDbs = visibleDbsRef.current;
          if (!visibleDbs || visibleDbs.length === 0) return;

          const config = {
            ...conn.config,
            port: Number(conn.config.port),
            password: conn.config.password || "",
            database: conn.config.database || "",
            useSSH: conn.config.useSSH || false,
            ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
          };

          // 加载所有可见数据库的表
          const allTables: CompletionTableMeta[] = [];
          const allColumns: CompletionColumnMeta[] = [];
          const allViews: CompletionViewMeta[] = [];
          const allMaterializedViews: CompletionViewMeta[] = [];
          const allTriggers: CompletionTriggerMeta[] = [];
          const allRoutines: CompletionRoutineMeta[] = [];
          const metadataDialect = normalizeMetadataDialect(conn);

          for (const dbName of visibleDbs) {
              const tableComments = new Map<string, string>();
              const tableCommentSQL = buildCompletionTableCommentSQL(metadataDialect, dbName);
              if (tableCommentSQL) {
                  try {
                      const resTableComments = await DBQuery(buildRpcConnectionConfig(config) as any, dbName, tableCommentSQL);
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

              // 获取列 (所有数据库类型都支持 DBGetAllColumns)
              const resCols = await DBGetAllColumns(buildRpcConnectionConfig(config) as any, dbName);
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

              const viewResults = await queryCompletionMetadataRowsBySpecs(
                  config,
                  dbName,
                  buildCompletionViewsMetadataQuerySpecs(metadataDialect, dbName),
              );
              const seenViews = new Set<string>();
              viewResults.forEach((queryResult) => {
                  queryResult.rows.forEach((row) => {
                      const tableType = String(getCaseInsensitiveValue(row, ['table_type', 'table type', 'type']) || '').trim().toUpperCase();
                      if (tableType && tableType !== 'VIEW') return;
                      const schemaName = String(getCaseInsensitiveValue(row, ['schema_name', 'schemaname', 'owner', 'table_schema', 'db']) || '').trim();
                      const rawViewName = String(getCaseInsensitiveValue(row, ['view_name', 'viewname', 'table_name', 'name']) || '').trim() || getFirstRowValue(row);
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

              const materializedViewResults = await queryCompletionMetadataRowsBySpecs(
                  config,
                  dbName,
                  buildCompletionMaterializedViewsMetadataQuerySpecs(metadataDialect, dbName),
              );
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

              const triggerResults = await queryCompletionMetadataRowsBySpecs(
                  config,
                  dbName,
                  buildCompletionTriggersMetadataQuerySpecs(metadataDialect, dbName),
              );
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

              const routineResults = await queryCompletionMetadataRowsBySpecs(
                  config,
                  dbName,
                  buildCompletionFunctionsMetadataQuerySpecs(metadataDialect, dbName),
              );
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
          }

          tablesRef.current = allTables;
          allColumnsRef.current = allColumns;
          viewsRef.current = allViews;
          materializedViewsRef.current = allMaterializedViews;
          triggersRef.current = allTriggers;
          routinesRef.current = allRoutines;
          // 如果当前 Tab 是活跃 Tab，同步更新共享变量
          if (isActive) {
              sharedTablesData = allTables;
              sharedAllColumnsData = allColumns;
              sharedViewsData = allViews;
              sharedMaterializedViewsData = allMaterializedViews;
              sharedTriggersData = allTriggers;
              sharedRoutinesData = allRoutines;
          }
          refreshObjectDecorations();
      };
      void fetchMetadata();
  }, [autoFetchVisible, currentConnectionId, connections, dbList, isActive, refreshObjectDecorations]); // dbList 变化时触发重新加载

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
          const hoverTarget = resolveQueryEditorHoverTarget(
              getQueryEditorObjectResolveText(model, lineContent),
              lineContent,
              targetPosition.column,
              currentDbRef.current,
              visibleDbsRef.current,
              tablesRef.current,
              allColumnsRef.current,
              viewsRef.current,
              materializedViewsRef.current,
              triggersRef.current,
              routinesRef.current,
          );

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
                      hoverMessage: {
                          value: buildQueryEditorNavigationHoverMarkdown(hoverTarget, item.hoverMessage),
                      },
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
          label: 'GoNavi: 查看对象信息',
          keybindings: showObjectInfoKeybinding,
          run: () => {
              const preferredPosition = lastHoverTargetPositionRef.current || editor.getPosition?.();
              const shown = showObjectInfoAtPosition(preferredPosition);
              if (!shown) {
                  void message.info({
                      key: 'gonavi-query-editor-object-info-miss',
                      content: '当前光标未定位到可识别的表或字段。',
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
          syncModifierState(browserEvent || null);
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
              const targetSchemaName = String(navigationTarget.schemaName || '').trim();
              const sidebarLocateKey = navigationTarget.type === 'materialized-view'
                  ? `${connectionId}-${targetDbName}-materialized-view-${targetViewName}`
                  : `${connectionId}-${targetDbName}-view-${targetViewName}`;
              addTab({
                  id: `view-def-${connectionId}-${targetDbName}-${targetViewName}`,
                  title: `${navigationTarget.type === 'materialized-view' ? '物化视图' : '视图'}: ${targetViewName}`,
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
                  title: `触发器: ${targetTriggerName}`,
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
          const targetSchemaName = String(navigationTarget.schemaName || '').trim();
          const sidebarLocateKey = `${connectionId}-${targetDbName}-routine-${targetRoutineName}`;
          addTab({
              id: `routine-def-${connectionId}-${targetDbName}-${targetRoutineName}`,
              title: `${navigationTarget.routineType === 'PROCEDURE' ? '存储过程' : '函数'}: ${targetRoutineName}`,
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
          window.removeEventListener('keydown', syncModifierState);
          window.removeEventListener('keyup', syncModifierState);
          window.removeEventListener('blur', handleWindowBlur);
          editorDomNode?.removeEventListener('dragover', handleEditorDragOver, true);
          editorDomNode?.removeEventListener('drop', handleEditorDrop, true);
      });

      refreshObjectDecorations();

      // 注册 AI 右键菜单操作
      const aiActions = [
          { id: 'ai.generateSQL', label: '🤖 AI 生成 SQL', prompt: '请根据当前数据库表结构生成查询语句：' },
          { id: 'ai.explainSQL', label: '🤖 AI 解释 SQL', useSelection: true, prompt: '请解释以下 SQL 语句的执行逻辑：\n```sql\n{SQL}\n```' },
          { id: 'ai.optimizeSQL', label: '🤖 AI 优化 SQL', useSelection: true, prompt: '请分析以下 SQL 语句的性能并给出优化建议：\n```sql\n{SQL}\n```' },
      ];

      aiActions.forEach(action => {
          editor.addAction({
              id: action.id,
              label: action.label,
              contextMenuGroupId: '9_ai',
              contextMenuOrder: 1,
              run: (ed: any) => {
                  const selection = ed.getModel()?.getValueInRange(ed.getSelection());
                  const conn = connectionsRef.current.find(c => c.id === currentConnectionIdRef.current);
                  const ctxText = conn ? `【上下文环境：${conn.config?.type || '数据库'} "${conn.name}", 当前库选定为 "${currentDbRef.current || '默认'}"】\n` : '';
                  let prompt = ctxText + action.prompt;
                  if (action.useSelection && selection) {
                      prompt = prompt.replace('{SQL}', selection);
                  }
                  // 打开 AI 面板并填入 prompt
                  const store = useStore.getState();
                  if (!store.aiPanelVisible) {
                      store.setAIPanelVisible(true);
                  }
                  // 通过自定义事件将 prompt 发送到 AI 面板
                  window.dispatchEvent(new CustomEvent('gonavi:ai:inject-prompt', { detail: { prompt } }));
              },
          });
      });

      // Register runQuery shortcut inside Monaco so it overrides Monaco's default keybinding
      const runBinding = runQueryShortcutBinding;
      if (runBinding?.enabled && runBinding.combo) {
          const keyBinding = comboToMonacoKeyBinding(
              runBinding.combo, monaco.KeyMod, monaco.KeyCode
          );
          if (keyBinding) {
              runQueryActionRef.current = editor.addAction({
                  id: 'gonavi.runQuery',
                  label: 'GoNavi: 执行 SQL',
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
                  label: 'GoNavi: 选择当前语句',
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
                  label: 'GoNavi: 保存查询',
                  keybindings: [keyBinding.keyMod | keyBinding.keyCode],
                  run: () => {
                      window.dispatchEvent(new CustomEvent('gonavi:save-active-query'));
                  },
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
          triggerCharacters: ['.', '_', ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')],
          provideCompletionItems: async (model: any, position: any) => {
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
              const dialectKeywords = resolveSqlKeywords(activeDialect);
              const dialectFunctions = resolveSqlFunctions(activeDialect);

              const stripQuotes = stripCompletionIdentifierQuotes;
              const normalizeQualifiedName = normalizeCompletionQualifiedName;
              const getLastPart = getCompletionQualifiedNameLastPart;
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

              const getColumnsByDB = async (tableIdent: string) => {
                  const connId = sharedCurrentConnectionId;
                  const dbName = sharedCurrentDb;
                  if (!connId || !dbName) return [] as ColumnDefinition[];
                  const key = `${connId}|${dbName}|${tableIdent}`;
                  const cached = sharedColumnsCacheData[key];
                  if (cached) return cached;

                  const config = buildConnConfig();
                  if (!config) return [] as ColumnDefinition[];

                  const res = await DBGetColumns(buildRpcConnectionConfig(config) as any, dbName, tableIdent);
                  if (res?.success && Array.isArray(res.data)) {
                      const cols = res.data as ColumnDefinition[];
                      sharedColumnsCacheData[key] = cols;
                      return cols;
                  }
                  return [] as ColumnDefinition[];
              };

              const fullText = model.getValue();

              // 获取当前行光标前的内容
              const linePrefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);

              // 0) 三段式 db.table.column 格式：当输入 db.table. 时提示列
              const threePartMatch = linePrefix.match(/([`"]?\w+[`"]?)\.([`"]?\w+[`"]?)\.(\w*)$/);
              if (threePartMatch) {
                  const dbPart = stripQuotes(threePartMatch[1]);
                  const tablePart = stripQuotes(threePartMatch[2]);
                  const colPrefix = (threePartMatch[3] || '').toLowerCase();

                  // 在 allColumnsRef 中查找匹配的列
                  const cols = sharedAllColumnsData.filter(c =>
                      (c.dbName || '').toLowerCase() === dbPart.toLowerCase() &&
                      (c.tableName || '').toLowerCase() === tablePart.toLowerCase()
                  );

                  const filtered = colPrefix
                      ? cols.filter(c => (c.name || '').toLowerCase().startsWith(colPrefix))
                      : cols;

                  const suggestions = filtered.map(c => ({
                      label: c.name,
                      kind: monaco.languages.CompletionItemKind.Field,
                      insertText: c.name,
                      detail: appendCommentToDetail(`${c.type} (${c.dbName}.${c.tableName})`, c.comment),
                      documentation: buildCompletionDocumentation(c.comment),
                      range,
                      sortText: '0' + c.name
                  }));
                  return { suggestions };
              }

              // 1) 两段式 qualifier.xxx 格式
              const qualifierMatch = linePrefix.match(/([`"]?[A-Za-z_]\w*[`"]?)\.(\w*)$/);
              if (qualifierMatch) {
                  const qualifier = stripQuotes(qualifierMatch[1]);
                  const prefix = (qualifierMatch[2] || '').toLowerCase();
                  const qualifierLower = qualifier.toLowerCase();

                  // 首先检查 qualifier 是否是数据库名（跨库表提示）
                  const visibleDbs = sharedVisibleDbs;
                  if (visibleDbs.some(db => db.toLowerCase() === qualifierLower)) {
                      // qualifier 是数据库名，提示该库的表
                      const tables = sharedTablesData.filter(t =>
                          (t.dbName || '').toLowerCase() === qualifierLower
                      );
                      const filtered = prefix
                          ? tables.filter(t => (t.tableName || '').toLowerCase().startsWith(prefix))
                          : tables;

                      const suggestions = filtered.map(t => ({
                          label: t.tableName,
                          kind: monaco.languages.CompletionItemKind.Class,
                          insertText: t.tableName,
                          detail: appendCommentToDetail(`Table (${t.dbName})`, t.comment),
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
                          insertText: t.table,
                          detail: appendCommentToDetail(`Table (${t.dbName}${t.schema ? '.' + t.schema : ''})`, t.comment),
                          documentation: buildCompletionDocumentation(t.comment),
                          range,
                          sortText: '0' + t.table
                      }));
                      return { suggestions };
                  }

                  // 否则检查是否是表别名或表名，提示列
                  const reserved = new Set([
                      'where', 'on', 'group', 'order', 'limit', 'having',
                      'left', 'right', 'inner', 'outer', 'full', 'cross', 'join',
                      'union', 'except', 'intersect', 'as', 'set', 'values', 'returning',
                  ]);

                  const aliasMap: Record<string, {dbName: string, tableName: string}> = {};
                  // Capture table and optional alias, support db.table format
                  const aliasRegex = /\b(?:FROM|JOIN|UPDATE|INTO|DELETE\s+FROM)\s+([`"]?\w+[`"]?(?:\s*\.\s*[`"]?\w+[`"]?)?)(?:\s+(?:AS\s+)?([`"]?\w+[`"]?))?/gi;
                  let m;
                  while ((m = aliasRegex.exec(fullText)) !== null) {
                      const tableIdent = normalizeQualifiedName(m[1] || '');
                      if (!tableIdent) continue;

                      // 解析 db.table 或 table 格式
                      const parts = tableIdent.split('.');
                      let dbName = sharedCurrentDb || '';
                      let tableName = tableIdent;
                      if (parts.length === 2) {
                          dbName = parts[0];
                          tableName = parts[1];
                      }

                      const shortTable = getLastPart(tableIdent);
                      // 用表名作为 qualifier
                      if (shortTable) aliasMap[shortTable.toLowerCase()] = { dbName, tableName };

                      const a = stripQuotes(m[2] || '').trim();
                      if (!a) continue;
                      const al = a.toLowerCase();
                      if (reserved.has(al)) continue;
                      aliasMap[al] = { dbName, tableName };
                  }

                  const tableInfo = aliasMap[qualifier.toLowerCase()];
                  if (tableInfo) {
                      // Prefer preloaded MySQL all-columns cache
                      let cols: { name: string, type?: string, tableName?: string, dbName?: string, comment?: string }[];
                      if (sharedAllColumnsData.length > 0) {
                          const tiTableLower = (tableInfo.tableName || '').toLowerCase();
                          cols = sharedAllColumnsData
                              .filter(c => {
                                  if ((c.dbName || '').toLowerCase() !== (tableInfo.dbName || '').toLowerCase()) return false;
                                  const cTableLower = (c.tableName || '').toLowerCase();
                                  if (cTableLower === tiTableLower) return true;
                                  // schema.table 格式匹配纯表名
                                  const parsed = splitSchemaAndTable(c.tableName || '');
                                  return (parsed.table || '').toLowerCase() === tiTableLower;
                              })
                              .map(c => ({ name: c.name, type: c.type, tableName: c.tableName, dbName: c.dbName, comment: c.comment }));
                      } else {
                          const dbCols = await getColumnsByDB(tableInfo.tableName);
                          cols = dbCols.map(c => ({ name: c.name, type: c.type, tableName: tableInfo.tableName, comment: c.comment }));
                      }

                      const filtered = prefix
                          ? cols.filter(c => (c.name || '').toLowerCase().startsWith(prefix))
                          : cols;

                      const suggestions = filtered.map(c => ({
                          label: c.name,
                          kind: monaco.languages.CompletionItemKind.Field,
                          insertText: c.name,
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
              const tableRegex = /\b(?:FROM|JOIN|UPDATE|INTO|DELETE\s+FROM)\s+([`"]?\w+[`"]?(?:\s*\.\s*[`"]?\w+[`"]?)?)/gi;
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

              // 相关列提示：匹配 SQL 中引用的表（FROM/JOIN 等）
              // 权重最高，输入 WHERE 条件时优先显示
              const relevantColumns = (expectsTableName ? [] : sharedAllColumnsData)
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
                          insertText: c.name,
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
                          insertText: label,
                          detail: appendCommentToDetail(`Table (${t.dbName})`, t.comment),
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
                  const insertText = hasDuplicate ? t.tableName : pureTable;
                  const schemaInfo = parsed.schema ? ` (${parsed.schema})` : '';
                  return {
                      label,
                      kind: monaco.languages.CompletionItemKind.Class,
                      insertText,
                      detail: appendCommentToDetail(`Table${schemaInfo}`, t.comment),
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
                      detail: 'Database',
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
      // 注册 / 斜杠命令 AI 快捷补全
      const slashCmdDefs = [
          { cmd: '/query',    label: '🔍 自然语言查询',  desc: '用中文描述你想查什么',   prompt: '帮我写一条 SQL 查询：' },
          { cmd: '/sql',      label: '📝 生成 SQL',      desc: '描述需求自动生成语句',   prompt: '请根据以下需求生成 SQL：' },
          { cmd: '/explain',  label: '💡 解释 SQL',      desc: '解释选中 SQL 的逻辑',    prompt: '请解释以下 SQL 的执行逻辑和每一步的作用：\n```sql\n{SQL}\n```', useSelection: true },
          { cmd: '/optimize', label: '⚡ 优化分析',      desc: '分析 SQL 性能瓶颈',      prompt: '请分析以下 SQL 的性能问题，并给出优化后的版本：\n```sql\n{SQL}\n```', useSelection: true },
          { cmd: '/schema',   label: '🏗️ 表设计评审',    desc: '评审表结构设计质量',     prompt: '请全面评审当前关联表的设计，包括字段类型、范式、索引策略等方面的改进建议：' },
          { cmd: '/index',    label: '📊 索引建议',      desc: '推荐最优索引方案',       prompt: '请基于当前表结构和常见查询场景，推荐最优的索引方案并给出建表语句：' },
          { cmd: '/diff',     label: '🔄 表对比',        desc: '对比两表差异生成变更',   prompt: '请对比以下两张表的结构差异，并生成从旧版本迁移到新版本的 ALTER 语句：' },
          { cmd: '/mock',     label: '🎲 造测试数据',    desc: '生成 INSERT 测试数据',   prompt: '请为当前关联的表生成 10 条符合业务语义的测试数据 INSERT 语句：' },
      ];
      // 全局变量存储命令定义，供 onDidChangeModelContent 使用
      (window as any).__gonaviSlashCmdDefs = slashCmdDefs;

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
                  suggestions: slashCmdDefs.map((c, i) => ({
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
      monaco.languages.registerCompletionItemProvider('sql', {
          provideCompletionItems: (model: any, position: any) => {
              const word = model.getWordUntilPosition(position);
              const prefix = word.word.toLowerCase();
              if (!prefix) return { suggestions: [] };

              const range = {
                  startLineNumber: position.lineNumber,
                  endLineNumber: position.lineNumber,
                  startColumn: word.startColumn,
                  endColumn: word.endColumn,
              };

              const allSnippets = useStore.getState().sqlSnippets;
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
                      documentation: s.description || s.body,
                      range,
                      sortText: '04' + s.prefix,
                  })),
              };
          },
      });

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
          const ctxText = conn ? `【上下文环境：${conn.config?.type || '数据库'} "${conn.name}", 当前库选定为 "${currentDbRef.current || '默认'}"】\n` : '';
          let finalPrompt = ctxText + cmdDef.prompt;
          if (cmdDef.useSelection) {
              const sel = editor.getSelection();
              const selText = sel ? model.getValueInRange(sel) : '';
              finalPrompt = finalPrompt.replace('{SQL}', selText || getCurrentQuery());
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
          const formatted = format(getCurrentQuery(), { language: 'mysql', keywordCase: sqlFormatOptions.keywordCase });
          const editor = editorRef.current;
          const monaco = monacoRef.current;
          const model = editor?.getModel?.();
          if (editor && monaco && model) {
              const currentValue = String(model.getValue?.() || '');
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
          void message.error("格式化失败: SQL 语法可能有误");
      }
  };

  const handleAIAction = (action: 'generate' | 'explain' | 'optimize' | 'schema') => {
      const editor = editorRef.current;
      const selection = editor?.getModel()?.getValueInRange(editor.getSelection()) || '';
      const fullSQL = getCurrentQuery();

      const conn = connections.find(c => c.id === currentConnectionId);
      const ctxText = conn ? `【上下文环境：${conn.config?.type || '数据库'} "${conn.name}", 当前库选定为 "${currentDb || '默认'}"】\n` : '';

      const prompts: Record<string, string> = {
          generate: `${ctxText}请根据当前数据库表结构生成查询语句：`,
          explain: `${ctxText}请解释以下 SQL 语句的执行逻辑：\n\`\`\`sql\n${selection || fullSQL}\n\`\`\``,
          optimize: `${ctxText}请分析以下 SQL 语句的性能并给出优化建议：\n\`\`\`sql\n${selection || fullSQL}\n\`\`\``,
          schema: `${ctxText}请针对当前数据库的表结构进行系统分析，并给出性能和设计上的优化建议。`,
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
          label: '关键字大写', 
          icon: sqlFormatOptions.keywordCase === 'upper' ? '✓' : undefined,
          onClick: () => setSqlFormatOptions({ keywordCase: 'upper' }) 
      },
      { 
          key: 'lower', 
          label: '关键字小写', 
          icon: sqlFormatOptions.keywordCase === 'lower' ? '✓' : undefined,
          onClick: () => setSqlFormatOptions({ keywordCase: 'lower' }) 
      },
      { type: 'divider' },
      {
          key: 'snippet-settings',
          label: '代码片段管理...',
          onClick: () => window.dispatchEvent(new CustomEvent('gonavi:open-snippet-settings')),
      },
      {
          key: 'shortcut-settings',
          label: '快捷键管理...',
          onClick: () => window.dispatchEvent(new CustomEvent('gonavi:open-shortcut-settings')),
      },
  ];

  const splitSQLStatements = (sql: string): string[] => {
    const text = (sql || '').replace(/\r\n/g, '\n');
    const statements: string[] = [];

    let cur = '';
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    let escaped = false;
    let inLineComment = false;
    let inBlockComment = false;
    let dollarTag: string | null = null; // postgres/kingbase: $$...$$ or $tag$...$tag$
    let plsqlDepth = 0;
    let plsqlDeclareBeginSkips = 0;
    let justClosedPLSQLBlock = false;

    const push = () => {
        const s = cur.trim();
        if (s) statements.push(s);
        cur = '';
    };

    const isWS = (ch: string) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const next = i + 1 < text.length ? text[i + 1] : '';
        const prev = i > 0 ? text[i - 1] : '';
        const next2 = i + 2 < text.length ? text[i + 2] : '';

        if (!inSingle && !inDouble && !inBacktick) {
            if (inLineComment) {
                cur += ch;
                if (ch === '\n') inLineComment = false;
                continue;
            }

            if (inBlockComment) {
                cur += ch;
                if (ch === '*' && next === '/') {
                    cur += next;
                    i++;
                    inBlockComment = false;
                }
                continue;
            }

            // Start comments
            if (ch === '/' && next === '*') {
                cur += ch + next;
                i++;
                inBlockComment = true;
                continue;
            }
            if (ch === '#') {
                cur += ch;
                inLineComment = true;
                continue;
            }
            if (ch === '-' && next === '-' && (i === 0 || isWS(prev)) && (next2 === '' || isWS(next2))) {
                cur += ch + next;
                i++;
                inLineComment = true;
                continue;
            }

            // Dollar-quoted strings (PG/Kingbase)
            if (dollarTag) {
                if (text.startsWith(dollarTag, i)) {
                    cur += dollarTag;
                    i += dollarTag.length - 1;
                    dollarTag = null;
                } else {
                    cur += ch;
                }
                continue;
            }
            if (ch === '$') {
                const m = text.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
                if (m && m[0]) {
                    dollarTag = m[0];
                    cur += dollarTag;
                    i += dollarTag.length - 1;
                    continue;
                }
            }
        }

        if (escaped) {
            cur += ch;
            escaped = false;
            continue;
        }

        if ((inSingle || inDouble) && ch === '\\') {
            cur += ch;
            escaped = true;
            continue;
        }

        if (!inDouble && !inBacktick && ch === '\'') {
            inSingle = !inSingle;
            cur += ch;
            continue;
        }
        if (!inSingle && !inBacktick && ch === '"') {
            inDouble = !inDouble;
            cur += ch;
            continue;
        }
        if (!inSingle && !inDouble && ch === '`') {
            inBacktick = !inBacktick;
            cur += ch;
            continue;
        }

        if (!inSingle && !inDouble && !inBacktick && !dollarTag && isSqlIdentifierStart(ch)) {
            let end = i + 1;
            while (end < text.length && isSqlIdentifierPart(text[end])) {
                end += 1;
            }
            const token = text.slice(i, end).toLowerCase();
            if (token === 'begin' && plsqlDeclareBeginSkips > 0) {
                plsqlDeclareBeginSkips -= 1;
                justClosedPLSQLBlock = false;
            } else if (token === 'begin' && shouldEnterPlsqlBeginBlock(text, end)) {
                plsqlDepth += 1;
                justClosedPLSQLBlock = false;
            } else if (token === 'declare' && shouldEnterPlsqlDeclareBlock(text, end)) {
                plsqlDepth += 1;
                plsqlDeclareBeginSkips += 1;
                justClosedPLSQLBlock = false;
            } else if (token === 'end' && plsqlDepth > 0 && !isPlsqlControlEnd(text, end)) {
                plsqlDepth -= 1;
                if (plsqlDeclareBeginSkips > plsqlDepth) {
                    plsqlDeclareBeginSkips = plsqlDepth;
                }
                justClosedPLSQLBlock = plsqlDepth === 0;
            }
            cur += text.slice(i, end);
            i = end - 1;
            continue;
        }

        if (!inSingle && !inDouble && !inBacktick && !dollarTag && (ch === ';' || ch === '；')) {
            if (plsqlDepth > 0) {
                cur += ch;
                continue;
            }
            if (justClosedPLSQLBlock) {
                cur += ch;
                push();
                justClosedPLSQLBlock = false;
                continue;
            }
            push();
            continue;
        }

        cur += ch;
    }

    push();
    return statements;
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

  const mergeResultSets = (previous: ResultSet[], next: ResultSet[], replaceAll: boolean): ResultSet[] => {
      if (replaceAll || previous.length === 0) {
          return next.map((result, index) => ({ ...result, key: `result-${index + 1}` }));
      }

      const merged = [...previous];
      next.forEach((result) => {
          const incomingKey = normalizeExecutedSqlKey(result.exportSql || result.sql);
          const existingIndex = merged.findIndex((item) => normalizeExecutedSqlKey(item.exportSql || item.sql) === incomingKey);
          if (existingIndex >= 0) {
              merged[existingIndex] = { ...result, key: merged[existingIndex].key };
              return;
          }
          merged.push({ ...result, key: `result-${resolveNextResultSetIndex(merged)}` });
      });
      return merged;
  };

  const resolveActiveResultKeyAfterMerge = (merged: ResultSet[], executed: ResultSet[]): string => {
      const firstExecutedResult = executed[0];
      if (!firstExecutedResult) {
          return '';
      }
      const executedSqlKey = normalizeExecutedSqlKey(firstExecutedResult.exportSql || firstExecutedResult.sql);
      return merged.find((item) => normalizeExecutedSqlKey(item.exportSql || item.sql) === executedSqlKey)?.key
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
              message.error('刷新失败: ' + (res?.message || '未知错误'));
              return;
          }

          // 取第一个结果集（单条 SQL 只有一个结果集）
          const resultSetDataArray = Array.isArray(res.data) ? (res.data as any[]) : [];
          if (resultSetDataArray.length === 0) return;
          const rsData = resultSetDataArray[0];
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
                  ? { ...rs, rows, columns: cols, truncated }
                  : rs
          ));
      } catch (err: any) {
          message.error('刷新失败: ' + (err?.message || '未知错误'));
      } finally {
          setLoading(false);
      }
  };

  const handleRun = async () => {
    const currentQuery = getCurrentQuery();
    if (!currentQuery.trim()) return;
    const executableSQL = getExecutableSQL();
    if (!executableSQL.trim()) {
        message.info('没有可执行的 SQL。');
        return;
    }
    if (!currentDb) {
        message.error("请先选择数据库");
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
        message.error("Connection not found");
        if (runSeqRef.current === runSeq) setLoading(false);
        return;
    }
    const connCaps = getDataSourceCapabilities(conn.config);
    if (!connCaps.supportsQueryEditor) {
        message.error("当前数据源不支持 SQL 查询编辑器，请使用对应专用页面。");
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
                message.info('没有可执行的 SQL。');
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
                        const prefix = statements.length > 1 ? `第 ${idx + 1} 条语句执行失败：` : '';
                        setExecutionError(prefix + shellConvert.error);
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
                    const prefix = statements.length > 1 ? `第 ${idx + 1} 条语句执行失败：` : '';
                    setExecutionError(prefix + res.message);
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
                        rows,
                        columns: cols,
                        pkColumns: [],
                        readOnly: true,
                        truncated
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
                            rows: [row],
                            columns: ['affectedRows'],
                            pkColumns: [],
                            readOnly: true
                        });
                    }
                }
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
                message.success(`已执行 ${statements.length} 条语句，生成 ${nextResultSets.length} 个结果集。`);
            } else if (nextResultSets.length === 0) {
                message.success('执行成功。');
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
                message.info('没有可执行的 SQL。');
                return;
            }

            const forceReadOnlyResult = connCaps.forceReadOnlyQueryResult;
            const statementPlans: QueryStatementPlan[] = [];
            for (const statement of sourceStatements) {
                statementPlans.push(await resolveQueryLocatorPlan({
                    statement,
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

            const res = await DBQueryMulti(buildRpcConnectionConfig(config) as any, currentDb, fullSQL, queryId);
            const duration = Date.now() - startTime;

            addSqlLog({
                id: `log-${Date.now()}-query-multi`,
                timestamp: Date.now(),
                sql: fullSQL,
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

                setExecutionError(res.message);
                setResultSets([]);
                setActiveResultKey('');
                return;
            }

            // res.data 是 ResultSetData[] 数组
            const resultSetDataArray = Array.isArray(res.data) ? (res.data as any[]) : [];
            const nextResultSets: ResultSet[] = [];
            const maxRows = Number(queryOptions?.maxRows) || 0;
            let anyTruncated = false;

            for (let idx = 0; idx < resultSetDataArray.length; idx++) {
                const rsData = resultSetDataArray[idx];
                const plan = executablePlans[idx];
                const originalSql = plan?.originalSql || '';
                const executedSql = plan?.executedSql || originalSql;

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
                        rows: [row],
                        columns: ['affectedRows'],
                        pkColumns: [],
                        readOnly: true
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
                    nextResultSets.push({
                        key: `result-${idx + 1}`,
                        sql: executedSql,
                        exportSql: originalSql,
                        rows,
                        columns: cols,
                        tableName: tableRef?.tableName,
                        pkColumns: plan?.pkColumns || [],
                        editLocator,
                        readOnly: forceReadOnlyResult || !editLocator || editLocator.readOnly,
                        truncated
                    });
                }
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
                message.success(`已执行完成，生成 ${nextResultSets.length} 个结果集。`);
            } else if (nextResultSets.length === 0) {
                message.success('执行成功。');
            }

        }
    } catch (e: any) {
        message.error("Error executing query: " + e.message);
        addSqlLog({
            id: `log-${Date.now()}-error`,
            timestamp: Date.now(),
            sql: executableSQL || getExecutableSQL() || getCurrentQuery(),
            status: 'error',
            duration: Date.now() - runStartTime,
            message: e.message,
            dbName: currentDb
        });
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
      message.warning('没有正在运行的查询可取消');
      return;
    }
    const queryIdToCancel = currentQueryIdRef.current;
    try {
      const res = await CancelQuery(queryIdToCancel);
      if (res.success) {
        message.success('查询已取消');
        // Clear query ID after successful cancellation
        if (currentQueryIdRef.current === queryIdToCancel) {
          clearQueryId()
        }
      } else {
        message.warning(res.message);
      }
    } catch (error: any) {
      message.error('取消查询失败: ' + error.message);
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
              label: 'GoNavi: 执行 SQL',
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
  }, [runQueryShortcutBinding]);

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
              label: 'GoNavi: 选择当前语句',
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
  }, [selectCurrentStatementShortcutBinding, handleSelectCurrentStatement]);

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
              label: 'GoNavi: 保存查询',
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
  }, [saveQueryShortcutBinding]);

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
                      message.success('代码已在当前光标处成功插入');
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
              message.success('代码已追加');
          }
      };
      window.addEventListener('gonavi:insert-sql-to-tab', handleInsertSql as EventListener);
      return () => window.removeEventListener('gonavi:insert-sql-to-tab', handleInsertSql as EventListener);
  }, [tab.id, handleRun]);

  const resolveDefaultQueryName = () => {
      const rawTitle = String(tab.title || '').trim();
      if (!rawTitle || rawTitle.startsWith('新建查询')) {
          return '未命名查询';
      }
      return rawTitle;
  };

  const persistQuery = (payload: { id: string; name: string; createdAt?: number }) => {
      const sql = getCurrentQuery();
      const saved = {
          id: payload.id,
          name: payload.name,
          sql,
          connectionId: currentConnectionId,
          dbName: currentDb || tab.dbName || '',
          createdAt: payload.createdAt ?? Date.now(),
      };
      saveQuery(saved);
      addTab({
          ...tab,
          title: payload.name,
          query: sql,
          connectionId: currentConnectionId,
          dbName: currentDb || tab.dbName || '',
          savedQueryId: payload.id,
      });
      return saved;
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
                  message.error('保存 SQL 文件失败: ' + (res.message || '未知错误'));
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
              message.success('SQL 文件已保存！');
          } catch (error) {
              message.error('保存 SQL 文件失败: ' + (error instanceof Error ? error.message : String(error)));
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
      persistQuery({ id: saveId, name: saveName, createdAt: existed?.createdAt });
      message.success('查询已保存！');
  };

  const handleRenameQuery = () => {
      const existed = currentSavedQuery || null;
      const fallbackSavedId = String(tab.savedQueryId || '').trim();
      if (!existed && !fallbackSavedId) {
          message.warning('请先保存查询后再重命名');
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
                  message.error('导出 SQL 文件失败: ' + (res.message || '未知错误'));
              }
              return;
          }
          message.success('SQL 文件已导出！');
      } catch (error) {
          message.error('导出 SQL 文件失败: ' + (error instanceof Error ? error.message : String(error)));
      }
  };

  const saveMoreMenuItems: MenuProps['items'] = [
      {
          key: 'rename-query',
          label: '重命名查询',
          disabled: !!tab.filePath,
          onClick: handleRenameQuery,
      },
      {
          key: 'export-sql-file',
          label: '导出 SQL 文件',
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
          persistQuery({
              id: nextSavedId,
              name: String(values.name || '').trim() || '未命名查询',
              createdAt: existed?.createdAt,
          });
          message.success(saveModalMode === 'rename' ? '查询已重命名！' : '查询已保存！');
          setIsSaveModalOpen(false);
      } catch (e) {
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

  const buildResultTabMenuItems = (key: string, index: number): MenuProps['items'] => [
      {
          key: 'close-other',
          label: '关闭其他页',
          disabled: resultSets.length <= 1,
          onClick: () => closeOtherResultTabs(key),
      },
      {
          key: 'close-left',
          label: '关闭左侧',
          disabled: index <= 0,
          onClick: () => closeResultTabsToLeft(key),
      },
      {
          key: 'close-right',
          label: '关闭右侧',
          disabled: index >= resultSets.length - 1,
          onClick: () => closeResultTabsToRight(key),
      },
      { type: 'divider' },
      {
          key: 'close-all',
          label: '关闭所有',
          disabled: resultSets.length === 0,
          onClick: closeAllResultTabs,
      },
  ];

  return (
    <div ref={queryEditorRootRef} className={isV2Ui ? 'gn-v2-query-editor' : undefined} style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <style>{`
        .query-result-tabs {
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .query-result-tabs .ant-tabs-nav {
          flex: 0 0 auto;
          margin: 0;
          min-height: 38px;
        }
        .query-result-tabs .ant-tabs-nav-wrap {
          flex: 0 1 auto;
          min-width: 0;
        }
        .query-result-tabs .ant-tabs-nav-list {
          align-items: center;
          width: auto;
        }
        .query-result-tabs .ant-tabs-tab {
          width: auto !important;
          min-width: 0 !important;
          max-width: 148px !important;
          height: 30px !important;
          min-height: 30px;
          margin: 4px 6px 4px 0 !important;
          padding: 0 9px !important;
          border-radius: 999px !important;
          border: 0.5px solid transparent !important;
          border-right: 0.5px solid transparent !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .query-result-tabs .ant-tabs-tab-btn {
          width: auto !important;
          height: 100%;
          max-width: 100%;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          font-size: 14px !important;
          line-height: 1 !important;
        }
        .query-result-tabs .ant-tabs-tab.ant-tabs-tab-active::after {
          display: none;
        }
        .query-result-tabs .ant-tabs-content-holder {
          flex: 1 1 auto;
          overflow: hidden;
          min-height: 0;
          display: flex;
          flex-direction: column;
        }
        .query-result-tabs .ant-tabs-content {
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          flex-direction: column;
        }
        .query-result-tabs .ant-tabs-tabpane {
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .query-result-tabs .ant-tabs-tabpane > div {
          flex: 1 1 auto;
          min-height: 0;
        }
        .query-result-tabs .ant-tabs-tabpane-hidden {
          display: none !important;
        }
        .query-result-tabs .ant-tabs-ink-bar {
          transition: none !important;
        }
        .query-result-tab-label {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          min-width: 0;
          max-width: 126px;
          height: 100%;
          line-height: 1;
          user-select: none;
          -webkit-user-select: none;
        }
        .query-result-tab-text {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 14px;
          font-weight: 700;
        }
        .query-result-tab-count {
          flex: 0 0 auto;
          min-width: 17px;
          height: 17px;
          padding: 0 5px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(148, 163, 184, 0.16);
          color: inherit;
          font-size: 11px;
          font-weight: 700;
          line-height: 17px;
        }
        .query-result-tab-close {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 16px;
          height: 16px;
          border-radius: 999px;
          color: #999;
          cursor: pointer;
          flex: 0 0 auto;
        }
        .query-result-tab-close:hover {
          background: rgba(0, 0, 0, 0.06);
          color: #666;
        }
      `}</style>
      <div ref={editorPaneRef} className={isV2Ui ? 'gn-v2-query-editor-pane' : undefined}>
      <div className={isV2Ui ? 'gn-v2-query-toolbar' : undefined} style={{ padding: '4px 8px 8px', display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'center' }}>
        <div
          className={isV2Ui ? 'gn-v2-query-toolbar-selects' : undefined}
          style={{ display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'center' }}
        >
          <Select
              className={isV2Ui ? 'gn-v2-query-toolbar-select gn-v2-query-toolbar-connection-select' : undefined}
              style={isV2Ui ? undefined : { width: 150 }}
              placeholder="选择连接"
              value={currentConnectionId}
              onChange={(val) => {
                  setCurrentConnectionId(val);
                  setCurrentDb('');
              }}
              options={queryCapableConnections.map(c => ({ label: c.name, value: c.id }))}
              showSearch
          />
          <Select
              className={isV2Ui ? 'gn-v2-query-toolbar-select gn-v2-query-toolbar-database-select' : undefined}
              style={isV2Ui ? undefined : { width: 200 }}
              placeholder="选择数据库"
              value={currentDb}
              onChange={setCurrentDb}
              options={dbList.map(db => ({ label: db, value: db }))}
              showSearch
          />
          <Tooltip title="最大返回行数（会对 SELECT 自动加 LIMIT，防止大结果集卡死）">
              <Select
                  className={isV2Ui ? 'gn-v2-query-toolbar-select gn-v2-query-toolbar-max-rows-select' : undefined}
                  style={isV2Ui ? undefined : { width: 170 }}
                  value={queryOptions?.maxRows ?? 5000}
                  onChange={(val) => setQueryOptions({ maxRows: Number(val) })}
                  options={[
                      { label: '最大行数：500', value: 500 },
                      { label: '最大行数：1000', value: 1000 },
                      { label: '最大行数：5000', value: 5000 },
                      { label: '最大行数：20000', value: 20000 },
                      { label: '最大行数：不限', value: 0 },
                  ]}
              />
          </Tooltip>
        </div>
        <div
          className={isV2Ui ? 'gn-v2-query-toolbar-actions' : undefined}
          style={{ display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'center' }}
        >
          <Button.Group className={isV2Ui ? 'gn-v2-query-toolbar-action-group' : undefined}>
            <Tooltip
                title={
	                    runQueryShortcutBinding.enabled && runQueryShortcutBinding.combo
	                        ? `运行（${getShortcutDisplayLabel(runQueryShortcutBinding.combo, activeShortcutPlatform)}）`
	                        : '运行'
                }
            >
                <Button className={isV2Ui ? 'gn-v2-query-toolbar-run-action' : undefined} type="primary" icon={<PlayCircleOutlined />} onMouseDown={captureEditorCursorPosition} onClick={handleRun} loading={loading}>
                  运行
                </Button>
            </Tooltip>
            {loading && (
              <Button type="primary" danger icon={<StopOutlined />} onClick={handleCancel}>
                停止
              </Button>
            )}
          </Button.Group>
          <Button.Group className={isV2Ui ? 'gn-v2-query-toolbar-action-group' : undefined}>
              <Tooltip
                  title={
                      saveQueryShortcutBinding.enabled && saveQueryShortcutBinding.combo
                          ? `保存（${getShortcutDisplayLabel(saveQueryShortcutBinding.combo, activeShortcutPlatform)}）`
                          : '保存'
                  }
              >
                <Button icon={<SaveOutlined />} onClick={handleQuickSave}>
                  保存
                </Button>
              </Tooltip>
              <Dropdown menu={{ items: saveMoreMenuItems }} placement="bottomRight">
                  <Button>更多</Button>
              </Dropdown>
          </Button.Group>

          <Button.Group className={isV2Ui ? 'gn-v2-query-toolbar-action-group' : undefined}>
              <Tooltip title="美化 SQL">
                  <Button icon={<FormatPainterOutlined />} onClick={handleFormat}>美化</Button>
              </Tooltip>
              <Dropdown menu={{ items: formatSettingsMenu }} placement="bottomRight">
                  <Button className={isV2Ui ? 'gn-v2-query-toolbar-icon-action' : undefined} icon={<SettingOutlined />} />
              </Dropdown>
          </Button.Group>

          <Dropdown menu={{ items: [
              { key: 'ai-generate', label: '生成 SQL', icon: <RobotOutlined />, onClick: () => handleAIAction('generate') },
              { key: 'ai-explain', label: '解释 SQL', icon: <RobotOutlined />, onClick: () => handleAIAction('explain') },
              { key: 'ai-optimize', label: '优化 SQL', icon: <RobotOutlined />, onClick: () => handleAIAction('optimize') },
              { type: 'divider' as const },
              { key: 'ai-schema', label: 'Schema 分析', icon: <RobotOutlined />, onClick: () => handleAIAction('schema') },
          ] }} placement="bottomRight">
              <Button className={isV2Ui ? 'gn-v2-query-toolbar-ai-action' : undefined} icon={<RobotOutlined />} style={{ color: '#818cf8' }}>AI</Button>
          </Dropdown>
        </div>
      </div>
      
      <div ref={editorShellRef} className={isV2Ui ? 'gn-v2-query-monaco-shell' : undefined} style={{ height: editorHeight, minHeight: '100px' }}>
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
        title="拖动调整高度"
      />
      </div>

      <div className={isV2Ui ? 'gn-v2-query-results' : undefined} style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: 0, display: 'flex', flexDirection: 'column' }}>
        {resultSets.length > 0 ? (
          <Tabs
              className="query-result-tabs"
              activeKey={activeResultKey || resultSets[0]?.key}
              onChange={setActiveResultKey}
              animated={false}
              style={{ flex: 1, minHeight: 0 }}
              items={resultSets.map((rs, idx) => ({
                  key: rs.key,
                  label: (
                      <Dropdown
                          menu={{ items: buildResultTabMenuItems(rs.key, idx) }}
                          trigger={['contextMenu']}
                          rootClassName={isV2Ui ? 'gn-v2-tab-context-menu-popup' : undefined}
                      >
                          <div
                              className="query-result-tab-label"
                              onContextMenu={(event) => {
                                  event.preventDefault();
                              }}
                          >
                              <Tooltip title={rs.sql}>
                                  <span className="query-result-tab-text">结果 {idx + 1}</span>
                              </Tooltip>
                              {(() => {
                                  const isAffected = rs.columns.length === 1 && rs.columns[0] === 'affectedRows';
                                  if (isAffected) {
                                      return <span className="query-result-tab-count">✓</span>;
                                  }
                                  if (!Array.isArray(rs.rows)) {
                                      return null;
                                  }
                                  return <span className="query-result-tab-count">{rs.rows.length}</span>;
                              })()}
                              <Tooltip title="关闭结果">
                                  <span
                                      className="query-result-tab-close"
                                      onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          handleCloseResult(rs.key);
                                      }}
                                  >
                                      <CloseOutlined style={{ fontSize: 12 }} />
                                  </span>
                              </Tooltip>
                          </div>
                      </Dropdown>
                  ),
                  children: (() => {
                      // affectedRows 类型结果集（UPDATE/INSERT/DELETE）：简洁提示
                      const isAffectedResult = rs.columns.length === 1 && rs.columns[0] === 'affectedRows';
                      if (isAffectedResult) {
                          const affected = Number(rs.rows[0]?.affectedRows ?? 0);
                          return (
                              <div className={isV2Ui ? 'gn-v2-query-success' : undefined} style={{
                                  flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  flexDirection: 'column', gap: 8, color: '#666', userSelect: 'text',
                              }}>
                                  <span style={{ fontSize: 36, color: '#52c41a' }}>✓</span>
                                  <span style={{ fontSize: 14, fontWeight: 500 }}>执行成功</span>
                                  <span style={{ fontSize: 13, color: '#999' }}>影响行数：{affected}</span>
                              </div>
                          );
                      }
                      return (
                          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                              <DataGrid
                                  data={rs.rows}
                                  columnNames={rs.columns}
                                  loading={loading}
                                  tableName={rs.tableName}
                                  exportScope="queryResult"
                                  resultSql={rs.exportSql || rs.sql}
                                  dbName={currentDb}
                                  connectionId={currentConnectionId}
                                  pkColumns={rs.pkColumns}
                                  editLocator={rs.editLocator}
                                  onReload={() => handleReloadResult(rs.key, rs.sql)}
                                  readOnly={rs.readOnly}
                              />
                          </div>
                      );
                  })()
              }))}
          />
        ) : executionError ? (
          <div className={isV2Ui ? 'gn-v2-query-error' : undefined} style={{ flex: 1, minHeight: 0, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, background: darkMode ? '#1e1e1e' : '#fafafa', overflow: 'auto' }}>
              <div style={{ color: '#ff4d4f', fontWeight: 'bold', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CloseOutlined />
                  <span>执行失败</span>
              </div>
              <div className="custom-scrollbar" style={{ padding: 16, background: darkMode ? '#2d1a1a' : '#fff2f0', border: `1px solid ${darkMode ? '#5c2020' : '#ffccc7'}`, borderRadius: 6, color: darkMode ? '#ffa39e' : '#cf1322', fontFamily: 'var(--gn-font-mono)', fontSize: 'var(--gn-font-size-mono, 13px)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '40vh', overflow: 'auto' }}>
                  {executionError}
              </div>
              <div style={{ marginTop: 8 }}>
                  <Button
                      type="primary"
                      icon={<RobotOutlined />}
                      style={{ background: '#818cf8', borderColor: '#818cf8', boxShadow: '0 2px 0 rgba(129, 140, 248, 0.2)' }}
                      onClick={() => {
                          const errSql = getCurrentQuery();
                          const prompt = `我在执行以下 SQL 时遇到了错误：\n\`\`\`sql\n${errSql}\n\`\`\`\n\n数据库报错信息如下：\n\`\`\`text\n${executionError}\n\`\`\`\n\n请帮我分析错误原因，并给出修改建议。`;
                          const store = useStore.getState();
                          const wasClosed = !store.aiPanelVisible;
                          if (wasClosed) store.setAIPanelVisible(true);
                          setTimeout(() => {
                              window.dispatchEvent(new CustomEvent('gonavi:ai:inject-prompt', { detail: { prompt } }));
                          }, wasClosed ? 350 : 0);
                      }}
                  >
                      一键 AI 诊断
                  </Button>
              </div>
          </div>
        ) : (
          <div className={isV2Ui ? 'gn-v2-query-empty' : undefined} style={{ flex: 1, minHeight: 0 }}>
            {isV2Ui && (
              <div>
                <strong>等待执行 SQL</strong>
                <span>运行查询后，结果会在下方以新版数据网格展示。</span>
              </div>
            )}
          </div>
        )}
      </div>

      <Modal 
        title={saveModalMode === 'rename' ? '重命名查询' : '保存查询'}
        open={isSaveModalOpen} 
        onOk={handleSave} 
        onCancel={() => setIsSaveModalOpen(false)}
        okText={saveModalMode === 'rename' ? '重命名' : '保存'}
        cancelText="取消"
      >
          <Form form={saveForm} layout="vertical">
              <Form.Item name="name" label="查询名称" rules={[{ required: true, message: '请输入查询名称' }]}>
                  <Input placeholder="例如：查询所有用户" />
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
