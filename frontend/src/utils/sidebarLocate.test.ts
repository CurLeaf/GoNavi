import { describe, expect, it } from 'vitest';

import {
  findSidebarNodePathByKey,
  findSidebarNodePathForLocate,
  normalizeSidebarLocateObjectRequest,
  normalizeSidebarLocateObjectRequestFromTab,
  resolveSidebarLocateTarget,
} from './sidebarLocate';

describe('sidebarLocate', () => {
  it('normalizes a table locate request and builds the direct tree path', () => {
    const request = normalizeSidebarLocateObjectRequest({
      tabId: 'conn-1-main-users',
      connectionId: 'conn-1',
      dbName: 'main',
      tableName: 'users',
    });

    expect(request).toMatchObject({
      tabId: 'conn-1-main-users',
      connectionId: 'conn-1',
      dbName: 'main',
      tableName: 'users',
      schemaName: '',
      objectGroup: 'tables',
    });

    expect(resolveSidebarLocateTarget(request!, { groupBySchema: false })).toMatchObject({
      targetKey: 'conn-1-main-users',
      expectedAncestorKeys: ['conn-1', 'conn-1-main', 'conn-1-main-tables'],
    });
  });

  it('keeps view tabs on the views branch and includes schema ancestors', () => {
    const request = normalizeSidebarLocateObjectRequest({
      tabId: 'conn-1-main-view-public.orders_view',
      connectionId: 'conn-1',
      dbName: 'main',
      tableName: 'public.orders_view',
    });

    expect(request).toMatchObject({
      objectGroup: 'views',
      schemaName: 'public',
    });

    expect(resolveSidebarLocateTarget(request!, { groupBySchema: true })).toMatchObject({
      targetKey: 'conn-1-main-view-public.orders_view',
      schemaKey: 'conn-1-main-schema-public',
      objectGroupKey: 'conn-1-main-schema-public-views',
      expectedAncestorKeys: [
        'conn-1',
        'conn-1-main',
        'conn-1-main-schema-public',
        'conn-1-main-schema-public-views',
      ],
    });
  });

  it('builds a locate request from the active table tab', () => {
    expect(normalizeSidebarLocateObjectRequestFromTab({
      id: 'conn-1-main-public.users',
      type: 'table',
      connectionId: 'conn-1',
      dbName: 'main',
      tableName: 'public.users',
    })).toMatchObject({
      tabId: 'conn-1-main-public.users',
      connectionId: 'conn-1',
      dbName: 'main',
      tableName: 'public.users',
      schemaName: 'public',
      objectGroup: 'tables',
    });
  });

  it('builds a view locate request from view tabs and rejects non-object tabs', () => {
    expect(normalizeSidebarLocateObjectRequestFromTab({
      id: 'view-def-conn-1-main-public.orders_view',
      type: 'view-def',
      connectionId: 'conn-1',
      dbName: 'main',
      viewName: 'public.orders_view',
    })).toMatchObject({
      tableName: 'public.orders_view',
      schemaName: 'public',
      objectGroup: 'views',
    });

    expect(normalizeSidebarLocateObjectRequestFromTab({
      id: 'query-1',
      type: 'query',
      connectionId: 'conn-1',
      dbName: 'main',
    })).toBeNull();
  });

  it('finds a locate path from loaded tree data even when the target key is absent', () => {
    const target = resolveSidebarLocateTarget(
      {
        tabId: 'stale-tab-id',
        connectionId: 'conn-1',
        dbName: 'main',
        tableName: 'public.users',
        schemaName: 'public',
        objectGroup: 'tables',
      },
      { groupBySchema: true },
    );

    const tree = [
      {
        key: 'conn-1',
        children: [
          {
            key: 'conn-1-main',
            dataRef: { id: 'conn-1', dbName: 'main' },
            children: [
              {
                key: 'conn-1-main-schema-public',
                dataRef: { id: 'conn-1', dbName: 'main', schemaName: 'public' },
                children: [
                  {
                    key: 'conn-1-main-schema-public-tables',
                    dataRef: { id: 'conn-1', dbName: 'main', groupKey: 'tables', schemaName: 'public' },
                    children: [
                      {
                        key: 'conn-1-main-public.users',
                        type: 'table',
                        dataRef: {
                          id: 'conn-1',
                          dbName: 'main',
                          tableName: 'public.users',
                          schemaName: 'public',
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];

    expect(findSidebarNodePathByKey(tree, 'conn-1-main-public.users')).toEqual([
      'conn-1',
      'conn-1-main',
      'conn-1-main-schema-public',
      'conn-1-main-schema-public-tables',
      'conn-1-main-public.users',
    ]);
    expect(findSidebarNodePathForLocate(tree, target)).toEqual([
      'conn-1',
      'conn-1-main',
      'conn-1-main-schema-public',
      'conn-1-main-schema-public-tables',
      'conn-1-main-public.users',
    ]);
  });
});
