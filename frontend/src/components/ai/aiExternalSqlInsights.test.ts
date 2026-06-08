import { describe, expect, it } from 'vitest';

import type { ExternalSQLDirectory, SavedConnection, TabData } from '../../types';
import { buildExternalSQLDirectoriesSnapshot } from './aiExternalSqlInsights';

const connections: SavedConnection[] = [
  {
    id: 'conn-1',
    name: '本地开发库',
    config: {
      type: 'mysql',
      host: '127.0.0.1',
      port: 3306,
      user: 'root',
    },
  },
];

describe('aiExternalSqlInsights', () => {
  it('filters configured external sql directories and reports matching open file tabs', () => {
    const externalSQLDirectories: ExternalSQLDirectory[] = [
      {
        id: 'dir-1',
        name: '报表脚本',
        path: 'D:/sql/reports',
        connectionId: 'conn-1',
        dbName: 'crm',
        createdAt: 2,
      },
      {
        id: 'dir-2',
        name: '运维脚本',
        path: 'D:/sql/ops',
        createdAt: 1,
      },
    ];
    const tabs: TabData[] = [
      {
        id: 'tab-1',
        title: '日报.sql',
        type: 'query',
        connectionId: 'conn-1',
        dbName: 'crm',
        filePath: 'D:/sql/reports/daily.sql',
        query: 'select 1',
      },
      {
        id: 'tab-2',
        title: '用户.sql',
        type: 'query',
        connectionId: 'conn-1',
        dbName: 'crm',
        filePath: 'D:/sql/reports/users/detail.sql',
        query: 'select 2',
      },
    ];

    const snapshot = buildExternalSQLDirectoriesSnapshot({
      externalSQLDirectories,
      connections,
      tabs,
      keyword: '报表',
    });

    expect(snapshot.totalMatched).toBe(1);
    expect(snapshot.returnedDirectories).toBe(1);
    expect(snapshot.totalOpenExternalSqlTabs).toBe(2);
    expect(snapshot.boundConnectionCount).toBe(1);
    expect(snapshot.directories[0]).toMatchObject({
      id: 'dir-1',
      connectionName: '本地开发库',
      connectionType: 'mysql',
      dbName: 'crm',
      openFileTabCount: 2,
      hasBoundConnection: true,
    });
    expect(snapshot.directories[0].openFileTitles[0].title).toBe('日报.sql');
  });
});
