import { describe, expect, it } from 'vitest';

import { formatSidebarRowCount } from './Sidebar';

describe('Sidebar v2 metadata', () => {
  it('formats table row counts for sidebar labels', () => {
    expect(formatSidebarRowCount(-1)).toBe('');
    expect(formatSidebarRowCount(0)).toBe('0');
    expect(formatSidebarRowCount(27)).toBe('27');
    expect(formatSidebarRowCount(1532)).toBe('1.5K');
    expect(formatSidebarRowCount(2_450_000)).toBe('2.5M');
  });
});
