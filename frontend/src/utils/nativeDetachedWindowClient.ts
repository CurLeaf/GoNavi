import type { TabData } from '../types';
import type {
  DetachedQueryResultWindow,
  DetachedQueryResultSnapshot,
} from './detachedWindow';
import type { QueryEditorResultSessionSnapshot } from './queryEditorResultSessionCache';
import { isNativeDetachedWindowRoute } from './nativeDetachedWindowRoute';
import { resolveLiveQueryTab } from './liveQueryTabs';
import { setQueryTabDraft } from './sqlFileTabDrafts';
import { sanitizeTableAccessCount } from './tableAccessCount';
import {
  sanitizeCustomThemeDefinition,
  type CustomThemeDefinition,
} from './customTheme';

export const NATIVE_DETACHED_BOOTSTRAP_URL = '/__gonavi/detached/bootstrap';
export const NATIVE_DETACHED_ACTION_URL = '/__gonavi/detached/action';
export { NATIVE_DETACHED_WINDOW_QUERY_PARAM } from './nativeDetachedWindowRoute';
export const NATIVE_DETACHED_WINDOW_COMMAND_EVENT = 'gonavi:native-detached-command';
export const NATIVE_DETACHED_QUERY_RESULT_REDETACH_EVENT = 'gonavi:redetach-query-result';

export const NATIVE_DETACHED_HOST_EVENTS_KEY = '__gonaviNativeHostEvents';
/** Reserved snapshot key; it is consumed by the detached document, not hydrated into Zustand. */
export const NATIVE_DETACHED_CUSTOM_THEME_CONTEXT_KEY = '__gonaviNativeCustomThemeContext';

export type NativeDetachedThemeContext = CustomThemeDefinition | null;

/**
 * Read a host-owned custom theme from a bootstrap or host-state snapshot.
 * An absent key means an older host did not provide the context; an explicit
 * null means the host intentionally has no active custom theme.
 */
export const readNativeDetachedThemeContext = (
  snapshot: object | null | undefined,
): NativeDetachedThemeContext | undefined => {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return undefined;
  const source = snapshot as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(source, NATIVE_DETACHED_CUSTOM_THEME_CONTEXT_KEY)) {
    return undefined;
  }
  const raw = source[NATIVE_DETACHED_CUSTOM_THEME_CONTEXT_KEY];
  if (raw === null) return null;
  return sanitizeCustomThemeDefinition(raw);
};

const withNativeDetachedThemeContext = (
  storeState: NativeDetachedStoreSnapshot,
  themeContext: NativeDetachedThemeContext | undefined,
): NativeDetachedStoreSnapshot => {
  if (themeContext === undefined) return storeState;
  return {
    ...storeState,
    [NATIVE_DETACHED_CUSTOM_THEME_CONTEXT_KEY]: themeContext,
  };
};

export const NATIVE_DETACHED_HOST_EVENT_NAMES = [
  'gonavi:locate-sidebar-object',
  'gonavi:insert-sql',
  'gonavi:insert-sql-to-tab',
  'gonavi:open-download-source-settings',
  'gonavi:open-global-proxy-settings',
] as const;

export type NativeDetachedHostEventName = typeof NATIVE_DETACHED_HOST_EVENT_NAMES[number];

export interface NativeDetachedHostEvent {
  id: string;
  name: NativeDetachedHostEventName;
  detail?: unknown;
}

export type NativeDetachedWindowKind = 'workbench' | 'query-result';
export type NativeDetachedWindowAction =
  | 'ready'
  | 'sync'
  | 'attach'
  | 'hide'
  | 'close'
  | 'cancel-close'
  | 'host-event';
export type NativeDetachedStoreSnapshot = Record<string, unknown>;

export interface NativeDetachedWindowPayload {
  storeState: NativeDetachedStoreSnapshot;
  tab?: TabData;
  resultWindow?: DetachedQueryResultWindow;
  resultSession?: QueryEditorResultSessionSnapshot | null;
}

export interface NativeDetachedWindowBootstrap {
  id: string;
  kind: NativeDetachedWindowKind;
  title: string;
  payload: NativeDetachedWindowPayload;
  actionRevision?: number;
}

