import { describe, expect, it, vi } from 'vitest';

import type { TabData } from '../types';
import type { DetachedQueryResultWindow } from './detachedWindow';
import {
  attachNativeDetachedWindow,
  buildNativeDetachedQueryResultPayload,
  buildNativeDetachedStoreSnapshot,
  buildNativeDetachedSyncStoreSnapshot,
  buildNativeDetachedWorkbenchPayload,
  hydrateNativeDetachedStore,
  isNativeDetachedWindow,
} from './nativeDetachedWindowClient';

const queryTab: TabData = {
  id: 'query-1',
  title: 'Query 1',
  type: 'query',
  connectionId: 'connection-1',
  dbName: 'main',
  query: 'select 1',
};

describe('nativeDetachedWindowClient', () => {
  it('builds a workbench payload without Zustand actions or nested functions', () => {
    const state = {
      tabs: [queryTab],
      theme: 'dark',
      updateQueryTabDraft: () => undefined,
      nested: {
        value: 42,
        callback: () => undefined,
      },
      sqlLogs: [{ id: 'log-1', sql: 'select 1' }],
    };

    const payload = buildNativeDetachedWorkbenchPayload(state, queryTab, {
      resultSets: [],
      activeResultKey: '',
      isResultPanelVisible: true,
    });

    expect(payload.tab).toEqual(queryTab);
    expect(payload.storeState).toEqual({
      tabs: [queryTab],
      activeTabId: queryTab.id,
      detachedWorkbenchWindows: [],
      detachedQueryResultWindows: [],
      detachedAIChatWindow: null,
      theme: 'dark',
      nested: { value: 42 },
      sqlLogs: [{ id: 'log-1', sql: 'select 1' }],
      sqlEditorPendingTransactions: {},
    });
    expect(JSON.stringify(payload)).not.toContain('updateQueryTabDraft');
    expect(JSON.stringify(payload)).not.toContain('callback');
  });

  it('skips heavyweight runtime state before recursively cloning a workbench snapshot', () => {
    const state: Record<string, unknown> = {
      tabs: [queryTab],
      theme: 'dark',
    };
    for (const key of ['aiChatHistory', 'aiContexts', 'jvmDiagnosticOutputs']) {
      Object.defineProperty(state, key, {
        enumerable: true,
        get: () => {
          throw new Error(`${key} should not be read`);
        },
      });
    }

    const payload = buildNativeDetachedWorkbenchPayload(state, queryTab);

    expect(payload.storeState.theme).toBe('dark');
    expect(payload.storeState).not.toHaveProperty('aiChatHistory');
    expect(payload.storeState).not.toHaveProperty('aiContexts');
    expect(payload.storeState).not.toHaveProperty('jvmDiagnosticOutputs');
  });

  it('hydrates snapshot data while retaining the current store actions', () => {
    const currentAction = vi.fn();
    let currentState = {
      theme: 'light',
      tabs: [] as TabData[],
      updateQueryTabDraft: currentAction,
    };
    const store = {
      getState: () => currentState,
      setState: (nextState: typeof currentState) => {
        currentState = nextState;
      },
    };

    hydrateNativeDetachedStore(store, {
      theme: 'dark',
      tabs: [queryTab],
      updateQueryTabDraft: 'remote action must not replace the local function',
      unknownKey: 'ignored',
    });

    expect(currentState.theme).toBe('dark');
    expect(currentState.tabs).toEqual([queryTab]);
    expect(currentState.updateQueryTabDraft).toBe(currentAction);
    expect(currentState).not.toHaveProperty('unknownKey');
  });

  it('syncs editor preferences and transaction state without resending all tabs', () => {
    expect(buildNativeDetachedSyncStoreSnapshot({
      tabs: [queryTab],
      queryOptions: { showQueryResultsPanel: true },
      sqlEditorPendingTransactions: { [queryTab.id]: { transactionId: 'tx-1' } },
      sqlLogs: [{ sql: 'select 1' }],
      closeTab: () => undefined,
    }, queryTab.id)).toEqual({
      sqlEditorPendingTransactions: { [queryTab.id]: { transactionId: 'tx-1' } },
    });

    expect(buildNativeDetachedSyncStoreSnapshot({
      sqlEditorPendingTransactions: {},
    }, queryTab.id, [{ id: 'log-new', sql: 'select 2' }])).toEqual({
      sqlEditorPendingTransactions: { [queryTab.id]: null },
      sqlLogs: [{ id: 'log-new', sql: 'select 2' }],
    });
  });

  it('builds an isolated JSON-safe query result snapshot', () => {
    const resultWindow: DetachedQueryResultWindow = {
      id: 'result-1',
      sourceQueryTabId: queryTab.id,
      connectionId: queryTab.connectionId,
      dbName: queryTab.dbName,
      title: 'Result 1',
      x: -1200,
      y: 100,
      width: 900,
      height: 620,
      zIndex: 1201,
      result: {
        key: 'result-set-1',
        sql: 'select 1 as value',
        rows: [{ value: 1, ignored: () => undefined }],
        columns: ['value'],
        pkColumns: [],
        readOnly: true,
      },
    };

    const payload = buildNativeDetachedQueryResultPayload(
      { tabs: [queryTab], closeTab: () => undefined },
      resultWindow,
    );

    expect(payload.resultWindow?.x).toBe(-1200);
    expect(payload.resultWindow?.result.rows).toEqual([{ value: 1 }]);
    expect(payload.resultWindow?.result).not.toBe(resultWindow.result);
    expect(payload.storeState).toEqual({
      tabs: [],
      activeTabId: null,
      detachedWorkbenchWindows: [],
      detachedQueryResultWindows: [],
      detachedAIChatWindow: null,
      sqlLogs: [],
      sqlEditorPendingTransactions: {},
    });
  });

  it('posts attach actions with the detached window identity', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => (
      new Response(null, { status: 204 })
    ));

    await attachNativeDetachedWindow(
      { id: 'window-1', kind: 'workbench', tab: queryTab },
      fetchMock as typeof fetch,
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/__gonavi/detached/action');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      action: 'attach',
      payload: { id: 'window-1', kind: 'workbench', tab: queryTab },
    });
  });

  it('uses the child Go bridge for terminal actions so attach is not followed by close', async () => {
    const action = vi.fn(async () => ({ success: true }));
    const previousWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { __GONAVI_DETACHED__: { action } },
    });
    try {
      await attachNativeDetachedWindow({ id: 'window-1', kind: 'workbench', tab: queryTab });
      expect(action).toHaveBeenCalledWith('attach', {
        id: 'window-1',
        kind: 'workbench',
        tab: queryTab,
      });
    } finally {
      if (previousWindowDescriptor) {
        Object.defineProperty(globalThis, 'window', previousWindowDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  it('detects injected flags and the detached query parameter', () => {
    expect(isNativeDetachedWindow({ pathname: '/', search: '?__gonavi_detached=window-1' })).toBe(true);
    expect(isNativeDetachedWindow({ pathname: '/', search: '' })).toBe(false);

    const previousWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { __GONAVI_NATIVE_DETACHED__: true },
    });
    try {
      expect(isNativeDetachedWindow({ pathname: '/', search: '' })).toBe(true);
    } finally {
      if (previousWindowDescriptor) {
        Object.defineProperty(globalThis, 'window', previousWindowDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  it('omits circular values instead of breaking bootstrap serialization', () => {
    const state: Record<string, unknown> = { theme: 'dark' };
    state.self = state;
    expect(buildNativeDetachedStoreSnapshot(state)).toEqual({ theme: 'dark' });
  });
});
