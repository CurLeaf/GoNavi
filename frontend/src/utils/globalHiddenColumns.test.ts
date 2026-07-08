import { describe, expect, it } from 'vitest';

import {
  filterColumnNamesByGlobalHiddenColumns,
  normalizeGlobalHiddenColumns,
  parseGlobalHiddenColumnsText,
} from './globalHiddenColumns';

describe('globalHiddenColumns', () => {
  it('parses comma, semicolon, and newline separated column names with dedupe', () => {
    expect(parseGlobalHiddenColumnsText('ID, created_by\nupdated_at；id')).toEqual([
      'ID',
      'created_by',
      'updated_at',
    ]);
  });

  it('normalizes persisted arrays and text input consistently', () => {
    expect(normalizeGlobalHiddenColumns([' ID ', 'id', 'NAME'])).toEqual(['ID', 'NAME']);
    expect(normalizeGlobalHiddenColumns(' ID\nNAME')).toEqual(['ID', 'NAME']);
  });

  it('filters query result columns case-insensitively', () => {
    expect(filterColumnNamesByGlobalHiddenColumns(['ID', 'Name', 'updated_at'], ['id', 'UPDATED_AT']))
      .toEqual(['Name']);
  });
});
