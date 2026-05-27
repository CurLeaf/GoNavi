import { describe, expect, it } from 'vitest';

import {
  calculateExternalHorizontalScrollInnerWidth,
  calculateTableBodyBottomPadding,
  calculateVirtualTableScrollX,
  resolveDataGridColumnQuickFindScrollLeft,
  resolveDataGridHorizontalWheelDelta,
} from './dataGridLayout';

describe('dataGridLayout helpers', () => {
  it('returns zero bottom padding without horizontal overflow', () => {
    expect(calculateTableBodyBottomPadding({
      hasHorizontalOverflow: false,
      floatingScrollbarHeight: 10,
      floatingScrollbarGap: 6,
    })).toBe(0);
  });

  it('adds safe area when horizontal overflow exists', () => {
    expect(calculateTableBodyBottomPadding({
      hasHorizontalOverflow: true,
      floatingScrollbarHeight: 10,
      floatingScrollbarGap: 6,
    })).toBe(28);
    expect(calculateTableBodyBottomPadding({
      hasHorizontalOverflow: true,
      floatingScrollbarHeight: 14,
      floatingScrollbarGap: 4,
    })).toBe(30);
  });

  it('keeps scroll width aligned with viewport or content width', () => {
    expect(calculateVirtualTableScrollX({ totalWidth: 646, tableViewportWidth: 1200, isMacLike: false })).toBe(1200);
    expect(calculateVirtualTableScrollX({ totalWidth: 646, tableViewportWidth: 0, isMacLike: false })).toBe(646);
    expect(calculateVirtualTableScrollX({ totalWidth: 1200, tableViewportWidth: 800, isMacLike: true })).toBe(1202);
  });

  it('keeps external horizontal scrollbar range aligned with table content range', () => {
    expect(calculateExternalHorizontalScrollInnerWidth({
      tableScrollWidth: 4563,
      trackInset: 10,
    })).toBe(4543);

    expect(calculateExternalHorizontalScrollInnerWidth({
      tableScrollWidth: 18,
      trackInset: 10,
    })).toBe(1);
  });

  it('resolves quick-find target scrollLeft by centering the target column when possible', () => {
    expect(resolveDataGridColumnQuickFindScrollLeft({
      currentScrollLeft: 0,
      columnLeft: 900,
      columnWidth: 120,
      viewportWidth: 600,
      scrollWidth: 2000,
    })).toBe(660);

    expect(resolveDataGridColumnQuickFindScrollLeft({
      currentScrollLeft: 0,
      columnLeft: 40,
      columnWidth: 120,
      viewportWidth: 600,
      scrollWidth: 2000,
    })).toBe(0);

    expect(resolveDataGridColumnQuickFindScrollLeft({
      currentScrollLeft: 200,
      columnLeft: 1750,
      columnWidth: 140,
      viewportWidth: 600,
      scrollWidth: 2000,
    })).toBe(1400);
  });

  it('falls back safely when quick-find scroll metrics are degenerate', () => {
    expect(resolveDataGridColumnQuickFindScrollLeft({
      currentScrollLeft: 120,
      columnLeft: 900,
      columnWidth: 720,
      viewportWidth: 600,
      scrollWidth: 2000,
    })).toBe(900);

    expect(resolveDataGridColumnQuickFindScrollLeft({
      currentScrollLeft: 120,
      columnLeft: Number.NaN,
      columnWidth: Number.NaN,
      viewportWidth: 0,
      scrollWidth: 2000,
    })).toBe(0);
  });

  it('only treats wheel gestures as horizontal when the horizontal intent is strong enough', () => {
    expect(resolveDataGridHorizontalWheelDelta({
      deltaX: 18,
      deltaY: 3,
      shiftKey: false,
    })).toBe(18);

    expect(resolveDataGridHorizontalWheelDelta({
      deltaX: 2,
      deltaY: 24,
      shiftKey: false,
    })).toBe(0);

    expect(resolveDataGridHorizontalWheelDelta({
      deltaX: 0.2,
      deltaY: 16,
      shiftKey: false,
    })).toBe(0);

    expect(resolveDataGridHorizontalWheelDelta({
      deltaX: 0,
      deltaY: 20,
      shiftKey: true,
    })).toBe(20);
  });
});
