import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearStartupWindowRestorePending,
  isStartupWindowRestorePending,
  markStartupWindowRestorePending,
  resolveDefaultStartupWindowBounds,
  resolveWorkAreaFillWindowBounds,
  shouldPreferWindowsStartupMaximise,
  WINDOWS_STARTUP_MAXIMISE_AREA_RATIO,
} from './windowStartupLayout';

describe('windowStartupLayout', () => {
  afterEach(() => {
    clearStartupWindowRestorePending();
    vi.useRealTimers();
  });

  it('centers a large first-launch window on the visible work area', () => {
    expect(resolveDefaultStartupWindowBounds({
      availWidth: 1920,
      availHeight: 1080,
      availLeft: 0,
      availTop: 0,
    })).toEqual({
      width: 1612,
      height: 907,
      x: 154,
      y: 86,
    });
  });

  it('never exceeds a small screen and still fills most of the work area', () => {
    expect(resolveDefaultStartupWindowBounds({
      availWidth: 1280,
      availHeight: 720,
      availLeft: 0,
      availTop: 40,
    })).toEqual({
      width: 1075,
      height: 604,
      x: 102,
      y: 98,
    });
  });

  it('respects multi-monitor work-area offsets', () => {
    expect(resolveDefaultStartupWindowBounds({
      availWidth: 1600,
      availHeight: 900,
      availLeft: 1920,
      availTop: 0,
    })).toEqual({
      width: 1344,
      height: 756,
      x: 2048,
      y: 72,
    });
  });

  it('tracks the startup restore grace window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-09T10:00:00.000Z'));

    expect(isStartupWindowRestorePending()).toBe(false);
    markStartupWindowRestorePending(1000);
    expect(isStartupWindowRestorePending()).toBe(true);

    vi.setSystemTime(new Date('2026-07-09T10:00:00.999Z'));
    expect(isStartupWindowRestorePending()).toBe(true);

    vi.setSystemTime(new Date('2026-07-09T10:00:01.001Z'));
    expect(isStartupWindowRestorePending()).toBe(false);
  });

  it('fills the OS work area as a maximise-failure fallback', () => {
    expect(resolveWorkAreaFillWindowBounds({
      availWidth: 1920,
      availHeight: 1040,
      availLeft: 0,
      availTop: 0,
    })).toEqual({
      width: 1920,
      height: 1040,
      x: 0,
      y: 0,
    });

    expect(resolveWorkAreaFillWindowBounds({
      availWidth: 1600,
      availHeight: 900,
      availLeft: 1920,
      availTop: 40,
    })).toEqual({
      width: 1600,
      height: 900,
      x: 1920,
      y: 40,
    });
  });

  it('prefers maximise for missing, legacy 1024×768, and undersized default windows', () => {
    const viewport = {
      availWidth: 1920,
      availHeight: 1080,
      availLeft: 0,
      availTop: 0,
    };

    expect(shouldPreferWindowsStartupMaximise(null, viewport)).toBe(true);
    expect(shouldPreferWindowsStartupMaximise({
      width: 1024,
      height: 768,
      x: 0,
      y: 0,
    }, viewport)).toBe(true);

    // 84%×84% default area ≈ 0.706 < 0.78 → 最大化
    const defaultBounds = resolveDefaultStartupWindowBounds(viewport);
    expect((defaultBounds.width * defaultBounds.height) / (1920 * 1080))
      .toBeLessThan(WINDOWS_STARTUP_MAXIMISE_AREA_RATIO);
    expect(shouldPreferWindowsStartupMaximise(defaultBounds, viewport)).toBe(true);

    // 用户刻意拉大的普通窗应保留
    expect(shouldPreferWindowsStartupMaximise({
      width: 1760,
      height: 980,
      x: 80,
      y: 40,
    }, viewport)).toBe(false);
  });
});