export interface NativeDetachedWindowActionPayload {
  id: string;
  kind: NativeDetachedWindowKind;
  providerId?: string;
  revision?: number;
  rollbackAction?: 'attach' | 'hide' | 'close';
  storeState?: NativeDetachedStoreSnapshot;
  tab?: TabData;
  resultWindow?: DetachedQueryResultWindow;
  resultSession?: QueryEditorResultSessionSnapshot | null;
  hostEvent?: NativeDetachedHostEvent;
  openedTabs?: TabData[];
  workbenchState?: NativeDetachedStoreSnapshot;
  workbenchStateBase?: NativeDetachedStoreSnapshot;
  clearSqlLogs?: boolean;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export const buildNativeDetachedSyncStoreSnapshot = (
  state: object,
  tabId: string,
  newSqlLogs: unknown[] = [],
): NativeDetachedStoreSnapshot => {
  const record = state as Record<string, unknown>;
  const pending = record.sqlEditorPendingTransactions;
  const pendingRecord = pending && typeof pending === 'object'
    ? pending as Record<string, unknown>
    : {};
  return buildNativeDetachedStoreSnapshot({
    ...(tabId
      ? {
          sqlEditorPendingTransactions: {
            [tabId]: Object.prototype.hasOwnProperty.call(pendingRecord, tabId)
              ? pendingRecord[tabId]
              : null,
          },
        }
      : {}),
    ...(newSqlLogs.length > 0 ? { sqlLogs: newSqlLogs } : {}),
  });
};

export interface NativeDetachedWindowActionRequest {
  action: NativeDetachedWindowAction;
  payload: NativeDetachedWindowActionPayload;
}

export interface NativeDetachedWindowActionResult {
  success: boolean;
  applied?: boolean;
  message?: string;
  id?: string;
  visibilityRevision?: number;
}

export interface NativeDetachedHostStateCommand {
  id: string;
  action: 'sync-host-state' | string;
  payload?: {
    revision?: number;
    visibilityRevision?: number;
    storeState?: NativeDetachedStoreSnapshot;
  };
}

type FetchLike = typeof fetch;

type StoreApiLike<TState extends object> = {
  getState: () => TState;
  setState: (nextState: TState, replace?: boolean) => void;
};

const OMIT_VALUE = Symbol('gonavi.native-detached.omit');
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const WORKBENCH_BOOTSTRAP_OMITTED_KEYS = new Set([
  'jvmDiagnosticDrafts',
  'jvmDiagnosticOutputs',
  'tabs',
  'detachedWorkbenchWindows',
  'detachedQueryResultWindows',
  'sqlEditorPendingTransactions',
]);
const QUERY_RESULT_BOOTSTRAP_OMITTED_KEYS = new Set([
  ...WORKBENCH_BOOTSTRAP_OMITTED_KEYS,
  'sqlLogs',
]);
const NATIVE_DETACHED_PROCESSED_EVENT_LIMIT = 256;
const NATIVE_DETACHED_HOST_EVENT_NAME_SET = new Set<string>(NATIVE_DETACHED_HOST_EVENT_NAMES);
export const NATIVE_DETACHED_WORKBENCH_MUTABLE_KEYS = [
  'activeContext',
  'pinnedSidebarTables',
  'queryOptions',
  'sqlFormatOptions',
  'dataEditTransactionOptions',
  'sqlEditorTransactionOptions',
  'tableColumnOrders',
  'enableColumnOrderMemory',
  'tablePinnedLeftColumns',
  'tableHiddenColumns',
  'enableHiddenColumnMemory',
  'shortcutOptions',
  'savedQueries',
  'recentConnectionTargets',
  'recentSQLFiles',
  'tableExportHistories',
  'tableAccessCount',
  'tableSortPreference',
  'jvmDiagnosticDrafts',
  'jvmDiagnosticOutputs',
] as const;

const cloneSerializableValue = (
  value: unknown,
  ancestors: WeakSet<object>,
): unknown | typeof OMIT_VALUE => {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    return OMIT_VALUE;
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'bigint') {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value !== 'object') {
    return OMIT_VALUE;
  }
  if (ancestors.has(value)) {
    return OMIT_VALUE;
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const result: unknown[] = [];
      for (const item of value) {
        const cloned = cloneSerializableValue(item, ancestors);
        if (cloned !== OMIT_VALUE) {
          result.push(cloned);
        }
      }
      return result;
    }

    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (UNSAFE_OBJECT_KEYS.has(key)) continue;
      const cloned = cloneSerializableValue(item, ancestors);
      if (cloned !== OMIT_VALUE) {
        result[key] = cloned;
      }
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
};

