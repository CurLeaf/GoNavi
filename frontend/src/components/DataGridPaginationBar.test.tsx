import { describe, expect, it } from 'vitest';

import { resolveDataGridPaginationBoundaryTarget } from './DataGridPaginationBar';

describe('DataGridPaginationBar boundary navigation', () => {
  it('resolves the first and last page when the total page count is known', () => {
    const options = {
      current: 3,
      totalPages: 10,
      totalKnown: true,
      canNavigate: true,
    };

    expect(resolveDataGridPaginationBoundaryTarget({ boundary: 'first', ...options })).toBe(1);
    expect(resolveDataGridPaginationBoundaryTarget({ boundary: 'last', ...options })).toBe(10);
  });

  it('keeps first-page navigation but has no last-page target when the total is unknown', () => {
    const options = {
      current: 3,
      totalPages: 4,
      totalKnown: false,
      canNavigate: true,
    };

    expect(resolveDataGridPaginationBoundaryTarget({ boundary: 'first', ...options })).toBe(1);
    expect(resolveDataGridPaginationBoundaryTarget({ boundary: 'last', ...options })).toBeNull();
  });

  it('has no boundary target when already at that boundary or navigation is unavailable', () => {
    expect(resolveDataGridPaginationBoundaryTarget({
      boundary: 'first',
      current: 1,
      totalPages: 10,
      totalKnown: true,
      canNavigate: true,
    })).toBeNull();
    expect(resolveDataGridPaginationBoundaryTarget({
      boundary: 'last',
      current: 10,
      totalPages: 10,
      totalKnown: true,
      canNavigate: true,
    })).toBeNull();
    expect(resolveDataGridPaginationBoundaryTarget({
      boundary: 'first',
      current: 3,
      totalPages: 10,
      totalKnown: true,
      canNavigate: false,
    })).toBeNull();
  });
});
