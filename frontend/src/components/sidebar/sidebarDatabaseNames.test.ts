import { describe, expect, it } from 'vitest';

import { dedupeTrimmedDatabaseNames } from './sidebarDatabaseNames';

describe('dedupeTrimmedDatabaseNames', () => {
  it('drops blanks and duplicates, then sorts by name', () => {
    expect(dedupeTrimmedDatabaseNames([
      'postgres',
      ' tanquan ',
      '',
      'qxerp-li',
      'tanquan',
      'agent-class-dev',
      'test-10',
      'test-2',
    ])).toEqual([
      'agent-class-dev',
      'postgres',
      'qxerp-li',
      'tanquan',
      'test-2',
      'test-10',
    ]);
  });
});