/** Build the JSON-safe, data-only part of a Zustand state object. */
export const buildNativeDetachedStoreSnapshot = (
  state: object,
): NativeDetachedStoreSnapshot => {
  const cloned = cloneSerializableValue(state, new WeakSet());
  return cloned && cloned !== OMIT_VALUE && !Array.isArray(cloned)
    ? cloned as NativeDetachedStoreSnapshot
    : {};
};

const buildFilteredStoreSnapshot = (
  state: object,
  omittedKeys: ReadonlySet<string>,
): NativeDetachedStoreSnapshot => {
  const source = state as Record<string, unknown>;
  const filtered: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    if (omittedKeys.has(key)) continue;
    filtered[key] = source[key];
  }
  return buildNativeDetachedStoreSnapshot(filtered);
};

export const buildNativeDetachedWorkbenchPayload = (
  state: object,
  tab: TabData,
  resultSession?: QueryEditorResultSessionSnapshot | null,
  themeContext?: NativeDetachedThemeContext,
): NativeDetachedWindowPayload => {
  const liveTab = resolveLiveQueryTab(tab);
  const storeState = buildFilteredStoreSnapshot(state, WORKBENCH_BOOTSTRAP_OMITTED_KEYS);
  const source = state as Record<string, unknown>;
  const allPending = source.sqlEditorPendingTransactions;
  const pendingRecord = allPending && typeof allPending === 'object'
    ? allPending as Record<string, unknown>
    : {};
  storeState.tabs = [liveTab];
  storeState.activeTabId = liveTab.id;
  storeState.detachedWorkbenchWindows = [];
  storeState.detachedQueryResultWindows = [];
  storeState.sqlEditorPendingTransactions = buildNativeDetachedStoreSnapshot(
    Object.prototype.hasOwnProperty.call(pendingRecord, liveTab.id)
      ? { [liveTab.id]: pendingRecord[liveTab.id] }
      : {},
  );
  const diagnosticDrafts = source.jvmDiagnosticDrafts;
  const diagnosticOutputs = source.jvmDiagnosticOutputs;
  const diagnosticDraftRecord = diagnosticDrafts && typeof diagnosticDrafts === 'object'
    ? diagnosticDrafts as Record<string, unknown>
    : {};
  const diagnosticOutputRecord = diagnosticOutputs && typeof diagnosticOutputs === 'object'
    ? diagnosticOutputs as Record<string, unknown>
    : {};
  storeState.jvmDiagnosticDrafts = buildNativeDetachedStoreSnapshot(
    Object.prototype.hasOwnProperty.call(diagnosticDraftRecord, liveTab.id)
      ? { [liveTab.id]: diagnosticDraftRecord[liveTab.id] }
      : {},
  );
  storeState.jvmDiagnosticOutputs = buildNativeDetachedStoreSnapshot(
    Object.prototype.hasOwnProperty.call(diagnosticOutputRecord, liveTab.id)
      ? { [liveTab.id]: diagnosticOutputRecord[liveTab.id] }
      : {},
  );
  return {
    storeState: withNativeDetachedThemeContext(storeState, themeContext),
    tab: liveTab,
    resultSession: resultSession ?? null,
  };
};

export const buildNativeDetachedQueryResultPayload = (
  state: object,
  resultWindow: DetachedQueryResultWindow,
  themeContext?: NativeDetachedThemeContext,
): NativeDetachedWindowPayload => {
  const storeState = buildFilteredStoreSnapshot(state, QUERY_RESULT_BOOTSTRAP_OMITTED_KEYS);
  storeState.tabs = [];
  storeState.activeTabId = null;
  storeState.detachedWorkbenchWindows = [];
  storeState.detachedQueryResultWindows = [];
  storeState.sqlLogs = [];
  storeState.sqlEditorPendingTransactions = {};
  return {
    storeState: withNativeDetachedThemeContext(storeState, themeContext),
    resultWindow: {
      ...resultWindow,
      result: buildNativeDetachedQueryResultSnapshot(resultWindow.result),
    },
  };
};

