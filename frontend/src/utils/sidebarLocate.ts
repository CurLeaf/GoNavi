import { splitQualifiedNameLast } from './qualifiedName';

export type SidebarLocateObjectGroup = 'tables' | 'views' | 'materializedViews' | 'triggers' | 'routines' | 'externalSqlFiles';
export type SidebarLocateDatabaseObjectGroup = Exclude<SidebarLocateObjectGroup, 'externalSqlFiles'>;

export interface SidebarLocateDatabaseObjectRequest {
  tabId?: string;
  connectionId: string;
  dbName: string;
  tableName: string;
  schemaName?: string;
  objectGroup: SidebarLocateDatabaseObjectGroup;
}

export interface SidebarLocateExternalSQLFileRequest {
  tabId?: string;
  connectionId?: string;
  dbName?: string;
  filePath: string;
  fileName?: string;
  objectGroup: 'externalSqlFiles';
}

export type SidebarLocateObjectRequest = SidebarLocateDatabaseObjectRequest | SidebarLocateExternalSQLFileRequest;

export interface SidebarLocateTarget {
  connectionKey: string;
  databaseKey: string;
  targetKey: string;
  objectGroup: SidebarLocateObjectGroup;
  objectGroupKey: string;
  schemaKey?: string;
  expectedAncestorKeys: string[];
  connectionId: string;
  dbName: string;
  tableName: string;
  schemaName: string;
  filePath?: string;
}

export interface SidebarLocateTreeNodeLike {
  key: string | number;
  title?: unknown;
  type?: string;
  dataRef?: Record<string, any>;
  children?: SidebarLocateTreeNodeLike[];
}

export interface SidebarLocateTabLike {
  id?: string;
  type?: string;
  connectionId?: string;
  dbName?: string;
  tableName?: string;
  viewName?: string;
  viewKind?: string;
  triggerName?: string;
  triggerTableName?: string;
  routineName?: string;
  schemaName?: string;
  sidebarLocateKey?: string;
  filePath?: string;
}

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

const normalizeExternalSQLLocatePath = (value: unknown): string => toTrimmedString(value).replace(/\\/g, '/');

export const splitSidebarQualifiedName = (qualifiedName: string): { schemaName: string; objectName: string } => {
  const raw = toTrimmedString(qualifiedName);
  if (!raw) return { schemaName: '', objectName: '' };
  const parsed = splitQualifiedNameLast(raw);
  return {
    schemaName: parsed.parentPath,
    objectName: parsed.objectName,
  };
};

const inferObjectGroup = (detail: Record<string, unknown>, connectionId: string, dbName: string): SidebarLocateDatabaseObjectGroup => {
  const explicitGroup = toTrimmedString(detail.objectGroup);
  if (explicitGroup === 'views' || explicitGroup === 'view') return 'views';
  if (explicitGroup === 'materializedViews' || explicitGroup === 'materialized-view') return 'materializedViews';
  if (explicitGroup === 'triggers' || explicitGroup === 'trigger') return 'triggers';
  if (explicitGroup === 'routines' || explicitGroup === 'routine') return 'routines';

  const explicitType = toTrimmedString(detail.objectType);
  if (explicitType === 'view' || explicitType === 'views') return 'views';
  if (explicitType === 'materialized' || explicitType === 'materialized-view') return 'materializedViews';
  if (explicitType === 'trigger' || explicitType === 'triggers') return 'triggers';
  if (explicitType === 'routine' || explicitType === 'routines') return 'routines';

  const tabId = toTrimmedString(detail.tabId);
  const dbNodeKey = `${connectionId}-${dbName}`;
  if (tabId.startsWith(`${dbNodeKey}-materialized-view-`)) return 'materializedViews';
  if (tabId.startsWith(`${dbNodeKey}-view-`)) return 'views';
  if (tabId.startsWith(`${dbNodeKey}-trigger-`)) return 'triggers';
  if (tabId.startsWith(`${dbNodeKey}-routine-`) || tabId.startsWith(`routine-def-${connectionId}-${dbName}-`)) return 'routines';

  return 'tables';
};

