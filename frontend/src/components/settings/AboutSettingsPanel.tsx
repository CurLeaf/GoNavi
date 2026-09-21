import React from 'react';
import { message, Spin } from 'antd';
import {
  CopyOutlined,
  FileTextOutlined,
  GithubOutlined,
  MessageOutlined,
  RightOutlined,
  UserOutlined,
  WechatOutlined,
} from '@ant-design/icons';

import { BrowserOpenURL } from '../../../wailsjs/runtime';
import { useI18n } from '../../i18n/provider';
import type { AboutInfo } from '../../hooks/useAppInfo';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import './AboutSettingsPanel.css';

type AboutProjectEntryProps = {
  darkMode: boolean;
  description: string;
  icon: React.ReactNode;
  mutedTextStyle: React.CSSProperties;
  overlayTheme: OverlayWorkbenchTheme;
  title: string;
  copyText?: string;
  url?: string;
};

/** 「项目入口」里的单个入口：有 url 就打开外链，有 copyText 就复制。 */
const AboutProjectEntry: React.FC<AboutProjectEntryProps> = ({
  darkMode,
  description,
  icon,
  mutedTextStyle,
  overlayTheme,
  title,
  copyText,
  url,
}) => {
  const { t } = useI18n();
  const actionable = Boolean(url || copyText);

  return (
    <button
      className="gonavi-about-project-entry"
      type="button"
      onClick={() => {
        if (copyText) {
          void navigator.clipboard.writeText(copyText).then(() => {
            void message.success(t('app.about.project.wechat.copied'));
          });
          return;
        }
        if (url) {
          BrowserOpenURL(url);
        }
      }}
      disabled={!actionable}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 12px',
        border: `1px solid ${darkMode ? 'rgba(255,255,255,0.10)' : 'rgba(16,24,40,0.10)'}`,
        borderRadius: 8,
        background: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.72)',
        color: darkMode ? 'rgba(255,255,255,0.90)' : '#101828',
        cursor: actionable ? 'pointer' : 'not-allowed',
        opacity: actionable ? 1 : 0.58,
        textAlign: 'left',
      }}
    >
      <span className="gonavi-about-project-entry-icon" style={{ color: overlayTheme.iconColor }}>
        {icon}
      </span>
      <span className="gonavi-about-project-entry-body">
        <span className="gonavi-about-project-entry-head">
          <span className="gonavi-about-project-entry-title">{title}</span>
          {copyText
            ? <CopyOutlined className="gonavi-about-project-entry-affix" style={{ color: overlayTheme.mutedText }} />
            : <RightOutlined className="gonavi-about-project-entry-affix" style={{ color: overlayTheme.mutedText }} />}
        </span>
        <span className="gonavi-about-project-entry-description" style={mutedTextStyle}>{description}</span>
      </span>
    </button>
  );
};

type AboutSettingsPanelProps = {
  aboutInfo: AboutInfo;
  aboutDisplayVersion: string;
  aboutLoading: boolean;
  darkMode: boolean;
  mutedTextStyle: React.CSSProperties;
  overlayTheme: OverlayWorkbenchTheme;
};

/**
 * 设置中心「关于 GoNavi」页。
 *
 * 应用随源码分发后不再内置更新检查，这里只展示只读的版本信息与项目入口。
 */
const AboutSettingsPanel: React.FC<AboutSettingsPanelProps> = ({
  aboutInfo,
  aboutDisplayVersion,
  aboutLoading,
  darkMode,
  mutedTextStyle,
  overlayTheme,
}) => {
  const { t } = useI18n();

  if (aboutLoading) {
    return (
      <div className="gonavi-about-loading">
        <Spin />
      </div>
    );
  }

  const buildTimeText = String(aboutInfo?.buildTime || '').trim();
  const versionRows: Array<[string, React.ReactNode]> = [
    [t('app.about.version.current'), aboutDisplayVersion],
    ...(buildTimeText
      ? [[t('app.about.version.build_time'), buildTimeText] as [string, React.ReactNode]]
      : []),
  ];

  return (
    <div className="gonavi-about-pane">
      <section className="gonavi-about-identity" aria-label="GoNavi">
        <div className="gonavi-about-identity-body">
          <div className="gonavi-about-identity-name" style={{ color: overlayTheme.titleText }}>GoNavi</div>
          <div className="gonavi-about-identity-meta" style={{ color: mutedTextStyle.color }}>
            <span className="gonavi-about-identity-author">
              <UserOutlined />
              {aboutInfo?.author || t('common.unknown')}
            </span>
          </div>
        </div>
      </section>

      <section className="gonavi-about-section" aria-label={t('app.about.field.version')}>
        <div className="gonavi-about-facts">
          {versionRows.map(([label, value]) => (
            <div key={label} className="gonavi-about-fact">
              <div className="gonavi-about-field-label" style={{ color: overlayTheme.titleText }}>{label}</div>
              <div className="gonavi-about-fact-value" style={{ color: mutedTextStyle.color }}>{value}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="gonavi-about-divider" role="separator" />

      <section className="gonavi-about-section" aria-labelledby="gonavi-about-project-heading">
        <div id="gonavi-about-project-heading" className="gonavi-about-section-title" style={{ color: overlayTheme.titleText }}>
          {t('app.about.project_links')}
        </div>
        <div className="gonavi-about-link-grid">
          <AboutProjectEntry
            darkMode={darkMode}
            icon={<GithubOutlined />}
            title={t('app.about.project.github.title')}
            description={t('app.about.project.github.description')}
            url={aboutInfo?.repoUrl}
            mutedTextStyle={mutedTextStyle}
            overlayTheme={overlayTheme}
          />
          <AboutProjectEntry
            darkMode={darkMode}
            icon={<MessageOutlined />}
            title={t('app.about.project.issues.title')}
            description={t('app.about.project.issues.description')}
            url={aboutInfo?.issueUrl}
            mutedTextStyle={mutedTextStyle}
            overlayTheme={overlayTheme}
          />
          <AboutProjectEntry
            darkMode={darkMode}
            icon={<FileTextOutlined />}
            title={t('app.about.project.releases.title')}
            description={t('app.about.project.releases.description')}
            url={aboutInfo?.releaseUrl}
            mutedTextStyle={mutedTextStyle}
            overlayTheme={overlayTheme}
          />
          <AboutProjectEntry
            darkMode={darkMode}
            icon={<WechatOutlined />}
            title={t('app.about.project.wechat.title')}
            description={t('app.about.project.wechat.description')}
            copyText={t('app.about.project.wechat.id')}
            mutedTextStyle={mutedTextStyle}
            overlayTheme={overlayTheme}
          />
        </div>
      </section>
    </div>
  );
};

export default AboutSettingsPanel;