export const buildNativeDetachedWorkbenchMutableStoreSnapshot = (
  state: object,
): NativeDetachedStoreSnapshot => {
  const source = state as Record<string, unknown>;
  const snapshot: Record<string, unknown> = {};
  for (const key of NATIVE_DETACHED_WORKBENCH_MUTABLE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) snapshot[key] = source[key];
  }
  return buildNativeDetachedStoreSnapshot(snapshot);
};

export const buildNativeDetachedChangedWorkbenchStoreSnapshot = (
  state: object,
  previousSource: NativeDetachedStoreSnapshot,
): NativeDetachedStoreSnapshot => {
  const current = buildNativeDetachedWorkbenchMutableStoreSnapshot(state);
  const changed: NativeDetachedStoreSnapshot = {};
  for (const key of NATIVE_DETACHED_WORKBENCH_MUTABLE_KEYS) {
    if (JSON.stringify(current[key]) !== JSON.stringify(previousSource[key])) {
      changed[key] = current[key];
    }
  }
  return changed;
};

const mergeNativeDetachedValueDelta = (
  currentValue: unknown,
  previousSourceValue: unknown,
  nextSourceValue: unknown,
  path: string[] = [],
): unknown => {
  if (Array.isArray(previousSourceValue) && Array.isArray(nextSourceValue)) {
    const rootKey = path[0] || '';
    const supportsIdentityMerge = rootKey === 'savedQueries'
      || rootKey === 'recentConnectionTargets'
      || rootKey === 'recentSQLFiles'
      || rootKey === 'tableExportHistories'
      || rootKey === 'pinnedSidebarTables';
    if (supportsIdentityMerge) {
      const identity = (item: unknown): string | null => {
        if (rootKey === 'pinnedSidebarTables') {
          return typeof item === 'string' && item ? `value:${item}` : null;
        }
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const record = item as Record<string, unknown>;
        if (rootKey === 'savedQueries') {
          const id = String(record.id || '').trim();
          return id ? `id:${id}` : null;
        }
        if (rootKey === 'recentConnectionTargets') {
          const connectionId = String(record.connectionId || '').trim();
          return connectionId
            ? `target:${connectionId}\u0000${String(record.dbName || '')}`
            : null;
        }
        if (rootKey === 'recentSQLFiles') {
          const connectionId = String(record.connectionId || '').trim();
          const filePath = String(record.filePath || '').trim().replace(/\\/g, '/');
          return connectionId && filePath
            ? `file:${connectionId}\u0000${String(record.dbName || '')}\u0000${filePath}`
            : null;
        }
        if (rootKey === 'tableExportHistories') {
          const jobId = String(record.jobId || '').trim();
          return jobId ? `job:${jobId}` : null;
        }
        return null;
      };
      const previousIds = previousSourceValue.map(identity);
      const nextIds = nextSourceValue.map(identity);
      if (previousIds.every(Boolean) && nextIds.every(Boolean)) {
        const previousById = new Map(previousIds.map((id, index) => [id!, previousSourceValue[index]]));
        const nextById = new Map(nextIds.map((id, index) => [id!, nextSourceValue[index]]));
        const currentItems = Array.isArray(currentValue) ? currentValue : [];
        const currentById = new Map(
          currentItems.flatMap((item) => {
            const id = identity(item);
            return id ? [[id, item] as const] : [];
          }),
        );
        const changedIds = new Set<string>();
        for (const id of new Set([...previousById.keys(), ...nextById.keys()])) {
          if (!previousById.has(id)
            || !nextById.has(id)
            || JSON.stringify(previousById.get(id)) !== JSON.stringify(nextById.get(id))) {
            changedIds.add(id);
          }
        }
        const merged = nextIds.map((id, index) => (
          changedIds.has(id!) ? nextSourceValue[index] : currentById.get(id!) ?? nextSourceValue[index]
        ));
        const nextIdSet = new Set(nextIds);
        const previousIdSet = new Set(previousIds);
        for (const item of currentItems) {
          const id = identity(item);
          if (id && !previousIdSet.has(id) && !nextIdSet.has(id)) merged.push(item);
        }
        if (rootKey === 'recentConnectionTargets' || rootKey === 'recentSQLFiles') {
          merged.sort((left, right) => {
            const leftAt = Number((left as Record<string, unknown>)?.openedAt || 0);
            const rightAt = Number((right as Record<string, unknown>)?.openedAt || 0);
            return rightAt - leftAt;
          });
        }
        return buildNativeDetachedStoreSnapshot({ value: merged }).value;
      }
    }
  }
  const currentIsRecord = Boolean(currentValue)
    && typeof currentValue === 'object'
    && !Array.isArray(currentValue);
  const previousIsRecord = Boolean(previousSourceValue)
    && typeof previousSourceValue === 'object'
    && !Array.isArray(previousSourceValue);
  const nextIsRecord = Boolean(nextSourceValue)
    && typeof nextSourceValue === 'object'
    && !Array.isArray(nextSourceValue);
  if (!previousIsRecord || !nextIsRecord) {
    return buildNativeDetachedStoreSnapshot({ value: nextSourceValue }).value;
  }

  const current = currentIsRecord
    ? currentValue as Record<string, unknown>
    : {};
  const previous = previousSourceValue as Record<string, unknown>;
  const next = nextSourceValue as Record<string, unknown>;
  const result: Record<string, unknown> = { ...current };
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of keys) {
    if (UNSAFE_OBJECT_KEYS.has(key)) continue;
    const hadBefore = Object.prototype.hasOwnProperty.call(previous, key);
    const hasNext = Object.prototype.hasOwnProperty.call(next, key);
    if (hadBefore === hasNext
      && JSON.stringify(previous[key]) === JSON.stringify(next[key])) continue;
    if (!hasNext) {
      delete result[key];
      continue;
    }
    result[key] = mergeNativeDetachedValueDelta(
      result[key],
      hadBefore ? previous[key] : undefined,
      next[key],
      [...path, key],
    );
  }
  return result;
};

