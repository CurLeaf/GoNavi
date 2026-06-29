import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
}

describe('sqlFileTabDrafts', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    localStorage.removeItem('gonavi-query-tab-drafts-v1');
    clearQueryTabDraft('query-tab-1');
    clearQueryTabDraft('query-recovery-1');
    clearSQLFileTabDraft('tab-1');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it('persists crash recovery snapshots and hydrates them after module reload', async () => {
    const drafts = await import('./sqlFileTabDrafts');
    drafts.persistQueryTabDraftSnapshot({
      id: 'query-recovery-1',
      title: '临时 SQL',
      connectionId: 'conn-1',
      dbName: 'main',
    }, 'select * from large_table;');

    vi.resetModules();
    const reloaded = await import('./sqlFileTabDrafts');
    expect(reloaded.getQueryTabDraft('query-recovery-1')).toBe('select * from large_table;');
    expect(reloaded.getPersistedQueryTabDraftEntry('query-recovery-1')).toEqual(
      expect.objectContaining({
        tabId: 'query-recovery-1',
        title: '临时 SQL',
        connectionId: 'conn-1',
        dbName: 'main',
        query: 'select * from large_table;',
      }),
    );
  });
});
