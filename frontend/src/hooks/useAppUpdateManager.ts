import { useCallback, useEffect, useRef, useState } from 'react';
import { message } from 'antd';
import { EventsOn } from '../../wailsjs/runtime';
import { resolveAboutDisplayVersion } from '../utils/appVersionDisplay';

type Translator = (key: string, params?: Record<string, any>) => string;

export type UpdateChannel = 'latest' | 'dev';

export type UpdateInfo = {
  hasUpdate: boolean;
  channel?: UpdateChannel | string;
  currentVersion: string;
  latestVersion: string;
  releaseName?: string;
  releaseNotesUrl?: string;
  assetName?: string;
  assetUrl?: string;
  assetSize?: number;
  sha256?: string;
  downloaded?: boolean;
  downloadPath?: string;
};

type UpdateDownloadProgressEvent = {
  status?: 'start' | 'downloading' | 'done' | 'error';
  percent?: number;
  downloaded?: number;
  total?: number;
  message?: string;
};

type UpdateDownloadResultData = {
  info?: UpdateInfo;
  downloadPath?: string;
  installLogPath?: string;
  installTarget?: string;
  platform?: string;
  autoRelaunch?: boolean;
};

type UseAppUpdateManagerOptions = {
  runtimeBuildType: string;
  t: Translator;
};

const createEmptyDownloadProgress = () => ({
  open: false,
  version: '',
  key: '',
  status: 'idle' as 'idle' | 'start' | 'downloading' | 'done' | 'error',
  percent: 0,
  downloaded: 0,
  total: 0,
  message: '',
});

const normalizeUpdateChannel = (value: unknown): UpdateChannel =>
  String(value || '').trim().toLowerCase() === 'dev' ? 'dev' : 'latest';

const buildUpdateKey = (info: Pick<UpdateInfo, 'channel' | 'latestVersion'> | null | undefined): string =>
  info?.latestVersion
    ? `${normalizeUpdateChannel(info.channel)}:${String(info.latestVersion || '').trim()}`
    : '';

