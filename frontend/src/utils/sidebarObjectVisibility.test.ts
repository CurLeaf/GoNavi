import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SIDEBAR_HIDDEN_OBJECT_GROUPS,
  filterSidebarTreeByHiddenObjectGroups,
  sanitizeSidebarHiddenObjectGroups,
  SIDEBAR_OBJECT_GROUP_KEYS,
} from './sidebarObjectVisibility';

describe('sidebarObjectVisibility databaseLinks', () => {
  it('includes databaseLinks in the group keys and default hidden list', () => {
    expect(SIDEBAR_OBJECT_GROUP_KEYS).toContain('databaseLinks');
    expect(DEFAULT_SIDEBAR_HIDDEN_OBJECT_GROUPS).toContain('databaseLinks');
  });

  it('keeps databaseLinks when sanitizing hidden groups', () => {
    expect(sanitizeSidebarHiddenObjectGroups(['tables', 'databaseLinks', 'unknown'])).toEqual([
      'tables',
      'databaseLinks',
    ]);
  });

  it('filters databaseLinks groups out of the object tree', () => {
    const tree = [
      {
        type: 'object-group',
        dataRef: { groupKey: 'tables' },
        children: [{ type: 'table' }],
      },
      {
        type: 'object-group',
        dataRef: { groupKey: 'databaseLinks' },
        children: [{ type: 'database-link' }],
      },
    ];

    const filtered = filterSidebarTreeByHiddenObjectGroups(tree, ['databaseLinks']);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.dataRef?.groupKey).toBe('tables');
  });
});
