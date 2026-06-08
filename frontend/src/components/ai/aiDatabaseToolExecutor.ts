import type { SavedConnection } from '../../types';
import { buildRpcConnectionConfig } from '../../utils/connectionRpcConfig';
import { buildAIReadonlyPreviewSQL } from '../../utils/aiSqlLimit';
import { buildPaginatedSelectSQL, quoteQualifiedIdent } from '../../utils/sql';
import { resolveAITableSchemaToolResult } from '../../utils/aiTableSchemaTool';
import type { AILocalToolRuntime, AIToolContextEntry } from './aiLocalToolRuntime';

interface ExecuteDatabaseToolCallOptions {
  toolName: string;
  args: Record<string, any>;
  connections: SavedConnection[];
  toolContextMap: Map<string, AIToolContextEntry>;
  runtime: AILocalToolRuntime;
}

interface ToolExecutionResult {
  content: string;
  success: boolean;
}

const findConnection = (connections: SavedConnection[], connectionId: string) =>
  connections.find((connection) => connection.id === connectionId);

const normalizeTableList = (rows: any[]): string[] =>
  rows.map((row) => row.Table || row.table || (Object.values(row)[0] as string));

const normalizeColumns = (rows: any[]) =>
  rows.map((column) => {
    const keys = Object.keys(column);
    return {
      field: column.Field || column.field || column.COLUMN_NAME || column.column_name || column.Name || column.name || (keys.length > 0 ? column[keys[0]] : ''),
      type: column.Type || column.type || column.DATA_TYPE || column.data_type || (keys.length > 1 ? column[keys[1]] : ''),
      nullable: column.Null || column.null || column.IS_NULLABLE || column.is_nullable || column.Nullable || column.nullable || '',
      default: column.Default || column.default || column.COLUMN_DEFAULT || column.column_default || column.DefaultValue || '',
      comment: column.Comment || column.comment || column.COLUMN_COMMENT || column.column_comment || column.Description || '',
    };
  });

const normalizeColumnsWithTable = (rows: any[]) =>
  rows.map((column) => {
    const keys = Object.keys(column);
    return {
      tableName: column.TableName || column.tableName || column.TABLE_NAME || column.table_name || (keys.length > 0 ? column[keys[0]] : ''),
      name: column.Name || column.name || column.COLUMN_NAME || column.column_name || (keys.length > 1 ? column[keys[1]] : ''),
      type: column.Type || column.type || column.DATA_TYPE || column.data_type || (keys.length > 2 ? column[keys[2]] : ''),
      comment: column.Comment || column.comment || column.COLUMN_COMMENT || column.column_comment || '',
    };
  });

const normalizePreviewLimit = (input: unknown): number => {
  const value = Math.floor(Number(input) || 20);
  if (value < 1) return 1;
  if (value > 100) return 100;
  return value;
};

const normalizeTableLimit = (input: unknown): number => {
  const value = Math.floor(Number(input) || 80);
  if (value < 1) return 1;
  if (value > 200) return 200;
  return value;
};

const normalizePerTableColumnLimit = (input: unknown): number => {
  const value = Math.floor(Number(input) || 8);
  if (value < 1) return 1;
  if (value > 30) return 30;
  return value;
};

const buildPreviewSQLForTable = (connection: SavedConnection, tableName: string, limit: number): string => {
  const dbType = String(connection.config?.type || '').trim();
  return buildPaginatedSelectSQL(
    dbType,
    `SELECT * FROM ${quoteQualifiedIdent(dbType, tableName)}`,
    '',
    limit,
    0,
  );
};

const resolveConnectionOrFailure = (
  connections: SavedConnection[],
  connectionId: string,
): { connection: SavedConnection | null; failure?: ToolExecutionResult } => {
  const connection = findConnection(connections, connectionId);
  if (!connection) {
    return {
      connection: null,
      failure: {
        content: 'Connection not found',
        success: false,
      },
    };
  }
  return { connection };
};

