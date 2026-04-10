import { describe, expect, it } from 'vitest';

import {
  detectConnectionImportKind,
  normalizeConnectionPackagePassword,
} from './connectionExport';

describe('connectionExport', () => {
  it('detects encrypted packages by gonavi envelope kind', () => {
    expect(detectConnectionImportKind(JSON.stringify({
      schemaVersion: 1,
      kind: 'gonavi_connection_package',
      cipher: 'AES-256-GCM',
      kdf: {
        name: 'Argon2id',
        memoryKiB: 65536,
        timeCost: 3,
        parallelism: 4,
        salt: 'c2FsdA==',
      },
      nonce: 'bm9uY2Utbm9uY2U=',
      payload: 'encrypted-data',
    }))).toBe('encrypted-package');
  });

  it('detects legacy imports from historical json arrays', () => {
    expect(detectConnectionImportKind(JSON.stringify([
      {
        id: 'conn-1',
        name: 'Primary',
        config: {
          type: 'postgres',
        },
      },
    ]))).toBe('legacy-json');
  });

  it('returns invalid for malformed or unsupported content', () => {
    expect(detectConnectionImportKind('{not-json}')).toBe('invalid');
    expect(detectConnectionImportKind(JSON.stringify({
      kind: 'gonavi_connection_package',
      payload: 'encrypted-data',
    }))).toBe('invalid');
    expect(detectConnectionImportKind(JSON.stringify([
      {
        foo: 'bar',
      },
    ]))).toBe('invalid');
    expect(detectConnectionImportKind(JSON.stringify({
      kind: 'other_package',
      payload: 'encrypted-data',
    }))).toBe('invalid');
    expect(detectConnectionImportKind('null')).toBe('invalid');
  });

  it('trims package passwords before use', () => {
    expect(normalizeConnectionPackagePassword('  secret-pass  ')).toBe('secret-pass');
    expect(normalizeConnectionPackagePassword('\n\t  \t')).toBe('');
  });
});
