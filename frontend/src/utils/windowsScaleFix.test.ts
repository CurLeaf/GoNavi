import { describe, expect, it } from 'vitest';
import {
  computeWindowsViewportScaleRatio,
  getWindowsScaleFixNudgedWidth,
  hasWindowsViewportScaleDrift,
} from './windowsScaleFix';

describe('windowsScaleFix', () => {
  it('treats matching window and viewport metrics as stable', () => {
    const ratio = computeWindowsViewportScaleRatio({
      windowWidth: 1920,
      innerWidth: 1280,
      devicePixelRatio: 1.5,
    });

    expect(ratio).toBeCloseTo(1, 5);
    expect(hasWindowsViewportScaleDrift({
      windowWidth: 1920,
      innerWidth: 1280,
      devicePixelRatio: 1.5,
    })).toBe(false);
  });

  it('detects zoom drift from viewport width mismatch', () => {
    expect(hasWindowsViewportScaleDrift({
      windowWidth: 1920,
      innerWidth: 1100,
      devicePixelRatio: 1.5,
    })).toBe(true);
  });

  it('detects zoom drift from visual viewport scale', () => {
    expect(hasWindowsViewportScaleDrift({
      windowWidth: 1600,
      innerWidth: 1600,
      devicePixelRatio: 1,
      visualViewportScale: 1.12,
    })).toBe(true);
  });

  it('returns a one-pixel nudge width for normal windows', () => {
    expect(getWindowsScaleFixNudgedWidth(960)).toBe(959);
    expect(getWindowsScaleFixNudgedWidth(420)).toBe(421);
  });
});
