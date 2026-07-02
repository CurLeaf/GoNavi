import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SIDEBAR_WIDTH,
  SIDEBAR_RESIZE_MAX_WIDTH,
  SIDEBAR_RESIZE_MIN_WIDTH,
  resolveSidebarResizeMaxWidth,
  sanitizeSidebarWidth,
} from './sidebarLayout';

describe('sidebar layout bounds', () => {
  it('allows wider persisted sidebar widths while keeping invalid values safe', () => {
    expect(sanitizeSidebarWidth(880)).toBe(880);
    expect(sanitizeSidebarWidth(1200)).toBe(SIDEBAR_RESIZE_MAX_WIDTH);
    expect(sanitizeSidebarWidth(120)).toBe(SIDEBAR_RESIZE_MIN_WIDTH);
    expect(sanitizeSidebarWidth('bad')).toBe(DEFAULT_SIDEBAR_WIDTH);
  });

  it('keeps enough workbench space when resolving drag width on smaller windows', () => {
    expect(resolveSidebarResizeMaxWidth(1600)).toBe(SIDEBAR_RESIZE_MAX_WIDTH);
    expect(resolveSidebarResizeMaxWidth(1180)).toBe(820);
    expect(resolveSidebarResizeMaxWidth(480)).toBe(SIDEBAR_RESIZE_MIN_WIDTH);
  });
});
