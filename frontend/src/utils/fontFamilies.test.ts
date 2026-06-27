import { describe, expect, it } from 'vitest';

import {
  buildFontFamilyOptions,
  DEFAULT_MONO_FONT_FAMILY,
  DEFAULT_UI_FONT_FAMILY,
  getLinuxCJKFontInstallHint,
  hasInstalledCJKFontFamily,
} from './fontFamilies';

describe('fontFamilies helpers', () => {
  const translateFontLabel = (key: string): string => ({
    'app.theme.font_family.default_ui_option': 'Default UI font',
    'app.theme.font_family.default_mono_option': 'Default code font',
  }[key] ?? key);

  it('detects installed CJK font families on Linux', () => {
    expect(hasInstalledCJKFontFamily([
      { family: 'Ubuntu' },
      { family: 'Noto Sans CJK SC' },
    ])).toBe(true);
    expect(hasInstalledCJKFontFamily([
      { family: 'DejaVu Sans' },
      { family: 'Liberation Sans' },
    ])).toBe(false);
  });

  it('returns an Ubuntu CJK font install hint only when Linux lacks CJK fonts', () => {
    expect(getLinuxCJKFontInstallHint('linux', [
      { family: 'DejaVu Sans' },
    ])).toBe('sudo apt install fonts-noto-cjk fonts-wqy-microhei && fc-cache -fv');

    expect(getLinuxCJKFontInstallHint('linux', [
      { family: 'Source Han Sans SC' },
    ])).toBeNull();

    expect(getLinuxCJKFontInstallHint('windows', [
      { family: 'DejaVu Sans' },
    ])).toBeNull();
  });

  it('localizes default UI font labels without relying on the Chinese label for sorting', () => {
    const [defaultOption] = buildFontFamilyOptions('linux', 'ui', [
      { family: 'Zulu Sans' },
    ], translateFontLabel);

    expect(defaultOption).toMatchObject({
      value: DEFAULT_UI_FONT_FAMILY,
      label: 'Default UI font',
    });
  });

  it('localizes default mono font labels without relying on the Chinese label for sorting', () => {
    const [defaultOption] = buildFontFamilyOptions('linux', 'mono', [
      { family: 'Zulu Mono' },
    ], translateFontLabel);

    expect(defaultOption).toMatchObject({
      value: DEFAULT_MONO_FONT_FAMILY,
      label: 'Default code font',
    });
  });
});