export const normalizeSidebarLocateObjectRequest = (detail: unknown): SidebarLocateObjectRequest | null => {
  const raw = (detail || {}) as Record<string, unknown>;
  const filePath = normalizeExternalSQLLocatePath(raw.filePath);
  if (filePath) {
    return {
      tabId: toTrimmedString(raw.tabId) || undefined,
      connectionId: toTrimmedString(raw.connectionId) || undefined,
      dbName: toTrimmedString(raw.dbName) || undefined,
      filePath,
      fileName: toTrimmedString(raw.fileName || raw.title) || undefined,
      objectGroup: 'externalSqlFiles',
    };
  }

  const connectionId = toTrimmedString(raw.connectionId);
  const dbName = toTrimmedString(raw.dbName);
  const tableName = toTrimmedString(raw.tableName || raw.objectName || raw.viewName || raw.triggerName || raw.routineName);

  if (!connectionId || !dbName || !tableName) {
    return null;
  }

  const parsed = splitSidebarQualifiedName(tableName);
  const schemaName = toTrimmedString(raw.schemaName) || parsed.schemaName;

  return {
    tabId: toTrimmedString(raw.tabId) || undefined,
    connectionId,
    dbName,
    tableName,
    schemaName,
    objectGroup: inferObjectGroup(raw, connectionId, dbName),
  };
};

export const normalizeSidebarLocateObjectRequestFromTab = (tab: SidebarLocateTabLike | null | undefined): SidebarLocateObjectRequest | null => {
  if (!tab) return null;
  const filePath = normalizeExternalSQLLocatePath(tab.filePath);
  if (tab.type === 'query' && filePath) {
    return normalizeSidebarLocateObjectRequest({
      tabId: tab.id,
      connectionId: tab.connectionId,
      dbName: tab.dbName,
      filePath,
      fileName: tab.id,
    });
  }

  const objectName = tab.type === 'view-def'
    ? toTrimmedString(tab.viewName || tab.tableName)
    : tab.type === 'trigger'
      ? toTrimmedString(tab.triggerName || tab.tableName)
      : tab.type === 'routine-def'
        ? toTrimmedString(tab.routineName || tab.tableName)
        : toTrimmedString(tab.tableName || tab.viewName);
  if (tab.type !== 'table' && tab.type !== 'view-def' && tab.type !== 'trigger' && tab.type !== 'routine-def') {
    return null;
  }

  return normalizeSidebarLocateObjectRequest({
    tabId: toTrimmedString(tab.sidebarLocateKey || tab.id) || undefined,
    connectionId: tab.connectionId,
    dbName: tab.dbName,
    tableName: objectName,
    schemaName: tab.schemaName,
    objectGroup: tab.type === 'view-def'
      ? (tab.viewKind === 'materialized' ? 'materializedViews' : 'views')
      : (tab.type === 'trigger' ? 'triggers' : (tab.type === 'routine-def' ? 'routines' : undefined)),
  });
};

