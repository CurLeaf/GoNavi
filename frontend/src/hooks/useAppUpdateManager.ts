import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
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
  releasePublishedAt?: string;
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

/** 启动发现更新时打开「设置中心-关于」页（替代旧版关于弹窗） */
export type UpdateCenterBridge = {
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
};

type UseAppUpdateManagerOptions = {
  runtimeBuildType: string;
  t: Translator;
  updateCenterBridgeRef?: MutableRefObject<UpdateCenterBridge | null>;
};

type AboutInfo = {
  version: string;
  author: string;
  buildTime?: string;
  repoUrl?: string;
  issueUrl?: string;
  releaseUrl?: string;
  communityUrl?: string;
};

const DEFAULT_ABOUT_INFO: AboutInfo = {
  version: '',
  author: 'Syngnat',
  repoUrl: 'https://github.com/Syngnat/GoNavi',
  issueUrl: 'https://github.com/Syngnat/GoNavi/issues',
  releaseUrl: 'https://github.com/Syngnat/GoNavi/releases',
  communityUrl: 'https://aibook.ren',
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

const isUnknownAboutValue = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  return normalized === 'unknown' || normalized === '未知' || normalized === 'common.unknown';
};

const normalizeAboutText = (value: unknown): string =>
  String(value || '').trim();

const normalizeAboutVersion = (value: unknown): string => {
  const text = normalizeAboutText(value);
  if (!text || text === '0.0.0' || isUnknownAboutValue(text)) {
    return '';
  }
  return text;
};

const normalizeAboutInfo = (value: unknown): AboutInfo => {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const version = normalizeAboutVersion(source.version);
  const author = normalizeAboutText(source.author);
  const buildTime = normalizeAboutText(source.buildTime);
  const repoUrl = normalizeAboutText(source.repoUrl);
  const issueUrl = normalizeAboutText(source.issueUrl);
  const releaseUrl = normalizeAboutText(source.releaseUrl);
  const communityUrl = normalizeAboutText(source.communityUrl);

  return {
    ...DEFAULT_ABOUT_INFO,
    version,
    author: author && !isUnknownAboutValue(author) ? author : DEFAULT_ABOUT_INFO.author,
    buildTime: buildTime || undefined,
    repoUrl: repoUrl || DEFAULT_ABOUT_INFO.repoUrl,
    issueUrl: issueUrl || DEFAULT_ABOUT_INFO.issueUrl,
    releaseUrl: releaseUrl || DEFAULT_ABOUT_INFO.releaseUrl,
    communityUrl: communityUrl || DEFAULT_ABOUT_INFO.communityUrl,
  };
};

