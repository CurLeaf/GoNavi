import { describe, expect, it } from 'vitest';
import {
  createDefaultDetachedBounds,
  DETACH_TAB_DRAG_Y_THRESHOLD,
  nextDetachedZIndex,
  resolveDetachedWindowTitle,
  resolveResultDetachPreferredBounds,
  shouldDetachTabByDrag,
} from './detachedWindow';

describe('detachedWindow helpers', () => {
  it('computes next z-index above existing windows', () => {
    expect(nextDetachedZIndex([])).toBe(1201);
    expect(nextDetachedZIndex([{ zIndex: 1300 }, { zIndex: 1250 }])).toBe(1301);
  });

  it('detaches only when vertical drag exceeds threshold', () => {
    expect(shouldDetachTabByDrag(DETACH_TAB_DRAG_Y_THRESHOLD - 1)).toBe(false);
    expect(shouldDetachTabByDrag(DETACH_TAB_DRAG_Y_THRESHOLD)).toBe(true);
    expect(shouldDetachTabByDrag(-DETACH_TAB_DRAG_Y_THRESHOLD)).toBe(true);
  });

  it('builds a default floating window bounds', () => {
    const bounds = createDefaultDetachedBounds([]);
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
    expect(bounds.zIndex).toBeGreaterThan(1200);
  });

  it('resolves floating window titles with object labels', () => {
    expect(resolveDetachedWindowTitle({
      kindLabel: '表数据',
      objectLabel: 'users',
      fallbackTitle: 'users',
    })).toBe('表数据 · users');
    expect(resolveDetachedWindowTitle({
      kindLabel: 'SQL 查询',
      fallbackTitle: 'Query 1',
    })).toBe('Query 1');
  });

  it('maps pointer release position to floating window preferred bounds', () => {
    expect(resolveResultDetachPreferredBounds(200, 300)).toEqual({ x: 80, y: 276 });
    expect(resolveResultDetachPreferredBounds(10, 10)).toEqual({ x: 16, y: 16 });
  });
});
