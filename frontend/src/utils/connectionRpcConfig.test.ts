import { describe, expect, it } from 'vitest';

import { connection } from '../../wailsjs/go/models';
import { buildRpcConnectionConfig } from './connectionRpcConfig';

describe('buildRpcConnectionConfig', () => {
  it('preserves the saved connection id while normalizing numeric fields', () => {
    const result = buildRpcConnectionConfig({
      id: 'conn-1',
      type: 'postgres',
      host: 'db.local',
      port: '5432' as unknown as number,
      user: 'postgres',
      useSSH: true,
      ssh: {
        host: 'bastion.local',
        port: '2222' as unknown as number,
        user: 'ops',
      },
      useProxy: true,
      proxy: {
        type: 'http',
        host: '127.0.0.1',
        port: '8080' as unknown as number,
      },
    } as any, {
      id: 'conn-2',
      timeout: '120' as unknown as number,
      redisDB: '6' as unknown as number,
      database: 'app',
    });

    expect(result.id).toBe('conn-1');
    expect(result.port).toBe(5432);
    expect(result.ssh?.port).toBe(2222);
    expect(result.proxy?.port).toBe(8080);
    expect(result.timeout).toBe(120);
    expect(result.redisDB).toBe(6);
    expect(result.database).toBe('app');
  });

  it('preserves ClickHouse protocol override for RPC calls', () => {
    const result = buildRpcConnectionConfig({
      id: 'conn-clickhouse',
      type: 'clickhouse',
      host: 'clickhouse.local',
      port: 8125,
      user: 'default',
      clickHouseProtocol: 'http',
    } as any);

    expect(result.clickHouseProtocol).toBe('http');
  });

  it('fills default nested config blocks needed by RPC calls', () => {
    const result = buildRpcConnectionConfig({
      id: 'conn-redis',
      type: 'redis',
      host: '127.0.0.1',
      port: 6379,
      user: '',
    } as any, {
      useSSH: true,
      useHttpTunnel: true,
      redisDB: '4' as unknown as number,
    });

    expect(result.id).toBe('conn-redis');
    expect(result.redisDB).toBe(4);
    expect(result.ssh).toEqual({
      host: '',
      port: 22,
      user: '',
      password: '',
      keyPath: '',
    });
    expect(result.httpTunnel).toEqual({
      host: '',
      port: 8080,
      user: '',
      password: '',
    });
  });

  it('returns a Wails connection model instance for RPC compatibility', () => {
    const result = buildRpcConnectionConfig({
      id: 'conn-model',
      type: 'mysql',
      host: '127.0.0.1',
      port: '3306' as unknown as number,
      user: 'root',
      useSSH: true,
      ssh: {
        host: 'jump.local',
        port: '2222' as unknown as number,
        user: 'ops',
      },
      useProxy: true,
      proxy: {
        type: 'http',
        host: '127.0.0.1',
        port: '8080' as unknown as number,
      },
      useHttpTunnel: true,
      httpTunnel: {
        host: '127.0.0.1',
        port: '9000' as unknown as number,
      },
    } as any);

    expect(result).toBeInstanceOf(connection.ConnectionConfig);
    expect(result.ssh).toBeInstanceOf(connection.SSHConfig);
    expect(result.proxy).toBeInstanceOf(connection.ProxyConfig);
    expect(result.httpTunnel).toBeInstanceOf(connection.HTTPTunnelConfig);
    expect(typeof (result as any).convertValues).toBe('function');
  });
});
