import { useEffect } from 'react';

import { EventsOn, WindowShow } from '../../wailsjs/runtime';
import { type SqlLog, useStore } from '../store';
import type { TabData } from '../types';
import type { DetachedQueryResultWindow } from '../utils/detachedWindow';
import {
  closeNativeDetachedWindowById,
  hasNativeDetachedWindowManager,
} from '../utils/nativeDetachedWindowHost';
import type { NativeDetachedWindowKind } from '../utils/nativeDetachedWindowClient';
import {
  saveQueryEditorResultSession,
  type QueryEditorResultSessionSnapshot,
} from '../utils/queryEditorResultSessionCache';

export const NATIVE_DETACHED_WINDOW_EVENT = 'gonavi:native-detached-event';

export type NativeDetachedWindowEvent = {
  id: string;
  kind: NativeDetachedWindowKind;
  action: 'opened' | 'sync' | 'attach' | 'close';
  payload?: {
    tab?: TabData;
    storeState?: Record<string, unknown>;
    resultSession?: QueryEditorResultSessionSnapshot | null;
    resultWindow?: DetachedQueryResultWindow;
    ownerWindowId?: string;
    [key: string]: unknown;
  };
};

const replaceSyncedTab = (tab: TabData): void => {
  useStore.setState((state) => {
    if (!state.tabs.some((item) => item.id === tab.id)) return state;
    return {
      tabs: state.tabs.map((item) => item.id === tab.id ? { ...item, ...tab, id: item.id } : item),
    };
  });
};

const mergeSyncedSqlLogs = (snapshot: Record<string, unknown>): void => {
  const incomingLogs = Array.isArray(snapshot.sqlLogs) ? snapshot.sqlLogs : [];
  if (incomingLogs.length > 0) {
    const existingIds = new Set(useStore.getState().sqlLogs.map((log) => log.id));
    const newLogs = incomingLogs.filter((item): item is SqlLog => {
      if (!item || typeof item !== 'object') return false;
      const id = String((item as { id?: unknown }).id || '').trim();
      if (!id || existingIds.has(id)) return false;
      existingIds.add(id);
      return true;
    });
    for (const log of [...newLogs].reverse()) {
      useStore.getState().addSqlLog(log);
    }
  }
};

const mergeSyncedTabRuntimeState = (
  tabId: string,
  snapshot: Record<string, unknown>,
): void => {
  const pendingPatch = snapshot.sqlEditorPendingTransactions;
  if (!pendingPatch || typeof pendingPatch !== 'object') return;
  const value = (pendingPatch as Record<string, unknown>)[tabId];
  useStore.setState((state) => {
    const next = { ...state.sqlEditorPendingTransactions };
    if (value === null || value === undefined) {
      delete next[tabId];
    } else {
      next[tabId] = value as (typeof next)[string];
    }
    return { sqlEditorPendingTransactions: next };
  });
};

const restoreQueryResult = (windowId: string): void => {
  const restored = useStore.getState().attachQueryResultWindow(windowId);
  if (!restored || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('gonavi:restore-query-result', {
    detail: {
      sourceQueryTabId: restored.sourceQueryTabId,
      result: restored.result,
    },
  }));
};

const showMainWindow = (): void => {
  if (typeof window !== 'undefined' && typeof (window as any).runtime?.WindowShow === 'function') {
    void WindowShow();
  }
};

