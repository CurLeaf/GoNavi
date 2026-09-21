import { useCallback, useEffect, useMemo, useState } from 'react';
import { message } from 'antd';

import type { I18nParams } from '../i18n/types';
import { resolveAboutDisplayVersion } from '../utils/appVersionDisplay';

/** 「关于 GoNavi」页展示的只读应用信息（来自绑定层 GetAppInfo）。 */
export type AboutInfo = {
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

type Translator = (key: string, params?: I18nParams) => string;

const isUnknownAboutValue = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  return normalized === 'unknown' || normalized === '未知' || normalized === 'common.unknown';
};

const normalizeAboutText = (value: unknown): string => String(value ?? '').trim();

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

type UseAppInfoOptions = {
  runtimeBuildType: string;
  t: Translator;
};

/**
 * 只负责拉取「关于」页所需的静态应用信息。
 *
 * 应用改为随源码分发后不再有应用内更新检查，因此这里不含任何更新通道、
 * 下载或安装状态。
 */
export const useAppInfo = ({ runtimeBuildType, t }: UseAppInfoOptions) => {
  const [aboutInfo, setAboutInfo] = useState<AboutInfo>(() => DEFAULT_ABOUT_INFO);
  const [aboutLoading, setAboutLoading] = useState(false);

  const aboutDisplayVersion = useMemo(
    () => resolveAboutDisplayVersion(runtimeBuildType, normalizeAboutVersion(aboutInfo.version), t('common.unknown')),
    [aboutInfo.version, runtimeBuildType, t],
  );

  const loadAppInfo = useCallback(async () => {
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
        return;
      }
      setAboutInfo(DEFAULT_ABOUT_INFO);
      void message.error(t('app.about.message.load_failed', { error: res?.message || t('common.unknown') }));
    } catch (e: any) {
      setAboutInfo(DEFAULT_ABOUT_INFO);
      void message.error(t('app.about.message.load_failed', { error: e?.message || t('common.unknown') }));
    } finally {
      setAboutLoading(false);
    }
  }, [t]);

  return { aboutInfo, aboutLoading, aboutDisplayVersion, loadAppInfo };
};

/** 打开「关于」页时刷新一次应用信息。 */
export const usePrepareAboutSurface = (isOpen: boolean, loadAppInfo: () => void) => {
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    loadAppInfo();
  }, [isOpen, loadAppInfo]);
};
