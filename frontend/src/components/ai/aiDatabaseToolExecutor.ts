import type { SavedConnection } from '../../types';
import { buildRpcConnectionConfig } from '../../utils/connectionRpcConfig';
import { buildAIReadonlyPreviewSQL } from '../../utils/aiSqlLimit';
import { resolveAITableSchemaToolResult } from '../../utils/aiTableSchemaTool';
import type { AILocalToolRuntime, AIToolContextEntry } from './aiLocalToolRuntime';
import {
  buildPreviewSQLForTable,
  normalizeColumns,
  normalizeColumnsWithTable,
  normalizePreviewLimit,
  normalizeTableList,
} from './aiDatabaseToolHelpers';
import { inspectDatabaseBundle, inspectTableBundle } from './aiDatabaseBundleTools';

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
      return inspectTableBundle({ args, connection: resolved.connection, runtime });
    }
    case 'inspect_database_bundle': {
      const resolved = resolveConnectionOrFailure(connections, args.connectionId);
      if (resolved.failure || !resolved.connection) return resolved.failure || null;
      return inspectDatabaseBundle({ args, connection: resolved.connection, runtime });
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
