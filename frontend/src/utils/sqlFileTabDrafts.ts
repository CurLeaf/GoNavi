import type { TabData } from '../types';

const drafts = new Map<string, string>();

const QUERY_TAB_DRAFT_SNAPSHOT_STORAGE_KEY = 'gonavi-query-tab-drafts-v1';
const QUERY_TAB_DRAFT_SNAPSHOT_MAX_COUNT = 30;
const QUERY_TAB_DRAFT_SNAPSHOT_MAX_TEXT_LENGTH = 1024 * 1024;
const QUERY_TAB_DRAFT_SNAPSHOT_DEBOUNCE_MS = 160;

type PersistedQueryTabDraftEntry = {
  tabId: string;
  title: string;
  query: string;
  connectionId: string;
  dbName: string;
  filePath?: string;
  savedQueryId?: string;
  readOnly?: boolean;
  updatedAt: number;
};

type QueryTabDraftSnapshotTab = Pick<
  TabData,
  'id' | 'title' | 'connectionId' | 'dbName' | 'filePath' | 'savedQueryId' | 'readOnly'
>;

const persistedDrafts = new Map<string, PersistedQueryTabDraftEntry>();

let persistedDraftsHydrated = false;
let persistTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
let flushListenersBound = false;

const getWindowTimerApi = (): {
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
} | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  const setTimeoutImpl = typeof window.setTimeout === 'function' ? window.setTimeout.bind(window) : globalThis.setTimeout;
  const clearTimeoutImpl = typeof window.clearTimeout === 'function' ? window.clearTimeout.bind(window) : globalThis.clearTimeout;
  if (typeof setTimeoutImpl !== 'function' || typeof clearTimeoutImpl !== 'function') {
    return null;
  }
  return {
    setTimeout: setTimeoutImpl,
    clearTimeout: clearTimeoutImpl,
  };
};

const toTabId = (value: unknown): string => String(value ?? '').trim();

const toTrimmedString = (value: unknown, fallback = ''): string => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const getDraftSnapshotStorage = (): Storage | null => {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  return localStorage;
};

const normalizePersistedDraftEntry = (
  value: unknown,
): PersistedQueryTabDraftEntry | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const tabId = toTabId(raw.tabId);
  if (!tabId) {
    return null;
  }
  const query = String(raw.query ?? '').slice(0, QUERY_TAB_DRAFT_SNAPSHOT_MAX_TEXT_LENGTH);
  const filePath = toTrimmedString(raw.filePath);
  const savedQueryId = toTrimmedString(raw.savedQueryId);
  if (!query.trim() && !filePath && !savedQueryId) {
    return null;
  }
  const updatedAt = Number(raw.updatedAt);
  return {
    tabId,
    title: toTrimmedString(raw.title, 'SQL Query'),
    query,
    connectionId: toTrimmedString(raw.connectionId),
    dbName: toTrimmedString(raw.dbName),
    filePath: filePath || undefined,
    savedQueryId: savedQueryId || undefined,
    readOnly: raw.readOnly === true,
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? Math.trunc(updatedAt) : Date.now(),
  };
};

const ensurePersistedDraftsHydrated = (): void => {
  if (persistedDraftsHydrated) {
    return;
  }
  persistedDraftsHydrated = true;
  const storage = getDraftSnapshotStorage();
  if (!storage) {
    return;
  }
  try {
    const raw = storage.getItem(QUERY_TAB_DRAFT_SNAPSHOT_STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return;
    }
    parsed
      .map((entry) => normalizePersistedDraftEntry(entry))
      .filter((entry): entry is PersistedQueryTabDraftEntry => !!entry)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, QUERY_TAB_DRAFT_SNAPSHOT_MAX_COUNT)
      .forEach((entry) => {
        persistedDrafts.set(entry.tabId, entry);
        drafts.set(entry.tabId, entry.query);
      });
  } catch {
    // ignore invalid crash-recovery payloads
  }
};

const flushPersistedDrafts = (): void => {
  const timerApi = getWindowTimerApi();
  if (persistTimer !== null && timerApi) {
    timerApi.clearTimeout(persistTimer);
    persistTimer = null;
  }
  const storage = getDraftSnapshotStorage();
  if (!storage) {
    return;
  }
  try {
    if (persistedDrafts.size === 0) {
      storage.removeItem(QUERY_TAB_DRAFT_SNAPSHOT_STORAGE_KEY);
      return;
    }
    const payload = Array.from(persistedDrafts.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, QUERY_TAB_DRAFT_SNAPSHOT_MAX_COUNT);
    storage.setItem(
      QUERY_TAB_DRAFT_SNAPSHOT_STORAGE_KEY,
      JSON.stringify(payload),
    );
  } catch {
    // ignore storage quota or serialization failures
  }
};

