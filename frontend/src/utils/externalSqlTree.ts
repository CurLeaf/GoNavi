import type { ExternalSQLDirectory, ExternalSQLTreeEntry } from '../types';

export type ExternalSQLNodeType =
  | 'external-sql-root'
  | 'external-sql-directory'
  | 'external-sql-folder'
  | 'external-sql-file';

export interface ExternalSQLTreeNode {
  title: string;
  key: string;
  isLeaf?: boolean;
  children?: ExternalSQLTreeNode[];
  type: ExternalSQLNodeType;
  dataRef: Record<string, unknown>;
}

type BuildExternalSQLRootNodeParams = {
  dbNodeKey: string;
  connectionId: string;
  dbName: string;
  directories: ExternalSQLDirectory[];
  directoryTrees: Record<string, ExternalSQLTreeEntry[]>;
  labels?: Partial<ExternalSQLTreeLabels>;
};

export type ExternalSQLTreeLabels = {
  root: string;
  directoryFallback: string;
};

const normalizeExternalSQLPath = (value: string): string =>
  String(value || '').trim().replace(/\\/g, '/');

const DEFAULT_EXTERNAL_SQL_TREE_LABELS: ExternalSQLTreeLabels = {
  root: 'External SQL files',
  directoryFallback: 'SQL directory',
};

const resolveExternalSQLTreeLabels = (labels?: Partial<ExternalSQLTreeLabels>): ExternalSQLTreeLabels => ({
  root: String(labels?.root || '').trim() || DEFAULT_EXTERNAL_SQL_TREE_LABELS.root,
  directoryFallback:
    String(labels?.directoryFallback || '').trim() || DEFAULT_EXTERNAL_SQL_TREE_LABELS.directoryFallback,
});

const resolveDirectoryDisplayName = (
  directory: ExternalSQLDirectory,
  labels: ExternalSQLTreeLabels,
): string => {
  const explicitName = String(directory.name || '').trim();
  if (explicitName) return explicitName;
  const normalizedPath = normalizeExternalSQLPath(directory.path);
  const segments = normalizedPath.split('/').filter(Boolean);
  return segments[segments.length - 1] || labels.directoryFallback;
};

export const buildExternalSQLDirectoryId = (connectionId: string, dbName: string, directoryPath: string): string =>
  `external-sql-dir:${String(connectionId || '').trim()}:${String(dbName || '').trim()}:${normalizeExternalSQLPath(directoryPath)}`;

export const buildExternalSQLTabId = (connectionId: string, dbName: string, filePath: string): string =>
  `external-sql-tab:${String(connectionId || '').trim()}:${String(dbName || '').trim()}:${normalizeExternalSQLPath(filePath)}`;

const buildExternalSQLNodeKey = (type: ExternalSQLNodeType, base: string): string =>
  `${type}:${normalizeExternalSQLPath(base)}`;

const mapExternalSQLTreeEntries = (
  entries: ExternalSQLTreeEntry[],
  context: { connectionId: string; dbName: string; dbNodeKey: string; directoryId: string },
): ExternalSQLTreeNode[] => entries.map((entry) => {
  const entryPath = normalizeExternalSQLPath(entry.path);
  if (entry.isDir) {
    const children = mapExternalSQLTreeEntries(entry.children || [], context);
    return {
      title: entry.name,
      key: buildExternalSQLNodeKey('external-sql-folder', entryPath),
      type: 'external-sql-folder',
      isLeaf: children.length === 0,
      children: children.length > 0 ? children : undefined,
      dataRef: {
        connectionId: context.connectionId,
        dbName: context.dbName,
        dbNodeKey: context.dbNodeKey,
        directoryId: context.directoryId,
        path: entry.path,
        name: entry.name,
      },
    };
  }

  return {
    title: entry.name,
    key: buildExternalSQLNodeKey('external-sql-file', entryPath),
    type: 'external-sql-file',
    isLeaf: true,
    dataRef: {
      connectionId: context.connectionId,
      dbName: context.dbName,
      dbNodeKey: context.dbNodeKey,
      directoryId: context.directoryId,
      path: entry.path,
      name: entry.name,
    },
  };
});

export const buildExternalSQLRootNode = ({
  dbNodeKey,
  connectionId,
  dbName,
  directories,
  directoryTrees,
  labels,
}: BuildExternalSQLRootNodeParams): ExternalSQLTreeNode => {
  const resolvedLabels = resolveExternalSQLTreeLabels(labels);
  const sortedDirectories = [...directories].sort((left, right) =>
    resolveDirectoryDisplayName(left, resolvedLabels)
      .toLowerCase()
      .localeCompare(resolveDirectoryDisplayName(right, resolvedLabels).toLowerCase()),
  );

  const children = sortedDirectories.map((directory) => {
    const directoryChildren = mapExternalSQLTreeEntries(directoryTrees[directory.id] || [], {
      connectionId,
      dbName,
      dbNodeKey,
      directoryId: directory.id,
    });
    return {
      title: resolveDirectoryDisplayName(directory, resolvedLabels),
      key: buildExternalSQLNodeKey('external-sql-directory', directory.id),
      type: 'external-sql-directory' as const,
      isLeaf: directoryChildren.length === 0,
      children: directoryChildren.length > 0 ? directoryChildren : undefined,
      dataRef: {
        ...directory,
        connectionId,
        dbName,
        dbNodeKey,
      },
    };
  });

  return {
    title: children.length > 0 ? `${resolvedLabels.root} (${children.length})` : resolvedLabels.root,
    key: `${dbNodeKey}-external-sql`,
    type: 'external-sql-root',
    isLeaf: children.length === 0,
    children: children.length > 0 ? children : undefined,
    dataRef: {
      connectionId,
      dbName,
      dbNodeKey,
    },
  };
};
