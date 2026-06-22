import type { TabData } from '../types';

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

export const SQL_FILE_NOT_FOUND_ERROR_CODE = 'file_not_found';

export const getSQLFileTabPath = (tab: Pick<TabData, 'type' | 'filePath'> | null | undefined): string => {
  if (!tab || tab.type !== 'query') return '';
  return toTrimmedString(tab.filePath);
};

export const isSQLFileQueryTab = (tab: Pick<TabData, 'type' | 'filePath'> | null | undefined): boolean =>
  Boolean(getSQLFileTabPath(tab));

export const normalizeSQLFileReadContent = (data: unknown): string => {
  if (data && typeof data === 'object') {
    const payload = data as Record<string, unknown>;
    if ('content' in payload) {
      return String(payload.content ?? '');
    }
    return '';
  }
  return String(data ?? '');
};

export const hasSQLFileTabUnsavedChanges = (
  tab: Pick<TabData, 'type' | 'filePath' | 'query'>,
  diskContent: string,
): boolean => {
  if (!isSQLFileQueryTab(tab)) return false;
  return String(tab.query ?? '') !== diskContent;
};

const SQL_FILE_MISSING_MESSAGE_PATTERNS = [
  'no such file or directory',
  'cannot find the file specified',
  'system cannot find the file specified',
  'does not exist',
  'not exist',
  '\u7cfb\u7edf\u627e\u4e0d\u5230\u6307\u5b9a\u7684\u6587\u4ef6',
  '\u6587\u4ef6\u4e0d\u5b58\u5728',
  '\u7cfb\u7d71\u627e\u4e0d\u5230\u6307\u5b9a\u7684\u6a94\u6848',
  '\u6a94\u6848\u4e0d\u5b58\u5728',
];

export const isSQLFileMissingErrorMessage = (message: unknown): boolean => {
  const normalizedMessage = toTrimmedString(message).toLowerCase();
  if (!normalizedMessage) return false;
  return SQL_FILE_MISSING_MESSAGE_PATTERNS.some((pattern) => normalizedMessage.includes(pattern));
};

export const isSQLFileMissingReadResult = (result: unknown): boolean => {
  if (!result || typeof result !== 'object') return false;
  const payload = result as Record<string, unknown>;
  if (payload.success === true) return false;

  const data = payload.data;
  if (data && typeof data === 'object') {
    const errorCode = toTrimmedString((data as Record<string, unknown>).errorCode).toLowerCase();
    if (errorCode === SQL_FILE_NOT_FOUND_ERROR_CODE) {
      return true;
    }
  }

  return isSQLFileMissingErrorMessage(payload.message);
};
