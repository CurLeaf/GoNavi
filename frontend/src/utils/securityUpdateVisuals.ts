import type { CSSProperties } from 'react';

import type { OverlayWorkbenchTheme } from './overlayWorkbenchTheme';

export const SECURITY_UPDATE_ACTION_BUTTON_CLASS = 'security-update-action-btn';
export const SECURITY_UPDATE_BANNER_CLASS = 'security-update-banner';
export const SECURITY_UPDATE_MODAL_CLASS = 'security-update-modal';
export const SECURITY_UPDATE_RESULT_CARD_CLASS = 'security-update-result-card';
export const SECURITY_UPDATE_RESULT_CARD_ACTIVE_CLASS = 'security-update-result-card-active';

type SecurityUpdateSectionSurfaceOptions = {
  emphasized?: boolean;
};

const getSecurityUpdateHighlightBorder = (overlayTheme: OverlayWorkbenchTheme): string => (
  overlayTheme.isDark
    ? '1px solid rgba(255,214,102,0.26)'
    : '1px solid rgba(22,119,255,0.22)'
);

const getSecurityUpdateHighlightBackground = (overlayTheme: OverlayWorkbenchTheme): string => (
  overlayTheme.isDark
    ? 'linear-gradient(180deg, rgba(255,214,102,0.14) 0%, rgba(255,255,255,0.05) 100%)'
    : 'linear-gradient(180deg, rgba(22,119,255,0.12) 0%, rgba(255,255,255,0.96) 100%)'
);

const getSecurityUpdateHighlightShadow = (overlayTheme: OverlayWorkbenchTheme): string => (
  overlayTheme.isDark
    ? '0 0 0 1px rgba(255,214,102,0.12), 0 12px 24px rgba(0,0,0,0.16)'
    : '0 0 0 1px rgba(22,119,255,0.08), 0 10px 22px rgba(15,23,42,0.08)'
);

export const getSecurityUpdateActionButtonStyle = (): CSSProperties => ({
  height: 36,
  borderRadius: 12,
  paddingInline: 16,
  boxShadow: 'none',
  fontWeight: 600,
});

export const getSecurityUpdateShellSurfaceStyle = (
  overlayTheme: OverlayWorkbenchTheme,
): CSSProperties => ({
  border: overlayTheme.shellBorder,
  background: overlayTheme.shellBg,
  boxShadow: overlayTheme.shellShadow,
  backdropFilter: overlayTheme.shellBackdropFilter,
});

export const getSecurityUpdateBannerSurfaceStyle = (
  overlayTheme: OverlayWorkbenchTheme,
): CSSProperties => ({
  ...getSecurityUpdateShellSurfaceStyle(overlayTheme),
  boxShadow: 'none',
});

export const getSecurityUpdateSectionSurfaceStyle = (
  overlayTheme: OverlayWorkbenchTheme,
  options: SecurityUpdateSectionSurfaceOptions = {},
): CSSProperties => ({
  border: options.emphasized ? getSecurityUpdateHighlightBorder(overlayTheme) : overlayTheme.sectionBorder,
  background: options.emphasized ? getSecurityUpdateHighlightBackground(overlayTheme) : overlayTheme.sectionBg,
  boxShadow: options.emphasized ? getSecurityUpdateHighlightShadow(overlayTheme) : 'none',
  transition: 'background 180ms ease, border-color 180ms ease, box-shadow 180ms ease',
});