const bindFlushListeners = (): void => {
  if (flushListenersBound || typeof window === 'undefined') {
    return;
  }
  flushListenersBound = true;
  const handleFlush = () => {
    flushPersistedDrafts();
  };
  window.addEventListener('pagehide', handleFlush, { capture: true });
  window.addEventListener('beforeunload', handleFlush, { capture: true });
  if (typeof document !== 'undefined') {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPersistedDrafts();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }
};

const schedulePersistedDraftFlush = (): void => {
  bindFlushListeners();
  const timerApi = getWindowTimerApi();
  if (!timerApi) {
    flushPersistedDrafts();
    return;
  }
  if (persistTimer !== null) {
    timerApi.clearTimeout(persistTimer);
  }
  persistTimer = timerApi.setTimeout(() => {
    flushPersistedDrafts();
  }, QUERY_TAB_DRAFT_SNAPSHOT_DEBOUNCE_MS);
};

const upsertPersistedDraftEntry = (
  tab: QueryTabDraftSnapshotTab,
  content: string,
  overrides?: { connectionId?: string; dbName?: string },
): void => {
  ensurePersistedDraftsHydrated();
  const tabId = toTabId(tab.id);
  if (!tabId) {
    return;
  }
  const query = String(content ?? '').slice(0, QUERY_TAB_DRAFT_SNAPSHOT_MAX_TEXT_LENGTH);
  const filePath = toTrimmedString(tab.filePath);
  const savedQueryId = toTrimmedString(tab.savedQueryId);
  const shouldKeep = Boolean(query.trim() || filePath || savedQueryId);
  if (!shouldKeep) {
    persistedDrafts.delete(tabId);
    schedulePersistedDraftFlush();
    return;
  }
  persistedDrafts.set(tabId, {
    tabId,
    title: toTrimmedString(tab.title, 'SQL Query'),
    query,
    connectionId: toTrimmedString(overrides?.connectionId, toTrimmedString(tab.connectionId)),
    dbName: toTrimmedString(overrides?.dbName, toTrimmedString(tab.dbName)),
    filePath: filePath || undefined,
    savedQueryId: savedQueryId || undefined,
    readOnly: tab.readOnly === true,
    updatedAt: Date.now(),
  });
  schedulePersistedDraftFlush();
};

export const setQueryTabDraft = (tabId: string, content: string): void => {
  ensurePersistedDraftsHydrated();
  const id = toTabId(tabId);
  if (!id) return;
  drafts.set(id, String(content ?? ''));
};

export const getQueryTabDraft = (tabId: string, fallback = ''): string => {
  ensurePersistedDraftsHydrated();
  const id = toTabId(tabId);
  if (!id || !drafts.has(id)) {
    return fallback;
  }
  return drafts.get(id) ?? fallback;
};

export const clearQueryTabDraft = (tabId: string): void => {
  ensurePersistedDraftsHydrated();
  const id = toTabId(tabId);
  if (!id) return;
  drafts.delete(id);
  if (persistedDrafts.delete(id)) {
    schedulePersistedDraftFlush();
  }
};

export const hasQueryTabDraft = (tabId: string): boolean => {
  ensurePersistedDraftsHydrated();
  const id = toTabId(tabId);
  return Boolean(id && drafts.has(id));
};

export const persistQueryTabDraftSnapshot = (
  tab: QueryTabDraftSnapshotTab,
  content: string,
  overrides?: { connectionId?: string; dbName?: string },
): void => {
  const tabId = toTabId(tab.id);
  if (!tabId) {
    return;
  }
  setQueryTabDraft(tabId, content);
  upsertPersistedDraftEntry(tab, content, overrides);
};

export const getPersistedQueryTabDraftEntry = (
  tabId: string,
): PersistedQueryTabDraftEntry | null => {
  ensurePersistedDraftsHydrated();
  const id = toTabId(tabId);
  if (!id) {
    return null;
  }
  return persistedDrafts.get(id) || null;
};

export const listPersistedQueryTabDraftEntries = (): PersistedQueryTabDraftEntry[] => {
  ensurePersistedDraftsHydrated();
  return Array.from(persistedDrafts.values()).sort((a, b) => b.updatedAt - a.updatedAt);
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