export const mergeNativeDetachedStoreDelta = (
  currentState: NativeDetachedStoreSnapshot,
  previousSource: NativeDetachedStoreSnapshot,
  changedSource: NativeDetachedStoreSnapshot,
): NativeDetachedStoreSnapshot => {
  const nextState = { ...currentState };
  for (const [key, nextSourceValue] of Object.entries(changedSource)) {
    if (UNSAFE_OBJECT_KEYS.has(key)) continue;
    const mergedValue = mergeNativeDetachedValueDelta(
      currentState[key],
      previousSource[key],
      nextSourceValue,
      [key],
    );
    nextState[key] = key === 'tableAccessCount'
      ? sanitizeTableAccessCount(mergedValue)
      : mergedValue;
  }
  return nextState;
};

export const advanceNativeDetachedStoreSource = (
  previousSource: NativeDetachedStoreSnapshot,
  changedSource: NativeDetachedStoreSnapshot,
): NativeDetachedStoreSnapshot => ({
  ...previousSource,
  ...buildNativeDetachedStoreSnapshot(changedSource),
});

export const buildNativeDetachedQueryResultSnapshot = (
  result: DetachedQueryResultSnapshot,
): DetachedQueryResultSnapshot => {
  const cloned = cloneSerializableValue(result, new WeakSet());
  return cloned && cloned !== OMIT_VALUE && !Array.isArray(cloned)
    ? cloned as DetachedQueryResultSnapshot
    : {
        key: '',
        sql: '',
        rows: [],
        columns: [],
        pkColumns: [],
        readOnly: true,
      };
};

/** Merge bootstrap state without replacing any action currently installed by Zustand. */
export const mergeNativeDetachedStoreState = <TState extends object>(
  currentState: TState,
  snapshot: NativeDetachedStoreSnapshot,
): TState => {
  const nextState = { ...currentState } as Record<string, unknown>;
  const currentRecord = currentState as Record<string, unknown>;
  const safeSnapshot = buildNativeDetachedStoreSnapshot(snapshot);

  for (const [key, value] of Object.entries(safeSnapshot)) {
    if (UNSAFE_OBJECT_KEYS.has(key)) continue;
    if (!Object.prototype.hasOwnProperty.call(currentRecord, key)) continue;
    if (typeof currentRecord[key] === 'function') continue;
    nextState[key] = value;
  }
  return nextState as TState;
};

