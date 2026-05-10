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

export const buildDriverManagerWorkbenchTheme = (darkMode: boolean, _opacity: number): DriverManagerWorkbenchTheme => {
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
