import type { TabData } from '../types';
import type {
  DetachedQueryResultWindow,
  DetachedQueryResultSnapshot,
} from './detachedWindow';
import type { QueryEditorResultSessionSnapshot } from './queryEditorResultSessionCache';

export const NATIVE_DETACHED_BOOTSTRAP_URL = '/__gonavi/detached/bootstrap';
export const NATIVE_DETACHED_ACTION_URL = '/__gonavi/detached/action';
export const NATIVE_DETACHED_WINDOW_QUERY_PARAM = '__gonavi_detached';

export type NativeDetachedWindowKind = 'workbench' | 'query-result';
export type NativeDetachedWindowAction = 'ready' | 'sync' | 'attach' | 'close';
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
}

export interface NativeDetachedWindowActionPayload {
  id: string;
  kind: NativeDetachedWindowKind;
  storeState?: NativeDetachedStoreSnapshot;
  tab?: TabData;
  resultSession?: QueryEditorResultSessionSnapshot | null;
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

type FetchLike = typeof fetch;

type StoreApiLike<TState extends object> = {
  getState: () => TState;
  setState: (nextState: TState, replace?: boolean) => void;
};

const OMIT_VALUE = Symbol('gonavi.native-detached.omit');
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const WORKBENCH_BOOTSTRAP_OMITTED_KEYS = new Set([
  'aiChatHistory',
  'aiChatSessions',
  'aiContexts',
  'jvmDiagnosticOutputs',
  'tabs',
  'detachedWorkbenchWindows',
  'detachedQueryResultWindows',
  'detachedAIChatWindow',
  'sqlEditorPendingTransactions',
]);
const QUERY_RESULT_BOOTSTRAP_OMITTED_KEYS = new Set([
  ...WORKBENCH_BOOTSTRAP_OMITTED_KEYS,
  'sqlLogs',
]);

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
): NativeDetachedWindowPayload => {
  const storeState = buildFilteredStoreSnapshot(state, WORKBENCH_BOOTSTRAP_OMITTED_KEYS);
  const source = state as Record<string, unknown>;
  const allPending = source.sqlEditorPendingTransactions;
  const pendingRecord = allPending && typeof allPending === 'object'
    ? allPending as Record<string, unknown>
    : {};
  storeState.tabs = [tab];
  storeState.activeTabId = tab.id;
  storeState.detachedWorkbenchWindows = [];
  storeState.detachedQueryResultWindows = [];
  storeState.detachedAIChatWindow = null;
  storeState.sqlEditorPendingTransactions = buildNativeDetachedStoreSnapshot(
    Object.prototype.hasOwnProperty.call(pendingRecord, tab.id)
      ? { [tab.id]: pendingRecord[tab.id] }
      : {},
  );
  return {
    storeState,
    tab,
    resultSession: resultSession ?? null,
  };
};

export const buildNativeDetachedQueryResultPayload = (
  state: object,
  resultWindow: DetachedQueryResultWindow,
): NativeDetachedWindowPayload => {
  const storeState = buildFilteredStoreSnapshot(state, QUERY_RESULT_BOOTSTRAP_OMITTED_KEYS);
  storeState.tabs = [];
  storeState.activeTabId = null;
  storeState.detachedWorkbenchWindows = [];
  storeState.detachedQueryResultWindows = [];
  storeState.detachedAIChatWindow = null;
  storeState.sqlLogs = [];
  storeState.sqlEditorPendingTransactions = {};
  return {
    storeState,
    resultWindow: {
      ...resultWindow,
      result: buildNativeDetachedQueryResultSnapshot(resultWindow.result),
    },
  };
};

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

export const isNativeDetachedWindow = (
  locationLike?: Pick<Location, 'pathname' | 'search'>,
): boolean => {
  if (typeof window !== 'undefined') {
    const runtimeWindow = window as typeof window & {
      __GONAVI_NATIVE_DETACHED__?: unknown;
      __GONAVI_DETACHED__?: unknown;
    };
    if (runtimeWindow.__GONAVI_NATIVE_DETACHED__ || runtimeWindow.__GONAVI_DETACHED__) {
      return true;
    }
  }
  const locationValue = locationLike
    ?? (typeof window !== 'undefined' ? window.location : undefined);
  if (!locationValue) return false;
  if (locationValue.pathname.startsWith('/__gonavi/detached/window')) return true;
  const params = new URLSearchParams(locationValue.search);
  const value = params.get(NATIVE_DETACHED_WINDOW_QUERY_PARAM);
  return value !== null && value !== '' && value !== '0' && value !== 'false';
};

const requireSuccessfulResponse = async (response: Response): Promise<Response> => {
  if (response.ok) return response;
  const body = await response.text().catch(() => '');
  throw new Error(
    `Native detached window request failed (${response.status})${body ? `: ${body}` : ''}`,
  );
};

export const fetchNativeDetachedWindowBootstrap = async (
  fetchImpl: FetchLike = fetch,
): Promise<NativeDetachedWindowBootstrap> => {
  const response = await requireSuccessfulResponse(await fetchImpl(
    NATIVE_DETACHED_BOOTSTRAP_URL,
    {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    },
  ));
  const bootstrap = await response.json() as NativeDetachedWindowBootstrap;
  if (!bootstrap || typeof bootstrap.id !== 'string' || !bootstrap.id.trim()) {
    throw new Error('Native detached window bootstrap is missing an id');
  }
  if (bootstrap.kind !== 'workbench' && bootstrap.kind !== 'query-result') {
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
): Promise<void> => {
  const nativeAction = !fetchImpl && typeof window !== 'undefined'
    ? (window as any).__GONAVI_DETACHED__?.action
    : undefined;
  if (typeof nativeAction === 'function') {
    const result = await nativeAction(action, payload);
    if (result?.success === false) {
      throw new Error(String(result.message || `Native detached ${action} failed`));
    }
    return;
  }
  const request = fetchImpl ?? fetch;
  await requireSuccessfulResponse(await request(NATIVE_DETACHED_ACTION_URL, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, payload } satisfies NativeDetachedWindowActionRequest),
  }));
};

export const syncNativeDetachedWindow = (
  payload: NativeDetachedWindowActionPayload,
  fetchImpl?: FetchLike,
): Promise<void> => postNativeDetachedWindowAction('sync', payload, fetchImpl);

export const readyNativeDetachedWindow = (
  payload: NativeDetachedWindowActionPayload,
  fetchImpl?: FetchLike,
): Promise<void> => postNativeDetachedWindowAction('ready', payload, fetchImpl);

export const attachNativeDetachedWindow = (
  payload: NativeDetachedWindowActionPayload,
  fetchImpl?: FetchLike,
): Promise<void> => postNativeDetachedWindowAction('attach', payload, fetchImpl);

export const closeNativeDetachedWindow = (
  payload: NativeDetachedWindowActionPayload,
  fetchImpl?: FetchLike,
): Promise<void> => postNativeDetachedWindowAction('close', payload, fetchImpl);

export const closeCurrentNativeDetachedWindow = async (): Promise<void> => {
  const nativeClose = typeof window !== 'undefined'
    ? (window as any).go?.nativewindow?.Control?.Close
    : undefined;
  if (typeof nativeClose === 'function') {
    await nativeClose();
    return;
  }
  if (typeof window !== 'undefined' && typeof window.close === 'function') {
    window.close();
  }
};
