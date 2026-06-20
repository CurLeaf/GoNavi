import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DBGetColumns, DBGetForeignKeys, DBGetIndexes, DBGetTables } from '../../wailsjs/go/app/App';
import type { ColumnDefinition, ForeignKeyDefinition } from '../types';
import { buildRpcConnectionConfig } from '../utils/connectionRpcConfig';
import { normalizeColumnDefinitions } from '../utils/columnDefinition';
import { resolveUniqueKeyGroupsFromIndexes } from './dataGridCopyInsert';
import {
  buildErDiagramGraph,
  extractErTableNames,
  normalizeErQualifiedName,
  normalizeForeignKeyDefinitions,
  resolveErActualTableName,
  tableNamesMatch,
  type BuildErDiagramGraphResult,
  type ErDiagramRelation,
  type ErDiagramTableSnapshot,
} from './dataGridErDiagramModel';

type DataGridErDiagramParams = {
  connections: any[];
  connectionId?: string;
  dbName?: string;
  tableName?: string;
};

type DataGridErDiagramState = {
  graph: BuildErDiagramGraphResult | null;
  loading: boolean;
  reloading: boolean;
  error: string;
  partial: boolean;
  warningCount: number;
};

type CacheValue<T> = T | Promise<T>;

const schemaTableNamesCache = new Map<string, CacheValue<string[]>>();
const tableColumnsCache = new Map<string, CacheValue<ColumnDefinition[]>>();
const tableForeignKeysCache = new Map<string, CacheValue<ForeignKeyDefinition[]>>();
const tableUniqueKeyGroupsCache = new Map<string, CacheValue<string[][]>>();

const DEFAULT_EMPTY_STATE: DataGridErDiagramState = {
  graph: null,
  loading: false,
  reloading: false,
  error: '',
  partial: false,
  warningCount: 0,
};

const normalizeConnectionConfig = (connection: any) => ({
  ...connection?.config,
  port: Number(connection?.config?.port),
  password: connection?.config?.password || '',
  database: connection?.config?.database || '',
  useSSH: connection?.config?.useSSH || false,
  ssh: connection?.config?.ssh || { host: '', port: 22, user: '', password: '', keyPath: '' },
});

const readCache = async <T>(
  cache: Map<string, CacheValue<T>>,
  key: string,
  loader: () => Promise<T>,
): Promise<T> => {
  const cached = cache.get(key);
  if (cached instanceof Promise) {
    return cached;
  }
  if (cached !== undefined) {
    return cached;
  }

  const pending = loader()
    .then((value) => {
      cache.set(key, value);
      return value;
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    });
  cache.set(key, pending);
  return pending;
};

const invalidateCacheByPrefix = (prefix: string) => {
  [schemaTableNamesCache, tableColumnsCache, tableForeignKeysCache, tableUniqueKeyGroupsCache].forEach((cache) => {
    Array.from(cache.keys()).forEach((key) => {
      if (key.startsWith(prefix)) {
        cache.delete(key);
      }
    });
  });
};

const runWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> => {
  if (items.length === 0) {
    return [];
  }

  const results: Array<PromiseSettledResult<R>> = new Array(items.length);
  let cursor = 0;

  const executeNext = async (): Promise<void> => {
    const index = cursor;
    cursor += 1;
    if (index >= items.length) {
      return;
    }
    try {
      const value = await worker(items[index]);
      results[index] = { status: 'fulfilled', value };
    } catch (error) {
      results[index] = { status: 'rejected', reason: error };
    }
    await executeNext();
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => executeNext()),
  );

  return results;
};

const loadSchemaTableNames = async (
  config: any,
  dbName: string,
  schemaCacheKey: string,
): Promise<string[]> => readCache(schemaTableNamesCache, schemaCacheKey, async () => {
  const response = await DBGetTables(buildRpcConnectionConfig(config) as any, dbName);
  if (!response?.success) {
    throw new Error(response?.message || 'Failed to load tables');
  }
  return extractErTableNames(response.data);
});

const loadTableColumns = async (
  config: any,
  dbName: string,
  tableName: string,
  cacheKey: string,
): Promise<ColumnDefinition[]> => readCache(tableColumnsCache, cacheKey, async () => {
  const response = await DBGetColumns(buildRpcConnectionConfig(config) as any, dbName, tableName);
  if (!response?.success) {
    throw new Error(response?.message || `Failed to load columns for ${tableName}`);
  }
  return normalizeColumnDefinitions(response.data);
});

