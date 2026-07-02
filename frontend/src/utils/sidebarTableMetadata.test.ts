import { describe, expect, it } from 'vitest';

import {
  resolveSidebarTableMetadataFields,
  sanitizeSidebarTableMetadataFields,
  setSidebarTableMetadataFieldSelected,
} from './sidebarTableMetadata';

describe('sidebarTableMetadata', () => {
  it('keeps the default sidebar table metadata to row counts when no value is provided', () => {
    expect(resolveSidebarTableMetadataFields(undefined, false)).toEqual(['rows']);
  });

  it('migrates the legacy sidebar table comment toggle into the metadata field list', () => {
    expect(resolveSidebarTableMetadataFields(undefined, true)).toEqual(['comment', 'rows']);
  });

  it('preserves an explicit empty metadata selection while filtering unknown fields', () => {
    expect(sanitizeSidebarTableMetadataFields([], [])).toEqual([]);
    expect(sanitizeSidebarTableMetadataFields(['updatedAt', 'unknown', 'rows'], [])).toEqual(['rows', 'updatedAt']);
  });

  it('toggles metadata fields in a canonical display order', () => {
    expect(setSidebarTableMetadataFieldSelected(['rows'], 'size', true)).toEqual(['rows', 'size']);
    expect(setSidebarTableMetadataFieldSelected(['comment', 'rows', 'size'], 'comment', false)).toEqual(['rows', 'size']);
  });
});
