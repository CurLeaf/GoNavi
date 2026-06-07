import { DBGetDatabases, DBGetTables } from '../../../wailsjs/go/app/App';

import type { AIChatMessage, AIMCPToolDescriptor, AIToolCall, SavedConnection } from '../../types';
import { buildRpcConnectionConfig } from '../../utils/connectionRpcConfig';
import { buildAIReadonlyPreviewSQL } from '../../utils/aiSqlLimit';
import { resolveAITableSchemaToolResult } from '../../utils/aiTableSchemaTool';

export interface AIToolContextEntry {
  connectionId: string;
  dbName: string;
  tables: string[];
}

interface AILocalToolRuntime {
  getDatabases: (config: any) => Promise<any>;
  getTables: (config: any, dbName: string) => Promise<any>;
  getColumns: (config: any, dbName: string, tableName: string) => Promise<any>;
  getIndexes: (config: any, dbName: string, tableName: string) => Promise<any>;
  getForeignKeys: (config: any, dbName: string, tableName: string) => Promise<any>;
  getTriggers: (config: any, dbName: string, tableName: string) => Promise<any>;
  showCreateTable: (config: any, dbName: string, tableName: string) => Promise<any>;
  query: (config: any, dbName: string, sql: string) => Promise<any>;
  checkSQL?: (sql: string) => Promise<{ allowed?: boolean; operationType?: string } | undefined>;
  callMCPTool?: (name: string, args: string) => Promise<{ content?: string; isError?: boolean } | undefined>;
}

export interface ExecuteLocalAIToolCallOptions {
  toolCall: AIToolCall;
  connections: SavedConnection[];
  mcpTools: AIMCPToolDescriptor[];
  toolContextMap: Map<string, AIToolContextEntry>;
  runtime?: Partial<AILocalToolRuntime>;
}

export interface ExecuteLocalAIToolCallResult {
  content: string;
  success: boolean;
  toolName: string;
}

const buildDefaultRuntime = (): AILocalToolRuntime => ({
  getDatabases: DBGetDatabases,
  getTables: DBGetTables,
  getColumns: async (config, dbName, tableName) => {
    const mod = await import('../../../wailsjs/go/app/App');
    return mod.DBGetColumns(config, dbName, tableName);
  },
  getIndexes: async (config, dbName, tableName) => {
    const mod = await import('../../../wailsjs/go/app/App');
    return mod.DBGetIndexes(config, dbName, tableName);
  },
  getForeignKeys: async (config, dbName, tableName) => {
    const mod = await import('../../../wailsjs/go/app/App');
    return mod.DBGetForeignKeys(config, dbName, tableName);
  },
  getTriggers: async (config, dbName, tableName) => {
    const mod = await import('../../../wailsjs/go/app/App');
    return mod.DBGetTriggers(config, dbName, tableName);
  },
  showCreateTable: async (config, dbName, tableName) => {
    const mod = await import('../../../wailsjs/go/app/App');
    return mod.DBShowCreateTable(config, dbName, tableName);
  },
  query: async (config, dbName, sql) => {
    const mod = await import('../../../wailsjs/go/app/App');
    return mod.DBQuery(config, dbName, sql);
  },
  checkSQL: async (sql) => {
    const service = (window as any).go?.aiservice?.Service;
    if (typeof service?.AICheckSQL !== 'function') {
      return undefined;
    }
    return service.AICheckSQL(sql);
  },
  callMCPTool: async (name, args) => {
    const service = (window as any).go?.aiservice?.Service;
    if (typeof service?.AICallMCPTool !== 'function') {
      return undefined;
    }
    return service.AICallMCPTool(name, args);
  },
});

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

const buildToolName = (toolCall: AIToolCall, descriptor?: AIMCPToolDescriptor) =>
  descriptor?.title || descriptor?.originalName || toolCall.function.name;

const findConnection = (connections: SavedConnection[], connectionId: string) =>
  connections.find((connection) => connection.id === connectionId);

