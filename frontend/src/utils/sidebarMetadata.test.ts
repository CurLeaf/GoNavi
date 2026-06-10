import { describe, expect, it } from 'vitest';

import { isSidebarViewTableType, normalizeSidebarViewName, resolveSidebarMetadataDialect } from './sidebarMetadata';

describe('sidebarMetadata', () => {
  it('normalizes MySQL-compatible view names without schema prefixes', () => {
    expect(normalizeSidebarViewName('mysql', 'SYSDBA', 'SYSDBA', 'SYSDBA.V_ACCOUNT')).toBe('V_ACCOUNT');
  });

  it('uses MySQL metadata queries for custom MySQL-compatible domestic drivers', () => {
    expect(resolveSidebarMetadataDialect('custom', 'gdb')).toBe('mysql');
    expect(resolveSidebarMetadataDialect('custom', 'goldendb')).toBe('mysql');
    expect(resolveSidebarMetadataDialect('custom', 'greatdb')).toBe('mysql');
    expect(resolveSidebarMetadataDialect('custom', 'doris')).toBe('mysql');
  });

  it('accepts MySQL-compatible view type variants returned by domestic databases', () => {
    expect(isSidebarViewTableType(undefined)).toBe(true);
    expect(isSidebarViewTableType('VIEW')).toBe(true);
    expect(isSidebarViewTableType('SYSTEM VIEW')).toBe(true);
    expect(isSidebarViewTableType('BASE VIEW')).toBe(true);
    expect(isSidebarViewTableType('BASE TABLE')).toBe(false);
    expect(isSidebarViewTableType('MATERIALIZED VIEW')).toBe(false);
  });
});