export const applyNativeDetachedWindowEvent = (
  event: NativeDetachedWindowEvent,
  currentWindowId?: string,
): void => {
  const id = String(event?.id || '').trim();
  if (!id || (event.kind !== 'workbench' && event.kind !== 'query-result')) return;

  const localWindowId = String(currentWindowId || '').trim();
  const ownerWindowId = String(event.payload?.ownerWindowId || '').trim();
  if (localWindowId) {
    if (event.kind === 'query-result') {
      // Result lifecycle belongs to its source SQL window. The result window
      // process itself receives the same broadcast but must not mutate a copy.
      if (ownerWindowId !== localWindowId) return;
    } else if (id !== localWindowId && ownerWindowId !== localWindowId) {
      return;
    }
  }

  if (event.action === 'opened') {
    const resultWindow = event.payload?.resultWindow;
    if (
      event.kind === 'query-result'
      && resultWindow
      && typeof resultWindow === 'object'
      && String(resultWindow.id || '').trim() === id
    ) {
      useStore.getState().detachQueryResultWindow(resultWindow);
    }
    return;
  }

  const tab = event.payload?.tab;
  const eventTabId = tab?.id || id.replace(/^workbench:/, '');
  if (event.payload?.storeState) {
    mergeSyncedSqlLogs(event.payload.storeState);
    if (event.kind === 'workbench') {
      mergeSyncedTabRuntimeState(eventTabId, event.payload.storeState);
    }
  }
  if (event.kind === 'workbench' && tab) {
    replaceSyncedTab(tab);
    if (tab.type === 'query' && event.payload?.resultSession) {
      saveQueryEditorResultSession(tab.id, event.payload.resultSession);
    }
  }

  if (event.action === 'sync') return;
  if (event.action === 'attach') {
    if (event.kind === 'workbench') {
      const tabId = tab?.id || id.replace(/^workbench:/, '');
      useStore.getState().attachWorkbenchTab(tabId);
    } else {
      restoreQueryResult(id);
    }
    showMainWindow();
    return;
  }

  if (event.kind === 'workbench') {
    const tabId = tab?.id || id.replace(/^workbench:/, '');
    const reason = String(event.payload?.reason || '').trim();
    const stillDetached = useStore.getState().detachedWorkbenchWindows.some(
      (item) => item.tabId === tabId,
    );
    if (reason === 'attached' || reason === 'parent-shutdown' || reason === 'requested') {
      return;
    }
    if (event.payload?.exited === true) {
      if (stillDetached) {
        useStore.getState().attachWorkbenchTab(tabId);
        showMainWindow();
      }
      return;
    }
    if (useStore.getState().tabs.some((item) => item.id === tabId)) {
      useStore.getState().closeTab(tabId);
    }
  } else {
    const reason = String(event.payload?.reason || '').trim();
    const stillDetached = useStore.getState().detachedQueryResultWindows.some(
      (item) => item.id === id,
    );
    if (reason === 'attached' || reason === 'parent-shutdown' || reason === 'requested') {
      return;
    }
    if (event.payload?.exited === true) {
      if (stillDetached) {
        restoreQueryResult(id);
        showMainWindow();
      }
      return;
    }
    useStore.getState().closeDetachedQueryResultWindow(id);
  }
};

const currentNativeWindowIds = (): Set<string> => {
  const state = useStore.getState();
  return new Set([
    ...state.detachedWorkbenchWindows.map((item) => `workbench:${item.tabId}`),
    ...state.detachedQueryResultWindows.map((item) => item.id),
  ]);
};

export interface NativeDetachedWindowControllerProps {
  currentWindowId?: string;
}

const NativeDetachedWindowController = ({
  currentWindowId,
}: NativeDetachedWindowControllerProps = {}): null => {
  useEffect(() => {
    if (!hasNativeDetachedWindowManager()) return undefined;

    const off = EventsOn(NATIVE_DETACHED_WINDOW_EVENT, (payload: NativeDetachedWindowEvent) => {
      applyNativeDetachedWindowEvent(payload, currentWindowId);
    });
    let previousIds = currentNativeWindowIds();
    const unsubscribeStore = useStore.subscribe(() => {
      const nextIds = currentNativeWindowIds();
      for (const id of previousIds) {
        if (!nextIds.has(id)) {
          void closeNativeDetachedWindowById(id).catch(() => undefined);
        }
      }
      previousIds = nextIds;
    });

    return () => {
      off();
      unsubscribeStore();
    };
  }, [currentWindowId]);

  return null;
};

export default NativeDetachedWindowController;
