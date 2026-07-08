import { describe, expect, it } from 'vitest';

import {
  applySidebarTableMetadataFieldOrder,
  resolveSidebarTableMetadataFieldOrder,
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
    expect(sanitizeSidebarTableMetadataFields(['updatedAt', 'unknown', 'rows'], [])).toEqual(['updatedAt', 'rows']);
  });

  it('toggles metadata fields while preserving the configured order', () => {
    expect(setSidebarTableMetadataFieldSelected(['rows'], 'size', true)).toEqual(['rows', 'size']);
    expect(setSidebarTableMetadataFieldSelected(['comment', 'rows', 'size'], 'comment', false)).toEqual(['rows', 'size']);
    expect(setSidebarTableMetadataFieldSelected(
      ['rows'],
      'size',
      true,
      ['size', 'comment', 'rows', 'createdAt', 'updatedAt'],
    )).toEqual(['size', 'rows']);
  });

  it('resolves a complete metadata field order and applies it to selected fields', () => {
    expect(resolveSidebarTableMetadataFieldOrder(['updatedAt', 'rows', 'unknown', 'rows'])).toEqual([
      'updatedAt',
      'rows',
      'comment',
      'size',
      'createdAt',
    ]);
    expect(applySidebarTableMetadataFieldOrder(
      ['comment', 'rows', 'updatedAt'],
      ['updatedAt', 'rows', 'comment', 'size', 'createdAt'],
    )).toEqual(['updatedAt', 'rows', 'comment']);
  });
});
