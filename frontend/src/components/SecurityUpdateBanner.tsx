import { Button } from 'antd';
import { CloseOutlined, SafetyCertificateOutlined } from '@ant-design/icons';

import type { SecurityUpdateStatus } from '../types';
import { getSecurityUpdateStatusMeta } from '../utils/securityUpdatePresentation';
import type { OverlayWorkbenchTheme } from '../utils/overlayWorkbenchTheme';
import {
  SECURITY_UPDATE_ACTION_BUTTON_CLASS,
  SECURITY_UPDATE_BANNER_CLASS,
  getSecurityUpdateActionButtonStyle,
  getSecurityUpdateBannerSurfaceStyle,
} from '../utils/securityUpdateVisuals';

interface SecurityUpdateBannerProps {
  status: SecurityUpdateStatus;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  onStart: () => void;
  onRetry: () => void;
  onRestart: () => void;
  onOpenDetails: () => void;
  onDismiss: () => void;
}

const resolvePrimaryAction = (
  status: SecurityUpdateStatus,
  actions: Pick<SecurityUpdateBannerProps, 'onStart' | 'onRetry' | 'onRestart' | 'onOpenDetails'>,
) => {
  switch (status.overallStatus) {
    case 'postponed':
      return {
        label: '立即更新',
        onClick: actions.onStart,
      };
    case 'needs_attention':
      return {
        label: '查看详情',
        onClick: actions.onOpenDetails,
      };
    case 'rolled_back':
      return {
        label: '重新开始更新',
        onClick: actions.onRestart,
      };
    default:
      return {
        label: '查看详情',
        onClick: actions.onOpenDetails,
      };
  }
};

const resolveSecondaryAction = (
  status: SecurityUpdateStatus,
  actions: Pick<SecurityUpdateBannerProps, 'onRetry' | 'onOpenDetails'>,
) => {
  switch (status.overallStatus) {
    case 'needs_attention':
      return {
        label: '重新检查',
        onClick: actions.onRetry,
      };
    case 'rolled_back':
      return {
        label: '查看详情',
        onClick: actions.onOpenDetails,
      };
    default:
      return null;
  }
};

const SecurityUpdateBanner = ({
  status,
  darkMode,
  overlayTheme,
  onStart,
  onRetry,
  onRestart,
  onOpenDetails,
  onDismiss,
}: SecurityUpdateBannerProps) => {
  const statusMeta = getSecurityUpdateStatusMeta(status);
  const primaryAction = resolvePrimaryAction(status, { onStart, onRetry, onRestart, onOpenDetails });
  const secondaryAction = resolveSecondaryAction(status, { onRetry, onOpenDetails });
  const actionButtonStyle = getSecurityUpdateActionButtonStyle();

  return (
    <div
      className={SECURITY_UPDATE_BANNER_CLASS}
      style={{
        margin: '12px 12px 0',
        padding: '14px 16px',
        borderRadius: 16,
        ...getSecurityUpdateBannerSurfaceStyle(overlayTheme),
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 14,
          display: 'grid',
          placeItems: 'center',
          background: overlayTheme.iconBg,
          color: overlayTheme.iconColor,
          flexShrink: 0,
          fontSize: 18,
        }}
      >
        <SafetyCertificateOutlined />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: overlayTheme.titleText }}>
          已保存配置可进行安全更新
        </div>
        <div style={{ marginTop: 4, fontSize: 13, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
          {statusMeta.description}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {secondaryAction ? (
          <Button className={SECURITY_UPDATE_ACTION_BUTTON_CLASS} style={actionButtonStyle} onClick={secondaryAction.onClick}>
            {secondaryAction.label}
          </Button>
        ) : null}
        <Button
          className={SECURITY_UPDATE_ACTION_BUTTON_CLASS}
          style={actionButtonStyle}
          type="primary"
          onClick={primaryAction.onClick}
        >
          {primaryAction.label}
        </Button>
        <Button
          className={SECURITY_UPDATE_ACTION_BUTTON_CLASS}
          style={{ ...actionButtonStyle, width: 36, minWidth: 36, paddingInline: 0 }}
          type="text"
          icon={<CloseOutlined />}
          onClick={onDismiss}
        />
      </div>
    </div>
  );
};

export type { SecurityUpdateBannerProps };
export default SecurityUpdateBanner;
