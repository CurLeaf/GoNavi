import { useStore } from '../store';
import type { TabData } from '../types';
import {
  DEFAULT_DETACHED_WINDOW_HEIGHT,
  DEFAULT_DETACHED_WINDOW_MIN_HEIGHT,
  DEFAULT_DETACHED_WINDOW_MIN_WIDTH,
  DEFAULT_DETACHED_WINDOW_WIDTH,
  type DetachedQueryResultWindow,
  type DetachedWindowBounds,
} from './detachedWindow';
import {
  buildNativeDetachedQueryResultPayload,
  buildNativeDetachedWorkbenchPayload,
  type NativeDetachedWindowKind,
  type NativeDetachedWindowPayload,
} from './nativeDetachedWindowClient';
import { peekQueryEditorResultSession } from './queryEditorResultSessionCache';

export type NativeDetachedWindowOperationResult = {
  success: boolean;
  message?: string;
  id?: string;
};

export type NativeDetachedWindowOpenRequest = {
  id: string;
  kind: NativeDetachedWindowKind;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  payload: NativeDetachedWindowPayload;
};

export type NativeDetachedWindowManager = {
  Open: (request: NativeDetachedWindowOpenRequest) => Promise<NativeDetachedWindowOperationResult>;
  Focus: (id: string) => Promise<NativeDetachedWindowOperationResult>;
  Close: (id: string) => Promise<NativeDetachedWindowOperationResult>;
  CloseAll: () => Promise<NativeDetachedWindowOperationResult>;
};

export type NativeQueryResultWindowInput = Omit<
  DetachedQueryResultWindow,
  keyof DetachedWindowBounds
> & Partial<DetachedWindowBounds>;

const openingWindows = new Map<string, Promise<boolean>>();

export const resolveNativeDetachedWindowManager = (): NativeDetachedWindowManager | null => {
  if (typeof window === 'undefined') return null;
  const manager = (window as any).go?.nativewindow?.Manager;
  if (
    typeof manager?.Open !== 'function'
    || typeof manager?.Focus !== 'function'
    || typeof manager?.Close !== 'function'
  ) {
    return null;
  }
  return manager as NativeDetachedWindowManager;
};

export const hasNativeDetachedWindowManager = (): boolean =>
  resolveNativeDetachedWindowManager() !== null;

const getNativeWindowBounds = (
  preferred?: Partial<Pick<DetachedWindowBounds, 'x' | 'y' | 'width' | 'height'>>,
): Pick<DetachedWindowBounds, 'x' | 'y' | 'width' | 'height'> => {
  const viewportWidth = typeof window === 'undefined' ? DEFAULT_DETACHED_WINDOW_WIDTH : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? DEFAULT_DETACHED_WINDOW_HEIGHT : window.innerHeight;
  const width = Math.max(
    DEFAULT_DETACHED_WINDOW_MIN_WIDTH,
    Math.round(Number(preferred?.width) || Math.min(DEFAULT_DETACHED_WINDOW_WIDTH, viewportWidth * 0.9)),
  );
  const height = Math.max(
    DEFAULT_DETACHED_WINDOW_MIN_HEIGHT,
    Math.round(Number(preferred?.height) || Math.min(DEFAULT_DETACHED_WINDOW_HEIGHT, viewportHeight * 0.86)),
  );
  const baseX = typeof window === 'undefined' ? 80 : window.screenX + Math.max(32, Math.round((window.innerWidth - width) / 2));
  const baseY = typeof window === 'undefined' ? 80 : window.screenY + Math.max(32, Math.round((window.innerHeight - height) / 2));
  return {
    x: Number.isFinite(Number(preferred?.x)) ? Math.round(Number(preferred?.x)) : baseX,
    y: Number.isFinite(Number(preferred?.y)) ? Math.round(Number(preferred?.y)) : baseY,
    width,
    height,
  };
};

const assertOpened = (result: NativeDetachedWindowOperationResult | undefined): void => {
  if (result?.success) return;
  throw new Error(String(result?.message || 'Failed to open native detached window'));
};

const focusExistingWindow = async (
  manager: NativeDetachedWindowManager,
  id: string,
): Promise<boolean> => {
  const result = await manager.Focus(id);
  if (!result?.success) {
    throw new Error(String(result?.message || 'Failed to focus native detached window'));
  }
  return true;
};