export async function executeLocalAIToolCall({
  toolCall,
  connections,
  mcpTools,
  toolContextMap,
  runtime,
}: ExecuteLocalAIToolCallOptions): Promise<ExecuteLocalAIToolCallResult> {
  const mergedRuntime = { ...buildDefaultRuntime(), ...(runtime || {}) };
  const descriptor = mcpTools.find((tool) => tool.alias === toolCall.function.name);
  let content = '';
  let success = false;

  try {
    const args = JSON.parse(toolCall.function.arguments || '{}');
    switch (toolCall.function.name) {
      case 'get_connections': {
        const availableConnections = connections.map((connection) => ({
          id: connection.id,
          name: connection.name,
          type: connection.config?.type,
          host: (connection.config as any)?.host || (connection.config as any)?.addr || '',
        }));
        content = JSON.stringify(availableConnections);
        success = true;
        break;
      }
      case 'get_databases': {
        const connection = findConnection(connections, args.connectionId);
        if (!connection) {
          content = 'Connection not found';
          break;
        }
        try {
          const result = await mergedRuntime.getDatabases(buildRpcConnectionConfig(connection.config) as any);
          if (result?.success && Array.isArray(result.data)) {
            let databaseNames = result.data.map((row: any) => row.Database || row.database || Object.values(row)[0]);
            if (databaseNames.length > 50) {
              databaseNames = [...databaseNames.slice(0, 50), '...(截断)'];
            }
            content = JSON.stringify(databaseNames);
            success = true;
          } else {
            content = result?.message || 'Failed to fetch DBs';
          }
        } catch (error: any) {
          content = `获取数据库列表失败: ${error?.message || error}`;
        }
        break;
      }
      case 'get_tables': {
        const connection = findConnection(connections, args.connectionId);
        if (!connection) {
          content = 'Connection not found';
          break;
        }
        try {
          const rawDbName = args.dbName || args.database;
          const safeDbName = rawDbName ? String(rawDbName).trim() : '';
          const result = await mergedRuntime.getTables(buildRpcConnectionConfig(connection.config) as any, safeDbName);
          if (result?.success && Array.isArray(result.data)) {
            let tableNames = normalizeTableList(result.data);
            if (tableNames.length > 150) {
              tableNames = [...tableNames.slice(0, 150), '...(截断)'];
            }
            content = JSON.stringify(tableNames);
            success = true;
            toolContextMap.set(`${args.connectionId}:${safeDbName}`, {
              connectionId: args.connectionId,
              dbName: safeDbName,
              tables: tableNames.filter((tableName) => tableName !== '...(截断)'),
            });
          } else {
            content = result?.message || 'Failed to fetch Tables';
          }
        } catch (error: any) {
          content = `获取表列表失败: ${error?.message || error}`;
        }
        break;
      }
      case 'get_columns': {
        const connection = findConnection(connections, args.connectionId);
        if (!connection) {
          content = 'Connection not found';
          break;
        }
        try {
          const safeDbName = args.dbName ? String(args.dbName).trim() : '';
          const safeTable = args.tableName ? String(args.tableName).trim() : '';
          const result = await mergedRuntime.getColumns(buildRpcConnectionConfig(connection.config) as any, safeDbName, safeTable);
          if (result?.success && Array.isArray(result.data)) {
            const columns = normalizeColumns(result.data);
            const fieldNames = columns.map((column) => column.field).join(', ');
            content = `⚠️ 以下为 ${safeTable} 表的真实字段列表。生成 SQL 时只能使用这些 field 值作为列名，必须原样使用，禁止修改、缩写或自行拼凑字段名。\n可用字段：${fieldNames}\n详细信息：${JSON.stringify(columns)}`;
            success = true;
          } else {
            content = result?.message || 'Failed to fetch columns';
          }
        } catch (error: any) {
          content = `获取字段列表失败: ${error?.message || error}`;
        }
        break;
      }
      case 'get_indexes': {
        const connection = findConnection(connections, args.connectionId);
        if (!connection) {
          content = 'Connection not found';
          break;
        }
        try {
          const safeDbName = args.dbName ? String(args.dbName).trim() : '';
          const safeTable = args.tableName ? String(args.tableName).trim() : '';
          const result = await mergedRuntime.getIndexes(buildRpcConnectionConfig(connection.config) as any, safeDbName, safeTable);
          if (result?.success && Array.isArray(result.data)) {
            content = JSON.stringify(result.data);
            success = true;
          } else {
            content = result?.message || 'Failed to fetch indexes';
          }
        } catch (error: any) {
          content = `获取索引定义失败: ${error?.message || error}`;
        }
        break;
      }
      case 'get_foreign_keys': {
        const connection = findConnection(connections, args.connectionId);
        if (!connection) {
          content = 'Connection not found';
          break;
        }
        try {
          const safeDbName = args.dbName ? String(args.dbName).trim() : '';
          const safeTable = args.tableName ? String(args.tableName).trim() : '';
          const result = await mergedRuntime.getForeignKeys(buildRpcConnectionConfig(connection.config) as any, safeDbName, safeTable);
          if (result?.success && Array.isArray(result.data)) {
            content = JSON.stringify(result.data);
            success = true;
          } else {
            content = result?.message || 'Failed to fetch foreign keys';
          }
        } catch (error: any) {
          content = `获取外键关系失败: ${error?.message || error}`;
        }
        break;
      }
      case 'get_triggers': {
        const connection = findConnection(connections, args.connectionId);
        if (!connection) {
          content = 'Connection not found';
          break;
        }
        try {
          const safeDbName = args.dbName ? String(args.dbName).trim() : '';
          const safeTable = args.tableName ? String(args.tableName).trim() : '';
          const result = await mergedRuntime.getTriggers(buildRpcConnectionConfig(connection.config) as any, safeDbName, safeTable);
          if (result?.success && Array.isArray(result.data)) {
            content = JSON.stringify(result.data);
            success = true;
          } else {
            content = result?.message || 'Failed to fetch triggers';
          }
        } catch (error: any) {
          content = `获取触发器定义失败: ${error?.message || error}`;
        }
        break;
      }
      case 'get_table_ddl': {
        const connection = findConnection(connections, args.connectionId);
        if (!connection) {
          content = 'Connection not found';
          break;
        }
        try {
          const safeDbName = args.dbName ? String(args.dbName).trim() : '';
          const safeTable = args.tableName ? String(args.tableName).trim() : '';
          const rpcConfig = buildRpcConnectionConfig(connection.config) as any;
          const result = await resolveAITableSchemaToolResult({
            tableName: safeTable,
            fetchDDL: () => mergedRuntime.showCreateTable(rpcConfig, safeDbName, safeTable),
            fetchColumns: () => mergedRuntime.getColumns(rpcConfig, safeDbName, safeTable),
          });
          content = result.content;
          success = result.success;
        } catch (error: any) {
          content = `获取建表语句失败: ${error?.message || error}`;
        }
        break;
      }
      case 'execute_sql': {
        const connection = findConnection(connections, args.connectionId);
        if (!connection) {
          content = 'Connection not found';
          break;
        }
        try {
          const safeDbName = args.dbName ? String(args.dbName).trim() : '';
          const safeSql = args.sql ? String(args.sql).trim() : '';
          if (typeof mergedRuntime.checkSQL === 'function') {
            const checkResult = await mergedRuntime.checkSQL(safeSql);
            if (checkResult && checkResult.allowed === false) {
              content = `安全策略拦截：当前安全级别不允许执行 ${checkResult.operationType} 类型的 SQL。请将 SQL 展示给用户，让用户手动执行。`;
              break;
            }
          }
          const finalSql = buildAIReadonlyPreviewSQL(connection.config?.type || '', safeSql, 50, connection.config?.driver || '');
          const result = await mergedRuntime.query(buildRpcConnectionConfig(connection.config) as any, safeDbName, finalSql);
          if (result?.success) {
            const rows = Array.isArray(result.data) ? result.data : [];
            content = JSON.stringify({ rowCount: rows.length, data: rows.slice(0, 50) });
            success = true;
          } else {
            content = result?.message || 'SQL 执行失败';
          }
        } catch (error: any) {
          content = `SQL 执行异常: ${error?.message || error}`;
        }
        break;
      }
      default: {
        if (!descriptor) {
          content = `Unknown function: ${toolCall.function.name}`;
          break;
        }
        try {
          const result = await mergedRuntime.callMCPTool?.(toolCall.function.name, toolCall.function.arguments || '{}');
          content = String(result?.content || (result?.isError ? 'MCP 工具调用失败' : ''));
          success = !!result && !result.isError;
        } catch (error: any) {
          content = `MCP 工具调用失败: ${error?.message || error}`;
        }
        break;
      }
    }
  } catch (error: any) {
    content = error?.message || String(error);
  }

  return {
    content,
    success,
    toolName: buildToolName(toolCall, descriptor),
  };
}

export function buildToolResultMessage(params: {
  id: string;
  timestamp: number;
  toolCall: AIToolCall;
  execution: ExecuteLocalAIToolCallResult;
}): AIChatMessage {
  const { id, timestamp, toolCall, execution } = params;
  return {
    id,
    role: 'tool',
    content: execution.content,
    timestamp,
    tool_call_id: toolCall.id,
    tool_name: execution.toolName,
    success: execution.success,
  };
}