export const resolveSidebarLocateTarget = (
  request: SidebarLocateObjectRequest,
  options: { groupBySchema: boolean },
): SidebarLocateTarget => {
  if (request.objectGroup === 'externalSqlFiles') {
    const filePath = normalizeExternalSQLLocatePath(request.filePath);
    return {
      connectionKey: toTrimmedString(request.connectionId),
      databaseKey: request.connectionId && request.dbName ? `${request.connectionId}-${request.dbName}` : '',
      targetKey: request.tabId || filePath,
      objectGroup: 'externalSqlFiles',
      objectGroupKey: 'external-sql-root',
      expectedAncestorKeys: ['external-sql-root'],
      connectionId: toTrimmedString(request.connectionId),
      dbName: toTrimmedString(request.dbName),
      tableName: request.fileName || filePath.split('/').filter(Boolean).pop() || filePath,
      schemaName: '',
      filePath,
    };
  }

  const connectionKey = request.connectionId;
  const databaseKey = `${request.connectionId}-${request.dbName}`;
  const fallbackTargetKey = request.objectGroup === 'materializedViews'
    ? `${databaseKey}-materialized-view-${request.tableName}`
    : request.objectGroup === 'views'
      ? `${databaseKey}-view-${request.tableName}`
      : request.objectGroup === 'triggers'
        ? `${databaseKey}-trigger-${request.tableName}`
        : request.objectGroup === 'routines'
          ? `${databaseKey}-routine-${request.tableName}`
          : `${databaseKey}-${request.tableName}`;
  const targetKey = request.tabId || fallbackTargetKey;
  const schemaSegment = request.schemaName || 'default';
  const schemaKey = options.groupBySchema ? `${databaseKey}-schema-${schemaSegment}` : undefined;
  const objectGroupKey = options.groupBySchema
    ? `${schemaKey}-${request.objectGroup}`
    : `${databaseKey}-${request.objectGroup}`;
  const expectedAncestorKeys = [
    connectionKey,
    databaseKey,
    ...(schemaKey ? [schemaKey] : []),
    objectGroupKey,
  ];

  return {
    connectionKey,
    databaseKey,
    targetKey,
    objectGroup: request.objectGroup,
    objectGroupKey,
    schemaKey,
    expectedAncestorKeys,
    connectionId: request.connectionId,
    dbName: request.dbName,
    tableName: request.tableName,
    schemaName: request.schemaName || '',
  };
};

export const findSidebarNodePathByKey = (
  nodes: SidebarLocateTreeNodeLike[],
  targetKey: string,
): string[] | null => {
  for (const node of nodes) {
    const nodeKey = String(node.key);
    if (nodeKey === targetKey) {
      return [nodeKey];
    }

    if (node.children) {
      const childPath = findSidebarNodePathByKey(node.children, targetKey);
      if (childPath) {
        return [nodeKey, ...childPath];
      }
    }
  }
  return null;
};

const matchesLocateObjectName = (
  target: SidebarLocateTarget,
  nodeObjectName: string,
  nodeSchemaName: string,
  options: { allowUnqualifiedSchemaMatch?: boolean } = {},
): boolean => {
  const normalizedNodeName = toTrimmedString(nodeObjectName);
  if (!normalizedNodeName) return false;

  const nodeParsed = splitSidebarQualifiedName(normalizedNodeName);
  const targetParsed = splitSidebarQualifiedName(target.tableName);
  const nodeObject = nodeParsed.objectName || normalizedNodeName;
  const targetObject = targetParsed.objectName || target.tableName;
  const resolvedNodeSchema = toTrimmedString(nodeSchemaName) || nodeParsed.schemaName;
  const resolvedTargetSchema = toTrimmedString(target.schemaName) || targetParsed.schemaName;
  const normalize = (value: string): string => toTrimmedString(value).toLowerCase();

  if (normalize(normalizedNodeName) === normalize(target.tableName)) return true;

  if (
    resolvedTargetSchema
    && !resolvedNodeSchema
    && normalize(resolvedTargetSchema) === normalize(target.dbName)
    && normalize(nodeObject) === normalize(targetObject)
  ) {
    return true;
  }

  if (!resolvedTargetSchema) {
    if (options.allowUnqualifiedSchemaMatch) {
      return normalize(nodeObject) === normalize(targetObject);
    }
    return !resolvedNodeSchema && normalize(nodeObject) === normalize(targetObject);
  }

  return normalize(resolvedNodeSchema) === normalize(resolvedTargetSchema)
    && normalize(nodeObject) === normalize(targetObject);
};