export const useAppUpdateManager = ({
  runtimeBuildType,
  t,
  updateCenterBridgeRef,
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

  const isUpdateCenterOpen = useCallback(() => {
    return Boolean(updateCenterBridgeRef?.current?.isOpen?.() || isAboutOpenRef.current);
  }, [updateCenterBridgeRef]);

  // 仅打开关于 UI；应用信息加载由 prepareAboutSurface / isAboutOpen effect 负责
  const openUpdateCenter = useCallback(() => {
    if (updateCenterBridgeRef?.current?.open) {
      updateCenterBridgeRef.current.open();
      return;
    }
    // 兼容：未接线时回退旧版关于弹窗
    setIsAboutOpen(true);
  }, [updateCenterBridgeRef]);

  const closeUpdateCenter = useCallback(() => {
    updateCenterBridgeRef?.current?.close?.();
    setIsAboutOpen(false);
  }, [updateCenterBridgeRef]);

  const [aboutLoading, setAboutLoading] = useState(false);
  const [updateChannel, setUpdateChannelState] = useState<UpdateChannel>('latest');
  const [isUpdateChannelLoading, setIsUpdateChannelLoading] = useState(false);
  const [isUpdateChannelSaving, setIsUpdateChannelSaving] = useState(false);
  const [aboutInfo, setAboutInfo] = useState<AboutInfo>(() => DEFAULT_ABOUT_INFO);
  const [aboutUpdateStatus, setAboutUpdateStatus] = useState<string>('');
  const [lastUpdateInfo, setLastUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateDownloadProgress, setUpdateDownloadProgress] = useState(createEmptyDownloadProgress);
  const aboutDisplayVersion = resolveAboutDisplayVersion(
    runtimeBuildType,
    normalizeAboutVersion(aboutInfo.version) || normalizeAboutVersion(lastUpdateInfo?.currentVersion),
  );
  const lastUpdateKey = buildUpdateKey(lastUpdateInfo);

  const formatAboutUpdateStatus = useCallback((info: UpdateInfo | null): string => {
    if (!info) {
      return t('app.about.update_status.not_checked');
    }
    if (info.hasUpdate) {
      const localDownloaded = updateDownloadedVersionRef.current === buildUpdateKey(info);
      const hasDownloaded = Boolean(info.downloaded) || localDownloaded;
      return hasDownloaded
        ? t('app.about.update_status.new_version_ready_restart', { version: info.latestVersion })
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
      // 与 Terminus/Codex 一致：下载到 100% 后停留在就绪态，由用户点击「重启应用更新」
      setUpdateDownloadProgress((prev) => ({
        ...prev,
        open: true,
        status: 'done',
        percent: 100,
        downloaded: prev.total > 0 ? prev.total : (info.assetSize || prev.downloaded),
        message: t('app.about.download_progress.ready_to_restart'),
      }));
      void message.success({
        content: resultData?.downloadPath
          ? t('app.about.message.download_ready_restart_with_path', { path: resultData.downloadPath })
          : t('app.about.message.download_ready_restart'),
        duration: 4,
      });
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

  const handleInstallFromProgress = useCallback(async (): Promise<boolean> => {
    const canInstall = updateDownloadProgress.status === 'done'
      || (Boolean(lastUpdateInfo?.hasUpdate) && (Boolean(lastUpdateInfo?.downloaded) || updateDownloadedVersionRef.current === lastUpdateKey));
    if (!canInstall) {
      return false;
    }
    // 点击后进入「正在应用并重启」态，再拉起安装脚本并退出
    setUpdateDownloadProgress((prev) => ({
      ...prev,
      open: true,
      status: 'downloading',
      percent: 100,
      message: t('app.about.download_progress.applying_restart'),
    }));
    let res: any = null;
    try {
      res = await (window as any).go?.app?.App?.InstallUpdateAndRestart?.();
    } catch (error: any) {
      res = { success: false, message: error?.message || t('common.unknown') };
    }
    if (!res?.success) {
      setUpdateDownloadProgress((prev) => ({
        ...prev,
        open: true,
        status: 'error',
        message: res?.message || t('common.unknown'),
      }));
      void message.error(t('app.about.message.install_failed_with_error', { error: res?.message || t('common.unknown') }));
      return false;
    }
    updateInstallTriggeredVersionRef.current = lastUpdateKey || null;
    // 后端会 Quit；此处保持弹窗文案，避免用户误以为失败
    setUpdateDownloadProgress((prev) => ({
      ...prev,
      open: true,
      status: 'done',
      percent: 100,
      message: t('app.about.download_progress.restarting'),
    }));
    return true;
  }, [lastUpdateInfo, lastUpdateKey, t, updateDownloadProgress.status]);

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
    const aboutOpen = isUpdateCenterOpen();
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
        // 启动/后台检查发现更新时，打开设置中心「关于」页，不再弹旧版关于对话框
        openUpdateCenter();
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
  }, [formatAboutUpdateStatus, isUpdateCenterOpen, openUpdateCenter, t]);

  const loadAboutInfo = useCallback(async () => {
    setAboutLoading(true);
    try {
      const backendApp = (window as any).go?.app?.App;
      if (typeof backendApp?.GetAppInfo !== 'function') {
        setAboutInfo(DEFAULT_ABOUT_INFO);
        return;
      }
      const res = await backendApp.GetAppInfo();
      if (res?.success) {
        setAboutInfo(normalizeAboutInfo(res.data));
      } else {
        setAboutInfo(DEFAULT_ABOUT_INFO);
        void message.error(t('app.about.message.load_failed', { error: res?.message || t('common.unknown') }));
      }
    } catch (e: any) {
      setAboutInfo(DEFAULT_ABOUT_INFO);
      const error = e?.message || t('common.unknown');
      void message.error(t('app.about.message.load_failed', { error }));
    } finally {
      setAboutLoading(false);
    }
  }, [t]);

  /** 关于页（设置中心或旧弹窗）打开时刷新状态与应用信息 */
  const prepareAboutSurface = useCallback(() => {
    setAboutUpdateStatus(formatAboutUpdateStatus(lastUpdateInfo));
    void loadAboutInfo();
  }, [formatAboutUpdateStatus, lastUpdateInfo, loadAboutInfo]);

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
    closeUpdateCenter();
  }, [closeUpdateCenter, lastUpdateKey]);

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
        setUpdateDownloadProgress((prev) => {
          // 用户已点「重启应用更新」时，不让 downloading 事件把 100% 就绪态打回中间态文案
          if (updateInstallTriggeredVersionRef.current && prev.key && updateInstallTriggeredVersionRef.current === prev.key) {
            return prev;
          }
          const eventMessage = String(event.message || '');
          let message = eventMessage;
          if (!message) {
            if (nextStatus === 'done') {
              message = t('app.about.download_progress.ready_to_restart');
            } else if (nextStatus === 'start' || nextStatus === 'downloading') {
              message = t('app.about.download_progress.downloading');
            }
          }
          return {
            open: prev.open || nextStatus === 'start' || nextStatus === 'downloading' || nextStatus === 'done' || nextStatus === 'error',
            version: prev.version,
            key: prev.key,
            status: nextStatus,
            percent: nextStatus === 'done' ? 100 : percent,
            downloaded: nextStatus === 'done' && total > 0 ? total : downloaded,
            total: total > 0 ? total : prev.total,
            message,
          };
        });
      });
    } catch (e) {
      console.warn('Wails API: EventsOn unavailable', e);
    }
    return () => {
      if (offDownloadProgress) offDownloadProgress();
    };
  }, [t]);

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
    prepareAboutSurface,
    setIsAboutOpen,
    showUpdateDownloadProgress,
    updateChannel,
    updateDownloadProgress,
  };
};
