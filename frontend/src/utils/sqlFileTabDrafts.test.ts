import { describe, expect, it } from 'vitest';

import {
  clearQueryTabDraft,
  clearSQLFileTabDraft,
  getQueryTabDraft,
  getSQLFileTabDraft,
  hasQueryTabDraft,
  hasSQLFileTabDraft,
  setQueryTabDraft,
  setSQLFileTabDraft,
} from './sqlFileTabDrafts';

describe('sqlFileTabDrafts', () => {
  it('stores query editor drafts outside the persisted tab state', () => {
    clearQueryTabDraft('query-tab-1');

    expect(hasQueryTabDraft('query-tab-1')).toBe(false);
    expect(getQueryTabDraft('query-tab-1', 'fallback')).toBe('fallback');

    setQueryTabDraft('query-tab-1', 'select * from large_table;');

    expect(hasQueryTabDraft('query-tab-1')).toBe(true);
    expect(getQueryTabDraft('query-tab-1', 'fallback')).toBe('select * from large_table;');

    clearQueryTabDraft('query-tab-1');

    expect(hasQueryTabDraft('query-tab-1')).toBe(false);
  });

  it('stores external SQL file editor drafts outside the persisted tab state', () => {
    clearSQLFileTabDraft('tab-1');

    expect(hasSQLFileTabDraft('tab-1')).toBe(false);
    expect(getSQLFileTabDraft('tab-1', 'fallback')).toBe('fallback');

    setSQLFileTabDraft('tab-1', 'select 1;');

    expect(hasSQLFileTabDraft('tab-1')).toBe(true);
    expect(getSQLFileTabDraft('tab-1', 'fallback')).toBe('select 1;');

    clearSQLFileTabDraft('tab-1');

    expect(hasSQLFileTabDraft('tab-1')).toBe(false);
  });
});