const matchesLocateObjectNode = (
  node: SidebarLocateTreeNodeLike,
  target: SidebarLocateTarget,
  options: { allowUnqualifiedSchemaMatch?: boolean } = {},
): boolean => {
  const dataRef = node.dataRef || {};

  if (target.objectGroup === 'externalSqlFiles') {
    return node.type === 'external-sql-file'
      && normalizeExternalSQLLocatePath(dataRef.path) === normalizeExternalSQLLocatePath(target.filePath);
  }

  const nodeConnectionId = toTrimmedString(dataRef.id || dataRef.connectionId);
  const nodeDbName = toTrimmedString(dataRef.dbName);

  if (nodeConnectionId !== target.connectionId || nodeDbName !== target.dbName) {
    return false;
  }

  if (target.objectGroup === 'views') {
    if (node.type !== 'view') return false;
    return matchesLocateObjectName(target, toTrimmedString(dataRef.viewName || dataRef.tableName), toTrimmedString(dataRef.schemaName), options);
  }

  if (target.objectGroup === 'materializedViews') {
    if (node.type !== 'materialized-view') return false;
    return matchesLocateObjectName(target, toTrimmedString(dataRef.viewName || dataRef.tableName), toTrimmedString(dataRef.schemaName), options);
  }

  if (target.objectGroup === 'triggers') {
    if (node.type !== 'db-trigger') return false;
    return matchesLocateObjectName(target, toTrimmedString(dataRef.triggerName || dataRef.tableName), toTrimmedString(dataRef.schemaName), options);
  }

  if (target.objectGroup === 'routines') {
    if (node.type !== 'routine') return false;
    return matchesLocateObjectName(target, toTrimmedString(dataRef.routineName || dataRef.tableName), toTrimmedString(dataRef.schemaName), options);
  }

  if (node.type !== 'table') return false;
  return matchesLocateObjectName(target, toTrimmedString(dataRef.tableName), toTrimmedString(dataRef.schemaName), options);
};

const findSidebarNodePathForLocateByObject = (
  nodes: SidebarLocateTreeNodeLike[],
  target: SidebarLocateTarget,
  options: { allowUnqualifiedSchemaMatch?: boolean } = {},
): string[] | null => {
  for (const node of nodes) {
    const nodeKey = String(node.key);
    if (matchesLocateObjectNode(node, target, options)) {
      return [nodeKey];
    }

    if (node.children) {
      const childPath = findSidebarNodePathForLocateByObject(node.children, target, options);
      if (childPath) {
        return [nodeKey, ...childPath];
      }
    }
  }
  return null;
};

const collectSidebarNodePathsForLocateByObject = (
  nodes: SidebarLocateTreeNodeLike[],
  target: SidebarLocateTarget,
  options: { allowUnqualifiedSchemaMatch?: boolean } = {},
  ancestorPath: string[] = [],
): string[][] => {
  const paths: string[][] = [];
  for (const node of nodes) {
    const nodeKey = String(node.key);
    const path = [...ancestorPath, nodeKey];
    if (matchesLocateObjectNode(node, target, options)) {
      paths.push(path);
    }
    if (node.children) {
      paths.push(...collectSidebarNodePathsForLocateByObject(node.children, target, options, path));
    }
  }
  return paths;
};

const getVisualNodeObjectName = (
  node: SidebarLocateTreeNodeLike,
  target: SidebarLocateTarget,
): string => {
  const title = toTrimmedString(node.title);
  if (title && title !== '[object Object]') return title;

  const nodeKey = toTrimmedString(node.key);
  const keyPrefixes = target.objectGroup === 'materializedViews'
    ? [`${target.databaseKey}-materialized-view-`]
    : target.objectGroup === 'views'
      ? [`${target.databaseKey}-view-`]
      : target.objectGroup === 'triggers'
        ? [`${target.databaseKey}-trigger-`]
        : target.objectGroup === 'routines'
          ? [`${target.databaseKey}-routine-`]
          : [`${target.databaseKey}-`];

  const matchedPrefix = keyPrefixes.find((prefix) => nodeKey.startsWith(prefix));
  return matchedPrefix ? nodeKey.slice(matchedPrefix.length) : '';
};