export const hydrateNativeDetachedStore = <TState extends object>(
  store: StoreApiLike<TState>,
  snapshot: NativeDetachedStoreSnapshot,
): TState => {
  const nextState = mergeNativeDetachedStoreState(store.getState(), snapshot);
  store.setState(nextState, true);
  return nextState;
};

export const applyNativeDetachedHostStateSync = <TState extends object>(
  currentState: TState,
  snapshot: NativeDetachedStoreSnapshot,
): TState => {
  const safe = buildNativeDetachedStoreSnapshot(snapshot);
  const hostStatePatch: NativeDetachedStoreSnapshot = {};
  for (const key of ['theme', 'themePreference', 'appearance', 'fontSize', 'uiScale'] as const) {
    if (Object.prototype.hasOwnProperty.call(safe, key)) {
      hostStatePatch[key] = safe[key];
    }
  }
  if (Object.prototype.hasOwnProperty.call(safe, 'activeContext')) {
    hostStatePatch.activeContext = safe.activeContext ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(safe, 'activeTabId')) {
    hostStatePatch.activeTabId = safe.activeTabId ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(safe, 'shortcutOptions')) {
    hostStatePatch.shortcutOptions = safe.shortcutOptions;
  }
  const next = mergeNativeDetachedStoreState(currentState, hostStatePatch) as Record<string, unknown>;

  const mergeById = (key: 'tabs' | 'connections', incoming: unknown): void => {
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return;
    const id = String((incoming as { id?: unknown }).id || '').trim();
    const current = next[key];
    if (!id || !Array.isArray(current)) return;
    const index = current.findIndex((item) => (
      item && typeof item === 'object' && String((item as { id?: unknown }).id || '') === id
    ));
    next[key] = index >= 0
      ? current.map((item, itemIndex) => itemIndex === index ? incoming : item)
      : [...current, incoming];
  };

  mergeById('tabs', safe.activeTab);
  mergeById('connections', safe.activeConnection);
  return next as TState;
};

export type NativeDetachedHostStateApplyOptions = {
  processedEventIds?: Set<string>;
  dispatchHostEvent?: (event: NativeDetachedHostEvent) => void;
};

const readNativeDetachedHostEvents = (
  snapshot: NativeDetachedStoreSnapshot,
): NativeDetachedHostEvent[] => {
  const rawEvents = snapshot[NATIVE_DETACHED_HOST_EVENTS_KEY];
  if (!Array.isArray(rawEvents)) return [];
  return rawEvents.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const id = String(record.id || '').trim();
    const name = String(record.name || '').trim();
    if (!id || !NATIVE_DETACHED_HOST_EVENT_NAME_SET.has(name)) return [];
    return [{
      id,
      name: name as NativeDetachedHostEventName,
      ...(Object.prototype.hasOwnProperty.call(record, 'detail') ? { detail: record.detail } : {}),
    }];
  });
};

export const applyNativeDetachedHostStateCommand = <TState extends object>(
  store: StoreApiLike<TState>,
  currentWindowId: string,
  currentRevision: number,
  command: NativeDetachedHostStateCommand,
  options: NativeDetachedHostStateApplyOptions = {},
): number => {
  const revision = Math.trunc(Number(command?.payload?.revision));
  if (
    command?.action !== 'sync-host-state'
    || String(command?.id || '') !== String(currentWindowId || '')
    || !Number.isFinite(revision)
    || revision <= currentRevision
    || !command.payload?.storeState
    || typeof command.payload.storeState !== 'object'
    || Array.isArray(command.payload.storeState)
  ) {
    return currentRevision;
  }
  const safeSnapshot = buildNativeDetachedStoreSnapshot(command.payload.storeState);
  const activeTab = safeSnapshot.activeTab;
  if (
    activeTab
    && typeof activeTab === 'object'
    && !Array.isArray(activeTab)
    && (activeTab as Record<string, unknown>).type === 'query'
    && typeof (activeTab as Record<string, unknown>).id === 'string'
    && typeof (activeTab as Record<string, unknown>).query === 'string'
  ) {
    const queryTab = activeTab as Record<string, unknown>;
    setQueryTabDraft(queryTab.id as string, queryTab.query as string);
  }
  store.setState(applyNativeDetachedHostStateSync(
    store.getState(),
    safeSnapshot,
  ), true);
  const processedIds = options.processedEventIds;
  for (const event of readNativeDetachedHostEvents(safeSnapshot)) {
    if (processedIds?.has(event.id)) continue;
    processedIds?.add(event.id);
    while (processedIds && processedIds.size > NATIVE_DETACHED_PROCESSED_EVENT_LIMIT) {
      const oldest = processedIds.values().next().value;
      if (typeof oldest !== 'string') break;
      processedIds.delete(oldest);
    }
    options.dispatchHostEvent?.(event);
  }
  return revision;
};

