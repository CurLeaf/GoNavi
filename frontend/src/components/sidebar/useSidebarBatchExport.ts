import { useEffect, useMemo, useState, type MutableRefObject } from 'react';
import { Modal, message } from 'antd';

import { DBGetDatabases, DBGetTables } from '../../../wailsjs/go/app/App';
import type { SavedConnection } from '../../types';
import { t } from '../../i18n';
import { buildRpcConnectionConfig } from '../../utils/connectionRpcConfig';
import type { SidebarViewMetadataEntry } from '../../utils/sidebarMetadata';
import {
  buildBatchDatabaseExportWorkbenchTab,
  buildBatchTableExportWorkbenchTab,
} from '../../utils/tableExportTab';
import {
  buildSidebarObjectKeyName,
  getMetadataDialect,
  getSidebarTableDisplayName,
  loadViews,
} from './sidebarMetadataLoaders';

export type BatchTableExportMode = 'schema' | 'backup' | 'dataOnly';
export type BatchObjectType = 'table' | 'view';
export type BatchObjectFilterType = 'all' | BatchObjectType;
export type BatchSelectionScope = 'filtered' | 'all';

export interface BatchObjectItem {
  title: string;
  key: string;
  objectName: string;
  objectType: BatchObjectType;
  dataRef: any;
}

interface UseSidebarBatchExportArgs {
  connections: SavedConnection[];
  selectedNodesRef: MutableRefObject<any[]>;
  addTab: (tab: any) => void;
  addSqlLog: (log: any) => void;
}

