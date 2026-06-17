import React from 'react';
import { Button } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { useI18n } from '../i18n/provider';

interface LinuxCJKFontBannerProps {
  darkMode: boolean;
  installHint: string;
  onOpenFontSettings: () => void;
  onDismiss: () => void;
}

const LinuxCJKFontBanner: React.FC<LinuxCJKFontBannerProps> = ({
  darkMode,
  installHint,
  onOpenFontSettings,
  onDismiss,
}) => {
  const { t } = useI18n();

  return (
    <div
      data-gonavi-linux-cjk-font-banner="true"
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 14px',
        borderBottom: darkMode ? '1px solid rgba(250,204,21,0.20)' : '1px solid rgba(217,119,6,0.18)',
        background: darkMode ? 'rgba(250,204,21,0.10)' : 'rgba(255,247,237,0.92)',
        color: darkMode ? 'rgba(254,249,195,0.96)' : '#7c2d12',
        fontSize: 12,
        lineHeight: 1.55,
      }}
    >
      <InfoCircleOutlined style={{ flexShrink: 0, color: darkMode ? '#facc15' : '#d97706' }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 700 }}>
          {t('app.linux_cjk_font_banner.title')}
        </div>
        <div>
          {t('app.linux_cjk_font_banner.description')}
          <code style={{ marginLeft: 6, fontFamily: 'var(--gn-font-mono)', wordBreak: 'break-all' }}>
            {installHint}
          </code>
        </div>
      </div>
      <Button
        size="small"
        onClick={onOpenFontSettings}
      >
        {t('app.linux_cjk_font_banner.action.open_font_settings')}
      </Button>
      <Button
        size="small"
        type="text"
        onClick={onDismiss}
        style={{ color: 'inherit' }}
      >
        {t('common.close')}
      </Button>
    </div>
  );
};

export default LinuxCJKFontBanner;
