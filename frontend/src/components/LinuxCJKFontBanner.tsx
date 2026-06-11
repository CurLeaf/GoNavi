import React from 'react';
import { Button } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';

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
}) => (
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
        Linux CJK fonts missing / Ubuntu 中文字体缺失
      </div>
      <div>
        Chinese text may render as □□□. Install fonts, then restart GoNavi:
        <code style={{ marginLeft: 6, fontFamily: 'var(--gn-font-mono)', wordBreak: 'break-all' }}>
          {installHint}
        </code>
      </div>
    </div>
    <Button
      size="small"
      onClick={onOpenFontSettings}
    >
      Font Settings
    </Button>
    <Button
      size="small"
      type="text"
      onClick={onDismiss}
      style={{ color: 'inherit' }}
    >
      Close
    </Button>
  </div>
);

export default LinuxCJKFontBanner;
