import { describe, expect, it } from 'vitest';

import type { ExternalSQLDirectory, ExternalSQLTreeEntry } from '../types';
import { buildExternalSQLRootNode, buildExternalSQLTabId } from './externalSqlTree';

describe('externalSqlTree helpers', () => {
  it('builds external SQL root node with nested directory and file entries', () => {
    const directories: ExternalSQLDirectory[] = [
      {
        id: 'dir-1',
        name: 'scripts',
        path: 'D:/sql/scripts',
        connectionId: 'conn-1',
        dbName: 'demo',
        createdAt: 1,
      },
    ];
    const trees: Record<string, ExternalSQLTreeEntry[]> = {
      'dir-1': [
        {
          name: 'ddl',
          path: 'D:/sql/scripts/ddl',
          isDir: true,
          children: [
            {
              name: 'init.sql',
              path: 'D:/sql/scripts/ddl/init.sql',
              isDir: false,
            },
          ],
        },
      ],
    };

    const node = buildExternalSQLRootNode({
      dbNodeKey: 'conn-1-demo',
      connectionId: 'conn-1',
      dbName: 'demo',
      directories,
      directoryTrees: trees,
    });

    expect(node.type).toBe('external-sql-root');
    expect(node.title).toBe('External SQL files (1)');
    expect(node.children).toHaveLength(1);
    expect(node.children?.[0]).toMatchObject({
      title: 'scripts',
      type: 'external-sql-directory',
    });
    expect(node.children?.[0].children?.[0]).toMatchObject({
      title: 'ddl',
      type: 'external-sql-folder',
    });
    expect(node.children?.[0].children?.[0].children?.[0]).toMatchObject({
      title: 'init.sql',
      type: 'external-sql-file',
    });
  });

  it('uses localized root and directory fallback labels while preserving explicit and path segment names', () => {
    const directories: ExternalSQLDirectory[] = [
      {
        id: 'dir-explicit',
        name: 'Reports',
        path: 'D:/sql/reports',
        connectionId: 'conn-1',
        dbName: 'demo',
        createdAt: 1,
      },
      {
        id: 'dir-segment',
        name: '   ',
        path: 'D:/sql/migrations',
        connectionId: 'conn-1',
        dbName: 'demo',
        createdAt: 2,
      },
      {
        id: 'dir-fallback',
        name: '',
        path: '/',
        connectionId: 'conn-1',
        dbName: 'demo',
        createdAt: 3,
      },
    ];

    const node = buildExternalSQLRootNode({
      dbNodeKey: 'conn-1-demo',
      connectionId: 'conn-1',
      dbName: 'demo',
      directories,
      directoryTrees: {},
      labels: {
        root: 'External SQL files',
        directoryFallback: 'SQL directory',
      },
    });

    expect(node.title).toBe('External SQL files (3)');
    expect(node.children?.map((child) => child.title)).toEqual([
      'migrations',
      'Reports',
      'SQL directory',
    ]);
  });

  it('builds query tab ids with connection and database isolation', () => {
    const first = buildExternalSQLTabId('conn-1', 'demo', 'D:/sql/init.sql');
    const second = buildExternalSQLTabId('conn-1', 'demo2', 'D:/sql/init.sql');

    expect(first).toContain('conn-1');
    expect(first).toContain('demo');
    expect(first).not.toBe(second);
  });
});
