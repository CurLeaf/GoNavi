import { describe, expect, it } from 'vitest';

import {
  filterSidebarTreeByHiddenObjectGroups,
  sanitizeSidebarHiddenObjectGroups,
} from './sidebarObjectVisibility';

describe('sidebar object visibility', () => {
  it('keeps only enabled object categories while preserving the source tree', () => {
    const tree = [{
      key: 'db',
      type: 'database',
      children: [
        { key: 'db-queries', type: 'queries-folder', children: [{ key: 'query-1', type: 'saved-query' }] },
        { key: 'db-tables', type: 'object-group', dataRef: { groupKey: 'tables' }, children: [{ key: 'orders', type: 'table' }] },
        { key: 'db-views', type: 'object-group', dataRef: { groupKey: 'views' } },
        {
          key: 'db-schema-dbo',
          type: 'object-group',
          dataRef: { groupKey: 'schema' },
          children: [
            { key: 'dbo-tables', type: 'object-group', dataRef: { groupKey: 'tables' }, children: [{ key: 'customers', type: 'table' }] },
            { key: 'dbo-events', type: 'object-group', dataRef: { groupKey: 'events' } },
          ],
        },
      ],
    }];

    const filtered = filterSidebarTreeByHiddenObjectGroups(tree, [
      'savedQueries',
      'views',
      'events',
    ]);

    expect(filtered[0].children?.map((node) => node.key)).toEqual(['db-tables', 'db-schema-dbo']);
    expect(filtered[0].children?.[1].children?.map((node) => node.key)).toEqual(['dbo-tables']);
    expect(tree[0].children?.map((node) => node.key)).toEqual([
      'db-queries',
      'db-tables',
      'db-views',
      'db-schema-dbo',
    ]);
  });

  it('drops invalid and duplicate persisted object group keys', () => {
    expect(sanitizeSidebarHiddenObjectGroups([
      'views',
      'views',
      'unknown',
      3,
      ' tables ',
    ])).toEqual(['views', 'tables']);
  });
});
