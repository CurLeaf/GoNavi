import { describe, expect, it } from 'vitest';

import { buildOverlayWorkbenchTheme } from './overlayWorkbenchTheme';
import {
  SECURITY_UPDATE_ACTION_BUTTON_CLASS,
  SECURITY_UPDATE_BANNER_CLASS,
  SECURITY_UPDATE_RESULT_CARD_ACTIVE_CLASS,
  SECURITY_UPDATE_RESULT_CARD_CLASS,
  getSecurityUpdateActionButtonStyle,
  getSecurityUpdateBannerSurfaceStyle,
  getSecurityUpdateSectionSurfaceStyle,
  getSecurityUpdateShellSurfaceStyle,
} from './securityUpdateVisuals';

describe('securityUpdateVisuals', () => {
  it('builds action buttons without default ant focus glow shadow', () => {
    expect(SECURITY_UPDATE_ACTION_BUTTON_CLASS).toBe('security-update-action-btn');
    expect(SECURITY_UPDATE_BANNER_CLASS).toBe('security-update-banner');
    expect(SECURITY_UPDATE_RESULT_CARD_CLASS).toBe('security-update-result-card');
    expect(SECURITY_UPDATE_RESULT_CARD_ACTIVE_CLASS).toBe('security-update-result-card-active');
    expect(getSecurityUpdateActionButtonStyle()).toMatchObject({
      height: 36,
      borderRadius: 12,
      boxShadow: 'none',
      fontWeight: 600,
    });
  });

  it('keeps the shell surface aligned with overlay shell tokens in light and dark mode', () => {
    const lightTheme = buildOverlayWorkbenchTheme(false);
    const darkTheme = buildOverlayWorkbenchTheme(true);

    expect(getSecurityUpdateShellSurfaceStyle(lightTheme)).toMatchObject({
      border: lightTheme.shellBorder,
      background: lightTheme.shellBg,
      boxShadow: lightTheme.shellShadow,
      backdropFilter: lightTheme.shellBackdropFilter,
    });
    expect(getSecurityUpdateShellSurfaceStyle(darkTheme)).toMatchObject({
      border: darkTheme.shellBorder,
      background: darkTheme.shellBg,
      boxShadow: darkTheme.shellShadow,
      backdropFilter: darkTheme.shellBackdropFilter,
    });
  });

  it('keeps the banner surface aligned with overlay shell tokens instead of translucent section tokens', () => {
    const lightTheme = buildOverlayWorkbenchTheme(false);
    const darkTheme = buildOverlayWorkbenchTheme(true);

    expect(getSecurityUpdateBannerSurfaceStyle(lightTheme)).toMatchObject({
      border: lightTheme.shellBorder,
      background: lightTheme.shellBg,
      boxShadow: 'none',
      backdropFilter: lightTheme.shellBackdropFilter,
    });
    expect(getSecurityUpdateBannerSurfaceStyle(darkTheme)).toMatchObject({
      border: darkTheme.shellBorder,
      background: darkTheme.shellBg,
      boxShadow: 'none',
      backdropFilter: darkTheme.shellBackdropFilter,
    });
  });

  it('can scale shell surface alpha with the current appearance opacity so reminder layers stay visually consistent', () => {
    const lightTheme = buildOverlayWorkbenchTheme(false);
    const fadedShell = getSecurityUpdateShellSurfaceStyle(lightTheme, 0.5);
    const fadedBanner = getSecurityUpdateBannerSurfaceStyle(lightTheme, 0.5);

    expect(fadedShell.background).not.toBe(lightTheme.shellBg);
    expect(fadedShell.border).not.toBe(lightTheme.shellBorder);
    expect(fadedShell.background).toContain('0.49');
    expect(fadedBanner.background).toContain('0.49');
  });

  it('can emphasize a section surface for transient focus and recent-result highlighting', () => {
    const lightTheme = buildOverlayWorkbenchTheme(false);
    const darkTheme = buildOverlayWorkbenchTheme(true);

    expect(getSecurityUpdateSectionSurfaceStyle(lightTheme)).toMatchObject({
      border: lightTheme.sectionBorder,
      background: lightTheme.sectionBg,
      boxShadow: 'none',
    });
    expect(getSecurityUpdateSectionSurfaceStyle(darkTheme)).toMatchObject({
      border: darkTheme.sectionBorder,
      background: darkTheme.sectionBg,
      boxShadow: 'none',
    });

    const emphasizedLight = getSecurityUpdateSectionSurfaceStyle(lightTheme, { emphasized: true });
    const emphasizedDark = getSecurityUpdateSectionSurfaceStyle(darkTheme, { emphasized: true });

    expect(emphasizedLight.background).not.toBe(lightTheme.sectionBg);
    expect(emphasizedLight.boxShadow).not.toBe('none');
    expect(emphasizedDark.background).not.toBe(darkTheme.sectionBg);
    expect(emphasizedDark.boxShadow).not.toBe('none');
  });
});
