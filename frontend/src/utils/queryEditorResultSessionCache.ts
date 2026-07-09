import type { QueryEditorResultSet } from '../components/QueryEditorResultsPanel';

type QueryEditorResultSessionSnapshot = {
  resultSets: QueryEditorResultSet[];
  activeResultKey: string;
  isResultPanelVisible?: boolean;
};

const cache = new Map<string, QueryEditorResultSessionSnapshot>();

export const saveQueryEditorResultSession = (
  tabId: string,
  snapshot: QueryEditorResultSessionSnapshot,
): void => {
  const id = String(tabId || '').trim();
  if (!id) return;
  cache.set(id, {
    resultSets: Array.isArray(snapshot.resultSets) ? snapshot.resultSets : [],
    activeResultKey: String(snapshot.activeResultKey || ''),
    isResultPanelVisible: snapshot.isResultPanelVisible,
  });
};

export const takeQueryEditorResultSession = (
  tabId: string,
): QueryEditorResultSessionSnapshot | null => {
  const id = String(tabId || '').trim();
  if (!id) return null;
  const snapshot = cache.get(id) || null;
  if (snapshot) {
    cache.delete(id);
  }
  return snapshot;
};

export const peekQueryEditorResultSession = (
  tabId: string,
): QueryEditorResultSessionSnapshot | null => {
  const id = String(tabId || '').trim();
  if (!id) return null;
  return cache.get(id) || null;
};

export const clearQueryEditorResultSession = (tabId: string): void => {
  const id = String(tabId || '').trim();
  if (!id) return;
  cache.delete(id);
};
