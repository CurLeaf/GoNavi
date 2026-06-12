import { describe, expect, it, vi } from 'vitest';

import type { AIToolCall, SavedConnection } from '../../types';
import { executeLocalAIToolCall } from './aiLocalToolExecutor';

const buildConnection = (): SavedConnection => ({
  id: 'conn-1',
  name: '主库',
  config: {
    type: 'mysql',
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
  },
});

const buildToolCall = (name: string, args: Record<string, unknown>): AIToolCall => ({
  id: `call-${name}`,
  type: 'function',
  function: {
    name,
    arguments: JSON.stringify(args),
  },
});

describe('aiLocalToolExecutor connection inspection tools', () => {
  it('returns the current connection snapshot so the model can inspect host, db, and ssh state', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_current_connection', {}),
      connections: [{
        id: 'conn-1',
        name: '主库',
        config: {
          type: 'mysql',
          host: '10.188.101.184',
          port: 1523,
          user: 'glzc',
          database: 'crm',
          useSSH: true,
          ssh: {
            host: '192.168.66.28',
            port: 22,
            user: 'wyeye',
          },
        },
      }],
      activeContext: {
        connectionId: 'conn-1',
        dbName: 'crm',
      },
      tabs: [{
        id: 'tab-query-1',
        title: '订单分析',
        type: 'query',
        connectionId: 'conn-1',
        dbName: 'crm',
        query: 'select * from orders limit 20',
      }],
      activeTabId: 'tab-query-1',
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"hasActiveConnection":true');
    expect(result.content).toContain('"connectionName":"主库"');
    expect(result.content).toContain('"host":"10.188.101.184"');
    expect(result.content).toContain('"port":1523');
    expect(result.content).toContain('"activeDbName":"crm"');
    expect(result.content).toContain('"useSSH":true');
    expect(result.content).toContain('"sshHost":"192.168.66.28"');
    expect(result.content).toContain('"activeTabType":"query"');
  });

  it('returns the current connection capability snapshot so the model can inspect supported UI actions', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_connection_capabilities', {}),
      connections: [{
        id: 'conn-1',
        name: '分析库',
        config: {
          type: 'clickhouse',
          host: '10.10.1.30',
          port: 8123,
          user: 'default',
          database: 'analytics',
        },
      }],
      activeContext: {
        connectionId: 'conn-1',
        dbName: 'analytics',
      },
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"connectionName":"分析库"');
    expect(result.content).toContain('"resolvedType":"clickhouse"');
    expect(result.content).toContain('"supportsCreateDatabase":true');
    expect(result.content).toContain('"supportsRenameDatabase":false');
    expect(result.content).toContain('"forceReadOnlyQueryResult":true');
    expect(result.content).toContain('force_readonly_query_result');
  });

  it('returns the local saved connections snapshot so the model can find matching data sources by type or keyword', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_saved_connections', {
        type: 'mysql',
        keyword: '订单',
      }),
      connections: [
        {
          id: 'conn-1',
          name: '订单主库',
          config: {
            type: 'mysql',
            host: '10.10.1.18',
            port: 3306,
            user: 'root',
            database: 'crm',
            useSSH: true,
            ssh: {
              host: '192.168.1.8',
              port: 22,
              user: 'ops',
            },
          },
        },
        {
          id: 'conn-2',
          name: '分析仓库',
          config: {
            type: 'postgres',
            host: '10.10.1.20',
            port: 5432,
            user: 'analyst',
            database: 'dw',
          },
        },
      ],
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"totalMatched":1');
    expect(result.content).toContain('"typeBreakdown":{"mysql":1}');
    expect(result.content).toContain('"name":"订单主库"');
    expect(result.content).toContain('"useSSH":true');
    expect(result.content).not.toContain('分析仓库');
  });

  it('returns a Redis topology snapshot with Sentinel and Cluster risks', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_redis_topology', {
        keyword: '订单',
      }),
      connections: [
        {
          id: 'redis-sentinel',
          name: '订单 Redis Sentinel',
          config: {
            type: 'redis',
            host: 'sentinel-a.local',
            port: 6379,
            hosts: ['sentinel-b.local:26379'],
            topology: 'sentinel',
            user: 'app',
            password: 'redis-secret',
            redisSentinelPassword: 'sentinel-secret',
          },
          hasRedisSentinelPassword: true,
        },
        {
          id: 'redis-cluster',
          name: '缓存集群',
          config: {
            type: 'redis',
            host: '10.10.1.10',
            port: 6379,
            user: '',
            topology: 'cluster',
            hosts: ['10.10.1.11:6379'],
            redisDB: 3,
            useSSH: true,
          },
        },
      ],
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"totalRedisConnections":2');
    expect(result.content).toContain('"totalMatched":1');
    expect(result.content).toContain('"topology":"sentinel"');
    expect(result.content).toContain('Sentinel master 名称为空');
    expect(result.content).toContain('Sentinel 主地址端口是 6379');
    expect(result.content).not.toContain('redis-secret');
    expect(result.content).not.toContain('sentinel-secret');
  });
});
