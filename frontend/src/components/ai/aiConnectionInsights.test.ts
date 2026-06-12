import { describe, expect, it } from 'vitest';

import type { SavedConnection, TabData } from '../../types';
import { buildCurrentConnectionSnapshot } from './aiConnectionInsights';

const baseConnection: SavedConnection = {
  id: 'conn-1',
  name: '生产主库',
  config: {
    type: 'mysql',
    host: '10.0.0.8',
    port: 3306,
    user: 'reader',
    database: 'crm',
    driver: 'mysql',
    useSSH: true,
    ssh: {
      host: '192.168.1.20',
      port: 22,
      user: 'jump',
    },
    useProxy: true,
    proxy: {
      type: 'socks5',
      host: '127.0.0.1',
      port: 1080,
    },
  },
};

describe('buildCurrentConnectionSnapshot', () => {
  it('returns a structured summary for the active connection and tab', () => {
    const tabs: TabData[] = [{
      id: 'tab-1',
      title: 'orders',
      type: 'table',
      connectionId: 'conn-1',
      dbName: 'crm',
      tableName: 'orders',
      readOnly: true,
    }];

    const snapshot = buildCurrentConnectionSnapshot({
      activeContext: {
        connectionId: 'conn-1',
        dbName: 'crm',
      },
      tabs,
      activeTabId: 'tab-1',
      connections: [baseConnection],
    });

    expect(snapshot).toMatchObject({
      hasActiveConnection: true,
      connectionId: 'conn-1',
      connectionName: '生产主库',
      connectionType: 'mysql',
      host: '10.0.0.8',
      port: 3306,
      activeDbName: 'crm',
      useSSH: true,
      sshHost: '192.168.1.20',
      sshUser: 'jump',
      useProxy: true,
      proxyType: 'socks5',
      activeTabId: 'tab-1',
      activeTabType: 'table',
      activeTableName: 'orders',
      readOnly: true,
    });
  });

  it('falls back to the active tab when no explicit active context exists', () => {
    const snapshot = buildCurrentConnectionSnapshot({
      activeContext: null,
      tabs: [{
        id: 'tab-query-1',
        title: '订单排查',
        type: 'query',
        connectionId: 'conn-1',
        dbName: 'crm',
        query: 'select * from orders limit 10',
      }],
      activeTabId: 'tab-query-1',
      connections: [baseConnection],
    });

    expect(snapshot).toMatchObject({
      hasActiveConnection: true,
      connectionId: 'conn-1',
      activeDbName: 'crm',
      activeTabType: 'query',
    });
  });

  it('returns an empty-state message when no active connection can be resolved', () => {
    const snapshot = buildCurrentConnectionSnapshot({
      activeContext: null,
      tabs: [],
      activeTabId: null,
      connections: [baseConnection],
    });

    expect(snapshot).toEqual({
      hasActiveConnection: false,
      message: '当前没有活动连接',
    });
  });
});
