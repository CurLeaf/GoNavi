export type DriverManagerWorkbenchTheme = {
  isDark: boolean;
  pageBg: string;
  sectionBg: string;
  sectionBorder: string;
  cardBg: string;
  cardBorder: string;
  cardWarningBorder: string;
  cardReadyBorder: string;
  statBg: string;
  statBorder: string;
  updateNoteBg: string;
  updateNoteBorder: string;
  mutedText: string;
  titleText: string;
  warningText: string;
};

/** v2 = body[data-ui-version="v2"]，由 App.tsx 切换。 */
const isV2 = (): boolean => {
  if (typeof document === 'undefined' || !document.body) return false;
  return document.body.getAttribute('data-ui-version') === 'v2';
};

export const buildDriverManagerWorkbenchTheme = (darkMode: boolean, _opacity: number): DriverManagerWorkbenchTheme => {
  // ─── v2 palette ──────────────────────────────────────────────
  if (isV2()) {
    if (darkMode) {
      return {
        isDark: true,
        pageBg: '#161a21',
        sectionBg: '#1b1f27',
        sectionBorder: '0.5px solid rgba(255,255,255,0.06)',
        cardBg: '#161a21',
        cardBorder: '0.5px solid rgba(255,255,255,0.10)',
        cardWarningBorder: '0.5px solid rgba(245, 158, 11, 0.36)',
        cardReadyBorder: '0.5px solid rgba(34, 197, 94, 0.36)',
        statBg: '#1b1f27',
        statBorder: '0.5px solid rgba(255,255,255,0.06)',
        updateNoteBg: 'rgba(245, 158, 11, 0.10)',
        updateNoteBorder: '0.5px solid rgba(245, 158, 11, 0.30)',
        mutedText: '#80868f',
        titleText: '#f1f3f5',
        warningText: '#f59e0b',
      };
    }
    return {
      isDark: false,
      pageBg: '#ffffff',
      sectionBg: '#fafaf8',
      sectionBorder: '0.5px solid rgba(15,23,42,0.08)',
      cardBg: '#ffffff',
      cardBorder: '0.5px solid rgba(15,23,42,0.12)',
      cardWarningBorder: '0.5px solid rgba(217, 119, 6, 0.32)',
      cardReadyBorder: '0.5px solid rgba(22, 163, 74, 0.28)',
      statBg: '#fafaf8',
      statBorder: '0.5px solid rgba(15,23,42,0.08)',
      updateNoteBg: 'rgba(217, 119, 6, 0.08)',
      updateNoteBorder: '0.5px solid rgba(217, 119, 6, 0.24)',
      mutedText: '#6b7280',
      titleText: '#0c1322',
      warningText: '#d97706',
    };
  }

  // ─── legacy palette ──────────────────────────────────────────
  if (darkMode) {
    const darkSurface = 'rgb(31, 31, 31)';

    return {
      isDark: true,
      pageBg: darkSurface,
      sectionBg: darkSurface,
      sectionBorder: '1px solid rgba(255, 255, 255, 0.08)',
      cardBg: darkSurface,
      cardBorder: '1px solid rgba(255, 255, 255, 0.08)',
      cardWarningBorder: '1px solid rgba(250, 173, 20, 0.35)',
      cardReadyBorder: '1px solid rgba(82, 196, 26, 0.22)',
      statBg: darkSurface,
      statBorder: '1px solid rgba(255, 255, 255, 0.08)',
      updateNoteBg: darkSurface,
      updateNoteBorder: '1px solid rgba(250, 173, 20, 0.24)',
      mutedText: 'rgba(255, 255, 255, 0.62)',
      titleText: '#f5f7ff',
      warningText: '#f6c453',
    };
  }

  const lightSurface = 'rgb(255, 255, 255)';

  return {
    isDark: false,
    pageBg: lightSurface,
    sectionBg: lightSurface,
    sectionBorder: '1px solid rgba(5, 5, 5, 0.08)',
    cardBg: lightSurface,
    cardBorder: '1px solid rgba(5, 5, 5, 0.08)',
    cardWarningBorder: '1px solid rgba(250, 173, 20, 0.35)',
    cardReadyBorder: '1px solid rgba(82, 196, 26, 0.22)',
    statBg: lightSurface,
    statBorder: '1px solid rgba(5, 5, 5, 0.08)',
    updateNoteBg: lightSurface,
    updateNoteBorder: '1px solid rgba(250, 173, 20, 0.24)',
    mutedText: 'rgba(5, 5, 5, 0.62)',
    titleText: 'rgba(5, 5, 5, 0.92)',
    warningText: '#d48806',
  };
};