export const isNativeDetachedWindow = (
  locationLike?: Pick<Location, 'pathname' | 'search'>,
): boolean => isNativeDetachedWindowRoute(undefined, locationLike);

const requireSuccessfulResponse = async (response: Response): Promise<Response> => {
  if (response.ok) return response;
  const body = await response.text().catch(() => '');
  throw new Error(
    `Native detached window request failed (${response.status})${body ? `: ${body}` : ''}`,
  );
};

export const fetchNativeDetachedWindowBootstrap = async (
  fetchImpl?: FetchLike,
): Promise<NativeDetachedWindowBootstrap> => {
  const nativeLoader = !fetchImpl && typeof window !== 'undefined'
    ? (window as any).__GONAVI_DETACHED__?.loadBootstrap
    : undefined;
  const bootstrap = typeof nativeLoader === 'function'
    ? await nativeLoader() as NativeDetachedWindowBootstrap
    : await (async () => {
        const request = fetchImpl ?? fetch;
        const response = await requireSuccessfulResponse(await request(
          NATIVE_DETACHED_BOOTSTRAP_URL,
          {
            method: 'GET',
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
          },
        ));
        return response.json() as Promise<NativeDetachedWindowBootstrap>;
      })();
  if (!bootstrap || typeof bootstrap.id !== 'string' || !bootstrap.id.trim()) {
    throw new Error('Native detached window bootstrap is missing an id');
  }
  if (
    bootstrap.kind !== 'workbench'
    && bootstrap.kind !== 'query-result'
  ) {
    throw new Error('Native detached window bootstrap has an invalid kind');
  }
  if (
    !bootstrap.payload
    || !bootstrap.payload.storeState
    || typeof bootstrap.payload.storeState !== 'object'
    || Array.isArray(bootstrap.payload.storeState)
  ) {
    throw new Error('Native detached window bootstrap is missing storeState');
  }
  return bootstrap;
};

export const postNativeDetachedWindowAction = async (
  action: NativeDetachedWindowAction,
  payload: NativeDetachedWindowActionPayload,
  fetchImpl?: FetchLike,
): Promise<NativeDetachedWindowActionResult> => {
  const nativeAction = !fetchImpl && typeof window !== 'undefined'
    ? (window as any).__GONAVI_DETACHED__?.action
    : undefined;
  if (typeof nativeAction === 'function') {
    const result = await nativeAction(action, payload);
    if (result?.success === false) {
      throw new Error(String(result.message || `Native detached ${action} failed`));
    }
    if (result?.applied === false) {
      throw new Error(String(result.message || `Native detached ${action} was ignored`));
    }
    return {
      success: result?.success !== false,
      ...(typeof result?.applied === 'boolean' ? { applied: result.applied } : {}),
      ...(result?.message ? { message: String(result.message) } : {}),
      ...(result?.id ? { id: String(result.id) } : {}),
      ...(Number.isFinite(Number(result?.visibilityRevision))
        ? { visibilityRevision: Number(result.visibilityRevision) }
        : {}),
    };
  }
  const request = fetchImpl ?? fetch;
  const response = await requireSuccessfulResponse(await request(NATIVE_DETACHED_ACTION_URL, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, payload } satisfies NativeDetachedWindowActionRequest),
  }));
  const body = await response.text();
  if (!body.trim()) return { success: true };
  const result = JSON.parse(body) as NativeDetachedWindowActionResult;
  if (result?.success === false) {
    throw new Error(String(result.message || `Native detached ${action} failed`));
  }
  if (result?.applied === false) {
    throw new Error(String(result.message || `Native detached ${action} was ignored`));
  }
  return result;
};

