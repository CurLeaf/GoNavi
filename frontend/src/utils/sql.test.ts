import { describe, expect, it } from 'vitest';

import { buildOrderBySQL } from './sql';

describe('buildOrderBySQL', () => {
  it('does not add fallback ORDER BY for DuckDB without explicit sort', () => {
    expect(buildOrderBySQL('duckdb', [], ['ID'])).toBe('');
  });

  it('keeps explicit DuckDB sort', () => {
    expect(buildOrderBySQL('duckdb', { columnKey: 'ID', order: 'descend' }, ['NAME'])).toBe(' ORDER BY "ID" DESC');
  });
});
