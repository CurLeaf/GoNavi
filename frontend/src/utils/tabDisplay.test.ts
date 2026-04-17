import { describe, expect, it } from 'vitest';

import type { SavedConnection, TabData } from '../types';
import { buildTabDisplayTitle, resolveConnectionHostSummary } from './tabDisplay';

const redisConnection: SavedConnection = {
  id: 'redis-1',
  name: '订单缓存',
  config: {
    type: 'redis',
    host: '10.10.0.12',
    port: 6379,
    user: '',
    database: '',
    hosts: ['10.10.0.13:6379', '10.10.0.14:6379'],
  },
};

describe('tabDisplay', () => {
  it('builds compact host summary for multi-host redis connections', () => {
    expect(resolveConnectionHostSummary(redisConnection.config)).toBe('10.10.0.12 +2');
  });

  it('adds connection and host identity to redis key tabs', () => {
    const redisKeysTab: TabData = {
      id: 'redis-keys-redis-1-db0',
      title: 'db0',
      type: 'redis-keys',
      connectionId: 'redis-1',
      redisDB: 0,
    };

    expect(buildTabDisplayTitle(redisKeysTab, redisConnection)).toBe('[订单缓存 | 10.10.0.12 +2] db0');
  });

  it('normalizes redis command and monitor tabs to db-scoped labels', () => {
    const commandTab: TabData = {
      id: 'cmd-1',
      title: '命令 - db1',
      type: 'redis-command',
      connectionId: 'redis-1',
      redisDB: 1,
    };
    const monitorTab: TabData = {
      id: 'monitor-1',
      title: '监控: 订单缓存',
      type: 'redis-monitor',
      connectionId: 'redis-1',
      redisDB: 1,
    };

    expect(buildTabDisplayTitle(commandTab, redisConnection)).toBe('[订单缓存 | 10.10.0.12 +2] 命令 - db1');
    expect(buildTabDisplayTitle(monitorTab, redisConnection)).toBe('[订单缓存 | 10.10.0.12 +2] 监控 - db1');
  });

  it('keeps table tabs on the existing prefix strategy', () => {
    const tableTab: TabData = {
      id: 'table-1',
      title: 'orders',
      type: 'table',
      connectionId: 'redis-1',
      dbName: 'app',
      tableName: 'orders',
    };

    expect(buildTabDisplayTitle(tableTab, redisConnection)).toBe('[订单缓存] orders');
  });
});