export const syncNativeDetachedWindow = (
  payload: NativeDetachedWindowActionPayload,
  fetchImpl?: FetchLike,
): Promise<void> => postNativeDetachedWindowAction('sync', payload, fetchImpl).then(() => undefined);

export const readyNativeDetachedWindow = (
  payload: NativeDetachedWindowActionPayload,
  fetchImpl?: FetchLike,
): Promise<void> => postNativeDetachedWindowAction('ready', payload, fetchImpl).then(() => undefined);

export const attachNativeDetachedWindow = (
  payload: NativeDetachedWindowActionPayload,
  fetchImpl?: FetchLike,
): Promise<void> => postNativeDetachedWindowAction('attach', payload, fetchImpl).then(() => undefined);

export const hideNativeDetachedWindow = async (
  payload: NativeDetachedWindowActionPayload,
  fetchImpl?: FetchLike,
): Promise<number> => {
  const result = await postNativeDetachedWindowAction('hide', payload, fetchImpl);
  const revision = Math.trunc(Number(result.visibilityRevision));
  if (!Number.isFinite(revision) || revision <= 0) {
    throw new Error('Native detached hide did not return a visibility revision');
  }
  return revision;
};

export const closeNativeDetachedWindow = (
  payload: NativeDetachedWindowActionPayload,
  fetchImpl?: FetchLike,
): Promise<void> => postNativeDetachedWindowAction('close', payload, fetchImpl).then(() => undefined);

export const cancelNativeDetachedWindowClose = (
  payload: NativeDetachedWindowActionPayload,
  fetchImpl?: FetchLike,
): Promise<void> => postNativeDetachedWindowAction('cancel-close', payload, fetchImpl).then(() => undefined);

export const sendNativeDetachedHostEvent = (
  payload: NativeDetachedWindowActionPayload,
  fetchImpl?: FetchLike,
): Promise<void> => postNativeDetachedWindowAction('host-event', payload, fetchImpl).then(() => undefined);

export const presentCurrentNativeDetachedWindow = async (): Promise<void> => {
  const present = typeof window !== 'undefined'
    ? (window as any).__GONAVI_DETACHED__?.present
    : undefined;
  if (typeof present !== 'function') return;
  const result = await present();
  if (result?.success === false) {
    throw new Error(String(result.message || 'Failed to present native detached window'));
  }
};

export const closeCurrentNativeDetachedWindow = async (): Promise<void> => {
  const nativeClose = typeof window !== 'undefined'
    ? (window as any).go?.nativewindow?.Control?.Close
    : undefined;
  if (typeof nativeClose === 'function') {
    const result = await nativeClose();
    if (result?.success === false) {
      throw new Error(String(result.message || 'Failed to close native detached window'));
    }
    return;
  }
  if (typeof window !== 'undefined' && typeof window.close === 'function') {
    window.close();
  }
};

export const hideCurrentNativeDetachedWindow = async (
  visibilityRevision: number,
): Promise<void> => {
  const nativeHide = typeof window !== 'undefined'
    ? (window as any).go?.nativewindow?.Control?.Hide
    : undefined;
  if (typeof nativeHide !== 'function') {
    throw new Error('Native detached hide control is unavailable');
  }
  const result = await nativeHide(Math.trunc(visibilityRevision));
  if (result?.success === false) {
    throw new Error(String(result.message || 'Failed to hide native detached window'));
  }
};

export const cancelCurrentNativeDetachedWindowClose = async (): Promise<void> => {
  const cancelClose = typeof window !== 'undefined'
    ? (window as any).go?.nativewindow?.Control?.CancelClose
    : undefined;
  if (typeof cancelClose !== 'function') return;
  const result = await cancelClose();
  if (result?.success === false) {
    throw new Error(String(result.message || 'Failed to cancel native window close'));
  }
};
