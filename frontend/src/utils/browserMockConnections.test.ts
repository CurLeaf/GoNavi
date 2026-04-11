import { describe, expect, it } from 'vitest';

import { duplicateBrowserMockConnection } from './browserMockConnections';

describe('duplicateBrowserMockConnection', () => {
  it('rewrites config.id to match the duplicated top-level id', () => {
    const duplicated = duplicateBrowserMockConnection({
      existing: {
        id: 'conn-1',
        name: 'Primary',
        config: {
          id: 'conn-1',
          type: 'postgres',
        },
        includeDatabases: ['appdb'],
      },
      items: [],
      nextId: 'conn-2',
    });

    expect(duplicated.id).toBe('conn-2');
    expect(duplicated.config.id).toBe('conn-2');
    expect(duplicated.name).toBe('Primary - 副本');
    expect(duplicated.includeDatabases).toEqual(['appdb']);
  });
});
