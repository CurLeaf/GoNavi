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

  it('builds locate requests from trigger and routine tabs', () => {
    expect(normalizeSidebarLocateObjectRequestFromTab({
      id: 'trigger-conn-1-main-audit.users_bi',
      type: 'trigger',
      connectionId: 'conn-1',
      dbName: 'main',
      triggerName: 'audit.users_bi',
    })).toMatchObject({
      tableName: 'audit.users_bi',
      schemaName: 'audit',
      objectGroup: 'triggers',
    });

    expect(normalizeSidebarLocateObjectRequestFromTab({
      id: 'routine-def-conn-1-main-reporting.refresh_stats',
      type: 'routine-def',
      connectionId: 'conn-1',
      dbName: 'main',
      routineName: 'reporting.refresh_stats',
    })).toMatchObject({
      tableName: 'reporting.refresh_stats',
      schemaName: 'reporting',
      objectGroup: 'routines',
    });
  });

  it('builds and resolves locate requests from external SQL file query tabs', () => {
    const request = normalizeSidebarLocateObjectRequestFromTab({
      id: 'external-sql-tab:conn-1:main:/Users/me/sql/report.sql',
      type: 'query',
      connectionId: 'conn-1',
      dbName: 'main',
      filePath: '/Users/me/sql/report.sql',
    });

    expect(request).toMatchObject({
      connectionId: 'conn-1',
      dbName: 'main',
      filePath: '/Users/me/sql/report.sql',
      objectGroup: 'externalSqlFiles',
    });

    expect(resolveSidebarLocateTarget(request!, { groupBySchema: false })).toMatchObject({
      objectGroupKey: 'external-sql-root',
      expectedAncestorKeys: ['external-sql-root'],
      filePath: '/Users/me/sql/report.sql',
    });
  });

  it('keeps StarRocks materialized view tabs on the materialized views branch', () => {
    const request = normalizeSidebarLocateObjectRequestFromTab({
      id: 'view-def-conn-1-main-sales.mv_daily',
      type: 'view-def',
      connectionId: 'conn-1',
      dbName: 'main',
      viewName: 'sales.mv_daily',
      viewKind: 'materialized',
    });

    expect(request).toMatchObject({
      tableName: 'sales.mv_daily',
      schemaName: 'sales',
      objectGroup: 'materializedViews',
    });

    expect(resolveSidebarLocateTarget(request!, { groupBySchema: true })).toMatchObject({
      targetKey: 'view-def-conn-1-main-sales.mv_daily',
      objectGroupKey: 'conn-1-main-schema-sales-materializedViews',
    });
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

  it('finds trigger and routine paths from loaded tree data', () => {
    const triggerTarget = resolveSidebarLocateTarget({
      connectionId: 'conn-1',
      dbName: 'main',
      tableName: 'audit.users_bi',
      schemaName: 'audit',
      objectGroup: 'triggers',
    }, { groupBySchema: true });

    const routineTarget = resolveSidebarLocateTarget({
      connectionId: 'conn-1',
      dbName: 'main',
      tableName: 'reporting.refresh_stats',
      schemaName: 'reporting',
      objectGroup: 'routines',
    }, { groupBySchema: true });

    const tree = [
      {
        key: 'conn-1',
        children: [
          {
            key: 'conn-1-main',
            dataRef: { id: 'conn-1', dbName: 'main' },
            children: [
              {
                key: 'conn-1-main-schema-audit',
                children: [
                  {
                    key: 'conn-1-main-schema-audit-triggers',
                    children: [
                      {
                        key: 'conn-1-main-trigger-audit.users_bi-audit.users',
                        type: 'db-trigger',
                        dataRef: { id: 'conn-1', dbName: 'main', triggerName: 'audit.users_bi', schemaName: 'audit' },
                      },
                    ],
                  },
                ],
              },
              {
                key: 'conn-1-main-schema-reporting',
                children: [
                  {
                    key: 'conn-1-main-schema-reporting-routines',
                    children: [
                      {
                        key: 'conn-1-main-routine-reporting.refresh_stats',
                        type: 'routine',
                        dataRef: { id: 'conn-1', dbName: 'main', routineName: 'reporting.refresh_stats', schemaName: 'reporting' },
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

    expect(findSidebarNodePathForLocate(tree, triggerTarget)).toEqual([
      'conn-1',
      'conn-1-main',
      'conn-1-main-schema-audit',
      'conn-1-main-schema-audit-triggers',
      'conn-1-main-trigger-audit.users_bi-audit.users',
    ]);
    expect(findSidebarNodePathForLocate(tree, routineTarget)).toEqual([
      'conn-1',
      'conn-1-main',
      'conn-1-main-schema-reporting',
      'conn-1-main-schema-reporting-routines',
      'conn-1-main-routine-reporting.refresh_stats',
    ]);
  });

  it('finds schema objects when tree nodes use unqualified names or different case', () => {
    const viewTarget = resolveSidebarLocateTarget({
      tabId: 'conn-1-main-view-reporting.active_users',
      connectionId: 'conn-1',
      dbName: 'main',
      tableName: 'reporting.active_users',
      schemaName: 'reporting',
      objectGroup: 'views',
    }, { groupBySchema: true });

    const routineTarget = resolveSidebarLocateTarget({
      tabId: 'conn-1-main-routine-reporting.refresh_stats',
      connectionId: 'conn-1',
      dbName: 'main',
      tableName: 'reporting.refresh_stats',
      schemaName: 'reporting',
      objectGroup: 'routines',
    }, { groupBySchema: true });

    const triggerTarget = resolveSidebarLocateTarget({
      tabId: 'conn-1-main-trigger-audit.users_bi-audit.users',
      connectionId: 'conn-1',
      dbName: 'main',
      tableName: 'audit.users_bi',
      schemaName: 'audit',
      objectGroup: 'triggers',
    }, { groupBySchema: true });

    const tree = [
      {
        key: 'conn-1',
        children: [
          {
            key: 'conn-1-main',
            dataRef: { id: 'conn-1', dbName: 'main' },
            children: [
              {
                key: 'conn-1-main-schema-REPORTING',
                children: [
                  {
                    key: 'conn-1-main-schema-REPORTING-views',
                    children: [
                      {
                        key: 'conn-1-main-view-ACTIVE_USERS',
                        type: 'view',
                        dataRef: { id: 'conn-1', dbName: 'main', viewName: 'ACTIVE_USERS', schemaName: 'REPORTING' },
                      },
                    ],
                  },
                  {
                    key: 'conn-1-main-schema-REPORTING-routines',
                    children: [
                      {
                        key: 'conn-1-main-routine-REFRESH_STATS',
                        type: 'routine',
                        dataRef: { id: 'conn-1', dbName: 'main', routineName: 'REFRESH_STATS', schemaName: 'REPORTING' },
                      },
                    ],
                  },
                ],
              },
              {
                key: 'conn-1-main-schema-AUDIT',
                children: [
                  {
                    key: 'conn-1-main-schema-AUDIT-triggers',
                    children: [
                      {
                        key: 'conn-1-main-trigger-USERS_BI-AUDIT.USERS',
                        type: 'db-trigger',
                        dataRef: { id: 'conn-1', dbName: 'main', triggerName: 'USERS_BI', tableName: 'AUDIT.USERS', schemaName: 'AUDIT' },
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

    expect(findSidebarNodePathForLocate(tree, viewTarget)).toEqual([
      'conn-1',
      'conn-1-main',
      'conn-1-main-schema-REPORTING',
      'conn-1-main-schema-REPORTING-views',
      'conn-1-main-view-ACTIVE_USERS',
    ]);
    expect(findSidebarNodePathForLocate(tree, routineTarget)).toEqual([
      'conn-1',
      'conn-1-main',
      'conn-1-main-schema-REPORTING',
      'conn-1-main-schema-REPORTING-routines',
      'conn-1-main-routine-REFRESH_STATS',
    ]);
    expect(findSidebarNodePathForLocate(tree, triggerTarget)).toEqual([
      'conn-1',
      'conn-1-main',
      'conn-1-main-schema-AUDIT',
      'conn-1-main-schema-AUDIT-triggers',
      'conn-1-main-trigger-USERS_BI-AUDIT.USERS',
    ]);
  });

  it('finds a unique schema-qualified view when the locate request only has the view name', () => {
    const target = resolveSidebarLocateTarget({
      tabId: 'conn-1-SYSDBA-view-V_ACCOUNT',
      connectionId: 'conn-1',
      dbName: 'SYSDBA',
      tableName: 'V_ACCOUNT',
      objectGroup: 'views',
    }, { groupBySchema: true });

    const tree = [
      {
        key: 'conn-1',
        children: [
          {
            key: 'conn-1-SYSDBA',
            dataRef: { id: 'conn-1', dbName: 'SYSDBA' },
            children: [
              {
                key: 'conn-1-SYSDBA-schema-SYSDBA',
                children: [
                  {
                    key: 'conn-1-SYSDBA-schema-SYSDBA-views',
                    children: [
                      {
                        key: 'conn-1-SYSDBA-view-SYSDBA.V_ACCOUNT',
                        type: 'view',
                        dataRef: {
                          id: 'conn-1',
                          dbName: 'SYSDBA',
                          viewName: 'SYSDBA.V_ACCOUNT',
                          schemaName: 'SYSDBA',
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

    expect(findSidebarNodePathForLocate(tree, target)).toEqual([
      'conn-1',
      'conn-1-SYSDBA',
      'conn-1-SYSDBA-schema-SYSDBA',
      'conn-1-SYSDBA-schema-SYSDBA-views',
      'conn-1-SYSDBA-view-SYSDBA.V_ACCOUNT',
    ]);
  });

  it('does not guess a schema-qualified view when an unqualified locate request is ambiguous', () => {
    const target = resolveSidebarLocateTarget({
      tabId: 'conn-1-SYSDBA-view-V_ACCOUNT',
      connectionId: 'conn-1',
      dbName: 'SYSDBA',
      tableName: 'V_ACCOUNT',
      objectGroup: 'views',
    }, { groupBySchema: true });

    const tree = [
      {
        key: 'conn-1',
        children: [
          {
            key: 'conn-1-SYSDBA',
            dataRef: { id: 'conn-1', dbName: 'SYSDBA' },
            children: [
              {
                key: 'conn-1-SYSDBA-schema-SYSDBA',
                children: [
                  {
                    key: 'conn-1-SYSDBA-schema-SYSDBA-views',
                    children: [
                      {
                        key: 'conn-1-SYSDBA-view-SYSDBA.V_ACCOUNT',
                        type: 'view',
                        dataRef: { id: 'conn-1', dbName: 'SYSDBA', viewName: 'SYSDBA.V_ACCOUNT', schemaName: 'SYSDBA' },
                      },
                    ],
                  },
                ],
              },
              {
                key: 'conn-1-SYSDBA-schema-REPORT',
                children: [
                  {
                    key: 'conn-1-SYSDBA-schema-REPORT-views',
                    children: [
                      {
                        key: 'conn-1-SYSDBA-view-REPORT.V_ACCOUNT',
                        type: 'view',
                        dataRef: { id: 'conn-1', dbName: 'SYSDBA', viewName: 'REPORT.V_ACCOUNT', schemaName: 'REPORT' },
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

    expect(findSidebarNodePathForLocate(tree, target)).toBeNull();
  });

  it('finds external SQL file paths from loaded tree data', () => {
    const target = resolveSidebarLocateTarget({
      filePath: 'C:\\Users\\me\\sql\\report.sql',
      objectGroup: 'externalSqlFiles',
    }, { groupBySchema: false });

    const tree = [
      {
        key: 'external-sql-root',
        type: 'external-sql-root',
        children: [
          {
            key: 'external-sql-directory:C:/Users/me/sql',
            type: 'external-sql-directory',
            dataRef: { path: 'C:/Users/me/sql' },
            children: [
              {
                key: 'external-sql-file:C:/Users/me/sql/report.sql',
                type: 'external-sql-file',
                dataRef: { path: 'C:/Users/me/sql/report.sql' },
              },
            ],
          },
        ],
      },
    ];

    expect(findSidebarNodePathForLocate(tree, target)).toEqual([
      'external-sql-root',
      'external-sql-directory:C:/Users/me/sql',
      'external-sql-file:C:/Users/me/sql/report.sql',
    ]);
  });
});
