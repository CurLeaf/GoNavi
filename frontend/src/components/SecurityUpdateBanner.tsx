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
import { useI18n } from '../i18n/provider';

interface SecurityUpdateBannerProps {
  status: SecurityUpdateStatus;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  surfaceOpacity?: number;
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
        labelKey: 'security_update.banner.action.start_now',
        onClick: actions.onStart,
      };
    case 'needs_attention':
      return {
        labelKey: 'security_update.banner.action.view_details',
        onClick: actions.onOpenDetails,
      };
    case 'rolled_back':
      return {
        labelKey: 'security_update.banner.action.restart_update',
        onClick: actions.onRestart,
      };
    default:
      return {
        labelKey: 'security_update.banner.action.view_details',
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
        labelKey: 'security_update.banner.action.retry_check',
        onClick: actions.onRetry,
      };
    case 'rolled_back':
      return {
        labelKey: 'security_update.banner.action.view_details',
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
  surfaceOpacity = 1,
  onStart,
  onRetry,
  onRestart,
  onOpenDetails,
  onDismiss,
}: SecurityUpdateBannerProps) => {
  const { t } = useI18n();
  const statusMeta = getSecurityUpdateStatusMeta(status, t);
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
        ...getSecurityUpdateBannerSurfaceStyle(overlayTheme, surfaceOpacity),
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
          {t('security_update.banner.title')}
        </div>
        <div style={{ marginTop: 4, fontSize: 13, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
          {statusMeta.description}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {secondaryAction ? (
          <Button className={SECURITY_UPDATE_ACTION_BUTTON_CLASS} style={actionButtonStyle} onClick={secondaryAction.onClick}>
            {t(secondaryAction.labelKey)}
          </Button>
        ) : null}
        <Button
          className={SECURITY_UPDATE_ACTION_BUTTON_CLASS}
          style={actionButtonStyle}
          type="primary"
          onClick={primaryAction.onClick}
        >
          {t(primaryAction.labelKey)}
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
