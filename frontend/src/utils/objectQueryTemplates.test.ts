import { describe, expect, it } from 'vitest';

import { buildTableSelectQuery } from './objectQueryTemplates';

describe('buildTableSelectQuery', () => {
  it('quotes uppercase postgres table names in new query templates', () => {
    expect(buildTableSelectQuery('postgres', 'public.MyTable')).toBe('SELECT * FROM public."MyTable";');
  });
});
