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

  it('applies the Windows scale fix when a minimized taskbar window is restored with viewport drift', () => {
    expect(shouldApplyWindowsScaleFix('restore', true)).toBe(true);
    expect(shouldApplyWindowsScaleFix('restore', false)).toBe(false);
  });

  it('toggles maximised windows on restore so taskbar-restored fonts return to the correct size', () => {
    // maximised 状态下 OS 拒绝 SetSize nudge，唯一可行的修复是切一次 maximise；
    // 重复触发由 inFlight 互斥 + 700ms 冷却 + ratio-change 合并到 activationTimer 防御。
    expect(shouldToggleMaximisedWindowForScaleFix('restore', true)).toBe(true);
    expect(shouldToggleMaximisedWindowForScaleFix('restore', false)).toBe(false);
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