const loadTableForeignKeys = async (
  config: any,
  dbName: string,
  tableName: string,
  cacheKey: string,
): Promise<ForeignKeyDefinition[]> => readCache(tableForeignKeysCache, cacheKey, async () => {
  const response = await DBGetForeignKeys(buildRpcConnectionConfig(config) as any, dbName, tableName);
  if (!response?.success) {
    throw new Error(response?.message || `Failed to load foreign keys for ${tableName}`);
  }
  return normalizeForeignKeyDefinitions(response.data);
});

const loadTableUniqueKeyGroups = async (
  config: any,
  dbName: string,
  tableName: string,
  cacheKey: string,
): Promise<string[][]> => readCache(tableUniqueKeyGroupsCache, cacheKey, async () => {
  const response = await DBGetIndexes(buildRpcConnectionConfig(config) as any, dbName, tableName);
  if (!response?.success || !Array.isArray(response.data)) {
    return [];
  }
  return resolveUniqueKeyGroupsFromIndexes(response.data);
});

const loadTableSnapshot = async (
  config: any,
  dbName: string,
  tableName: string,
  tableCacheKey: string,
): Promise<ErDiagramTableSnapshot> => {
  const [columnsResult, foreignKeysResult, uniqueKeyGroupsResult] = await Promise.allSettled([
    loadTableColumns(config, dbName, tableName, `${tableCacheKey}|columns`),
    loadTableForeignKeys(config, dbName, tableName, `${tableCacheKey}|foreignKeys`),
    loadTableUniqueKeyGroups(config, dbName, tableName, `${tableCacheKey}|uniqueKeys`),
  ]);

  if (columnsResult.status === 'rejected') {
    throw columnsResult.reason;
  }

  return {
    tableName,
    columns: columnsResult.value,
    foreignKeys: foreignKeysResult.status === 'fulfilled' ? foreignKeysResult.value : [],
    uniqueKeyGroups: uniqueKeyGroupsResult.status === 'fulfilled' ? uniqueKeyGroupsResult.value : [],
  };
};

const dedupeRelations = (relations: ErDiagramRelation[]): ErDiagramRelation[] => {
  const seen = new Set<string>();
  const result: ErDiagramRelation[] = [];
  relations.forEach((relation) => {
    const key = [
      normalizeErQualifiedName(relation.sourceTableName),
      normalizeErQualifiedName(relation.targetTableName),
      relation.columnName.toLowerCase(),
      relation.refColumnName.toLowerCase(),
      relation.direction,
      relation.constraintName.toLowerCase(),
    ].join('|');
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(relation);
  });
  return result;
};

const dedupeTableNames = (tableNames: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  tableNames.forEach((tableName) => {
    const normalized = normalizeErQualifiedName(tableName);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    result.push(tableName);
  });
  return result;
};