const openOnce = (
  manager: NativeDetachedWindowManager,
  request: NativeDetachedWindowOpenRequest,
  afterOpen: () => boolean,
  rollbackAfterExit: () => void,
): Promise<boolean> => {
  const existing = openingWindows.get(request.id);
  if (existing) {
    return existing.then(async (opened) => {
      if (opened) await focusExistingWindow(manager, request.id);
      return opened;
    });
  }
  const opening = (async () => {
    const result = await manager.Open(request);
    assertOpened(result);
    const opened = afterOpen();
    if (!opened) return false;

    // A child can acknowledge ready and exit before the Wails Open promise is
    // delivered to JavaScript. Verify it after committing detached state so
    // either this rollback or the process-exit event restores the source.
    try {
      await focusExistingWindow(manager, request.id);
    } catch (error) {
      rollbackAfterExit();
      throw error;
    }
    return true;
  })();
  openingWindows.set(request.id, opening);
  void opening.finally(() => {
    if (openingWindows.get(request.id) === opening) {
      openingWindows.delete(request.id);
    }
  }).catch(() => undefined);
  return opening;
};

const resolveWorkbenchTitle = (tab: TabData): string =>
  String(tab.title || tab.tableName || tab.viewName || tab.id).trim() || tab.id;

export const openNativeWorkbenchTabWindow = async (
  tabId: string,
  preferred?: Partial<Pick<DetachedWindowBounds, 'x' | 'y' | 'width' | 'height'>>,
  managerOverride?: NativeDetachedWindowManager,
): Promise<boolean> => {
  const id = String(tabId || '').trim();
  const state = useStore.getState();
  const tab = state.tabs.find((item) => item.id === id);
  if (!tab) return false;

  const manager = managerOverride ?? resolveNativeDetachedWindowManager();
  if (!manager) {
    state.detachWorkbenchTab(id, preferred);
    return true;
  }
  const windowId = `workbench:${id}`;
  if (state.isWorkbenchTabDetached(id)) {
    return focusExistingWindow(manager, windowId);
  }

  const bounds = getNativeWindowBounds(preferred);
  if (tab.type === 'query' && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gonavi:capture-query-result-session', {
      detail: { tabId: tab.id },
    }));
  }
  const request: NativeDetachedWindowOpenRequest = {
    id: windowId,
    kind: 'workbench',
    title: resolveWorkbenchTitle(tab),
    ...bounds,
    payload: buildNativeDetachedWorkbenchPayload(
      state,
      tab,
      tab.type === 'query' ? peekQueryEditorResultSession(tab.id) : null,
    ),
  };
  return openOnce(manager, request, () => {
    const latest = useStore.getState();
    if (!latest.tabs.some((item) => item.id === id)) {
      void manager.Close(windowId);
      return false;
    }
    latest.detachWorkbenchTab(id, preferred ?? bounds);
    return true;
  }, () => {
    useStore.getState().attachWorkbenchTab(id);
  });
};

export const openNativeQueryResultWindow = async (
  windowState: NativeQueryResultWindowInput,
  managerOverride?: NativeDetachedWindowManager,
): Promise<boolean> => {
  const id = String(windowState.id || '').trim();
  if (!id) return false;
  const state = useStore.getState();
  const manager = managerOverride ?? resolveNativeDetachedWindowManager();
  if (!manager) {
    state.detachQueryResultWindow(windowState);
    return true;
  }
  if (state.detachedQueryResultWindows.some((item) => item.id === id)) {
    return focusExistingWindow(manager, id);
  }
  const bounds = getNativeWindowBounds(windowState);
  return openOnce(manager, {
    id,
    kind: 'query-result',
    title: windowState.title,
    ...bounds,
    payload: buildNativeDetachedQueryResultPayload(state, {
      ...windowState,
      ...bounds,
      zIndex: Number(windowState.zIndex) || 1201,
    }),
  }, () => {
    useStore.getState().detachQueryResultWindow({ ...windowState, ...bounds });
    return true;
  }, () => {
    useStore.getState().closeDetachedQueryResultWindow(id);
  });
};

export const closeNativeDetachedWindowById = async (id: string): Promise<void> => {
  const manager = resolveNativeDetachedWindowManager();
  if (!manager) return;
  const result = await manager.Close(String(id || '').trim());
  if (!result?.success && result?.message) {
    throw new Error(result.message);
  }
};
