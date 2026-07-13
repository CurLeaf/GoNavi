import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveUpdateInstallAction, useAppUpdateManager } from './useAppUpdateManager';

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

  it('resolves Portable and MSI install actions from backend metadata', () => {
    expect(resolveUpdateInstallAction({ packageType: 'portable', autoRelaunch: true })).toBe('restart');
    expect(resolveUpdateInstallAction({ packageType: 'msi', autoRelaunch: true })).toBe('install-and-restart');
    expect(resolveUpdateInstallAction({ packageType: 'msi', autoRelaunch: false })).toBe('launch-installer');
  });

  it('merges complete MSI download metadata returned by the backend', async () => {
    backendApp.CheckForUpdates.mockResolvedValue({
      success: true,
      data: {
        hasUpdate: true,
        channel: 'latest',
        currentVersion: '0.8.1',
        latestVersion: '0.8.2',
        releaseName: 'Initial release metadata',
        assetName: 'GoNavi-0.8.2-Windows-Amd64-Installer.msi',
        packageType: 'msi',
        installMode: 'msi',
        autoRelaunch: true,
        downloaded: false,
        assetSize: 4096,
      },
    });
    backendApp.DownloadUpdate.mockResolvedValue({
      success: true,
      data: {
        info: {
          hasUpdate: true,
          channel: 'latest',
          currentVersion: '0.8.1',
          latestVersion: '0.8.2',
          releaseName: 'Resolved release metadata',
          assetName: 'GoNavi-0.8.2-Windows-Amd64-Installer.msi',
          packageType: 'msi',
          installMode: 'msi',
          autoRelaunch: true,
        },
        downloadPath: 'C:\\ProgramData\\GoNavi\\GoNavi-0.8.2-Windows-Amd64-Installer.msi',
        packageType: 'msi',
        installMode: 'msi',
        autoRelaunch: false,
      },
    });

    renderHook();
    await act(async () => {
      await hook?.checkForUpdates(false);
    });
    await act(async () => {
      await hook?.downloadUpdate(hook?.lastUpdateInfo!, false);
    });

    expect(hook?.lastUpdateInfo).toMatchObject({
      releaseName: 'Resolved release metadata',
      assetName: 'GoNavi-0.8.2-Windows-Amd64-Installer.msi',
      packageType: 'msi',
      installMode: 'msi',
      autoRelaunch: false,
      downloaded: true,
      downloadPath: 'C:\\ProgramData\\GoNavi\\GoNavi-0.8.2-Windows-Amd64-Installer.msi',
    });
    expect(hook?.installMode).toBe('msi');
    expect(hook?.updateInstallAction).toBe('launch-installer');
    expect(hook?.updateDownloadProgress.message).toBe('app.about.download_progress.ready_to_install');
    expect(messageApi.success).toHaveBeenCalledWith(expect.objectContaining({
      content: 'app.about.message.download_ready_install_with_path:C:\\ProgramData\\GoNavi\\GoNavi-0.8.2-Windows-Amd64-Installer.msi',
    }));
  });

  it('keeps same-version Portable and MSI downloads in separate cache identities', async () => {
    const portableInfo = {
      hasUpdate: true,
      channel: 'latest',
      currentVersion: '0.8.1',
      latestVersion: '0.8.2',
      assetName: 'GoNavi-0.8.2-Windows-Amd64-Portable.exe',
      packageType: 'portable',
      installMode: 'portable',
      autoRelaunch: true,
      downloaded: false,
      assetSize: 2048,
    };
    const msiInfo = {
      ...portableInfo,
      assetName: 'GoNavi-0.8.2-Windows-Amd64-Installer.msi',
      packageType: 'msi',
      installMode: 'msi',
    };
    backendApp.CheckForUpdates
      .mockResolvedValueOnce({ success: true, data: portableInfo })
      .mockResolvedValueOnce({ success: true, data: msiInfo });
    backendApp.DownloadUpdate
      .mockResolvedValueOnce({ success: true, data: { info: portableInfo, packageType: 'portable' } })
      .mockResolvedValueOnce({ success: true, data: { info: msiInfo, packageType: 'msi' } });

    renderHook();
    await act(async () => {
      await hook?.checkForUpdates(false);
    });
    await act(async () => {
      await hook?.downloadUpdate(hook?.lastUpdateInfo!, false);
    });
    await act(async () => {
      await hook?.checkForUpdates(false);
    });

    expect(hook?.lastUpdateInfo?.packageType).toBe('msi');
    expect(hook?.isLatestUpdateDownloaded).toBe(false);

    await act(async () => {
      await hook?.downloadUpdate(hook?.lastUpdateInfo!, false);
    });
    expect(backendApp.DownloadUpdate).toHaveBeenCalledTimes(2);
    expect(hook?.lastUpdateInfo?.packageType).toBe('msi');
    expect(hook?.isLatestUpdateDownloaded).toBe(true);
  });

  it('reports a launched MSI installer instead of claiming an automatic restart', async () => {
    backendApp.CheckForUpdates.mockResolvedValue({
      success: true,
      data: {
        hasUpdate: true,
        channel: 'latest',
        currentVersion: '0.8.1',
        latestVersion: '0.8.2',
        assetName: 'GoNavi-0.8.2-Windows-Amd64-Installer.msi',
        packageType: 'msi',
        installMode: 'msi',
        autoRelaunch: false,
        downloaded: true,
      },
    });
    backendApp.InstallUpdateAndRestart.mockResolvedValue({
      success: true,
      data: { packageType: 'msi', autoRelaunch: false },
    });

    renderHook();
    await act(async () => {
      await hook?.checkForUpdates(false);
    });
    await act(async () => {
      await hook?.handleInstallFromProgress();
    });

    expect(backendApp.InstallUpdateAndRestart).toHaveBeenCalledTimes(1);
    expect(hook?.updateInstallAction).toBe('launch-installer');
    expect(hook?.updateDownloadProgress.message).toBe('app.about.download_progress.installer_started');
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
    expect(backendApp.InstallUpdateAndRestart).not.toHaveBeenCalled();
    expect(hook?.lastUpdateInfo?.downloaded).toBe(true);
  });

  it('keeps download at 100% ready-to-restart without auto-installing after download completes', async () => {
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
        platform: 'darwin',
        autoRelaunch: true,
        downloadPath: '/Users/test/Desktop/GoNavi-0.8.2/GoNavi-0.8.2-MacOS-Arm64.dmg',
      },
    });
    backendApp.InstallUpdateAndRestart.mockResolvedValue({ success: true });

    renderHook();

    await act(async () => {
      await hook?.checkForUpdates(false);
    });

    await act(async () => {
      await hook?.downloadUpdate(hook?.lastUpdateInfo!, false);
    });

    expect(backendApp.DownloadUpdate).toHaveBeenCalledTimes(1);
    // 下载完成后不自动安装；用户需点击「重启应用更新」
    expect(backendApp.InstallUpdateAndRestart).not.toHaveBeenCalled();
    expect(backendApp.OpenDownloadedUpdateDirectory).not.toHaveBeenCalled();
    expect(hook?.updateDownloadProgress.status).toBe('done');
    expect(hook?.updateDownloadProgress.percent).toBe(100);
    expect(hook?.updateDownloadProgress.open).toBe(true);
    expect(hook?.lastUpdateInfo?.downloaded).toBe(true);
  });

  it('installs and restarts only after the user confirms restart-to-update', async () => {
    backendApp.CheckForUpdates.mockResolvedValue({
      success: true,
      data: {
        hasUpdate: true,
        currentVersion: '0.8.1',
        latestVersion: '0.8.2',
        downloaded: true,
        assetSize: 2048,
      },
    });
    backendApp.InstallUpdateAndRestart.mockResolvedValue({ success: true });

    renderHook();

    await act(async () => {
      await hook?.checkForUpdates(false);
    });

    let accepted = false;
    await act(async () => {
      accepted = await hook!.handleInstallFromProgress();
    });

    expect(backendApp.InstallUpdateAndRestart).toHaveBeenCalledTimes(1);
    expect(accepted).toBe(true);
  });

  it('returns false when the backend rejects restart-to-update', async () => {
    backendApp.CheckForUpdates.mockResolvedValue({
      success: true,
      data: {
        hasUpdate: true,
        currentVersion: '0.8.1',
        latestVersion: '0.8.2',
        downloaded: true,
        assetSize: 2048,
      },
    });
    backendApp.InstallUpdateAndRestart.mockResolvedValue({
      success: false,
      message: 'unable-to-start-updater',
    });

    renderHook();

    await act(async () => {
      await hook?.checkForUpdates(false);
    });

    let accepted = true;
    await act(async () => {
      accepted = await hook!.handleInstallFromProgress();
    });

    expect(accepted).toBe(false);
    expect(backendApp.InstallUpdateAndRestart).toHaveBeenCalledTimes(1);
    expect(hook?.updateDownloadProgress.status).toBe('error');
    expect(messageApi.error).toHaveBeenCalledWith(
      'app.about.message.install_failed_with_error:unable-to-start-updater',
    );
  });

  it('returns false without calling the backend when no update is ready', async () => {
    renderHook();

    let accepted = true;
    await act(async () => {
      accepted = await hook!.handleInstallFromProgress();
    });

    expect(accepted).toBe(false);
    expect(backendApp.InstallUpdateAndRestart).not.toHaveBeenCalled();
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

  it('keeps release metadata from the backend update response', async () => {
    backendApp.CheckForUpdates.mockResolvedValue({
      success: true,
      data: {
        hasUpdate: true,
        currentVersion: '0.8.1',
        latestVersion: '0.8.2',
        releaseName: 'Dev Build (dev-22fab86)',
        releasePublishedAt: '2026-07-08T11:15:00Z',
        releaseNotesUrl: 'https://github.com/Syngnat/GoNavi/releases/tag/dev-latest',
      },
    });

    renderHook();

    await act(async () => {
      await hook?.checkForUpdates(false);
    });

    expect(hook?.lastUpdateInfo?.releaseName).toBe('Dev Build (dev-22fab86)');
    expect(hook?.lastUpdateInfo?.releasePublishedAt).toBe('2026-07-08T11:15:00Z');
    expect(hook?.lastUpdateInfo?.releaseNotesUrl).toBe('https://github.com/Syngnat/GoNavi/releases/tag/dev-latest');
  });

  it('keeps official about metadata usable when backend app info is incomplete', async () => {
    backendApp.GetAppInfo.mockResolvedValue({
      success: true,
      data: {
        version: '',
        author: 'Unknown',
      },
    });
    backendApp.CheckForUpdates.mockResolvedValue({
      success: true,
      data: {
        hasUpdate: false,
        currentVersion: '0.8.5',
        latestVersion: '0.8.5',
      },
    });

    renderHook();

    await act(async () => {
      await hook?.checkForUpdates(false);
    });
    await act(async () => {
      hook?.setIsAboutOpen(true);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(hook?.aboutDisplayVersion).toBe('0.8.5');
    expect(hook?.aboutInfo?.author).toBe('Syngnat');
    expect(hook?.aboutInfo?.repoUrl).toBe('https://github.com/Syngnat/GoNavi');
    expect(hook?.aboutInfo?.issueUrl).toBe('https://github.com/Syngnat/GoNavi/issues');
    expect(hook?.aboutInfo?.releaseUrl).toBe('https://github.com/Syngnat/GoNavi/releases');
    expect(messageApi.error).not.toHaveBeenCalled();
  });

  it('opens settings-center bridge instead of legacy about modal on silent update discovery', async () => {
    const bridge = {
      open: vi.fn(),
      close: vi.fn(),
      isOpen: vi.fn(() => false),
    };
    const bridgeRef = { current: bridge };

    backendApp.CheckForUpdatesSilently.mockResolvedValue({
      success: true,
      data: {
        hasUpdate: true,
        currentVersion: '0.8.1',
        latestVersion: '0.8.2',
        assetSize: 1024,
      },
    });

    const Harness = () => {
      hook = useAppUpdateManager({
        runtimeBuildType: 'release',
        t,
        updateCenterBridgeRef: bridgeRef,
      });
      return null;
    };

    act(() => {
      renderer = create(<Harness />);
    });

    await act(async () => {
      await hook?.checkForUpdates(true);
    });

    expect(bridge.open).toHaveBeenCalledTimes(1);
    expect(hook?.isAboutOpen).toBe(false);
    expect(hook?.lastUpdateInfo?.hasUpdate).toBe(true);
    expect(hook?.lastUpdateInfo?.latestVersion).toBe('0.8.2');
  });

  it('opens the downloaded update directory when a package is already downloaded', async () => {
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
    backendApp.OpenDownloadedUpdateDirectory.mockResolvedValue({
      success: true,
      message: 'opened-install-directory',
    });

    renderHook();

    await act(async () => {
      await hook?.checkForUpdates(false);
    });

    await act(async () => {
      await hook?.openDownloadedUpdateDirectory();
    });

    expect(backendApp.OpenDownloadedUpdateDirectory).toHaveBeenCalledTimes(1);
    expect(messageApi.success).toHaveBeenCalledWith('opened-install-directory');
  });
});
