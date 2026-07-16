import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useStore } from '../store';
import {
  openNativeQueryResultWindow,
  openNativeWorkbenchTabWindow,
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
    manager = {
      Open: vi.fn().mockResolvedValue({ success: true }),
      Focus: vi.fn().mockResolvedValue({ success: true }),
      Close: vi.fn().mockResolvedValue({ success: true }),
      CloseAll: vi.fn().mockResolvedValue({ success: true }),
    };
    useStore.setState({
      tabs: [buildTab('query-1')],
      activeTabId: 'query-1',
      detachedWorkbenchWindows: [],
      detachedQueryResultWindows: [],
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
});
