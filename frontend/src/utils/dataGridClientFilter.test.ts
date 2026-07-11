import { describe, expect, it } from 'vitest';
import { filterRowsByGridConditions } from './dataGridClientFilter';

describe('filterRowsByGridConditions', () => {
  const rows = [
    { id: 1, name: 'Alice', status: 'active' },
    { id: 2, name: 'Bob', status: 'disabled' },
    { id: 3, name: 'Carol', status: null },
  ];

  it('returns original rows when no active conditions', () => {
    expect(filterRowsByGridConditions(rows, [])).toEqual(rows);
    expect(filterRowsByGridConditions(rows, [{ column: 'name', op: 'CONTAINS', value: 'x', enabled: false }])).toEqual(rows);
  });

  it('filters by contains and equality', () => {
    expect(filterRowsByGridConditions(rows, [
      { column: 'name', op: 'CONTAINS', value: 'a', enabled: true },
    ]).map((row) => row.id)).toEqual([1, 3]);

    expect(filterRowsByGridConditions(rows, [
      { column: 'id', op: '=', value: '2', enabled: true },
    ]).map((row) => row.id)).toEqual([2]);
  });

  it('supports null checks and OR logic', () => {
    expect(filterRowsByGridConditions(rows, [
      { column: 'status', op: 'IS_NULL', enabled: true },
    ]).map((row) => row.id)).toEqual([3]);

    expect(filterRowsByGridConditions(rows, [
      { column: 'status', op: '=', value: 'active', enabled: true },
      { column: 'status', op: 'IS_NULL', logic: 'OR', enabled: true },
    ]).map((row) => row.id)).toEqual([1, 3]);
  });
});