export const useDataGridErDiagram = (params: DataGridErDiagramParams) => {
  const {
    connections,
    connectionId,
    dbName,
    tableName,
  } = params;

  const [state, setState] = useState<DataGridErDiagramState>(DEFAULT_EMPTY_STATE);
  const [reloadVersion, setReloadVersion] = useState(0);
  const requestSeqRef = useRef(0);
  const normalizedDbName = useMemo(() => String(dbName || '').trim(), [dbName]);
  const normalizedTableName = useMemo(() => String(tableName || '').trim(), [tableName]);
  const cachePrefix = useMemo(
    () => `${String(connectionId || '').trim()}|${normalizedDbName}|`,
    [connectionId, normalizedDbName],
  );

  const reload = useCallback(() => {
    if (!cachePrefix) {
      return;
    }
    invalidateCacheByPrefix(cachePrefix);
    requestSeqRef.current += 1;
    setReloadVersion((version) => version + 1);
    setState((prev) => ({
      ...prev,
      loading: !prev.graph,
      reloading: Boolean(prev.graph),
      error: '',
    }));
  }, [cachePrefix]);

  useEffect(() => {
    if (!connectionId || !normalizedTableName) {
      setState(DEFAULT_EMPTY_STATE);
      return;
    }

    const connection = connections.find((item) => item.id === connectionId);
    if (!connection) {
      setState({
        ...DEFAULT_EMPTY_STATE,
        error: 'Connection not found',
      });
      return;
    }

    const seq = ++requestSeqRef.current;
    const config = normalizeConnectionConfig(connection);
    const schemaCacheKey = `${cachePrefix}schemaTables`;
    const currentTableCacheKey = `${cachePrefix}${normalizedTableName}`;

    setState((prev) => ({
      ...prev,
      loading: !prev.graph,
      reloading: Boolean(prev.graph),
      error: '',
      partial: false,
      warningCount: 0,
    }));

    const loadGraph = async () => {
      let warningCount = 0;
      const currentSnapshot = await loadTableSnapshot(config, normalizedDbName, normalizedTableName, currentTableCacheKey);

      let schemaTableNames = [currentSnapshot.tableName];
      try {
        schemaTableNames = await loadSchemaTableNames(config, normalizedDbName, schemaCacheKey);
      } catch {
        warningCount += 1;
      }

      const resolvedSchemaTableNames = extractErTableNames([
        ...schemaTableNames.map((name) => ({ table: name })),
        ...currentSnapshot.foreignKeys.map((foreignKey) => ({ table: foreignKey.refTableName })),
        { table: currentSnapshot.tableName },
      ]);

      const resolveTableName = (name: string) => resolveErActualTableName(name, resolvedSchemaTableNames);

      const outgoingRelations: ErDiagramRelation[] = currentSnapshot.foreignKeys.map((foreignKey) => {
        const targetTableName = resolveTableName(foreignKey.refTableName);
        return {
          sourceTableName: currentSnapshot.tableName,
          targetTableName,
          columnName: foreignKey.columnName,
          refColumnName: foreignKey.refColumnName,
          constraintName: foreignKey.constraintName || foreignKey.name || '',
          direction: tableNamesMatch(targetTableName, currentSnapshot.tableName) ? 'self' : 'outgoing',
        };
      });

      const scanCandidates = resolvedSchemaTableNames.filter((candidate) => !tableNamesMatch(candidate, currentSnapshot.tableName));
      const incomingScanResults = await runWithConcurrency(scanCandidates, 6, async (candidateTableName) => {
        const tableCacheKey = `${cachePrefix}${candidateTableName}`;
        const foreignKeys = await loadTableForeignKeys(
          config,
          normalizedDbName,
          candidateTableName,
          `${tableCacheKey}|foreignKeys`,
        );
        return { tableName: candidateTableName, foreignKeys };
      });

      const incomingRelations: ErDiagramRelation[] = [];
      incomingScanResults.forEach((result) => {
        if (result.status === 'rejected') {
          warningCount += 1;
          return;
        }
        result.value.foreignKeys.forEach((foreignKey) => {
          const targetTableName = resolveTableName(foreignKey.refTableName);
          if (!tableNamesMatch(targetTableName, currentSnapshot.tableName)) {
            return;
          }
          incomingRelations.push({
            sourceTableName: result.value.tableName,
            targetTableName: currentSnapshot.tableName,
            columnName: foreignKey.columnName,
            refColumnName: foreignKey.refColumnName,
            constraintName: foreignKey.constraintName || foreignKey.name || '',
            direction: 'incoming',
          });
        });
      });

      const relations = dedupeRelations([...outgoingRelations, ...incomingRelations]);
      const relatedTableNames = dedupeTableNames(
        relations.flatMap((relation) => [relation.sourceTableName, relation.targetTableName]),
      ).filter((candidate) => !tableNamesMatch(candidate, currentSnapshot.tableName));

      const relatedSnapshotResults = await runWithConcurrency(relatedTableNames, 4, async (relatedTableName) => {
        const tableCacheKey = `${cachePrefix}${relatedTableName}`;
        return loadTableSnapshot(config, normalizedDbName, relatedTableName, tableCacheKey);
      });

      const relatedSnapshots: ErDiagramTableSnapshot[] = relatedSnapshotResults.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        }
        warningCount += 1;
        return {
          tableName: relatedTableNames[index],
          columns: [],
          foreignKeys: [],
          uniqueKeyGroups: [],
        };
      });

      return {
        graph: buildErDiagramGraph({
          currentTableName: currentSnapshot.tableName,
          currentSnapshot,
          relatedSnapshots,
          relations,
        }),
        partial: warningCount > 0,
        warningCount,
      };
    };

    void loadGraph()
      .then((result) => {
        if (seq !== requestSeqRef.current) {
          return;
        }
        setState({
          graph: result.graph,
          loading: false,
          reloading: false,
          error: '',
          partial: result.partial,
          warningCount: result.warningCount,
        });
      })
      .catch((error) => {
        if (seq !== requestSeqRef.current) {
          return;
        }
        setState({
          graph: null,
          loading: false,
          reloading: false,
          error: error instanceof Error ? error.message : String(error || 'Failed to load ER diagram'),
          partial: false,
          warningCount: 0,
        });
      });
  }, [cachePrefix, connectionId, connections, normalizedDbName, normalizedTableName, reloadVersion]);

  return {
    ...state,
    reload,
  };
};
