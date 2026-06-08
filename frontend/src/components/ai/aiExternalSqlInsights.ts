import type { ExternalSQLDirectory, SavedConnection, TabData } from '../../types';

const normalizeLimit = (input: unknown, fallback: number, max: number): number => {
  const value = Math.floor(Number(input) || fallback);
  if (value < 1) return 1;
  if (value > max) return max;
  return value;
};

const normalizeKeyword = (input: unknown): string => String(input || '').trim().toLowerCase();

const normalizePath = (input: unknown): string =>
  String(input || '').trim().replace(/\\/g, '/').replace(/\/+$/u, '');

const matchesKeyword = (keyword: string, fields: Array<string | undefined>): boolean => {
  if (!keyword) {
    return true;
  }
  return fields.some((field) => String(field || '').toLowerCase().includes(keyword));
};

const belongsToDirectory = (filePath: string, directoryPath: string): boolean => {
  if (!filePath || !directoryPath) {
    return false;
  }
  const normalizedFilePath = normalizePath(filePath).toLowerCase();
  const normalizedDirectoryPath = normalizePath(directoryPath).toLowerCase();
  if (!normalizedFilePath || !normalizedDirectoryPath) {
    return false;
  }
  return normalizedFilePath === normalizedDirectoryPath || normalizedFilePath.startsWith(`${normalizedDirectoryPath}/`);
};

export const buildExternalSQLDirectoriesSnapshot = (params: {
  externalSQLDirectories?: ExternalSQLDirectory[];
  connections: SavedConnection[];
  tabs?: TabData[];
  keyword?: unknown;
  connectionId?: unknown;
  dbName?: unknown;
  limit?: unknown;
}) => {
  const {
    externalSQLDirectories = [],
    connections,
    tabs = [],
    keyword,
    connectionId,
    dbName,
    limit,
  } = params;

  const safeKeyword = normalizeKeyword(keyword);
  const safeConnectionId = String(connectionId || '').trim();
  const safeDbName = String(dbName || '').trim();
  const safeLimit = normalizeLimit(limit, 20, 100);
  const externalSqlTabs = tabs.filter((tab) => String(tab.filePath || '').trim());

  const filteredDirectories = [...externalSQLDirectories]
    .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0))
    .filter((directory) => {
      if (safeConnectionId && String(directory.connectionId || '').trim() !== safeConnectionId) {
        return false;
      }
      if (safeDbName && String(directory.dbName || '').trim() !== safeDbName) {
        return false;
      }
      const connection = connections.find((item) => item.id === directory.connectionId);
      return matchesKeyword(safeKeyword, [
        directory.id,
        directory.name,
        directory.path,
        directory.connectionId,
        directory.dbName,
        connection?.name,
        connection?.config?.type,
      ]);
    });

  const visibleDirectories = filteredDirectories.slice(0, safeLimit).map((directory) => {
    const connection = connections.find((item) => item.id === directory.connectionId);
    const matchingTabs = externalSqlTabs.filter((tab) => belongsToDirectory(String(tab.filePath || ''), directory.path));

    return {
      id: directory.id,
      name: directory.name,
      path: directory.path,
      connectionId: directory.connectionId || '',
      connectionName: connection?.name || '',
      connectionType: connection?.config?.type || '',
      dbName: directory.dbName || '',
      createdAt: Number(directory.createdAt || 0),
      hasBoundConnection: Boolean(String(directory.connectionId || '').trim()),
      openFileTabCount: matchingTabs.length,
      openFileTitles: matchingTabs.slice(0, 5).map((tab) => ({
        tabId: tab.id,
        title: tab.title,
        filePath: tab.filePath || '',
        dbName: tab.dbName || '',
      })),
    };
  });

  return {
    keyword: safeKeyword,
    connectionId: safeConnectionId,
    dbName: safeDbName,
    limit: safeLimit,
    totalMatched: filteredDirectories.length,
    returnedDirectories: visibleDirectories.length,
    truncated: filteredDirectories.length > visibleDirectories.length,
    totalConfiguredDirectories: externalSQLDirectories.length,
    totalOpenExternalSqlTabs: externalSqlTabs.length,
    boundConnectionCount: filteredDirectories.filter((item) => String(item.connectionId || '').trim()).length,
    directories: visibleDirectories,
  };
};