export const useAppUpdateManager = ({
  runtimeBuildType,
  t,
}: UseAppUpdateManagerOptions) => {
  const updateCheckInFlightRef = useRef(false);
  const updateDownloadInFlightRef = useRef(false);
  const updateUserDismissedRef = useRef(false);
  const updateDownloadedVersionRef = useRef<string | null>(null);
  const updateInstallTriggeredVersionRef = useRef<string | null>(null);
  const updateDownloadMetaRef = useRef<UpdateDownloadResultData | null>(null);
  const updateNotifiedVersionRef = useRef<string | null>(null);
  const updateMutedVersionRef = useRef<string | null>(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const isAboutOpenRef = useRef(false);
  const [aboutLoading, setAboutLoading] = useState(false);
  const [updateChannel, setUpdateChannelState] = useState<UpdateChannel>('latest');
  const [isUpdateChannelLoading, setIsUpdateChannelLoading] = useState(false);
  const [isUpdateChannelSaving, setIsUpdateChannelSaving] = useState(false);
  const [aboutInfo, setAboutInfo] = useState<{
    version: string;
    author: string;
    buildTime?: string;
    repoUrl?: string;
    issueUrl?: string;
    releaseUrl?: string;
    communityUrl?: string;
  } | null>(null);
  const aboutDisplayVersion = resolveAboutDisplayVersion(runtimeBuildType, aboutInfo?.version);
  const [aboutUpdateStatus, setAboutUpdateStatus] = useState<string>('');
  const [lastUpdateInfo, setLastUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateDownloadProgress, setUpdateDownloadProgress] = useState(createEmptyDownloadProgress);
  const lastUpdateKey = buildUpdateKey(lastUpdateInfo);

  const formatAboutUpdateStatus = useCallback((info: UpdateInfo | null): string => {
    if (!info) {
      return t('app.about.update_status.not_checked');
    }
    if (info.hasUpdate) {
      const localDownloaded = updateDownloadedVersionRef.current === buildUpdateKey(info);
      const hasDownloaded = Boolean(info.downloaded) || localDownloaded;
      return hasDownloaded
        ? t('app.about.update_status.new_version_downloaded', { version: info.latestVersion })
        : t('app.about.update_status.new_version_not_downloaded', { version: info.latestVersion });
    }
    return t('app.about.update_status.latest', { version: info.currentVersion || t('common.unknown') });
  }, [t]);

  const formatBytes = useCallback((bytes?: number) => {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let idx = 0;
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024;
      idx++;
    }
    return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
  }, []);

  const resetLocalUpdateArtifacts = useCallback(() => {
    updateDownloadedVersionRef.current = null;
    updateInstallTriggeredVersionRef.current = null;
    updateDownloadMetaRef.current = null;
    setUpdateDownloadProgress(createEmptyDownloadProgress());
  }, []);

  const downloadUpdate = useCallback(async (info: UpdateInfo, silent: boolean) => {
    if (updateDownloadInFlightRef.current) return;
    const targetKey = buildUpdateKey(info);
    if (updateDownloadedVersionRef.current === targetKey) {
      if (!silent) {
        const cachedDownloadPath = updateDownloadMetaRef.current?.downloadPath;
        void message.info(cachedDownloadPath
          ? t('app.about.message.update_package_ready_with_path', { version: info.latestVersion, path: cachedDownloadPath })
          : t('app.about.message.update_package_ready', { version: info.latestVersion }));
        showUpdateDownloadProgress();
      }
      return;
    }
    updateDownloadInFlightRef.current = true;
    updateUserDismissedRef.current = false;
    updateDownloadMetaRef.current = null;
    setUpdateDownloadProgress({
      open: true,
      version: info.latestVersion,
      key: targetKey,
      status: 'start',
      percent: 0,
      downloaded: 0,
      total: info.assetSize || 0,
      message: '',
    });
    let res: any = null;
    try {
      res = await (window as any).go.app.App.DownloadUpdate();
    } catch (e) {
      console.warn('Wails API: DownloadUpdate unavailable', e);
    }
    updateDownloadInFlightRef.current = false;
    if (res?.success) {
      const resultData = (res?.data || {}) as UpdateDownloadResultData;
      updateDownloadMetaRef.current = resultData;
      updateDownloadedVersionRef.current = targetKey;
      setUpdateDownloadProgress((prev) => {
        const total = prev.total > 0 ? prev.total : (info.assetSize || 0);
        return { ...prev, status: 'done', percent: 100, downloaded: total, total, message: '', open: false };
      });
      setLastUpdateInfo((prev) => {
        if (!prev || prev.latestVersion !== info.latestVersion) {
          return {
            ...info,
            channel: normalizeUpdateChannel(info.channel),
            downloaded: true,
            downloadPath: resultData?.downloadPath || info.downloadPath,
          };
        }
        return {
          ...prev,
          channel: normalizeUpdateChannel(prev.channel || info.channel),
          downloaded: true,
          downloadPath: resultData?.downloadPath || prev.downloadPath || info.downloadPath,
        };
      });
      if (resultData?.downloadPath) {
        void message.success({ content: t('app.about.message.download_completed_with_path', { path: resultData.downloadPath }), duration: 5 });
      } else {
        void message.success({ content: t('app.about.message.download_completed'), duration: 2 });
      }
      setAboutUpdateStatus(formatAboutUpdateStatus({ ...info, channel: normalizeUpdateChannel(info.channel), downloaded: true }));
    } else {
      setUpdateDownloadProgress((prev) => ({
        ...prev,
        status: 'error',
        message: res?.message || t('common.unknown'),
      }));
      void message.error({ content: t('app.about.message.download_failed_with_error', { error: res?.message || t('common.unknown') }), duration: 4 });
    }
  }, [formatAboutUpdateStatus, t]);

  const showUpdateDownloadProgress = useCallback(() => {
    setUpdateDownloadProgress((prev) => {
      if (prev.status === 'idle') return prev;
      return { ...prev, open: true };
    });
  }, []);

  const hideUpdateDownloadProgress = useCallback(() => {
    setUpdateDownloadProgress((prev) => ({ ...prev, open: false }));
  }, []);

  const isLatestUpdateDownloaded = Boolean(lastUpdateInfo?.hasUpdate) && (
    Boolean(lastUpdateInfo?.downloaded)
    || (Boolean(lastUpdateKey) && updateDownloadedVersionRef.current === lastUpdateKey)
  );
  const isBackgroundProgressForLatestUpdate = Boolean(lastUpdateInfo?.hasUpdate)
    && Boolean(lastUpdateKey)
    && updateDownloadProgress.key === lastUpdateKey
    && (updateDownloadProgress.status === 'start'
      || updateDownloadProgress.status === 'downloading'
      || updateDownloadProgress.status === 'done'
      || updateDownloadProgress.status === 'error');
  const canShowProgressEntry = (isLatestUpdateDownloaded || isBackgroundProgressForLatestUpdate)
    && updateInstallTriggeredVersionRef.current !== (lastUpdateKey || null);

  const handleInstallFromProgress = useCallback(async () => {
    const canInstall = updateDownloadProgress.status === 'done'
      || (Boolean(lastUpdateInfo?.hasUpdate) && (Boolean(lastUpdateInfo?.downloaded) || updateDownloadedVersionRef.current === lastUpdateKey));
    if (!canInstall) {
      return;
    }
    const res = await (window as any).go.app.App.InstallUpdateAndRestart();
    if (!res?.success) {
      void message.error(t('app.about.message.install_failed_with_error', { error: res?.message || t('common.unknown') }));
      return;
    }
    updateInstallTriggeredVersionRef.current = lastUpdateKey || null;
    hideUpdateDownloadProgress();
  }, [hideUpdateDownloadProgress, lastUpdateInfo, lastUpdateKey, t, updateDownloadProgress.status]);

  const openDownloadedUpdateDirectory = useCallback(async () => {
    const backendApp = (window as any).go?.app?.App;
    if (typeof backendApp?.OpenDownloadedUpdateDirectory !== 'function') {
      void message.error(t('app.about.message.open_install_directory_failed_with_error', { error: t('common.unknown') }));
      return;
    }
    const res = await backendApp.OpenDownloadedUpdateDirectory();
    if (!res?.success) {
      void message.error(t('app.about.message.open_install_directory_failed_with_error', { error: res?.message || t('common.unknown') }));
      return;
    }
    void message.success(res?.message || t('app.about.message.install_directory_opened_manual_replace'));
  }, [t]);

  const checkForUpdates = useCallback(async (silent: boolean) => {
    if (updateCheckInFlightRef.current) return;
    updateCheckInFlightRef.current = true;
    if (!silent) {
      setAboutUpdateStatus(t('app.about.update_status.checking'));
    }
    const updateAPI = (window as any).go.app.App;
    const checkFn = silent && typeof updateAPI.CheckForUpdatesSilently === 'function'
      ? updateAPI.CheckForUpdatesSilently
      : updateAPI.CheckForUpdates;
    const res = await checkFn();
    updateCheckInFlightRef.current = false;
    if (!res?.success) {
      if (!silent) {
        const error = res?.message || t('common.unknown');
        void message.error(t('app.about.message.check_failed_with_error', { error }));
        setAboutUpdateStatus(t('app.about.update_status.check_failed', { error }));
      }
      return;
    }
    const info: UpdateInfo = {
      ...(res.data || {}),
      channel: normalizeUpdateChannel(res?.data?.channel),
    };
    if (!info) return;
    setUpdateChannelState(normalizeUpdateChannel(info.channel));
    const aboutOpen = isAboutOpenRef.current;
    if (info.hasUpdate) {
      const infoKey = buildUpdateKey(info);
      if (!info.downloaded && updateDownloadedVersionRef.current === infoKey) {
        updateDownloadedVersionRef.current = null;
        updateDownloadMetaRef.current = null;
      }
      const localDownloaded = updateDownloadedVersionRef.current === infoKey;
      const hasDownloaded = Boolean(info.downloaded) || localDownloaded;
      if (hasDownloaded) {
        const downloadPath = info.downloadPath || updateDownloadMetaRef.current?.downloadPath || '';
        updateDownloadedVersionRef.current = infoKey;
        updateDownloadMetaRef.current = {
          ...(updateDownloadMetaRef.current || {}),
          info,
          downloadPath: downloadPath || undefined,
        };
        setUpdateDownloadProgress((prev) => {
          if (prev.status === 'start' || prev.status === 'downloading') {
            return prev;
          }
          const total = info.assetSize || prev.total || 0;
          return {
            ...prev,
            open: prev.open && prev.key === infoKey,
            version: info.latestVersion,
            key: infoKey,
            status: 'done',
            percent: 100,
            downloaded: total,
            total,
            message: '',
          };
        });
        setLastUpdateInfo({
          ...info,
          downloaded: true,
          downloadPath: downloadPath || undefined,
        });
      } else {
        if (updateDownloadedVersionRef.current !== infoKey) {
          updateDownloadMetaRef.current = null;
        }
        setUpdateDownloadProgress((prev) => {
          if (prev.status === 'start' || prev.status === 'downloading') {
            return prev;
          }
          return {
            ...prev,
            open: false,
            version: info.latestVersion,
            key: infoKey,
            status: 'idle',
            percent: 0,
            downloaded: 0,
            total: info.assetSize || 0,
            message: '',
          };
        });
        setLastUpdateInfo(info);
      }
      const statusText = formatAboutUpdateStatus({ ...info, downloaded: hasDownloaded });
      if (!silent) {
        void message.info(t('app.about.message.new_version_found', { version: info.latestVersion }));
        setAboutUpdateStatus(statusText);
      }
      if (silent && aboutOpen) {
        setAboutUpdateStatus(statusText);
      }
      if (silent && !aboutOpen && updateMutedVersionRef.current !== infoKey && updateNotifiedVersionRef.current !== infoKey) {
        updateNotifiedVersionRef.current = infoKey;
        setIsAboutOpen(true);
      }
    } else if (!silent) {
      setUpdateDownloadProgress((prev) => {
        if (prev.status === 'start' || prev.status === 'downloading') {
          return prev;
        }
        return createEmptyDownloadProgress();
      });
      setLastUpdateInfo(info);
      const text = formatAboutUpdateStatus(info);
      void message.success(text);
      setAboutUpdateStatus(text);
    } else if (silent && aboutOpen) {
      setUpdateDownloadProgress((prev) => {
        if (prev.status === 'start' || prev.status === 'downloading') {
          return prev;
        }
        return createEmptyDownloadProgress();
      });
      setLastUpdateInfo(info);
      const text = formatAboutUpdateStatus(info);
      setAboutUpdateStatus(text);
    } else {
      setLastUpdateInfo(info);
    }
  }, [formatAboutUpdateStatus, t]);

  const loadAboutInfo = useCallback(async () => {
    setAboutLoading(true);
    const res = await (window as any).go.app.App.GetAppInfo();
    if (res?.success) {
      setAboutInfo(res.data);
    } else {
      void message.error(t('app.about.message.load_failed', { error: res?.message || t('common.unknown') }));
    }
    setAboutLoading(false);
  }, [t]);

  const loadUpdateChannel = useCallback(async () => {
    const backendApp = (window as any).go?.app?.App;
    if (typeof backendApp?.GetUpdateChannel !== 'function') {
      return;
    }
    setIsUpdateChannelLoading(true);
    try {
      const res = await backendApp.GetUpdateChannel();
      if (res?.success) {
        setUpdateChannelState(normalizeUpdateChannel(res?.data?.channel));
      }
    } catch (e) {
      console.warn('Wails API: GetUpdateChannel unavailable', e);
    } finally {
      setIsUpdateChannelLoading(false);
    }
  }, []);

  const changeUpdateChannel = useCallback(async (nextChannel: UpdateChannel | string) => {
    const normalizedChannel = normalizeUpdateChannel(nextChannel);
    const backendApp = (window as any).go?.app?.App;
    if (typeof backendApp?.SetUpdateChannel !== 'function') {
      setUpdateChannelState(normalizedChannel);
      resetLocalUpdateArtifacts();
      setLastUpdateInfo(null);
      setAboutUpdateStatus(t('app.about.update_status.not_checked'));
      return;
    }

    setIsUpdateChannelSaving(true);
    try {
      const res = await backendApp.SetUpdateChannel(normalizedChannel);
      if (!res?.success) {
        void message.error(t('app.about.message.channel_switch_failed_with_error', { error: res?.message || t('common.unknown') }));
        return;
      }

      const effectiveChannel = normalizeUpdateChannel(res?.data?.channel || normalizedChannel);
      setUpdateChannelState(effectiveChannel);
      resetLocalUpdateArtifacts();
      setLastUpdateInfo(null);
      setAboutUpdateStatus(t('app.about.update_status.not_checked'));
      await checkForUpdates(false);
    } catch (e: any) {
      const error = e?.message || t('common.unknown');
      void message.error(t('app.about.message.channel_switch_failed_with_error', { error }));
    } finally {
      setIsUpdateChannelSaving(false);
    }
  }, [checkForUpdates, resetLocalUpdateArtifacts, t]);

  const muteLatestUpdate = useCallback(() => {
    if (lastUpdateKey) {
      updateMutedVersionRef.current = lastUpdateKey;
    }
    setIsAboutOpen(false);
  }, [lastUpdateKey]);

  const markUpdateProgressDismissed = useCallback(() => {
    updateUserDismissedRef.current = true;
  }, []);

  useEffect(() => {
    isAboutOpenRef.current = isAboutOpen;
  }, [isAboutOpen]);

  useEffect(() => {
    if (isAboutOpen) {
      setAboutUpdateStatus(formatAboutUpdateStatus(lastUpdateInfo));
      void loadAboutInfo();
    }
  }, [formatAboutUpdateStatus, isAboutOpen, lastUpdateInfo, loadAboutInfo]);

  useEffect(() => {
    void loadUpdateChannel();
  }, [loadUpdateChannel]);

  useEffect(() => {
    const startupTimer = window.setTimeout(() => {
      void checkForUpdates(true);
    }, 2000);
    const interval = window.setInterval(() => {
      void checkForUpdates(true);
    }, 30 * 60 * 1000);
    return () => {
      window.clearTimeout(startupTimer);
      window.clearInterval(interval);
    };
  }, [checkForUpdates]);

  useEffect(() => {
    let offDownloadProgress: any = null;
    try {
      offDownloadProgress = EventsOn('update:download-progress', (event: UpdateDownloadProgressEvent) => {
        if (!event) return;
        const status = event.status || 'downloading';
        const nextStatus: 'idle' | 'start' | 'downloading' | 'done' | 'error' =
          status === 'start' || status === 'downloading' || status === 'done' || status === 'error'
            ? status
            : 'downloading';
        const downloaded = typeof event.downloaded === 'number' ? event.downloaded : 0;
        const total = typeof event.total === 'number' ? event.total : 0;
        const percentRaw = typeof event.percent === 'number'
          ? event.percent
          : (total > 0 ? (downloaded / total) * 100 : 0);
        const percent = Math.max(0, Math.min(100, percentRaw));
        setUpdateDownloadProgress((prev) => ({
          open: prev.open,
          version: prev.version,
          key: prev.key,
          status: nextStatus,
          percent,
          downloaded,
          total,
          message: String(event.message || ''),
        }));
      });
    } catch (e) {
      console.warn('Wails API: EventsOn unavailable', e);
    }
    return () => {
      if (offDownloadProgress) offDownloadProgress();
    };
  }, []);

  return {
    aboutDisplayVersion,
    aboutInfo,
    aboutLoading,
    aboutUpdateStatus,
    canShowProgressEntry,
    changeUpdateChannel,
    checkForUpdates,
    downloadUpdate,
    formatBytes,
    handleInstallFromProgress,
    hideUpdateDownloadProgress,
    isAboutOpen,
    isBackgroundProgressForLatestUpdate,
    isLatestUpdateDownloaded,
    isUpdateChannelLoading,
    isUpdateChannelSaving,
    lastUpdateInfo,
    markUpdateProgressDismissed,
    muteLatestUpdate,
    openDownloadedUpdateDirectory,
    setIsAboutOpen,
    showUpdateDownloadProgress,
    updateChannel,
    updateDownloadProgress,
  };
};
