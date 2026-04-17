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
});
