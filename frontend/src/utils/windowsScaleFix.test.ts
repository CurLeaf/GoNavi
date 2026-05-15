// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  applyWindowsViewportZoomNudge,
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

  it('applies and resets the CSS zoom nudge across two animation frames', () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });

    const root = document.documentElement;
    const style = root.style as CSSStyleDeclaration & { zoom?: string };
    style.zoom = '';

    applyWindowsViewportZoomNudge();
    // 第一阶段：zoom 已被设置为 1.0001
    expect(style.zoom).toBe('1.0001');
    expect(rafCallbacks).toHaveLength(1);

    // 第一帧：调度第二帧 reset
    rafCallbacks[0]?.(0);
    expect(style.zoom).toBe('1.0001');
    expect(rafCallbacks).toHaveLength(2);

    // 第二帧：恢复 zoom
    rafCallbacks[1]?.(0);
    expect(style.zoom).toBe('');

    rafSpy.mockRestore();
  });
});
