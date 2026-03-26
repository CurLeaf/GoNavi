import { describe, expect, it } from 'vitest';

import {
  hasIndexFormChanged,
  normalizeIndexFormFromRow,
  shouldRestoreOriginalIndex,
  toggleIndexSelection,
  type IndexDisplaySnapshot,
  type IndexFormSnapshot,
} from './tableDesignerIndexUtils';

describe('tableDesignerIndexUtils', () => {
  it('normalizes index rows for edit form reuse', () => {
    const row: IndexDisplaySnapshot = {
      key: 'idx_user_name',
      name: 'idx_user_name',
      indexType: 'btree',
      nonUnique: 0,
      columnNames: ['name'],
    };

    expect(normalizeIndexFormFromRow(row, ['NORMAL', 'UNIQUE', 'PRIMARY', 'FULLTEXT', 'SPATIAL'])).toEqual({
      name: 'idx_user_name',
      columnNames: ['name'],
      kind: 'UNIQUE',
      indexType: 'BTREE',
    });
  });

  it('detects no-op index edits as unchanged', () => {
    const previousForm: IndexFormSnapshot = {
      name: 'idx_user_name',
      columnNames: ['name'],
      kind: 'UNIQUE',
      indexType: 'BTREE',
    };
    const nextForm: IndexFormSnapshot = {
      name: 'idx_user_name',
      columnNames: ['name'],
      kind: 'UNIQUE',
      indexType: 'BTREE',
    };

    expect(hasIndexFormChanged(previousForm, nextForm)).toBe(false);
  });

  it('marks edits as changed when index columns differ', () => {
    const previousForm: IndexFormSnapshot = {
      name: 'idx_user_name',
      columnNames: ['name'],
      kind: 'NORMAL',
      indexType: 'DEFAULT',
    };
    const nextForm: IndexFormSnapshot = {
      name: 'idx_user_name',
      columnNames: ['name', 'email'],
      kind: 'NORMAL',
      indexType: 'DEFAULT',
    };

    expect(hasIndexFormChanged(previousForm, nextForm)).toBe(true);
  });

  it('toggles selected index keys without duplicates', () => {
    expect(toggleIndexSelection([], 'idx_user_name', true)).toEqual(['idx_user_name']);
    expect(toggleIndexSelection(['idx_user_name'], 'idx_user_name', true)).toEqual(['idx_user_name']);
    expect(toggleIndexSelection(['idx_user_name'], 'idx_user_name')).toEqual([]);
  });

  it('keeps single-selection toggles stable across repeated clicks', () => {
    let selected = toggleIndexSelection([], 'idx_user_name');
    expect(selected).toEqual(['idx_user_name']);

    selected = toggleIndexSelection(selected, 'idx_user_name');
    expect(selected).toEqual([]);

    selected = toggleIndexSelection(selected, 'idx_user_name');
    expect(selected).toEqual(['idx_user_name']);

    selected = toggleIndexSelection(selected, 'idx_user_email');
    expect(selected).toEqual(['idx_user_name', 'idx_user_email']);

    selected = toggleIndexSelection(selected, 'idx_user_email');
    expect(selected).toEqual(['idx_user_name']);

    selected = toggleIndexSelection(selected, 'idx_user_name');
    expect(selected).toEqual([]);
  });

  it('only restores original index when create step fails after drop step', () => {
    expect(shouldRestoreOriginalIndex({ failedStatementIndex: 1 })).toBe(true);
    expect(shouldRestoreOriginalIndex({ failedStatementIndex: 0 })).toBe(false);
    expect(shouldRestoreOriginalIndex({})).toBe(false);
  });
});
