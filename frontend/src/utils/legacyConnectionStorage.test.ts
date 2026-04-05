import { describe, expect, it } from 'vitest';

import { readLegacyPersistedSecrets, stripLegacyPersistedSecrets } from './legacyConnectionStorage';

describe('legacy connection storage', () => {
  it('extracts legacy saved connections and global proxy password from lite-db-storage', () => {
    const payload = JSON.stringify({
      state: {
        connections: [
          {
            id: 'conn-1',
            name: 'Primary',
            config: {
              id: 'conn-1',
              type: 'postgres',
              host: 'db.local',
              port: 5432,
              user: 'postgres',
              password: 'secret',
            },
          },
        ],
        globalProxy: {
          enabled: true,
          type: 'http',
          host: '127.0.0.1',
          port: 8080,
          user: 'ops',
          password: 'proxy-secret',
        },
      },
    });

    const result = readLegacyPersistedSecrets(payload);
    expect(result.connections).toHaveLength(1);
    expect(result.connections[0]?.config.password).toBe('secret');
    expect(result.globalProxy?.password).toBe('proxy-secret');
  });

  it('strips persisted connection secrets but keeps secretless proxy metadata', () => {
    const payload = JSON.stringify({
      state: {
        connections: [
          {
            id: 'conn-1',
            name: 'Primary',
            config: {
              id: 'conn-1',
              type: 'postgres',
              host: 'db.local',
              port: 5432,
              user: 'postgres',
              password: 'secret',
            },
          },
        ],
        globalProxy: {
          enabled: true,
          type: 'http',
          host: '127.0.0.1',
          port: 8080,
          user: 'ops',
          password: 'proxy-secret',
        },
      },
    });

    const sanitized = stripLegacyPersistedSecrets(payload);
    const parsed = JSON.parse(sanitized);

    expect(parsed.state.connections).toEqual([]);
    expect(parsed.state.globalProxy.password).toBeUndefined();
    expect(parsed.state.globalProxy.hasPassword).toBe(true);
  });
});
