import { describe, expect, it } from 'vitest';

import {
  resolveTitleBarToggleIconKey,
  resolveWindowsScaleCheckDelayMs,
  shouldApplyWindowsScaleFix,
  shouldResetWebViewZoomForScaleFix,
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
    // 关键：restore 场景刻意不再触发 maximised 窗口的 toggle —— Unmaximise → Maximise 在
    // 任务栏恢复的真实交互里会被用户肉眼看见为"重复最大化"动画，比偶发字体变大更糟。
    // 这是 9848b8b2 已有的取舍，禁止再次被"修复"成 true。
    expect(shouldToggleMaximisedWindowForScaleFix('restore', true)).toBe(false);
  });

  it('only calls the backend WebView2 zoom reset after a real restore drift', () => {
    expect(shouldResetWebViewZoomForScaleFix('restore', true)).toBe(true);
    expect(shouldResetWebViewZoomForScaleFix('restore', false)).toBe(false);
    expect(shouldResetWebViewZoomForScaleFix('activation', true)).toBe(false);
    expect(shouldResetWebViewZoomForScaleFix('ratio-change', true)).toBe(false);
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
