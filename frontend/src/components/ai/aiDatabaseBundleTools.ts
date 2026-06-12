import type { SavedConnection } from '../../types';
import { buildRpcConnectionConfig } from '../../utils/connectionRpcConfig';
import { resolveAITableSchemaToolResult } from '../../utils/aiTableSchemaTool';
import type { AILocalToolRuntime } from './aiLocalToolRuntime';
import {
  buildPreviewSQLForTable,
  normalizeColumns,
  normalizeColumnsWithTable,
  normalizePerTableColumnLimit,
  normalizePreviewLimit,
  normalizeTableLimit,
  normalizeTableList,
} from './aiDatabaseToolHelpers';

interface DatabaseToolExecutionResult {
  content: string;
  success: boolean;
}

interface InspectDatabaseBundleOptions {
  args: Record<string, any>;
  connection: SavedConnection;
  runtime: AILocalToolRuntime;
}

export const inspectTableBundle = async ({
  args,
  connection,
  runtime,
}: InspectDatabaseBundleOptions): Promise<DatabaseToolExecutionResult> => {
  try {
    const safeDbName = args.dbName ? String(args.dbName).trim() : '';
    const safeTable = args.tableName ? String(args.tableName).trim() : '';
    if (!safeTable) return { content: 'tableName 不能为空', success: false };
    const includeSampleRows = args.includeSampleRows === true;
    const sampleLimit = normalizePreviewLimit(args.sampleLimit ?? 10);
    const rpcConfig = buildRpcConnectionConfig(connection.config) as any;
    const results = await Promise.allSettled([
      runtime.getColumns(rpcConfig, safeDbName, safeTable),
      runtime.getIndexes(rpcConfig, safeDbName, safeTable),
      runtime.getForeignKeys(rpcConfig, safeDbName, safeTable),
      runtime.getTriggers(rpcConfig, safeDbName, safeTable),
      resolveAITableSchemaToolResult({
        tableName: safeTable,
        fetchDDL: () => runtime.showCreateTable(rpcConfig, safeDbName, safeTable),
        fetchColumns: () => runtime.getColumns(rpcConfig, safeDbName, safeTable),
      }),
      includeSampleRows
        ? runtime.query(rpcConfig, safeDbName, buildPreviewSQLForTable(connection, safeTable, sampleLimit))
        : Promise.resolve(undefined),
    ]);
    const warnings: string[] = [];
    const payload: Record<string, unknown> = {
      dbName: safeDbName,
      tableName: safeTable,
      columns: [],
      indexes: [],
      foreignKeys: [],
      triggers: [],
      ddl: '',
    };
    const columnsResult = results[0];
    const indexesResult = results[1];
    const foreignKeysResult = results[2];
    const triggersResult = results[3];
    const ddlResult = results[4];
    const sampleRowsResult = results[5];
    if (columnsResult.status === 'fulfilled' && columnsResult.value?.success && Array.isArray(columnsResult.value.data)) {
      payload.columns = normalizeColumns(columnsResult.value.data);
    } else {
      warnings.push(`字段列表获取失败：${columnsResult.status === 'fulfilled' ? (columnsResult.value?.message || '未知错误') : String(columnsResult.reason)}`);
    }
    if (indexesResult.status === 'fulfilled' && indexesResult.value?.success && Array.isArray(indexesResult.value.data)) {
      payload.indexes = indexesResult.value.data;
    } else {
      warnings.push(`索引定义获取失败：${indexesResult.status === 'fulfilled' ? (indexesResult.value?.message || '未知错误') : String(indexesResult.reason)}`);
    }
    if (foreignKeysResult.status === 'fulfilled' && foreignKeysResult.value?.success && Array.isArray(foreignKeysResult.value.data)) {
      payload.foreignKeys = foreignKeysResult.value.data;
    } else {
      warnings.push(`外键关系获取失败：${foreignKeysResult.status === 'fulfilled' ? (foreignKeysResult.value?.message || '未知错误') : String(foreignKeysResult.reason)}`);
    }
    if (triggersResult.status === 'fulfilled' && triggersResult.value?.success && Array.isArray(triggersResult.value.data)) {
      payload.triggers = triggersResult.value.data;
    } else {
      warnings.push(`触发器获取失败：${triggersResult.status === 'fulfilled' ? (triggersResult.value?.message || '未知错误') : String(triggersResult.reason)}`);
    }
    if (ddlResult.status === 'fulfilled' && ddlResult.value?.success) {
      payload.ddl = ddlResult.value.content;
    } else {
      warnings.push(`DDL 获取失败：${ddlResult.status === 'fulfilled' ? (ddlResult.value?.content || '未知错误') : String(ddlResult.reason)}`);
    }
    if (includeSampleRows) {
      if (sampleRowsResult.status === 'fulfilled' && sampleRowsResult.value?.success) {
        const rows = Array.isArray(sampleRowsResult.value.data) ? sampleRowsResult.value.data : [];
        payload.sampleRows = {
          limit: sampleLimit,
          rowCount: rows.length,
          rows: rows.slice(0, sampleLimit),
        };
      } else {
        warnings.push(`样例数据获取失败：${sampleRowsResult.status === 'fulfilled' ? (sampleRowsResult.value?.message || '未知错误') : String(sampleRowsResult.reason)}`);
      }
    }
    if (warnings.length > 0) {
      payload.warnings = warnings;
    }
    return { content: JSON.stringify(payload), success: true };
  } catch (error: any) {
    return { content: `获取表结构快照失败: ${error?.message || error}`, success: false };
  }
};

