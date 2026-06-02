const drafts = new Map<string, string>();

const toTabId = (value: unknown): string => String(value ?? '').trim();

export const setQueryTabDraft = (tabId: string, content: string): void => {
  const id = toTabId(tabId);
  if (!id) return;
  drafts.set(id, String(content ?? ''));
};

export const getQueryTabDraft = (tabId: string, fallback = ''): string => {
  const id = toTabId(tabId);
  if (!id || !drafts.has(id)) {
    return fallback;
  }
  return drafts.get(id) ?? fallback;
};

export const clearQueryTabDraft = (tabId: string): void => {
  const id = toTabId(tabId);
  if (!id) return;
  drafts.delete(id);
};

export const hasQueryTabDraft = (tabId: string): boolean => {
  const id = toTabId(tabId);
  return Boolean(id && drafts.has(id));
};

export const setSQLFileTabDraft = (tabId: string, content: string): void => {
  setQueryTabDraft(tabId, content);
};

export const getSQLFileTabDraft = (tabId: string, fallback = ''): string => {
  return getQueryTabDraft(tabId, fallback);
};

export const clearSQLFileTabDraft = (tabId: string): void => {
  clearQueryTabDraft(tabId);
};

export const hasSQLFileTabDraft = (tabId: string): boolean => {
  return hasQueryTabDraft(tabId);
};
