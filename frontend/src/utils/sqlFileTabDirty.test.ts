import { describe, expect, it } from 'vitest';

import {
  getSQLFileTabPath,
  hasSQLFileTabUnsavedChanges,
  isSQLFileQueryTab,
  normalizeSQLFileReadContent,
} from './sqlFileTabDirty';

describe('sqlFileTabDirty', () => {
  it('only treats query tabs with filePath as SQL file tabs', () => {
    expect(isSQLFileQueryTab({ type: 'query', filePath: '/tmp/a.sql' })).toBe(true);
    expect(isSQLFileQueryTab({ type: 'query', filePath: '  ' })).toBe(false);
    expect(isSQLFileQueryTab({ type: 'table', filePath: '/tmp/a.sql' } as any)).toBe(false);
    expect(getSQLFileTabPath({ type: 'query', filePath: ' /tmp/a.sql ' })).toBe('/tmp/a.sql');
  });

  it('normalizes old and new SQL file read payloads', () => {
    expect(normalizeSQLFileReadContent('select 1;')).toBe('select 1;');
    expect(normalizeSQLFileReadContent({ content: 'select 2;', filePath: '/tmp/a.sql' })).toBe('select 2;');
    expect(normalizeSQLFileReadContent({ isLargeFile: true, filePath: '/tmp/a.sql' })).toBe('');
  });

  it('detects unsaved changes by comparing tab query with disk content', () => {
    expect(hasSQLFileTabUnsavedChanges({
      type: 'query',
      filePath: '/tmp/a.sql',
      query: 'select 1;',
    } as any, 'select 1;')).toBe(false);

    expect(hasSQLFileTabUnsavedChanges({
      type: 'query',
      filePath: '/tmp/a.sql',
      query: 'select 2;',
    } as any, 'select 1;')).toBe(true);
  });
});
