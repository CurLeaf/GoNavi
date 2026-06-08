import type { ExternalSQLDirectory } from '../../types';

export const normalizeExternalSQLPath = (input: unknown): string =>
  String(input || '').trim().replace(/\\/g, '/').replace(/\/+$/u, '');

export const isExternalSQLPathInsideDirectory = (filePath: string, directoryPath: string): boolean => {
  if (!filePath || !directoryPath) {
    return false;
  }
  const normalizedFilePath = normalizeExternalSQLPath(filePath).toLowerCase();
  const normalizedDirectoryPath = normalizeExternalSQLPath(directoryPath).toLowerCase();
  if (!normalizedFilePath || !normalizedDirectoryPath) {
    return false;
  }
  return normalizedFilePath === normalizedDirectoryPath || normalizedFilePath.startsWith(`${normalizedDirectoryPath}/`);
};

export const findBestMatchingExternalSQLDirectory = (
  filePath: string,
  directories: ExternalSQLDirectory[],
): ExternalSQLDirectory | undefined => {
  const normalizedFilePath = normalizeExternalSQLPath(filePath).toLowerCase();
  if (!normalizedFilePath) {
    return undefined;
  }
  return [...directories]
    .filter((directory) => isExternalSQLPathInsideDirectory(normalizedFilePath, directory.path))
    .sort((left, right) => normalizeExternalSQLPath(right.path).length - normalizeExternalSQLPath(left.path).length)[0];
};