export const useSidebarBatchExport = ({
  connections,
  selectedNodesRef,
  addTab,
  addSqlLog,
}: UseSidebarBatchExportArgs) => {
  // Batch Operations Modal
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchTables, setBatchTables] = useState<BatchObjectItem[]>([]);
  const [checkedTableKeys, setCheckedTableKeys] = useState<string[]>([]);
  const [batchDbContext, setBatchDbContext] = useState<any>(null);
  const [selectedConnection, setSelectedConnection] = useState<string>('');
  const [selectedDatabase, setSelectedDatabase] = useState<string>('');
  const [availableDatabases, setAvailableDatabases] = useState<any[]>([]);
  const [batchFilterKeyword, setBatchFilterKeyword] = useState<string>('');
  const [batchFilterType, setBatchFilterType] = useState<BatchObjectFilterType>('all');
  const [batchSelectionScope, setBatchSelectionScope] = useState<BatchSelectionScope>('filtered');
  const filteredBatchObjects = useMemo(() => {
      const keyword = batchFilterKeyword.trim().toLowerCase();
      return batchTables.filter((item) => {
          if (batchFilterType !== 'all' && item.objectType !== batchFilterType) {
              return false;
          }
          if (!keyword) {
              return true;
          }
          return item.title.toLowerCase().includes(keyword) || item.objectName.toLowerCase().includes(keyword);
      });
  }, [batchFilterKeyword, batchFilterType, batchTables]);
  const groupedBatchObjects = useMemo(() => {
      const tables = filteredBatchObjects.filter(item => item.objectType === 'table');
      const views = filteredBatchObjects.filter(item => item.objectType === 'view');
      return { tables, views };
  }, [filteredBatchObjects]);
  const allBatchObjectKeys = useMemo(() => batchTables.map(item => item.key), [batchTables]);
  const allBatchObjectKeysByType = useMemo(() => {
      if (batchFilterType === 'all') {
          return allBatchObjectKeys;
      }
      return batchTables
          .filter((item) => item.objectType === batchFilterType)
          .map((item) => item.key);
  }, [allBatchObjectKeys, batchFilterType, batchTables]);
  const filteredBatchObjectKeys = useMemo(() => filteredBatchObjects.map(item => item.key), [filteredBatchObjects]);
  const selectionScopeTargetKeys = useMemo(
      () => (batchSelectionScope === 'filtered' ? filteredBatchObjectKeys : allBatchObjectKeysByType),
      [allBatchObjectKeysByType, batchSelectionScope, filteredBatchObjectKeys]
  );
  useEffect(() => {
      if (batchFilterType === 'all') {
          return;
      }
      const allowed = new Set(allBatchObjectKeysByType);
      setCheckedTableKeys((prev) => prev.filter((key) => allowed.has(key)));
  }, [allBatchObjectKeysByType, batchFilterType]);

  // Batch Database Operations Modal
  const [isBatchDbModalOpen, setIsBatchDbModalOpen] = useState(false);
  const [batchDatabases, setBatchDatabases] = useState<any[]>([]);
  const [checkedDbKeys, setCheckedDbKeys] = useState<string[]>([]);
  const [batchConnContext, setBatchConnContext] = useState<any>(null);
  const [selectedDbConnection, setSelectedDbConnection] = useState<string>('');


  const normalizeConnConfig = (raw: any) => (
      buildRpcConnectionConfig(raw)
  );

  const handleExportDatabaseSQL = async (node: any, includeData: boolean) => {
      const conn = node.dataRef;
      const dbName = conn.dbName || node.title;
      const hide = message.loading(
          includeData
              ? t('sidebar.message.exporting_database_backup', { database: dbName })
              : t('sidebar.message.exporting_database_schema', { database: dbName }),
          0,
      );
      try {
          const res = await (window as any).go.app.App.ExportDatabaseSQL(normalizeConnConfig(conn.config), dbName, includeData);
          hide();
          if (res.success) {
              message.success(t('sidebar.message.export_success'));
          } else if (res.message !== '已取消') {
              message.error(t('sidebar.message.export_failed', { error: res.message }));
          }
      } catch (e: any) {
          hide();
          message.error(t('sidebar.message.export_failed', { error: e?.message || String(e) }));
      }
  };

  const handleExportSchemaSQL = async (node: any, includeData: boolean) => {
      const conn = node?.dataRef;
      const dbName = String(conn?.dbName || '').trim();
      const schemaName = String(conn?.schemaName || '').trim();
      if (!conn || !dbName || !schemaName) {
          message.error(t('sidebar.message.schema_export_target_missing'));
          return;
      }
      const hide = message.loading(
          includeData
              ? t('sidebar.message.exporting_schema_backup', { schema: schemaName })
              : t('sidebar.message.exporting_schema_structure', { schema: schemaName }),
          0,
      );
      try {
          const res = await (window as any).go.app.App.ExportSchemaSQL(
              buildRpcConnectionConfig(conn.config, { database: dbName }) as any,
              dbName,
              schemaName,
              includeData,
          );
          hide();
          if (res.success) {
              message.success(t('sidebar.message.export_success'));
          } else if (res.message !== '已取消') {
              message.error(t('sidebar.message.export_failed', { error: res.message }));
          }
      } catch (e: any) {
          hide();
          message.error(t('sidebar.message.export_failed', { error: e?.message || String(e) }));
      }
  };

  const handleExportTablesSQL = async (nodes: any[], includeData: boolean) => {
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0].dataRef;
      const dbName = first.dbName;
      const connId = first.id;
      const allSame = nodes.every(n => n?.dataRef?.id === connId && n?.dataRef?.dbName === dbName);
      if (!allSame) {
          message.error(t('sidebar.message.export_tables_same_database_required'));
          return;
      }

      const tableNames = nodes.map(n => n.dataRef.tableName).filter(Boolean);
      const hide = message.loading(
          includeData
              ? t('sidebar.message.backing_up_selected_tables', { count: tableNames.length })
              : t('sidebar.message.exporting_selected_table_schema', { count: tableNames.length }),
          0,
      );
      try {
          const res = await (window as any).go.app.App.ExportTablesSQL(normalizeConnConfig(first.config), dbName, tableNames, includeData);
          hide();
          if (res.success) {
              message.success(t('sidebar.message.export_success'));
          } else if (res.message !== '已取消') {
              message.error(t('sidebar.message.export_failed', { error: res.message }));
          }
      } catch (e: any) {
          hide();
          message.error(t('sidebar.message.export_failed', { error: e?.message || String(e) }));
      }
  };

  const openBatchOperationModal = async () => {
      // Check if current selected node is database or table
      let connId = '';
      let dbName = '';

      if (selectedNodesRef.current.length > 0) {
          const node = selectedNodesRef.current[0];
          if (node.type === 'database') {
              connId = node.dataRef.id;
              dbName = node.title;
          } else if (node.type === 'table' || node.type === 'view' || node.type === 'materialized-view') {
              connId = node.dataRef.id;
              dbName = node.dataRef.dbName;
          }
      }

      setSelectedConnection(connId);
      setSelectedDatabase(dbName);
      setBatchTables([]);
      setCheckedTableKeys([]);
      setAvailableDatabases([]);
      setBatchFilterKeyword('');
      setBatchFilterType('all');
      setBatchSelectionScope('filtered');

      if (connId) {
          const conn = connections.find(c => c.id === connId);
          if (conn) {
              await loadDatabasesForBatch(conn);
              if (dbName) {
                  await loadTablesForBatch(conn, dbName);
              }
          }
      }

      setIsBatchModalOpen(true);
  };

  const openBatchTableExportWorkbench = () => {
      let connId = '';
      let dbName = '';

      if (selectedNodesRef.current.length > 0) {
          const node = selectedNodesRef.current[0];
          if (node.type === 'connection' && node.dataRef?.config?.type !== 'redis') {
              connId = node.key as string;
          } else if (node.type === 'database') {
              connId = node.dataRef.id;
              dbName = node.title;
          } else if (node.type === 'table' || node.type === 'view' || node.type === 'materialized-view') {
              connId = node.dataRef.id;
              dbName = node.dataRef.dbName;
          }
      }

      addTab(buildBatchTableExportWorkbenchTab({
          connectionId: connId,
          dbName: dbName || undefined,
          title: dbName ? `批量导出 ${dbName} 对象` : '批量导出对象',
      }));
  };

	  const loadDatabasesForBatch = async (conn: SavedConnection) => {
	      const config = {
          ...conn.config,
          port: Number(conn.config.port),
          password: conn.config.password || "",
          database: conn.config.database || "",
          useSSH: conn.config.useSSH || false,
          ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
      };

      const res = await DBGetDatabases(buildRpcConnectionConfig(config) as any);
      if (res.success) {
          const dbRows: any[] = Array.isArray(res.data) ? res.data : [];
          let dbs = dbRows.map((row: any) => {
              const dbName = row.Database || row.database;
              return {
                  title: dbName,
                  key: `${conn.id}-${dbName}`,
                  dbName: dbName
              };
          });

          if (conn.includeDatabases && conn.includeDatabases.length > 0) {
              dbs = dbs.filter(db => conn.includeDatabases!.includes(db.dbName));
          }

          setAvailableDatabases(dbs);
      } else {
          message.error(t('sidebar.message.load_database_list_failed', { error: res.message }));
      }
  };

  const loadTablesForBatch = async (conn: SavedConnection, dbName: string) => {
      setBatchDbContext({ conn, dbName });

      const config = {
          ...conn.config,
          port: Number(conn.config.port),
          password: conn.config.password || "",
          database: conn.config.database || "",
          useSSH: conn.config.useSSH || false,
          ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
      };

      const [res, viewResult] = await Promise.all([
          DBGetTables(buildRpcConnectionConfig(config) as any, dbName),
          loadViews(conn, dbName).catch(() => ({ views: [], supported: false })),
      ]);

      if (!res.success) {
          message.error(t('sidebar.message.load_table_list_failed', { error: res.message }));
          return;
      }

      const tableRows: any[] = Array.isArray(res.data) ? res.data : [];
      const viewRows: SidebarViewMetadataEntry[] = Array.isArray(viewResult.views) ? viewResult.views : [];
      const viewSet = new Set(
          viewRows.flatMap((view) => {
              const names = [view.viewName.toLowerCase()];
              if (view.schemaName && !view.viewName.includes('.')) {
                  names.push(`${view.schemaName}.${view.viewName}`.toLowerCase());
              }
              return names;
          })
      );

      const tableObjects: BatchObjectItem[] = tableRows
          .map((row: any) => Object.values(row)[0] as string)
          .filter((tableName: string) => !viewSet.has(tableName.toLowerCase()))
          .map((tableName: string) => ({
              title: getSidebarTableDisplayName(conn, tableName),
              key: `${conn.id}-${dbName}-table-${tableName}`,
              objectName: tableName,
              objectType: 'table' as const,
              dataRef: { ...conn, tableName, dbName, objectType: 'table' },
          }));

      const viewObjects: BatchObjectItem[] = viewRows.map((view) => {
          const keyName = buildSidebarObjectKeyName(dbName, view.schemaName, view.viewName);
          return {
              title: getSidebarTableDisplayName(conn, view.viewName),
              key: `${conn.id}-${dbName}-view-${keyName}`,
              objectName: view.viewName,
              objectType: 'view' as const,
              dataRef: { ...conn, tableName: view.viewName, schemaName: view.schemaName, dbName, objectType: 'view' },
          };
      });

      tableObjects.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
      viewObjects.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));

      setBatchTables([...tableObjects, ...viewObjects]);
      setCheckedTableKeys([]);
  };

  const handleConnectionChange = async (connId: string) => {
      setSelectedConnection(connId);
      setSelectedDatabase('');
      setBatchTables([]);
      setCheckedTableKeys([]);
      setBatchFilterKeyword('');
      setBatchFilterType('all');
      setBatchSelectionScope('filtered');

      const conn = connections.find(c => c.id === connId);
      if (conn) {
          await loadDatabasesForBatch(conn);
      }
  };

  const handleDatabaseChange = async (dbName: string) => {
      setSelectedDatabase(dbName);
      setBatchFilterKeyword('');
      setBatchFilterType('all');
      setBatchSelectionScope('filtered');

      const conn = connections.find(c => c.id === selectedConnection);
      if (conn && dbName) {
          await loadTablesForBatch(conn, dbName);
      }
  };

  const handleBatchExport = async (mode: BatchTableExportMode) => {
      const selectedObjects = batchTables.filter(t => checkedTableKeys.includes(t.key));
      if (selectedObjects.length === 0) {
          message.warning(t('sidebar.message.select_object_required'));
          return;
      }

      setIsBatchModalOpen(false);

      const { conn, dbName } = batchDbContext;
      const objectNames = selectedObjects.map(t => t.objectName);
      const selectedViewCount = selectedObjects.filter(item => item.objectType === 'view').length;

      const loadingText = mode === 'backup'
          ? t('sidebar.message.backing_up_selected_objects', { count: objectNames.length })
          : mode === 'dataOnly'
              ? t('sidebar.message.exporting_selected_object_data', { count: objectNames.length, format: 'INSERT' })
              : t('sidebar.message.exporting_selected_object_schema', { count: objectNames.length });
      const hide = message.loading(loadingText, 0);
      try {
          const app = (window as any).go.app.App;
          const res = mode === 'dataOnly'
              ? await app.ExportTablesDataSQL(normalizeConnConfig(conn.config), dbName, objectNames)
              : await app.ExportTablesSQL(normalizeConnConfig(conn.config), dbName, objectNames, mode === 'backup');
          hide();
          if (res.success) {
              if (mode !== 'schema' && selectedViewCount > 0) {
                  message.success(t('sidebar.message.export_success_skipped_views', { count: selectedViewCount }));
              } else {
                  message.success(t('sidebar.message.export_success'));
              }
          } else if (res.message !== '已取消') {
              message.error(t('sidebar.message.export_failed', { error: res.message }));
          }
      } catch (e: any) {
          hide();
          message.error(t('sidebar.message.export_failed', { error: e?.message || String(e) }));
      }
  };

  const handleBatchClear = async () => {
      const selectedObjects = batchTables.filter(t => checkedTableKeys.includes(t.key));
      if (selectedObjects.length === 0) {
          message.warning(t('sidebar.message.select_object_required'));
          return;
      }

      const { conn, dbName } = batchDbContext;
      const objectNames = selectedObjects.map(t => t.objectName);

      const ok = await new Promise<boolean>((resolve) => {
          Modal.confirm({
              title: t('sidebar.modal.confirm_clear_selected_tables.title'),
              content: t('sidebar.modal.confirm_clear_selected_tables.content', {
                  connection: conn.name,
                  database: dbName,
              }),
              okText: t('sidebar.action.continue'),
              cancelText: t('sidebar.action.cancel'),
              onOk: () => resolve(true),
              onCancel: () => resolve(false),
          });
      });
      if (!ok) return;

      setIsBatchModalOpen(false);
      const hide = message.loading(t('sidebar.message.clearing_selected_tables', { count: objectNames.length }), 0);
      const startTime = Date.now();
      try {
          const app = (window as any).go.app.App;
          const res = await app.ClearTables(normalizeConnConfig(conn.config), dbName, objectNames);
          hide();
          const duration = Date.now() - startTime;
          if (res.success) {
              message.success(t('sidebar.message.clear_success'));
              // 构造 SQL 日志
              let logSql = `/* Clear Tables (${objectNames.length} tables) */\n`;
              if (res.data && res.data.executedSQLs && Array.isArray(res.data.executedSQLs)) {
                  logSql += res.data.executedSQLs.join(';\n') + ';';
              } else {
                  logSql += objectNames.map(name => name).join('; ');
              }
              addSqlLog({
                  id: Date.now().toString(),
                  timestamp: Date.now(),
                  sql: logSql,
                  status: 'success',
                  duration,
                  message: res.message,
                  dbName,
                  affectedRows: res.data?.count || 0
              });
          } else if (res.message !== '已取消') {
              message.error(t('sidebar.message.clear_failed', { error: res.message }));
              // 记录失败的日志
              let logSql = `/* Clear Tables (${objectNames.length} tables) - FAILED */\n`;
              if (res.data && res.data.executedSQLs && Array.isArray(res.data.executedSQLs)) {
                  logSql += res.data.executedSQLs.join(';\n') + ';';
              } else {
                  logSql += objectNames.map(name => name).join('; ');
              }
              addSqlLog({
                  id: Date.now().toString(),
                  timestamp: Date.now(),
                  sql: logSql,
                  status: 'error',
                  duration,
                  message: res.message,
                  dbName
              });
          }
      } catch (e: any) {
          const duration = Date.now() - startTime;
          hide();
          const errMsg = e?.message || String(e);
          message.error(t('sidebar.message.clear_failed', { error: errMsg }));
          // 记录异常的日志
          let logSql = `/* Clear Tables (${objectNames.length} tables) - ERROR */\n`;
          logSql += objectNames.map(name => name).join('; ');
          addSqlLog({
              id: Date.now().toString(),
              timestamp: Date.now(),
              sql: logSql,
              status: 'error',
              duration,
              message: errMsg,
              dbName
          });
      }
  };

  const handleCheckAll = (checked: boolean) => {
      if (batchSelectionScope === 'all') {
          setCheckedTableKeys(checked ? allBatchObjectKeys : []);
          return;
      }
      if (filteredBatchObjectKeys.length === 0) {
          return;
      }
      if (checked) {
          setCheckedTableKeys(prev => {
              const nextSet = new Set(prev);
              filteredBatchObjectKeys.forEach((key) => nextSet.add(key));
              return allBatchObjectKeys.filter((key) => nextSet.has(key));
          });
          return;
      }
      const filteredKeySet = new Set(filteredBatchObjectKeys);
      setCheckedTableKeys(prev => prev.filter((key) => !filteredKeySet.has(key)));
  };

  const handleInvertSelection = () => {
      if (batchSelectionScope === 'all') {
          setCheckedTableKeys(prev => allBatchObjectKeys.filter((key) => !prev.includes(key)));
          return;
      }
      if (filteredBatchObjectKeys.length === 0) {
          return;
      }
      setCheckedTableKeys(prev => {
          const nextSet = new Set(prev);
          filteredBatchObjectKeys.forEach((key) => {
              if (nextSet.has(key)) {
                  nextSet.delete(key);
              } else {
                  nextSet.add(key);
              }
          });
          return allBatchObjectKeys.filter((key) => nextSet.has(key));
      });
  };

  const openBatchDatabaseModal = async () => {
      // Check if current selected node is connection or database
      let connId = '';

      if (selectedNodesRef.current.length > 0) {
          const node = selectedNodesRef.current[0];
          if (node.type === 'connection' && node.dataRef?.config?.type !== 'redis') {
              connId = node.key as string;
          } else if (node.type === 'database') {
              connId = node.dataRef.id;
          } else if (node.type === 'table') {
              connId = node.dataRef.id;
          }
      }

      setSelectedDbConnection(connId);
      setBatchDatabases([]);
      setCheckedDbKeys([]);

      if (connId) {
          const conn = connections.find(c => c.id === connId);
          if (conn) {
              await loadDatabasesForDbBatch(conn);
          }
      }

      setIsBatchDbModalOpen(true);
  };

  const openBatchDatabaseExportWorkbench = () => {
      let connId = '';

      if (selectedNodesRef.current.length > 0) {
          const node = selectedNodesRef.current[0];
          if (node.type === 'connection' && node.dataRef?.config?.type !== 'redis') {
              connId = node.key as string;
          } else if (node.type === 'database' || node.type === 'table' || node.type === 'view' || node.type === 'materialized-view') {
              connId = node.dataRef.id;
          }
      }

      addTab(buildBatchDatabaseExportWorkbenchTab({
          connectionId: connId,
          title: '批量导出库',
      }));
  };

	  const loadDatabasesForDbBatch = async (conn: SavedConnection) => {
	      setBatchConnContext(conn);

	      const config = {
          ...conn.config,
          port: Number(conn.config.port),
          password: conn.config.password || "",
          database: conn.config.database || "",
          useSSH: conn.config.useSSH || false,
          ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
      };

      const res = await DBGetDatabases(buildRpcConnectionConfig(config) as any);
      if (res.success) {
          const dbRows: any[] = Array.isArray(res.data) ? res.data : [];
          let dbs = dbRows.map((row: any) => {
              const dbName = row.Database || row.database;
              return {
                  title: dbName,
                  key: `${conn.id}-${dbName}`,
                  dbName: dbName,
                  dataRef: { ...conn, dbName }
              };
          });

          if (conn.includeDatabases && conn.includeDatabases.length > 0) {
              dbs = dbs.filter(db => conn.includeDatabases!.includes(db.dbName));
          }

          setBatchDatabases(dbs);
          setCheckedDbKeys([]);
      } else {
          message.error(t('sidebar.message.load_database_list_failed', { error: res.message }));
      }
  };

  const handleDbConnectionChange = async (connId: string) => {
      setSelectedDbConnection(connId);

      const conn = connections.find(c => c.id === connId);
      if (conn) {
          await loadDatabasesForDbBatch(conn);
      }
  };

  const handleBatchDbExport = async (includeData: boolean) => {
      const selectedDbs = batchDatabases.filter(db => checkedDbKeys.includes(db.key));
      if (selectedDbs.length === 0) {
          message.warning(t('sidebar.message.select_database_required'));
          return;
      }

      setIsBatchDbModalOpen(false);

      for (const db of selectedDbs) {
          const hide = message.loading(
              includeData
                  ? t('sidebar.message.exporting_database_backup', { database: db.dbName })
                  : t('sidebar.message.exporting_database_schema', { database: db.dbName }),
              0,
          );
          try {
              const res = await (window as any).go.app.App.ExportDatabaseSQL(normalizeConnConfig(batchConnContext.config), db.dbName, includeData);
              hide();
              if (res.success) {
                  message.success(t('sidebar.message.database_export_success', { database: db.dbName }));
              } else if (res.message !== '已取消') {
                  message.error(t('sidebar.message.database_export_failed', { database: db.dbName, error: res.message }));
                  break;
              } else {
                  break; // User cancelled
              }
          } catch (e: any) {
              hide();
              message.error(t('sidebar.message.database_export_failed', { database: db.dbName, error: e?.message || String(e) }));
              break;
          }
      }
  };

  const handleCheckAllDb = (checked: boolean) => {
      if (checked) {
          setCheckedDbKeys(batchDatabases.map(db => db.key));
      } else {
          setCheckedDbKeys([]);
      }
  };

  const handleInvertSelectionDb = () => {
      const allKeys = batchDatabases.map(db => db.key);
      const newChecked = allKeys.filter(k => !checkedDbKeys.includes(k));
      setCheckedDbKeys(newChecked);
  };

  return {
      isBatchModalOpen,
      setIsBatchModalOpen,
      batchTables,
      checkedTableKeys,
      setCheckedTableKeys,
      selectedConnection,
      selectedDatabase,
      availableDatabases,
      batchFilterKeyword,
      setBatchFilterKeyword,
      batchFilterType,
      setBatchFilterType,
      batchSelectionScope,
      setBatchSelectionScope,
      filteredBatchObjects,
      groupedBatchObjects,
      selectionScopeTargetKeys,
      isBatchDbModalOpen,
      setIsBatchDbModalOpen,
      batchDatabases,
      checkedDbKeys,
      setCheckedDbKeys,
      selectedDbConnection,
      handleExportDatabaseSQL,
      handleExportSchemaSQL,
      openBatchOperationModal,
      openBatchTableExportWorkbench,
      handleConnectionChange,
      handleDatabaseChange,
      handleBatchExport,
      handleBatchClear,
      handleCheckAll,
      handleInvertSelection,
      openBatchDatabaseModal,
      openBatchDatabaseExportWorkbench,
      handleDbConnectionChange,
      handleBatchDbExport,
      handleCheckAllDb,
      handleInvertSelectionDb,
  };
};
