import { describe, expect, it } from 'vitest';

import type { SavedConnection } from '../../types';
import { buildRedisTopologySnapshot } from './aiRedisTopologyInsights';

const buildRedisConnection = (
  id: string,
  name: string,
  config: Partial<SavedConnection['config']>,
  extra: Partial<SavedConnection> = {},
): SavedConnection => ({
  id,
  name,
  config: {
    type: 'redis',
    host: '127.0.0.1',
    port: 6379,
    user: '',
    ...config,
  },
  ...extra,
});

describe('buildRedisTopologySnapshot', () => {
  it('summarizes Redis Sentinel settings without exposing passwords', () => {
    const snapshot = buildRedisTopologySnapshot({
      connections: [
        buildRedisConnection('redis-sentinel', '生产 Redis Sentinel', {
          host: 'sentinel-a.local',
          port: 6379,
          hosts: ['sentinel-b.local:26379'],
          topology: 'sentinel',
          user: 'app',
          password: 'redis-secret',
          redisSentinelUser: 'sentinel-user',
          redisSentinelPassword: 'sentinel-secret',
          redisDB: 2,
          useSSL: true,
          sslMode: 'required',
        }, {
          hasRedisSentinelPassword: true,
        }),
      ],
      keyword: '生产',
    });

    expect(snapshot.totalRedisConnections).toBe(1);
    expect(snapshot.totalMatched).toBe(1);
    expect(snapshot.topologyBreakdown).toEqual({ sentinel: 1 });
    expect(snapshot.connections[0].sentinelMaster).toBe('');
    expect(snapshot.connections[0].hasRedisAuth).toBe(true);
    expect(snapshot.connections[0].hasSentinelAuth).toBe(true);
    expect(snapshot.connections[0].warnings).toContain('Sentinel master 名称为空，go-redis FailoverClient 无法发现主节点');
    expect(snapshot.connections[0].warnings).toContain('Sentinel 主地址端口是 6379，请确认这里填写的是 Sentinel 端口，常见默认值是 26379');
    expect(JSON.stringify(snapshot)).not.toContain('redis-secret');
    expect(JSON.stringify(snapshot)).not.toContain('sentinel-secret');
  });

  it('reports cluster logical-db and SSH risks', () => {
    const snapshot = buildRedisTopologySnapshot({
      connections: [
        buildRedisConnection('redis-cluster', '订单 Redis Cluster', {
          host: '10.10.1.10',
          port: 6379,
          hosts: ['10.10.1.11:6379', '10.10.1.12:6379'],
          topology: 'cluster',
          redisDB: 4,
          useSSH: true,
        }, {
          includeRedisDatabases: [0, 4],
        }),
      ],
      connectionId: 'redis-cluster',
    });

    expect(snapshot.connections[0].topology).toBe('cluster');
    expect(snapshot.connections[0].seedAddressCount).toBe(3);
    expect(snapshot.connections[0].warnings).toContain('Redis Cluster 当前后端不支持 SSH 隧道，请改用直连、代理或远程 MCP HTTP 方案');
    expect(snapshot.connections[0].warnings).toContain('Redis Cluster 物理上只支持 db0；GoNavi 会用 __gonavi_db_N__: 前缀模拟逻辑库隔离');
    expect(snapshot.connections[0].recommendations?.join('\n')).toContain('种子节点');
  });

  it('filters out non-Redis connections and warns about multi-host single mode', () => {
    const snapshot = buildRedisTopologySnapshot({
      connections: [
        buildRedisConnection('redis-single', '缓存单机', {
          host: 'redis.local',
          port: 6379,
          topology: 'single',
          hosts: ['redis-2.local:6379'],
        }),
        {
          id: 'mysql-1',
          name: '业务库',
          config: {
            type: 'mysql',
            host: 'mysql.local',
            port: 3306,
            user: 'root',
          },
        },
      ],
    });

    expect(snapshot.totalRedisConnections).toBe(1);
    expect(snapshot.connections).toHaveLength(1);
    expect(snapshot.connections[0].warnings).toContain('单机模式下存在多个节点地址，后端会按多节点集群路径处理，建议显式改为 Cluster 模式');
  });
});