const matchesLocateObjectNodeByVisualIdentity = (
  node: SidebarLocateTreeNodeLike,
  target: SidebarLocateTarget,
  path: string[],
): boolean => {
  if (!path.includes(target.databaseKey)) return false;

  if (target.objectGroup === 'views' && node.type !== 'view') return false;
  if (target.objectGroup === 'materializedViews' && node.type !== 'materialized-view') return false;
  if (target.objectGroup === 'triggers' && node.type !== 'db-trigger') return false;
  if (target.objectGroup === 'routines' && node.type !== 'routine') return false;
  if (target.objectGroup === 'tables' && node.type !== 'table') return false;
  if (target.objectGroup === 'externalSqlFiles') return false;

  const schemaName = toTrimmedString(node.dataRef?.schemaName);
  return matchesLocateObjectName(target, getVisualNodeObjectName(node, target), schemaName, { allowUnqualifiedSchemaMatch: true });
};

const collectSidebarNodePathsForLocateByVisualIdentity = (
  nodes: SidebarLocateTreeNodeLike[],
  target: SidebarLocateTarget,
  ancestorPath: string[] = [],
): string[][] => {
  const paths: string[][] = [];
  for (const node of nodes) {
    const nodeKey = String(node.key);
    const path = [...ancestorPath, nodeKey];
    if (matchesLocateObjectNodeByVisualIdentity(node, target, path)) {
      paths.push(path);
    }
    if (node.children) {
      paths.push(...collectSidebarNodePathsForLocateByVisualIdentity(node.children, target, path));
    }
  }
  return paths;
};

const hasLocateTargetSchema = (target: SidebarLocateTarget): boolean => {
  if (target.objectGroup === 'externalSqlFiles') return true;
  return Boolean(toTrimmedString(target.schemaName) || splitSidebarQualifiedName(target.tableName).schemaName);
};

const shouldFallbackViewLocateToTableNode = (target: SidebarLocateTarget): boolean => (
  target.objectGroup === 'views' || target.objectGroup === 'materializedViews'
);

export const findSidebarNodePathForLocate = (
  nodes: SidebarLocateTreeNodeLike[],
  target: SidebarLocateTarget,
): string[] | null => {
  const exactPath = findSidebarNodePathByKey(nodes, target.targetKey);
  if (exactPath) return exactPath;

  const strictPath = findSidebarNodePathForLocateByObject(nodes, target);
  if (strictPath) return strictPath;

  const visualIdentityPaths = collectSidebarNodePathsForLocateByVisualIdentity(nodes, target);
  if (visualIdentityPaths.length === 1) return visualIdentityPaths[0];

  if (shouldFallbackViewLocateToTableNode(target)) {
    const tableLikeTarget = { ...target, objectGroup: 'tables' as const };
    const tableLikePaths = collectSidebarNodePathsForLocateByObject(nodes, tableLikeTarget);
    if (tableLikePaths.length === 1) return tableLikePaths[0];
    if (!hasLocateTargetSchema(target)) {
      const relaxedTableLikePaths = collectSidebarNodePathsForLocateByObject(
        nodes,
        tableLikeTarget,
        { allowUnqualifiedSchemaMatch: true },
      );
      if (relaxedTableLikePaths.length === 1) return relaxedTableLikePaths[0];
    }
  }

  if (hasLocateTargetSchema(target)) return null;

  const relaxedPaths = collectSidebarNodePathsForLocateByObject(nodes, target, { allowUnqualifiedSchemaMatch: true });
  return relaxedPaths.length === 1 ? relaxedPaths[0] : null;
};
