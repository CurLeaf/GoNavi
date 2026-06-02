import type { TabData } from '../types';

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

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
