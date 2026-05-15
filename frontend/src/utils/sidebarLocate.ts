export type SidebarLocateObjectGroup = 'tables' | 'views' | 'materializedViews';

export interface SidebarLocateObjectRequest {
  tabId?: string;
  connectionId: string;
  dbName: string;
  tableName: string;
  schemaName?: string;
  objectGroup: SidebarLocateObjectGroup;
}

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
}

export interface SidebarLocateTreeNodeLike {
  key: string | number;
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
}

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

export const splitSidebarQualifiedName = (qualifiedName: string): { schemaName: string; objectName: string } => {
  const raw = toTrimmedString(qualifiedName);
  if (!raw) return { schemaName: '', objectName: '' };
  const idx = raw.lastIndexOf('.');
  if (idx <= 0 || idx >= raw.length - 1) return { schemaName: '', objectName: raw };
  return {
    schemaName: raw.substring(0, idx).trim(),
    objectName: raw.substring(idx + 1).trim(),
  };
};

const inferObjectGroup = (detail: Record<string, unknown>, connectionId: string, dbName: string): SidebarLocateObjectGroup => {
  const explicitGroup = toTrimmedString(detail.objectGroup);
  if (explicitGroup === 'views' || explicitGroup === 'view') return 'views';
  if (explicitGroup === 'materializedViews' || explicitGroup === 'materialized-view') return 'materializedViews';

  const explicitType = toTrimmedString(detail.objectType);
  if (explicitType === 'view' || explicitType === 'views') return 'views';
  if (explicitType === 'materialized' || explicitType === 'materialized-view') return 'materializedViews';

  const tabId = toTrimmedString(detail.tabId);
  const dbNodeKey = `${connectionId}-${dbName}`;
  if (tabId.startsWith(`${dbNodeKey}-materialized-view-`)) return 'materializedViews';
  if (tabId.startsWith(`${dbNodeKey}-view-`)) return 'views';

  return 'tables';
};

export const normalizeSidebarLocateObjectRequest = (detail: unknown): SidebarLocateObjectRequest | null => {
  const raw = (detail || {}) as Record<string, unknown>;
  const connectionId = toTrimmedString(raw.connectionId);
  const dbName = toTrimmedString(raw.dbName);
  const tableName = toTrimmedString(raw.tableName || raw.objectName || raw.viewName);

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
  const objectName = tab.type === 'view-def'
    ? toTrimmedString(tab.viewName || tab.tableName)
    : toTrimmedString(tab.tableName || tab.viewName);
  if (tab.type !== 'table' && tab.type !== 'view-def') {
    return null;
  }

  return normalizeSidebarLocateObjectRequest({
    tabId: tab.id,
    connectionId: tab.connectionId,
    dbName: tab.dbName,
    tableName: objectName,
    objectGroup: tab.type === 'view-def'
      ? (tab.viewKind === 'materialized' ? 'materializedViews' : 'views')
      : undefined,
  });
};

export const resolveSidebarLocateTarget = (
  request: SidebarLocateObjectRequest,
  options: { groupBySchema: boolean },
): SidebarLocateTarget => {
  const connectionKey = request.connectionId;
  const databaseKey = `${request.connectionId}-${request.dbName}`;
  const fallbackTargetKey = request.objectGroup === 'materializedViews'
    ? `${databaseKey}-materialized-view-${request.tableName}`
    : (request.objectGroup === 'views' ? `${databaseKey}-view-${request.tableName}` : `${databaseKey}-${request.tableName}`);
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

const matchesLocateObjectName = (target: SidebarLocateTarget, nodeObjectName: string, nodeSchemaName: string): boolean => {
  const normalizedNodeName = toTrimmedString(nodeObjectName);
  if (!normalizedNodeName) return false;
  if (normalizedNodeName === target.tableName) return true;

  if (!target.schemaName) return false;

  const nodeParsed = splitSidebarQualifiedName(normalizedNodeName);
  const targetParsed = splitSidebarQualifiedName(target.tableName);
  const nodeObject = nodeParsed.objectName || normalizedNodeName;
  const targetObject = targetParsed.objectName || target.tableName;
  const resolvedNodeSchema = toTrimmedString(nodeSchemaName) || nodeParsed.schemaName;
  return resolvedNodeSchema === target.schemaName && nodeObject === targetObject;
};

const matchesLocateObjectNode = (node: SidebarLocateTreeNodeLike, target: SidebarLocateTarget): boolean => {
  const dataRef = node.dataRef || {};
  const nodeConnectionId = toTrimmedString(dataRef.id || dataRef.connectionId);
  const nodeDbName = toTrimmedString(dataRef.dbName);

  if (nodeConnectionId !== target.connectionId || nodeDbName !== target.dbName) {
    return false;
  }

  if (target.objectGroup === 'views') {
    if (node.type !== 'view') return false;
    return matchesLocateObjectName(target, toTrimmedString(dataRef.viewName || dataRef.tableName), toTrimmedString(dataRef.schemaName));
  }

  if (target.objectGroup === 'materializedViews') {
    if (node.type !== 'materialized-view') return false;
    return matchesLocateObjectName(target, toTrimmedString(dataRef.viewName || dataRef.tableName), toTrimmedString(dataRef.schemaName));
  }

  if (node.type !== 'table') return false;
  return matchesLocateObjectName(target, toTrimmedString(dataRef.tableName), toTrimmedString(dataRef.schemaName));
};

export const findSidebarNodePathForLocate = (
  nodes: SidebarLocateTreeNodeLike[],
  target: SidebarLocateTarget,
): string[] | null => {
  const exactPath = findSidebarNodePathByKey(nodes, target.targetKey);
  if (exactPath) return exactPath;

  for (const node of nodes) {
    const nodeKey = String(node.key);
    if (matchesLocateObjectNode(node, target)) {
      return [nodeKey];
    }

    if (node.children) {
      const childPath = findSidebarNodePathForLocate(node.children, target);
      if (childPath) {
        return [nodeKey, ...childPath];
      }
    }
  }
  return null;
};
