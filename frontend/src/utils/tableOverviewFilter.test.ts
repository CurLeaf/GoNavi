import { describe, expect, it } from 'vitest';

import {
  TABLE_OVERVIEW_RENDER_BATCH_SIZE,
  buildTableOverviewSearchIndex,
  filterAndSortTableOverviewRows,
  resolveTableOverviewVisibleRows,
} from './tableOverviewFilter';

const buildRows = (count: number) => Array.from({ length: count }, (_, index) => ({
  name: `table_${String(index).padStart(4, '0')}`,
  comment: index === count - 1 ? 'target table comment' : 'normal table',
  rows: index,
  dataSize: count - index,
  indexSize: 0,
}));

describe('tableOverviewFilter', () => {
  it('filters against the full table set before applying the render limit', () => {
    const rows = buildRows(1200);
    const indexed = buildTableOverviewSearchIndex(rows);
    const filtered = filterAndSortTableOverviewRows(indexed, 'target', 'name', 'asc');

    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('table_1199');
  });

  it('caps initially rendered rows for large overview result sets', () => {
    const rows = buildRows(1200);
    const visible = resolveTableOverviewVisibleRows(rows, TABLE_OVERVIEW_RENDER_BATCH_SIZE);

    expect(visible.visibleRows).toHaveLength(TABLE_OVERVIEW_RENDER_BATCH_SIZE);
    expect(visible.hiddenCount).toBe(1200 - TABLE_OVERVIEW_RENDER_BATCH_SIZE);
    expect(visible.totalCount).toBe(1200);
  });

  it('sorts with precomputed normalized table names', () => {
    const indexed = buildTableOverviewSearchIndex([
      { name: 'z_table', comment: '', rows: 1, dataSize: 10, indexSize: 0 },
      { name: 'A_table', comment: '', rows: 2, dataSize: 5, indexSize: 0 },
    ]);

    expect(filterAndSortTableOverviewRows(indexed, '', 'name', 'asc').map((item) => item.name)).toEqual([
      'A_table',
      'z_table',
    ]);
  });
});