export const inspectDatabaseBundle = async ({
  args,
  connection,
  runtime,
}: InspectDatabaseBundleOptions): Promise<DatabaseToolExecutionResult> => {
  try {
    const safeDbName = args.dbName ? String(args.dbName).trim() : '';
    if (!safeDbName) return { content: 'dbName 不能为空', success: false };
    const includeColumns = args.includeColumns !== false;
    const tableLimit = normalizeTableLimit(args.tableLimit);
    const perTableColumnLimit = normalizePerTableColumnLimit(args.perTableColumnLimit);
    const rpcConfig = buildRpcConnectionConfig(connection.config) as any;
    const results = await Promise.allSettled([
      runtime.getTables(rpcConfig, safeDbName),
      includeColumns ? runtime.getAllColumns(rpcConfig, safeDbName) : Promise.resolve(undefined),
    ]);
    const warnings: string[] = [];
    const tablesResult = results[0];
    const allColumnsResult = results[1];
    const allColumns = allColumnsResult.status === 'fulfilled' && allColumnsResult.value?.success && Array.isArray(allColumnsResult.value.data)
      ? normalizeColumnsWithTable(allColumnsResult.value.data)
      : [];
    const tableNamesFromColumns = Array.from(new Set(allColumns.map((column) => column.tableName).filter(Boolean)));
    let tableNames: string[] = [];
    if (tablesResult.status === 'fulfilled' && tablesResult.value?.success && Array.isArray(tablesResult.value.data)) {
      tableNames = normalizeTableList(tablesResult.value.data).filter(Boolean);
    } else if (tableNamesFromColumns.length > 0) {
      tableNames = tableNamesFromColumns;
      warnings.push(`表列表获取失败，已退回字段摘要推断：${tablesResult.status === 'fulfilled' ? (tablesResult.value?.message || '未知错误') : String(tablesResult.reason)}`);
    } else {
      warnings.push(`表列表获取失败：${tablesResult.status === 'fulfilled' ? (tablesResult.value?.message || '未知错误') : String(tablesResult.reason)}`);
    }
    if (includeColumns && allColumnsResult.status === 'fulfilled' && (!allColumnsResult.value?.success || !Array.isArray(allColumnsResult.value.data))) {
      warnings.push(`字段摘要获取失败：${allColumnsResult.value?.message || '未知错误'}`);
    } else if (includeColumns && allColumnsResult.status === 'rejected') {
      warnings.push(`字段摘要获取失败：${String(allColumnsResult.reason)}`);
    }
    const uniqueTableNames = Array.from(new Set(tableNames.filter(Boolean)));
    const visibleTableNames = uniqueTableNames.slice(0, tableLimit);
    const columnsByTable = new Map<string, ReturnType<typeof normalizeColumnsWithTable>>();
    allColumns.forEach((column) => {
      const tableName = String(column.tableName || '').trim();
      if (!tableName) return;
      const current = columnsByTable.get(tableName) || [];
      current.push(column);
      columnsByTable.set(tableName, current);
    });
    const payload: Record<string, unknown> = {
      dbName: safeDbName,
      tableCount: uniqueTableNames.length,
      totalColumns: allColumns.length,
      tables: visibleTableNames,
      truncatedTables: uniqueTableNames.length > visibleTableNames.length,
    };
    if (includeColumns) {
      payload.tableSummaries = visibleTableNames.map((tableName) => {
        const tableColumns = columnsByTable.get(tableName) || [];
        return {
          tableName,
          columnCount: tableColumns.length,
          truncatedColumns: tableColumns.length > perTableColumnLimit,
          columns: tableColumns.slice(0, perTableColumnLimit),
        };
      });
    }
    if (warnings.length > 0) {
      payload.warnings = warnings;
    }
    return { content: JSON.stringify(payload), success: true };
  } catch (error: any) {
    return { content: `获取数据库结构总览失败: ${error?.message || error}`, success: false };
  }
};
