import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TabData } from '../types';
import type { NativeDetachedWindowBootstrap } from '../utils/nativeDetachedWindowClient';

const queryTab: TabData = {
  id: 'query-native-1',
  title: 'Detached query',
  type: 'query',
  connectionId: 'connection-1',
  dbName: 'main',
  query: 'select 1',
};

let storeState: Record<string, any>;
const storeListeners = new Set<() => void>();

vi.mock('../store', () => {
  const useStore = Object.assign(
    (selector: (state: Record<string, any>) => unknown) => selector(storeState),
    {
      getState: () => storeState,
      setState: (nextState: Record<string, any> | ((state: Record<string, any>) => Record<string, any>)) => {
        storeState = typeof nextState === 'function' ? nextState(storeState) : nextState;
        storeListeners.forEach((listener) => listener());
      },
      subscribe: (listener: () => void) => {
        storeListeners.add(listener);
        return () => storeListeners.delete(listener);
      },
    },
  );
  return { useStore };
});

vi.mock('../i18n/provider', () => ({
  useOptionalI18n: () => null,
}));

vi.mock('../i18n', () => ({
  t: (key: string) => key,
}));

vi.mock('antd', () => ({
  Button: ({ icon, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }) => (
    <button {...props}>{icon}</button>
  ),
  ConfigProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Spin: () => <span data-component="spin" />,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  theme: {
    darkAlgorithm: 'dark',
    defaultAlgorithm: 'light',
  },
}));

vi.mock('@ant-design/icons', () => ({
  CloseOutlined: () => <span data-icon="close" />,
  CompressOutlined: () => <span data-icon="attach" />,
}));

vi.mock('./WorkbenchTabContent', () => ({
  default: ({ tab }: { tab: TabData }) => <div data-workbench-tab={tab.id} />,
}));

vi.mock('./DataGrid', () => ({
  default: () => <div data-component="data-grid" />,
}));

import NativeDetachedWindowApp from './NativeDetachedWindowApp';

const flushEffects = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('NativeDetachedWindowApp', () => {
  beforeEach(() => {
    storeListeners.clear();
    storeState = {
      tabs: [],
      theme: 'light',
      appearance: { uiVersion: 'v2' },
      fontSize: 14,
      updateQueryTabDraft: vi.fn(),
    };
  });

  it('hydrates and attaches a workbench tab through the native action client', async () => {
    const bootstrap: NativeDetachedWindowBootstrap = {
      id: 'native-window-1',
      kind: 'workbench',
      title: queryTab.title,
      payload: {
        storeState: {
          tabs: [queryTab],
          theme: 'dark',
          appearance: { uiVersion: 'v2' },
          fontSize: 15,
        },
        tab: queryTab,
        resultSession: {
          resultSets: [],
          activeResultKey: '',
          isResultPanelVisible: true,
        },
      },
    };
    const client = {
      load: vi.fn(async () => bootstrap),
      ready: vi.fn(async () => undefined),
      sync: vi.fn(async () => undefined),
      attach: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      closeCurrentWindow: vi.fn(async () => undefined),
    };

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<NativeDetachedWindowApp client={client} />);
      await flushEffects();
    });

    expect(storeState.tabs).toEqual([queryTab]);
    expect(storeState.theme).toBe('dark');
    expect(typeof storeState.updateQueryTabDraft).toBe('function');
    expect(client.ready).toHaveBeenCalledWith(expect.objectContaining({
      id: bootstrap.id,
      kind: 'workbench',
    }));
    expect(renderer!.root.findByProps({ 'data-workbench-tab': queryTab.id })).toBeTruthy();

    const attachButton = renderer!.root.findByProps({
      'aria-label': 'tab_manager.detached.restore',
    });
    await act(async () => {
      attachButton.props.onClick();
      await flushEffects();
    });

    expect(client.sync).toHaveBeenCalledWith(expect.objectContaining({
      id: bootstrap.id,
      kind: 'workbench',
      tab: queryTab,
    }));
    expect(client.attach).toHaveBeenCalledWith(expect.objectContaining({
      id: bootstrap.id,
      kind: 'workbench',
      tab: queryTab,
    }));
    expect(client.close).not.toHaveBeenCalled();
    expect(client.closeCurrentWindow).toHaveBeenCalledOnce();
  });
});
