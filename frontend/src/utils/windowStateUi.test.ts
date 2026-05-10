import { describe, expect, it } from 'vitest';

import {
  resolveTitleBarToggleIconKey,
  resolveWindowsScaleCheckDelayMs,
  shouldApplyWindowsScaleFix,
  shouldToggleMaximisedWindowForScaleFix,
} from './windowStateUi';

describe('windowStateUi', () => {
  it('does not re-toggle a maximized window on activation when focus returns', () => {
    expect(shouldToggleMaximisedWindowForScaleFix('activation', true)).toBe(false);
  });

  it('only applies the Windows scale fix on real ratio drift', () => {
    expect(shouldApplyWindowsScaleFix('activation', true)).toBe(false);
    expect(shouldApplyWindowsScaleFix('ratio-change', true)).toBe(true);
  });

  it('debounces resize-triggered Windows scale checks until window transitions settle', () => {
    expect(resolveWindowsScaleCheckDelayMs('resize')).toBeGreaterThan(0);
    expect(resolveWindowsScaleCheckDelayMs('focus')).toBe(0);
    expect(resolveWindowsScaleCheckDelayMs('poll')).toBe(0);
  });

  it('switches the titlebar toggle icon to restore when the window is maximized', () => {
    expect(resolveTitleBarToggleIconKey('maximized')).toBe('restore');
  });
});