export async function executeDatabaseToolCall(
  options: ExecuteDatabaseToolCallOptions,
): Promise<ToolExecutionResult | null> {
  const { toolName, args, connections, toolContextMap, runtime } = options;

  switch (toolName) {
    case 'get_connections': {
      const availableConnections = connections.map((connection) => ({
        id: connection.id,
        name: connection.name,
        type: connection.config?.type,
        host: (connection.config as any)?.host || (connection.config as any)?.addr || '',
      }));
      return {
        content: JSON.stringify(availableConnections),
        success: true,
      };
    }
    case 'get_databases': {
      const resolved = resolveConnectionOrFailure(connections, args.connectionId);
      if (resolved.failure || !resolved.connection) return resolved.failure || null;
      try {
        const result = await runtime.getDatabases(buildRpcConnectionConfig(resolved.connection.config) as any);
        if (result?.success && Array.isArray(result.data)) {
          let databaseNames = result.data.map((row: any) => row.Database || row.database || Object.values(row)[0]);
          if (databaseNames.length > 50) {
            databaseNames = [...databaseNames.slice(0, 50), '...(截断)'];
          }
          return { content: JSON.stringify(databaseNames), success: true };
        }
        return { content: result?.message || 'Failed to fetch DBs', success: false };
      } catch (error: any) {
        return { content: `获取数据库列表失败: ${error?.message || error}`, success: false };
      }
    }
    case 'get_tables': {
      const resolved = resolveConnectionOrFailure(connections, args.connectionId);
      if (resolved.failure || !resolved.connection) return resolved.failure || null;
      try {
        const rawDbName = args.dbName || args.database;
        const safeDbName = rawDbName ? String(rawDbName).trim() : '';
        const result = await runtime.getTables(buildRpcConnectionConfig(resolved.connection.config) as any, safeDbName);
        if (result?.success && Array.isArray(result.data)) {
          let tableNames = normalizeTableList(result.data);
          if (tableNames.length > 150) {
            tableNames = [...tableNames.slice(0, 150), '...(截断)'];
          }
          toolContextMap.set(`${args.connectionId}:${safeDbName}`, {
            connectionId: args.connectionId,
            dbName: safeDbName,
            tables: tableNames.filter((tableName) => tableName !== '...(截断)'),
          });
          return { content: JSON.stringify(tableNames), success: true };
        }
        return { content: result?.message || 'Failed to fetch Tables', success: false };
      } catch (error: any) {
        return { content: `获取表列表失败: ${error?.message || error}`, success: false };
      }
    }
    case 'get_all_columns': {
      const resolved = resolveConnectionOrFailure(connections, args.connectionId);
      if (resolved.failure || !resolved.connection) return resolved.failure || null;
      try {
        const safeDbName = args.dbName ? String(args.dbName).trim() : '';
        const result = await runtime.getAllColumns(buildRpcConnectionConfig(resolved.connection.config) as any, safeDbName);
        if (result?.success && Array.isArray(result.data)) {
          const allColumns = normalizeColumnsWithTable(result.data);
          const tableNames = Array.from(new Set(allColumns.map((column) => column.tableName).filter(Boolean)));
          const limitedColumns = allColumns.slice(0, 400);
          return {
            content: JSON.stringify({
              dbName: safeDbName,
              tableCount: tableNames.length,
              totalColumns: allColumns.length,
              truncated: allColumns.length > limitedColumns.length,
              columns: limitedColumns,
            }),
            success: true,
          };
        }
        return { content: result?.message || 'Failed to fetch all columns', success: false };
      } catch (error: any) {
        return { content: `获取全库字段摘要失败: ${error?.message || error}`, success: false };
      }
    }
    case 'get_columns': {
      const resolved = resolveConnectionOrFailure(connections, args.connectionId);
      if (resolved.failure || !resolved.connection) return resolved.failure || null;
      try {
        const safeDbName = args.dbName ? String(args.dbName).trim() : '';
        const safeTable = args.tableName ? String(args.tableName).trim() : '';
        const result = await runtime.getColumns(buildRpcConnectionConfig(resolved.connection.config) as any, safeDbName, safeTable);
        if (result?.success && Array.isArray(result.data)) {
          const columns = normalizeColumns(result.data);
          const fieldNames = columns.map((column) => column.field).join(', ');
          return {
            content: `⚠️ 以下为 ${safeTable} 表的真实字段列表。生成 SQL 时只能使用这些 field 值作为列名，必须原样使用，禁止修改、缩写或自行拼凑字段名。\n可用字段：${fieldNames}\n详细信息：${JSON.stringify(columns)}`,
            success: true,
          };
        }
        return { content: result?.message || 'Failed to fetch columns', success: false };
      } catch (error: any) {
        return { content: `获取字段列表失败: ${error?.message || error}`, success: false };
      }
    }
    case 'get_indexes': {
      const resolved = resolveConnectionOrFailure(connections, args.connectionId);
      if (resolved.failure || !resolved.connection) return resolved.failure || null;
      try {
        const safeDbName = args.dbName ? String(args.dbName).trim() : '';
        const safeTable = args.tableName ? String(args.tableName).trim() : '';
        const result = await runtime.getIndexes(buildRpcConnectionConfig(resolved.connection.config) as any, safeDbName, safeTable);
        return {
          content: result?.success && Array.isArray(result.data) ? JSON.stringify(result.data) : (result?.message || 'Failed to fetch indexes'),
          success: !!result?.success && Array.isArray(result.data),
        };
      } catch (error: any) {
        return { content: `获取索引定义失败: ${error?.message || error}`, success: false };
      }
    }
    case 'get_foreign_keys': {
      const resolved = resolveConnectionOrFailure(connections, args.connectionId);
      if (resolved.failure || !resolved.connection) return resolved.failure || null;
      try {
        const safeDbName = args.dbName ? String(args.dbName).trim() : '';
        const safeTable = args.tableName ? String(args.tableName).trim() : '';
        const result = await runtime.getForeignKeys(buildRpcConnectionConfig(resolved.connection.config) as any, safeDbName, safeTable);
        return {
          content: result?.success && Array.isArray(result.data) ? JSON.stringify(result.data) : (result?.message || 'Failed to fetch foreign keys'),
          success: !!result?.success && Array.isArray(result.data),
        };
      } catch (error: any) {
        return { content: `获取外键关系失败: ${error?.message || error}`, success: false };
      }
    }
    case 'get_triggers': {
      const resolved = resolveConnectionOrFailure(connections, args.connectionId);
      if (resolved.failure || !resolved.connection) return resolved.failure || null;
      try {
        const safeDbName = args.dbName ? String(args.dbName).trim() : '';
        const safeTable = args.tableName ? String(args.tableName).trim() : '';
        const result = await runtime.getTriggers(buildRpcConnectionConfig(resolved.connection.config) as any, safeDbName, safeTable);
        return {
          content: result?.success && Array.isArray(result.data) ? JSON.stringify(result.data) : (result?.message || 'Failed to fetch triggers'),
          success: !!result?.success && Array.isArray(result.data),
        };
      } catch (error: any) {
        return { content: `获取触发器定义失败: ${error?.message || error}`, success: false };
      }
    }
    case 'get_table_ddl': {
      const resolved = resolveConnectionOrFailure(connections, args.connectionId);
      if (resolved.failure || !resolved.connection) return resolved.failure || null;
      try {
        const safeDbName = args.dbName ? String(args.dbName).trim() : '';
        const safeTable = args.tableName ? String(args.tableName).trim() : '';
        const rpcConfig = buildRpcConnectionConfig(resolved.connection.config) as any;
        const result = await resolveAITableSchemaToolResult({
          tableName: safeTable,
          fetchDDL: () => runtime.showCreateTable(rpcConfig, safeDbName, safeTable),
          fetchColumns: () => runtime.getColumns(rpcConfig, safeDbName, safeTable),
        });
        return { content: result.content, success: result.success };
      } catch (error: any) {
        return { content: `获取建表语句失败: ${error?.message || error}`, success: false };
      }
    }
    case 'inspect_table_bundle': {
      const resolved = resolveConnectionOrFailure(connections, args.connectionId);
      if (resolved.failure || !resolved.connection) return resolved.failure || null;
      try {
        const safeDbName = args.dbName ? String(args.dbName).trim() : '';
        const safeTable = args.tableName ? String(args.tableName).trim() : '';
        if (!safeTable) return { content: 'tableName 不能为空', success: false };
        const includeSampleRows = args.includeSampleRows === true;
        const sampleLimit = normalizePreviewLimit(args.sampleLimit ?? 10);
        const rpcConfig = buildRpcConnectionConfig(resolved.connection.config) as any;
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
            ? runtime.query(rpcConfig, safeDbName, buildPreviewSQLForTable(resolved.connection, safeTable, sampleLimit))
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
    }
    case 'inspect_database_bundle': {
      const resolved = resolveConnectionOrFailure(connections, args.connectionId);
      if (resolved.failure || !resolved.connection) return resolved.failure || null;
      try {
        const safeDbName = args.dbName ? String(args.dbName).trim() : '';
        if (!safeDbName) return { content: 'dbName 不能为空', success: false };
        const includeColumns = args.includeColumns !== false;
        const tableLimit = normalizeTableLimit(args.tableLimit);
        const perTableColumnLimit = normalizePerTableColumnLimit(args.perTableColumnLimit);
        const rpcConfig = buildRpcConnectionConfig(resolved.connection.config) as any;
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
    }
    case 'preview_table_rows': {
      const resolved = resolveConnectionOrFailure(connections, args.connectionId);
      if (resolved.failure || !resolved.connection) return resolved.failure || null;
      try {
        const safeDbName = args.dbName ? String(args.dbName).trim() : '';
        const safeTable = args.tableName ? String(args.tableName).trim() : '';
        if (!safeTable) return { content: 'tableName 不能为空', success: false };
        const safeLimit = normalizePreviewLimit(args.limit);
        const previewSQL = buildPreviewSQLForTable(resolved.connection, safeTable, safeLimit);
        const result = await runtime.query(buildRpcConnectionConfig(resolved.connection.config) as any, safeDbName, previewSQL);
        if (result?.success) {
          const rows = Array.isArray(result.data) ? result.data : [];
          return {
            content: JSON.stringify({
              dbName: safeDbName,
              tableName: safeTable,
              limit: safeLimit,
              rowCount: rows.length,
              rows: rows.slice(0, safeLimit),
            }),
            success: true,
          };
        }
        return { content: result?.message || 'Failed to preview table rows', success: false };
      } catch (error: any) {
        return { content: `预览表样例数据失败: ${error?.message || error}`, success: false };
      }
    }
    case 'execute_sql': {
      const resolved = resolveConnectionOrFailure(connections, args.connectionId);
      if (resolved.failure || !resolved.connection) return resolved.failure || null;
      try {
        const safeDbName = args.dbName ? String(args.dbName).trim() : '';
        const safeSql = args.sql ? String(args.sql).trim() : '';
        if (typeof runtime.checkSQL === 'function') {
          const checkResult = await runtime.checkSQL(safeSql);
          if (checkResult && checkResult.allowed === false) {
            return {
              content: `安全策略拦截：当前安全级别不允许执行 ${checkResult.operationType} 类型的 SQL。请将 SQL 展示给用户，让用户手动执行。`,
              success: false,
            };
          }
        }
        const finalSql = buildAIReadonlyPreviewSQL(
          resolved.connection.config?.type || '',
          safeSql,
          50,
          resolved.connection.config?.driver || '',
        );
        const result = await runtime.query(buildRpcConnectionConfig(resolved.connection.config) as any, safeDbName, finalSql);
        if (result?.success) {
          const rows = Array.isArray(result.data) ? result.data : [];
          return {
            content: JSON.stringify({ rowCount: rows.length, data: rows.slice(0, 50) }),
            success: true,
          };
        }
        return { content: result?.message || 'SQL 执行失败', success: false };
      } catch (error: any) {
        return { content: `SQL 执行异常: ${error?.message || error}`, success: false };
      }
    }
    default:
      return null;
  }
}
