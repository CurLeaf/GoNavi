import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppUpdateManager } from './useAppUpdateManager';

const runtimeApi = vi.hoisted(() => ({
  EventsOn: vi.fn(() => vi.fn()),
}));

const messageApi = vi.hoisted(() => ({
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../wailsjs/runtime', () => runtimeApi);

vi.mock('antd', () => ({
  message: messageApi,
}));

type BackendAppMock = {
  CheckForUpdates: ReturnType<typeof vi.fn>;
  CheckForUpdatesSilently: ReturnType<typeof vi.fn>;
  DownloadUpdate: ReturnType<typeof vi.fn>;
  GetUpdateChannel: ReturnType<typeof vi.fn>;
  InstallUpdateAndRestart: ReturnType<typeof vi.fn>;
  OpenDownloadedUpdateDirectory: ReturnType<typeof vi.fn>;
  SetUpdateChannel: ReturnType<typeof vi.fn>;
  GetAppInfo: ReturnType<typeof vi.fn>;
};

const createBackendAppMock = (): BackendAppMock => ({
  CheckForUpdates: vi.fn(),
  CheckForUpdatesSilently: vi.fn(),
  DownloadUpdate: vi.fn(),
  GetUpdateChannel: vi.fn(async () => ({ success: true, data: { channel: 'latest' } })),
  InstallUpdateAndRestart: vi.fn(),
  OpenDownloadedUpdateDirectory: vi.fn(),
  SetUpdateChannel: vi.fn(async (channel: string) => ({ success: true, data: { channel } })),
  GetAppInfo: vi.fn(async () => ({ success: true, data: { version: '0.8.1', author: 'Syngnat' } })),
});

describe('useAppUpdateManager', () => {
  let backendApp: BackendAppMock;
  let hook: ReturnType<typeof useAppUpdateManager> | null = null;
  let renderer: ReactTestRenderer | null = null;

  const t = (key: string, params?: Record<string, any>) => {
    if (params?.version) return `${key}:${params.version}`;
    if (params?.path) return `${key}:${params.path}`;
    if (params?.error) return `${key}:${params.error}`;
    return key;
  };

  const renderHook = () => {
    const Harness = () => {
      hook = useAppUpdateManager({
        runtimeBuildType: 'release',
        t,
      });
      return null;
    };

    act(() => {
      renderer = create(<Harness />);
    });
  };

  beforeEach(() => {
    backendApp = createBackendAppMock();
    hook = null;
    renderer = null;
    runtimeApi.EventsOn.mockClear();
    messageApi.info.mockReset();
    messageApi.success.mockReset();
    messageApi.error.mockReset();
    vi.useFakeTimers();
    vi.stubGlobal('window', {
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      go: {
        app: {
          App: backendApp,
        },
      },
    });
  });

  afterEach(() => {
    act(() => {
      renderer?.unmount();
    });
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('uses InstallUpdateAndRestart for downloaded macOS updates', async () => {
    backendApp.CheckForUpdates.mockResolvedValue({
      success: true,
      data: {
        hasUpdate: true,
        currentVersion: '0.8.1',
        latestVersion: '0.8.2',
        downloaded: true,
        assetSize: 1024,
      },
    });
    backendApp.InstallUpdateAndRestart.mockResolvedValue({ success: true });
    backendApp.OpenDownloadedUpdateDirectory.mockResolvedValue({ success: true });

    renderHook();

    await act(async () => {
      await hook?.checkForUpdates(false);
    });

    await act(async () => {
      await hook?.handleInstallFromProgress();
    });

    expect(backendApp.InstallUpdateAndRestart).toHaveBeenCalledTimes(1);
    expect(backendApp.OpenDownloadedUpdateDirectory).not.toHaveBeenCalled();
  });

  it('does not auto-open the downloaded macOS package directory after download succeeds', async () => {
    backendApp.CheckForUpdates.mockResolvedValue({
      success: true,
      data: {
        hasUpdate: true,
        currentVersion: '0.8.1',
        latestVersion: '0.8.2',
        downloaded: false,
        assetSize: 2048,
      },
    });
    backendApp.DownloadUpdate.mockResolvedValue({
      success: true,
      data: {
        downloadPath: '/Users/test/Desktop/GoNavi-0.8.2-MacOS-Arm64.dmg',
      },
    });
    backendApp.OpenDownloadedUpdateDirectory.mockResolvedValue({ success: true });

    renderHook();

    await act(async () => {
      await hook?.checkForUpdates(false);
    });

    await act(async () => {
      await hook?.downloadUpdate(hook?.lastUpdateInfo!, false);
    });

    expect(backendApp.DownloadUpdate).toHaveBeenCalledTimes(1);
    expect(backendApp.OpenDownloadedUpdateDirectory).not.toHaveBeenCalled();
    expect(hook?.lastUpdateInfo?.downloaded).toBe(true);
  });

  it('switches update channel and re-checks against the selected channel', async () => {
    backendApp.SetUpdateChannel.mockResolvedValue({ success: true, data: { channel: 'dev' } });
    backendApp.CheckForUpdates.mockResolvedValue({
      success: true,
      data: {
        hasUpdate: false,
        channel: 'dev',
        currentVersion: '0.8.1',
        latestVersion: 'dev-a1b2c3d',
      },
    });

    renderHook();

    await act(async () => {
      await hook?.changeUpdateChannel('dev');
    });

    expect(backendApp.SetUpdateChannel).toHaveBeenCalledWith('dev');
    expect(backendApp.CheckForUpdates).toHaveBeenCalledTimes(1);
    expect(hook?.updateChannel).toBe('dev');
    expect(hook?.lastUpdateInfo?.channel).toBe('dev');
  });
});
