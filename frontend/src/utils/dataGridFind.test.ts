import { describe, expect, it } from 'vitest';

import {
  attachDataGridFindRenderVersion,
  collectDataGridFindMatches,
  findDataGridTextRanges,
  hasDataGridFindRenderVersionChanged,
  normalizeDataGridFindQuery,
  resolveDataGridFindNavigationIndex,
  summarizeDataGridFindMatches,
} from './dataGridFind';

describe('dataGridFind', () => {
  it('normalizes blank queries to an empty search value without changing non-blank text', () => {
    expect(normalizeDataGridFindQuery('  alpha  ')).toBe('  alpha  ');
    expect(normalizeDataGridFindQuery('   ')).toBe('');
    expect(normalizeDataGridFindQuery(null)).toBe('');
  });

  it('finds case-insensitive non-overlapping text ranges', () => {
    expect(findDataGridTextRanges('Alpha beta ALPHA', 'alpha')).toEqual([
      { start: 0, end: 5 },
      { start: 11, end: 16 },
    ]);
  });

  it('treats special characters as plain text', () => {
    expect(findDataGridTextRanges('a+b a.b a+b', 'a+b')).toEqual([
      { start: 0, end: 3 },
      { start: 8, end: 11 },
    ]);
  });

  it('preserves whitespace in non-blank plain text queries', () => {
    expect(findDataGridTextRanges(' alpha alpha ', ' alpha')).toEqual([
      { start: 0, end: 6 },
      { start: 6, end: 12 },
    ]);
    expect(findDataGridTextRanges('alpha  beta alphabeta', 'alpha ')).toEqual([
      { start: 0, end: 6 },
    ]);
  });

  it('returns no ranges for empty query or empty text', () => {
    expect(findDataGridTextRanges('alpha', '')).toEqual([]);
    expect(findDataGridTextRanges('', 'alpha')).toEqual([]);
  });

  it('summarizes matches across selected columns only', () => {
    const rows = [
      { id: 1, name: 'Alpha', note: 'alpha beta', hidden: 'alpha' },
      { id: 2, name: 'Gamma', note: 'none', hidden: 'alpha' },
    ];

    expect(
      summarizeDataGridFindMatches(rows, ['name', 'note'], 'alpha', (value) => String(value ?? '')),
    ).toEqual({ matchedCellCount: 2, occurrenceCount: 2 });
  });

  it('collects ordered cell matches with row and column coordinates', () => {
    const rows = [
      { __gonavi_row_key__: 'row-1', name: 'Alpha alpha', note: 'beta Alpha' },
      { __gonavi_row_key__: 'row-2', name: 'none', note: 'alpha' },
    ];

    expect(
      collectDataGridFindMatches(
        rows,
        ['name', 'note'],
        'alpha',
        (value) => String(value ?? ''),
        (row) => String(row.__gonavi_row_key__),
      ),
    ).toEqual([
      { rowIndex: 0, rowKey: 'row-1', columnName: 'name', columnIndex: 0, occurrenceIndex: 0, start: 0, end: 5 },
      { rowIndex: 0, rowKey: 'row-1', columnName: 'name', columnIndex: 0, occurrenceIndex: 1, start: 6, end: 11 },
      { rowIndex: 0, rowKey: 'row-1', columnName: 'note', columnIndex: 1, occurrenceIndex: 0, start: 5, end: 10 },
      { rowIndex: 1, rowKey: 'row-2', columnName: 'note', columnIndex: 1, occurrenceIndex: 0, start: 0, end: 5 },
    ]);
  });

  it('resolves previous and next navigation indexes with wrapping', () => {
    expect(resolveDataGridFindNavigationIndex(-1, 4, 'next')).toBe(0);
    expect(resolveDataGridFindNavigationIndex(0, 4, 'next')).toBe(1);
    expect(resolveDataGridFindNavigationIndex(3, 4, 'next')).toBe(0);
    expect(resolveDataGridFindNavigationIndex(-1, 4, 'previous')).toBe(3);
    expect(resolveDataGridFindNavigationIndex(0, 4, 'previous')).toBe(3);
    expect(resolveDataGridFindNavigationIndex(2, 4, 'previous')).toBe(1);
    expect(resolveDataGridFindNavigationIndex(0, 0, 'next')).toBe(-1);
  });

  it('tracks render version changes without exposing metadata as row data', () => {
    const rows = [{ id: 1, name: 'Alpha' }];

    expect(attachDataGridFindRenderVersion(rows, '')).toBe(rows);

    const alphaRows = attachDataGridFindRenderVersion(rows, 'alpha');
    const betaRows = attachDataGridFindRenderVersion(rows, 'beta');

    expect(alphaRows).not.toBe(rows);
    expect(alphaRows[0]).not.toBe(rows[0]);
    expect(Object.keys(alphaRows[0])).toEqual(['id', 'name']);
    expect(hasDataGridFindRenderVersionChanged(alphaRows[0], rows[0])).toBe(true);
    expect(hasDataGridFindRenderVersionChanged(betaRows[0], alphaRows[0])).toBe(true);
    expect(hasDataGridFindRenderVersionChanged(rows[0], alphaRows[0])).toBe(true);
  });
});
