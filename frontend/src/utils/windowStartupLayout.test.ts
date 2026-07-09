import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearStartupWindowRestorePending,
  isStartupWindowRestorePending,
  markStartupWindowRestorePending,
  resolveDefaultStartupWindowBounds,
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
});
