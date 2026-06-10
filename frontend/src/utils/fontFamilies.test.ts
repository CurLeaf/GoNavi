import { describe, expect, it } from 'vitest';

import {
  getLinuxCJKFontInstallHint,
  hasInstalledCJKFontFamily,
} from './fontFamilies';

describe('fontFamilies helpers', () => {
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
});
