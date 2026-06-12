import { describe, expect, it } from 'vitest';

import {
  buildRedisUriFromValues,
  parseRedisUriToFormValues,
  resolveRedisConfigDraft,
} from './redisConnectionUri';

describe('redisConnectionUri', () => {
  it('parses Redis Sentinel URI into form values without dropping topology fields', () => {
    const result = parseRedisUriToFormValues(
      'rediss://default:redis%40secret@sentinel-a.local:26379,sentinel-b.local/3?topology=sentinel&master=mymaster&sentinel_user=ops&sentinel_password=s%40p&skip_verify=true&sslCAPath=C%3A%2Fcerts%2Fca.pem',
    );

    expect(result).toMatchObject({
      host: 'sentinel-a.local',
      port: 26379,
      user: 'default',
      password: 'redis@secret',
      useSSL: true,
      sslMode: 'skip-verify',
      sslCAPath: 'C:/certs/ca.pem',
      redisTopology: 'sentinel',
      redisHosts: ['sentinel-b.local:26379'],
      redisSentinelMaster: 'mymaster',
      redisSentinelUser: 'ops',
      redisSentinelPassword: 's@p',
      redisDB: 3,
    });
  });

  it('builds Redis Sentinel URI with Sentinel credentials separated from Redis auth', () => {
    expect(buildRedisUriFromValues({
      host: 'sentinel-a.local',
      port: 26379,
      redisHosts: ['sentinel-b.local', 'sentinel-b.local:26379'],
      redisTopology: 'sentinel',
      user: 'default',
      password: 'redis secret',
      redisSentinelMaster: 'mymaster',
      redisSentinelUser: 'sentinel-user',
      redisSentinelPassword: 'sentinel secret',
      redisDB: 6,
      useSSL: true,
      sslMode: 'required',
      sslCAPath: 'C:/certs/ca.pem',
    })).toBe(
      'rediss://default:redis%20secret@sentinel-a.local:26379,sentinel-b.local:26379/6?topology=sentinel&master=mymaster&sentinel_user=sentinel-user&sentinel_password=sentinel+secret&sslCAPath=C%3A%2Fcerts%2Fca.pem',
    );
  });

  it('resolves Redis config draft for cluster and Sentinel save payloads', () => {
    expect(resolveRedisConfigDraft({
      redisTopology: 'cluster',
      redisHosts: ['redis-b.local', 'redis-c.local:6380'],
      redisDB: 2,
    }, 'redis-a.local', 6379, 6379)).toEqual({
      primaryPort: 6379,
      hosts: ['redis-a.local:6379', 'redis-b.local:6379', 'redis-c.local:6380'],
      topology: 'cluster',
      redisSentinelMaster: '',
      redisSentinelUser: '',
      redisSentinelPassword: '',
      redisDB: 2,
    });

    expect(resolveRedisConfigDraft({
      redisTopology: 'sentinel',
      port: 6379,
      redisHosts: ['sentinel-b.local'],
      redisSentinelMaster: 'mymaster',
      redisSentinelUser: 'ops',
      redisSentinelPassword: 'sentinel-pass',
      redisDB: 99,
    }, 'sentinel-a.local', 6379, 6379)).toEqual({
      primaryPort: 26379,
      hosts: ['sentinel-a.local:26379', 'sentinel-b.local:26379'],
      topology: 'sentinel',
      redisSentinelMaster: 'mymaster',
      redisSentinelUser: 'ops',
      redisSentinelPassword: 'sentinel-pass',
      redisDB: 99,
    });
  });
});
