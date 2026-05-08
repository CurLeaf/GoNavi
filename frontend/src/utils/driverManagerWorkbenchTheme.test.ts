import { describe, expect, it } from 'vitest';

import { buildDriverManagerWorkbenchTheme } from './driverManagerWorkbenchTheme';

describe('driverManagerWorkbenchTheme', () => {
  it('builds a dark driver manager theme with dark surfaces', () => {
    const theme = buildDriverManagerWorkbenchTheme(true, 0.72);

    expect(theme.isDark).toBe(true);
    expect(theme.pageBg).toBe('rgb(31, 31, 31)');
    expect(theme.sectionBg).toBe('rgb(31, 31, 31)');
    expect(theme.cardBg).toBe('rgb(31, 31, 31)');
    expect(theme.statBg).toBe('rgb(31, 31, 31)');
    expect(theme.updateNoteBg).toBe('rgb(31, 31, 31)');
    expect(theme.titleText).toBe('#f5f7ff');
    expect(theme.warningText).toBe('#f6c453');
  });

  it('builds a light driver manager theme with light surfaces', () => {
    const theme = buildDriverManagerWorkbenchTheme(false, 0.92);

    expect(theme.isDark).toBe(false);
    expect(theme.pageBg).toBe('rgb(255, 255, 255)');
    expect(theme.sectionBg).toBe('rgb(255, 255, 255)');
    expect(theme.cardBg).toBe('rgb(255, 255, 255)');
    expect(theme.statBg).toBe('rgb(255, 255, 255)');
    expect(theme.updateNoteBg).toBe('rgb(255, 255, 255)');
    expect(theme.titleText).toBe('rgba(5, 5, 5, 0.92)');
    expect(theme.warningText).toBe('#d48806');
  });
});
