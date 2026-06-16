import React from 'react';
import { message } from 'antd';

import type { AIContextItem } from '../../types';
import { useStore } from '../../store';
import { buildRpcConnectionConfig } from '../../utils/connectionRpcConfig';
import { resolveAITableSchemaToolResult } from '../../utils/aiTableSchemaTool';
import { DBGetColumns, DBGetDatabases, DBGetTables, DBShowCreateTable } from '../../../wailsjs/go/app/App';

interface ActiveContextRef {
  connectionId?: string | null;
  dbName?: string | null;
}

interface UseAIChatContextBindingParams {
  activeContext: ActiveContextRef | null;
  activeContextItems: AIContextItem[];
  connectionKey: string;
  addAIContext: (connectionKey: string, item: AIContextItem) => void;
  removeAIContext: (connectionKey: string, dbName: string, tableName: string) => void;
}

export const useAIChatContextBinding = ({
  activeContext,
  activeContextItems,
  connectionKey,
  addAIContext,
  removeAIContext,
}: UseAIChatContextBindingParams) => {
  const [contextOpen, setContextOpen] = React.useState(false);
  const [contextLoading, setContextLoading] = React.useState(false);
  const [contextTables, setContextTables] = React.useState<{ name: string }[]>([]);
  const [selectedTableKeys, setSelectedTableKeys] = React.useState<string[]>([]);
  const [searchText, setSearchText] = React.useState('');
  const [appendingContext, setAppendingContext] = React.useState(false);
  const [dbList, setDbList] = React.useState<string[]>([]);
  const [selectedDbName, setSelectedDbName] = React.useState('');
  const [contextExpanded, setContextExpanded] = React.useState(false);

  const filteredTables = React.useMemo(
    () => contextTables.filter((table) => table.name.toLowerCase().includes(searchText.toLowerCase())),
    [contextTables, searchText],
  );

  const fetchTablesForDb = React.useCallback(async (dbName: string, connConfig: any) => {
    setContextLoading(true);
    setSelectedDbName(dbName);
    try {
      const res = await DBGetTables(buildRpcConnectionConfig(connConfig), dbName);
      if (res.success && Array.isArray(res.data)) {
        setContextTables(res.data.map((row) => ({ name: Object.values(row)[0] as string })));
      } else {
        message.error(`获取表格失败: ${res.message}`);
        setContextTables([]);
      }
    } catch (error: any) {
      message.error(error?.message || '获取表格失败');
      setContextTables([]);
    } finally {
      setContextLoading(false);
    }
  }, []);

  const handleOpenContext = React.useCallback(async () => {
    if (!activeContext?.connectionId) {
      message.warning('请先在左侧选择一个数据库作为所聊上下文');
      return;
    }

    const connection = useStore.getState().connections.find((item) => item.id === activeContext.connectionId);
    if (!connection) {
      return;
    }

    setContextOpen(true);
    setContextLoading(true);
    setSearchText('');
    setSelectedTableKeys(activeContextItems.map((item) => `${item.dbName}::${item.tableName}`));

    try {
      const dbRes = await DBGetDatabases(buildRpcConnectionConfig(connection.config) as any);
      if (dbRes.success && Array.isArray(dbRes.data)) {
        setDbList(dbRes.data.map((row: any) => Object.values(row)[0] as string));
      }

      const initialDbName = activeContext.dbName || '';
      setSelectedDbName(initialDbName);
      const tablesRes = await DBGetTables(buildRpcConnectionConfig(connection.config) as any, initialDbName);
      if (tablesRes.success && Array.isArray(tablesRes.data)) {
        setContextTables(tablesRes.data.map((row: any) => ({ name: Object.values(row)[0] as string })));
      } else {
        setContextTables([]);
      }
    } catch (error: any) {
      message.error(error?.message || '读取上下文表失败');
    } finally {
      setContextLoading(false);
    }
  }, [activeContext, activeContextItems]);

  const handleAppendContext = React.useCallback(async () => {
    if (!activeContext?.connectionId) {
      return;
    }

    const connection = useStore.getState().connections.find((item) => item.id === activeContext.connectionId);
    if (!connection) {
      return;
    }

    setAppendingContext(true);
    try {
      let addedCount = 0;
      let removedCount = 0;

      for (const item of activeContextItems) {
        const key = `${item.dbName}::${item.tableName}`;
        if (!selectedTableKeys.includes(key)) {
          removeAIContext(connectionKey, item.dbName, item.tableName);
          removedCount += 1;
        }
      }

      for (const key of selectedTableKeys) {
        const [dbName, tableName] = key.split('::');
        if (!dbName || !tableName) {
          continue;
        }

        if (activeContextItems.some((item) => item.dbName === dbName && item.tableName === tableName)) {
          continue;
        }

        const rpcConfig = buildRpcConnectionConfig(connection.config) as any;
        const schemaResult = await resolveAITableSchemaToolResult({
          tableName,
          fetchDDL: () => DBShowCreateTable(rpcConfig, dbName, tableName),
          fetchColumns: () => DBGetColumns(rpcConfig, dbName, tableName),
        });

        if (!schemaResult.success) {
          message.error(`获取表 ${dbName}.${tableName} 结构失败: ${schemaResult.content}`);
          continue;
        }

        if (schemaResult.content) {
          addAIContext(connectionKey, {
            dbName,
            tableName,
            ddl: schemaResult.content,
          });
          addedCount += 1;
        }
      }

      if (addedCount > 0 || removedCount > 0) {
        if (addedCount > 0 && removedCount === 0) {
          message.success(`已添加 ${addedCount} 张表的结构到上下文`);
        } else if (removedCount > 0 && addedCount === 0) {
          message.success(`已从上下文移除 ${removedCount} 张表的结构`);
        } else {
          message.success(`上下文已同步更新：新增 ${addedCount}，移除 ${removedCount}`);
        }
        if (addedCount > 0) {
          setContextExpanded(true);
        }
      } else {
        message.info('选中的表未发生变化');
      }
      setContextOpen(false);
    } catch (error: any) {
      message.error(error?.message || '同步 AI 上下文失败');
    } finally {
      setAppendingContext(false);
    }
  }, [activeContext, activeContextItems, addAIContext, connectionKey, removeAIContext, selectedTableKeys]);

  const handleDbChange = React.useCallback((value: string) => {
    const connection = useStore.getState().connections.find((item) => item.id === activeContext?.connectionId);
    if (connection) {
      void fetchTablesForDb(value, connection.config);
    }
  }, [activeContext?.connectionId, fetchTablesForDb]);

  const handleRemoveContextItem = React.useCallback((dbName: string, tableName: string) => {
    removeAIContext(connectionKey, dbName, tableName);
  }, [connectionKey, removeAIContext]);

  return {
    appendingContext,
    contextExpanded,
    contextLoading,
    contextOpen,
    dbList,
    filteredTables,
    handleAppendContext,
    handleDbChange,
    handleOpenContext,
    handleRemoveContextItem,
    searchText,
    selectedDbName,
    selectedTableKeys,
    setContextExpanded,
    setContextOpen,
    setSearchText,
    setSelectedTableKeys,
  };
};
