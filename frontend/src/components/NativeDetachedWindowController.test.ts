import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useStore } from '../store';
import { peekQueryEditorResultSession } from '../utils/queryEditorResultSessionCache';
import {
  applyNativeDetachedWindowEvent,
  type NativeDetachedWindowEvent,
} from './NativeDetachedWindowController';

const buildQueryTab = (id: string, query: string) => ({
  id,
  title: id,
  type: 'query' as const,
  connectionId: 'conn-1',
  query,
});

describe('NativeDetachedWindowController', () => {
  beforeEach(() => {
    useStore.setState({
      tabs: [buildQueryTab('query-a', 'select 1'), buildQueryTab('query-b', 'select 2')],
      activeTabId: 'query-a',
      detachedWorkbenchWindows: [
        { tabId: 'query-a', x: 10, y: 10, width: 800, height: 600, zIndex: 1201 },
        { tabId: 'query-b', x: 30, y: 30, width: 800, height: 600, zIndex: 1202 },
      ],
      detachedQueryResultWindows: [],
      sqlLogs: [],
    });
  });

  it('syncs only the detached tab and its live result session', () => {
    applyNativeDetachedWindowEvent({
      id: 'workbench:query-a',
      kind: 'workbench',
      action: 'sync',
      payload: {
        storeState: { sqlEditorPendingTransactions: { 'query-a': { transactionId: 'tx-1' } } },
        tab: buildQueryTab('query-a', 'select 42'),
        resultSession: {
          activeResultKey: 'result-1',
          resultSets: [{
            key: 'result-1',
            sql: 'select 42',
            rows: [{ value: 42 }],
            columns: ['value'],
            pkColumns: [],
            readOnly: true,
          }],
        },
      },
    });

    expect(useStore.getState().tabs.find((tab) => tab.id === 'query-a')?.query).toBe('select 42');
    expect(useStore.getState().tabs.find((tab) => tab.id === 'query-b')?.query).toBe('select 2');
    expect((useStore.getState().sqlEditorPendingTransactions['query-a'] as any)?.transactionId).toBe('tx-1');
    expect(peekQueryEditorResultSession('query-a')?.resultSets[0]?.rows).toEqual([{ value: 42 }]);
  });

  it('merges new child SQL logs by id without duplicating existing entries', () => {
    useStore.getState().addSqlLog({
      id: 'log-existing',
      timestamp: 1,
      sql: 'select 1',
      status: 'success',
      duration: 1,
    });

    applyNativeDetachedWindowEvent({
      id: 'workbench:query-a',
      kind: 'workbench',
      action: 'sync',
      payload: {
        storeState: {
          sqlLogs: [
            {
              id: 'log-new',
              timestamp: 2,
              sql: 'select 2',
              status: 'success',
              duration: 2,
            },
            {
              id: 'log-existing',
              timestamp: 1,
              sql: 'select 1',
              status: 'success',
              duration: 1,
            },
          ],
        },
      },
    });

    expect(useStore.getState().sqlLogs.map((log) => log.id)).toEqual([
      'log-new',
      'log-existing',
    ]);
  });

  it('merges audit logs produced by an editable detached result window', () => {
    applyNativeDetachedWindowEvent({
      id: 'query-result:query-a:r-edit',
      kind: 'query-result',
      action: 'sync',
      payload: {
        storeState: {
          sqlLogs: [{
            id: 'log-result-edit',
            timestamp: 3,
            sql: 'update users set name = ?',
            status: 'success',
            duration: 4,
            affectedRows: 1,
          }],
        },
      },
    });

    expect(useStore.getState().sqlLogs.map((log) => log.id)).toEqual(['log-result-edit']);
  });

  it('tracks a result window opened by its owning detached SQL window', () => {
    const resultWindow = {
      id: 'query-result:query-a:r-nested',
      sourceQueryTabId: 'query-a',
      connectionId: 'conn-1',
      title: 'Nested result',
      x: 2100,
      y: -120,
      width: 900,
      height: 620,
      zIndex: 1201,
      result: {
        key: 'r-nested',
        sql: 'select 7',
        rows: [{ value: 7 }],
        columns: ['value'],
        pkColumns: [],
        readOnly: true,
      },
    };
    const event: NativeDetachedWindowEvent = {
      id: resultWindow.id,
      kind: 'query-result',
      action: 'opened',
      payload: {
        ownerWindowId: 'workbench:query-a',
        resultWindow,
      },
    };

    applyNativeDetachedWindowEvent(event);
    expect(useStore.getState().detachedQueryResultWindows).toEqual([
      expect.objectContaining({ id: resultWindow.id }),
    ]);
    useStore.setState({ detachedQueryResultWindows: [] });

    applyNativeDetachedWindowEvent(event, resultWindow.id);
    applyNativeDetachedWindowEvent(event, 'workbench:query-b');
    expect(useStore.getState().detachedQueryResultWindows).toEqual([]);

    applyNativeDetachedWindowEvent(event, 'workbench:query-a');
    expect(useStore.getState().detachedQueryResultWindows).toEqual([
      expect.objectContaining({ id: resultWindow.id }),
    ]);
  });

  it('reattaches one tab without closing it or disturbing peer windows', () => {
    applyNativeDetachedWindowEvent({
      id: 'workbench:query-a',
      kind: 'workbench',
      action: 'attach',
      payload: { tab: buildQueryTab('query-a', 'select 9') },
    });

    expect(useStore.getState().tabs.map((tab) => tab.id)).toEqual(['query-a', 'query-b']);
    expect(useStore.getState().detachedWorkbenchWindows.map((item) => item.tabId)).toEqual(['query-b']);
    expect(useStore.getState().activeTabId).toBe('query-a');
  });

  it('closes only the tab whose native window sent an explicit close action', () => {
    const event: NativeDetachedWindowEvent = {
      id: 'workbench:query-a',
      kind: 'workbench',
      action: 'close',
    };
    applyNativeDetachedWindowEvent(event);

    expect(useStore.getState().tabs.map((tab) => tab.id)).toEqual(['query-b']);
    expect(useStore.getState().detachedWorkbenchWindows.map((item) => item.tabId)).toEqual(['query-b']);
  });

  it('reattaches a workbench tab when its child process exits unexpectedly', () => {
    applyNativeDetachedWindowEvent({
      id: 'workbench:query-a',
      kind: 'workbench',
      action: 'close',
      payload: { reason: 'process-error', exited: true, error: 'exit status 9' },
    });

    expect(useStore.getState().tabs.map((tab) => tab.id)).toEqual(['query-a', 'query-b']);
    expect(useStore.getState().detachedWorkbenchWindows.map((item) => item.tabId)).toEqual(['query-b']);
    expect(useStore.getState().activeTabId).toBe('query-a');
  });

  it('restores instead of deleting when the process exit races a window-close action', () => {
    applyNativeDetachedWindowEvent({
      id: 'workbench:query-a',
      kind: 'workbench',
      action: 'close',
      payload: { reason: 'window-closed', exited: true },
    });

    expect(useStore.getState().tabs.map((tab) => tab.id)).toEqual(['query-a', 'query-b']);
    expect(useStore.getState().detachedWorkbenchWindows.map((item) => item.tabId)).toEqual(['query-b']);
  });

  it('ignores the child process exit that follows a successful reattach', () => {
    applyNativeDetachedWindowEvent({
      id: 'workbench:query-a',
      kind: 'workbench',
      action: 'attach',
      payload: { tab: buildQueryTab('query-a', 'select 9') },
    });
    applyNativeDetachedWindowEvent({
      id: 'workbench:query-a',
      kind: 'workbench',
      action: 'close',
      payload: { reason: 'attached', exited: true },
    });

    expect(useStore.getState().tabs.map((tab) => tab.id)).toEqual(['query-a', 'query-b']);
    expect(useStore.getState().detachedWorkbenchWindows.map((item) => item.tabId)).toEqual(['query-b']);
  });

  it('keeps a docked tab when a just-ready child exits before detach state commits', () => {
    useStore.setState({
      detachedWorkbenchWindows: useStore.getState().detachedWorkbenchWindows.filter(
        (item) => item.tabId !== 'query-a',
      ),
    });
    applyNativeDetachedWindowEvent({
      id: 'workbench:query-a',
      kind: 'workbench',
      action: 'close',
      payload: { reason: 'process-error', exited: true },
    });

    expect(useStore.getState().tabs.map((tab) => tab.id)).toEqual(['query-a', 'query-b']);
  });

  it('restores a result snapshot without closing its source query tab', () => {
    useStore.setState({
      detachedQueryResultWindows: [{
        id: 'query-result:query-a:r1',
        sourceQueryTabId: 'query-a',
        connectionId: 'conn-1',
        title: 'Result 1',
        x: 10,
        y: 10,
        width: 800,
        height: 600,
        zIndex: 1201,
        result: {
          key: 'r1',
          sql: 'select 42',
          rows: [{ value: 42 }],
          columns: ['value'],
          pkColumns: [],
          readOnly: true,
        },
      }],
    });
    const dispatchEvent = vi.fn();
    const previousWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { dispatchEvent },
    });
    try {
      applyNativeDetachedWindowEvent({
        id: 'query-result:query-a:r1',
        kind: 'query-result',
        action: 'attach',
      });
      expect(useStore.getState().detachedQueryResultWindows).toEqual([]);
      expect(useStore.getState().tabs.map((tab) => tab.id)).toEqual(['query-a', 'query-b']);
      expect(dispatchEvent).toHaveBeenCalledOnce();
      expect(dispatchEvent.mock.calls[0][0].detail.result.rows).toEqual([{ value: 42 }]);
    } finally {
      if (previousWindowDescriptor) {
        Object.defineProperty(globalThis, 'window', previousWindowDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  it('restores a detached result when its child process crashes', () => {
    useStore.setState({
      detachedQueryResultWindows: [{
        id: 'query-result:query-a:r1',
        sourceQueryTabId: 'query-a',
        connectionId: 'conn-1',
        title: 'Result 1',
        x: 10,
        y: 10,
        width: 800,
        height: 600,
        zIndex: 1201,
        result: {
          key: 'r1',
          sql: 'select 42',
          rows: [{ value: 42 }],
          columns: ['value'],
          pkColumns: [],
          readOnly: true,
        },
      }],
    });
    const dispatchEvent = vi.fn();
    const previousWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { dispatchEvent },
    });
    try {
      applyNativeDetachedWindowEvent({
        id: 'query-result:query-a:r1',
        kind: 'query-result',
        action: 'close',
        payload: { reason: 'process-error', exited: true },
      });

      expect(useStore.getState().detachedQueryResultWindows).toEqual([]);
      expect(dispatchEvent).toHaveBeenCalledOnce();
      expect(dispatchEvent.mock.calls[0][0].detail.result.rows).toEqual([{ value: 42 }]);
    } finally {
      if (previousWindowDescriptor) {
        Object.defineProperty(globalThis, 'window', previousWindowDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  it('routes result restoration to the detached SQL window that owns it', () => {
    const resultWindow = {
      id: 'query-result:query-a:r-owned',
      sourceQueryTabId: 'query-a',
      connectionId: 'conn-1',
      title: 'Owned result',
      x: 10,
      y: 10,
      width: 800,
      height: 600,
      zIndex: 1201,
      result: {
        key: 'r-owned',
        sql: 'select 8',
        rows: [{ value: 8 }],
        columns: ['value'],
        pkColumns: [],
        readOnly: true,
      },
    };
    useStore.setState({ detachedQueryResultWindows: [resultWindow] });
    const dispatchEvent = vi.fn();
    const previousWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { dispatchEvent },
    });
    try {
      const event: NativeDetachedWindowEvent = {
        id: resultWindow.id,
        kind: 'query-result',
        action: 'attach',
        payload: { ownerWindowId: 'workbench:query-a' },
      };
      applyNativeDetachedWindowEvent(event, 'workbench:query-b');
      expect(dispatchEvent).not.toHaveBeenCalled();
      expect(useStore.getState().detachedQueryResultWindows).toHaveLength(1);

      applyNativeDetachedWindowEvent(event, 'workbench:query-a');
      expect(dispatchEvent).toHaveBeenCalledOnce();
      expect(dispatchEvent.mock.calls[0][0].detail.result.rows).toEqual([{ value: 8 }]);
      expect(useStore.getState().detachedQueryResultWindows).toEqual([]);
    } finally {
      if (previousWindowDescriptor) {
        Object.defineProperty(globalThis, 'window', previousWindowDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });
});
