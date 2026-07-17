import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useStore } from '../store';
import type { TabData } from '../types';
import {
  clearNativeDetachedHostEvents,
  openNativeAIChatWindow,
  openNativeQueryResultWindow,
  openNativeWorkbenchTabWindow,
  forwardNativeDetachedHostEvent,
  syncNativeAIChatHostState,
  type NativeDetachedWindowManager,
} from './nativeDetachedWindowHost';

const buildTab = (id: string) => ({
  id,
  title: `Query ${id}`,
  type: 'query' as const,
  connectionId: 'conn-1',
  dbName: 'main',
  query: 'select 1',
});

describe('nativeDetachedWindowHost', () => {
  let manager: NativeDetachedWindowManager;

  beforeEach(() => {
    clearNativeDetachedHostEvents('ai-chat');
    manager = {
      Open: vi.fn().mockResolvedValue({ success: true }),
      Focus: vi.fn().mockResolvedValue({ success: true }),
      Close: vi.fn().mockResolvedValue({ success: true }),
      CloseAll: vi.fn().mockResolvedValue({ success: true }),
      SyncHostState: vi.fn().mockResolvedValue({ success: true }),
    };
    useStore.setState({
      tabs: [buildTab('query-1')],
      activeTabId: 'query-1',
      detachedWorkbenchWindows: [],
      detachedQueryResultWindows: [],
      detachedAIChatWindow: null,
      aiPanelVisible: false,
      aiChatHistory: {},
      aiChatSessions: [],
      aiActiveSessionId: null,
      aiContexts: {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hides the docked tab only after the native window opens', async () => {
    let resolveOpen: ((value: { success: boolean }) => void) | undefined;
    const pending = new Promise<{ success: boolean }>((resolve) => {
      resolveOpen = resolve;
    });
    vi.mocked(manager.Open).mockReturnValueOnce(pending);

    const opening = openNativeWorkbenchTabWindow('query-1', { x: -1600, y: 120 }, manager);
    expect(useStore.getState().isWorkbenchTabDetached('query-1')).toBe(false);

    resolveOpen?.({ success: true });
    await expect(opening).resolves.toBe(true);
    expect(useStore.getState().isWorkbenchTabDetached('query-1')).toBe(true);
    expect(manager.Open).toHaveBeenCalledWith(expect.objectContaining({
      id: 'workbench:query-1',
      kind: 'workbench',
      x: -1600,
      y: 120,
    }));
  });

  it('keeps the tab docked when native window creation fails', async () => {
    vi.mocked(manager.Open).mockResolvedValueOnce({ success: false, message: 'open failed' });

    await expect(
      openNativeWorkbenchTabWindow('query-1', { x: 2000, y: -300 }, manager),
    ).rejects.toThrow('open failed');
    expect(useStore.getState().isWorkbenchTabDetached('query-1')).toBe(false);
  });

  it('focuses an existing window instead of opening a duplicate', async () => {
    await openNativeWorkbenchTabWindow('query-1', undefined, manager);
    await openNativeWorkbenchTabWindow('query-1', undefined, manager);

    expect(manager.Open).toHaveBeenCalledTimes(1);
    expect(manager.Focus).toHaveBeenCalledTimes(2);
    expect(manager.Focus).toHaveBeenCalledWith('workbench:query-1');
  });

  it('restores the source tab when a just-ready child exits before detach commits', async () => {
    vi.mocked(manager.Focus).mockResolvedValueOnce({
      success: false,
      message: 'native window was not found',
    });

    await expect(openNativeWorkbenchTabWindow('query-1', undefined, manager))
      .rejects.toThrow('native window was not found');

    expect(useStore.getState().isWorkbenchTabDetached('query-1')).toBe(false);
    expect(useStore.getState().tabs.map((tab) => tab.id)).toContain('query-1');
  });

  it('opens many tabs with unique native window ids without a hard cap', async () => {
    const tabs = Array.from({ length: 32 }, (_, index) => buildTab(`query-${index + 1}`));
    useStore.setState({ tabs, detachedWorkbenchWindows: [] });

    await Promise.all(tabs.map((tab) => openNativeWorkbenchTabWindow(tab.id, undefined, manager)));

    const ids = vi.mocked(manager.Open).mock.calls.map(([request]) => request.id);
    expect(ids).toHaveLength(32);
    expect(new Set(ids).size).toBe(32);
    expect(useStore.getState().detachedWorkbenchWindows).toHaveLength(32);
  });

  it('routes every detachable workbench tab type through the native window manager', async () => {
    const types: TabData['type'][] = [
      'query',
      'table',
      'design',
      'sql-file-execution',
      'sql-analysis',
      'sql-audit',
      'redis-keys',
      'redis-command',
      'redis-monitor',
      'trigger',
      'view-def',
      'event-def',
      'routine-def',
      'sequence-def',
      'package-def',
      'table-overview',
      'table-export',
      'jvm-overview',
      'jvm-resource',
      'jvm-audit',
      'jvm-diagnostic',
      'jvm-monitoring',
    ];
    const tabs = types.map((type, index): TabData => ({
      id: `matrix-${index}`,
      title: type,
      type,
      connectionId: 'conn-1',
    }));
    useStore.setState({ tabs, detachedWorkbenchWindows: [] });

    await Promise.all(tabs.map((tab) => openNativeWorkbenchTabWindow(tab.id, undefined, manager)));

    expect(manager.Open).toHaveBeenCalledTimes(types.length);
    expect(vi.mocked(manager.Open).mock.calls.map(([request]) => ({
      kind: request.kind,
      type: request.payload.tab?.type,
    }))).toEqual(types.map((type) => ({ kind: 'workbench', type })));
  });

  it('opens AI chat as a native window and preserves its live conversation state', async () => {
    useStore.setState({
      aiPanelVisible: true,
      aiChatHistory: {
        'session-1': [{ id: 'message-1', role: 'user', content: 'hello', timestamp: 1 }],
      },
      aiChatSessions: [{ id: 'session-1', title: 'Session 1', updatedAt: 1 }],
      aiActiveSessionId: 'session-1',
      aiContexts: { 'conn-1:main': [{ dbName: 'main', tableName: 'users', ddl: 'CREATE TABLE users(id int)' }] },
      detachedAIChatWindow: null,
    });

    await expect(openNativeAIChatWindow({
      x: -1680,
      y: 90,
      width: 520,
      height: 760,
    }, manager)).resolves.toBe(true);

    expect(manager.Open).toHaveBeenCalledWith(expect.objectContaining({
      id: 'ai-chat',
      kind: 'ai-chat',
      title: 'GoNavi AI',
      x: -1680,
      y: 90,
      width: 520,
      height: 760,
      payload: expect.objectContaining({
        storeState: expect.objectContaining({
          aiActiveSessionId: 'session-1',
          aiChatSessions: [expect.objectContaining({ id: 'session-1' })],
          aiChatHistory: expect.objectContaining({
            'session-1': [expect.objectContaining({ content: 'hello' })],
          }),
        }),
      }),
    }));
    expect(useStore.getState().detachedAIChatWindow).toBeTruthy();
    expect(manager.SyncHostState).toHaveBeenCalledWith(expect.objectContaining({
      id: 'ai-chat',
      revision: expect.any(Number),
      storeState: expect.objectContaining({
        activeTabId: 'query-1',
        activeTab: expect.objectContaining({ id: 'query-1' }),
      }),
    }));
  });

  it('does not reopen AI chat when the user attaches it while native open is pending', async () => {
    let resolveOpen: ((value: { success: boolean }) => void) | undefined;
    vi.mocked(manager.Open).mockReturnValueOnce(new Promise((resolve) => {
      resolveOpen = resolve;
    }));
    useStore.getState().detachAIChatPanel({ x: 120, y: 80, width: 440, height: 720 });

    const opening = openNativeAIChatWindow(undefined, manager);
    useStore.getState().attachAIChatPanel();
    resolveOpen?.({ success: true });

    await expect(opening).resolves.toBe(false);
    expect(useStore.getState().aiPanelVisible).toBe(true);
    expect(useStore.getState().detachedAIChatWindow).toBeNull();
    expect(manager.Close).toHaveBeenCalledOnce();
    expect(manager.Close).toHaveBeenCalledWith('ai-chat');
    expect(manager.Focus).not.toHaveBeenCalled();
    expect(manager.SyncHostState).not.toHaveBeenCalled();
  });

  it('does not reopen AI chat when the user closes it while native open is pending', async () => {
    let resolveOpen: ((value: { success: boolean }) => void) | undefined;
    vi.mocked(manager.Open).mockReturnValueOnce(new Promise((resolve) => {
      resolveOpen = resolve;
    }));
    useStore.getState().detachAIChatPanel({ x: 120, y: 80, width: 440, height: 720 });

    const opening = openNativeAIChatWindow(undefined, manager);
    useStore.getState().setAIPanelVisible(false);
    resolveOpen?.({ success: true });

    await expect(opening).resolves.toBe(false);
    expect(useStore.getState().aiPanelVisible).toBe(false);
    expect(useStore.getState().detachedAIChatWindow).toBeNull();
    expect(manager.Close).toHaveBeenCalledOnce();
    expect(manager.Close).toHaveBeenCalledWith('ai-chat');
    expect(manager.Focus).not.toHaveBeenCalled();
    expect(manager.SyncHostState).not.toHaveBeenCalled();
  });

  it('pushes only the active host context to an existing native AI child', async () => {
    useStore.setState({
      activeContext: { connectionId: 'conn-1', dbName: 'main' },
      connections: [{ id: 'conn-1', name: 'Local', config: { type: 'sqlite' } } as any],
    });

    await expect(syncNativeAIChatHostState(manager)).resolves.toBe(true);

    expect(manager.SyncHostState).toHaveBeenCalledWith(expect.objectContaining({
      id: 'ai-chat',
      storeState: expect.objectContaining({
        activeContext: { connectionId: 'conn-1', dbName: 'main' },
        activeTabId: 'query-1',
        activeTab: expect.objectContaining({ id: 'query-1' }),
        activeConnection: expect.objectContaining({ id: 'conn-1' }),
        aiContexts: {},
      }),
    }));
  });

  it('retains and serializes host events for a detached AI child', async () => {
    let releaseFirst: (() => void) | undefined;
    const syncHostState = vi.mocked(manager.SyncHostState!);
    syncHostState
      .mockImplementationOnce(() => new Promise((resolve) => {
        releaseFirst = () => resolve({ success: true });
      }))
      .mockResolvedValue({ success: true });

    const first = forwardNativeDetachedHostEvent(
      'ai-chat',
      'gonavi:ai:inject-prompt',
      { prompt: 'first' },
      manager,
    );
    const second = forwardNativeDetachedHostEvent(
      'ai-chat',
      'gonavi:ai:config-changed',
      undefined,
      manager,
    );

    await vi.waitFor(() => expect(syncHostState).toHaveBeenCalledTimes(1));
    releaseFirst?.();
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(syncHostState).toHaveBeenCalledTimes(2);

    const firstRequest = syncHostState.mock.calls[0]![0];
    const secondRequest = syncHostState.mock.calls[1]![0];
    expect(secondRequest.revision).toBeGreaterThan(firstRequest.revision);
    expect((secondRequest.storeState.__gonaviNativeHostEvents as any[]).map((item) => item.name))
      .toEqual(['gonavi:ai:inject-prompt', 'gonavi:ai:config-changed']);
  });

  it('opens a query result snapshot as a native window on another display', async () => {
    await expect(openNativeQueryResultWindow({
      id: 'query-result:query-1:r1',
      sourceQueryTabId: 'query-1',
      connectionId: 'conn-1',
      dbName: 'main',
      title: 'Result 1',
      x: 2100,
      y: -240,
      result: {
        key: 'r1',
        sql: 'select 42',
        rows: [{ value: 42 }],
        columns: ['value'],
        pkColumns: [],
        readOnly: true,
      },
    }, manager)).resolves.toBe(true);

    expect(manager.Open).toHaveBeenCalledWith(expect.objectContaining({
      id: 'query-result:query-1:r1',
      kind: 'query-result',
      x: 2100,
      y: -240,
    }));
    expect(useStore.getState().detachedQueryResultWindows).toHaveLength(1);
  });

  it('closes a just-opened result child when its source tab closed while native open was pending', async () => {
    let resolveOpen: ((value: { success: boolean }) => void) | undefined;
    vi.mocked(manager.Open).mockReturnValueOnce(new Promise((resolve) => {
      resolveOpen = resolve;
    }));

    const opening = openNativeQueryResultWindow({
      id: 'query-result:query-1:r-pending',
      sourceQueryTabId: 'query-1',
      connectionId: 'conn-1',
      dbName: 'main',
      title: 'Pending result',
      result: {
        key: 'r-pending',
        sql: 'select 42',
        rows: [{ value: 42 }],
        columns: ['value'],
        pkColumns: [],
        readOnly: true,
      },
    }, manager);

    useStore.getState().closeTab('query-1');
    resolveOpen?.({ success: true });

    await expect(opening).resolves.toBe(false);
    expect(manager.Close).toHaveBeenCalledOnce();
    expect(manager.Close).toHaveBeenCalledWith('query-result:query-1:r-pending');
    expect(manager.Focus).not.toHaveBeenCalled();
    expect(useStore.getState().detachedQueryResultWindows).toEqual([]);
  });
});
