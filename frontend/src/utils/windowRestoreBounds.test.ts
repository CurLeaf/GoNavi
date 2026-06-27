import { describe, expect, it } from 'vitest';

import { resolveVisibleStartupWindowBounds } from './windowRestoreBounds';

describe('windowRestoreBounds', () => {
  it('keeps existing bounds when the window still overlaps the visible area', () => {
    expect(resolveVisibleStartupWindowBounds(
      { width: 1280, height: 820, x: -120, y: 40 },
      { availWidth: 1920, availHeight: 1080, availLeft: 0, availTop: 0 },
    )).toEqual({ width: 1280, height: 820, x: -120, y: 40 });
  });

  it('recenters bounds when the saved window is fully outside the visible area', () => {
    expect(resolveVisibleStartupWindowBounds(
      { width: 1280, height: 820, x: 3200, y: 1800 },
      { availWidth: 1920, availHeight: 1080, availLeft: 0, availTop: 0 },
    )).toEqual({ width: 1280, height: 820, x: 320, y: 130 });
  });

  it('recenters bounds when the saved window is fully above and left of the visible area', () => {
    expect(resolveVisibleStartupWindowBounds(
      { width: 900, height: 640, x: -1600, y: -900 },
      { availWidth: 1600, availHeight: 900, availLeft: 0, availTop: 0 },
    )).toEqual({ width: 900, height: 640, x: 350, y: 130 });
  });

  it('shrinks a restored window that is larger than the current visible screen', () => {
    expect(resolveVisibleStartupWindowBounds(
      { width: 2560, height: 1440, x: 0, y: 0 },
      { availWidth: 1440, availHeight: 860, availLeft: 0, availTop: 25 },
    )).toEqual({ width: 1440, height: 860, x: 0, y: 25 });
  });

  it('keeps oversized restored bounds inside an offset visible screen', () => {
    expect(resolveVisibleStartupWindowBounds(
      { width: 2400, height: 1200, x: 1800, y: 60 },
      { availWidth: 1728, availHeight: 1040, availLeft: 1728, availTop: 40 },
    )).toEqual({ width: 1728, height: 1040, x: 1728, y: 40 });
  });
});
