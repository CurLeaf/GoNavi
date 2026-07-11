import { describe, expect, it } from 'vitest';

import {
  MAX_REDIS_DB_ALIAS_LENGTH,
  buildRedisDbNodeLabel,
  getRedisDbAlias,
  mergeRedisDbAliases,
  sanitizeRedisDbAlias,
  sanitizeRedisDbAliases,
  setRedisDbAlias,
} from './redisDbAlias';

describe('redisDbAlias helpers', () => {
  it('sanitizes a single alias by trimming, collapsing whitespace, and capping length', () => {
    expect(sanitizeRedisDbAlias('  cache  ')).toBe('cache');
    expect(sanitizeRedisDbAlias('user\n  sessions')).toBe('user sessions');
    expect(sanitizeRedisDbAlias('   ')).toBe('');
    expect(sanitizeRedisDbAlias(42)).toBe('');
    expect(sanitizeRedisDbAlias('x'.repeat(200))).toHaveLength(MAX_REDIS_DB_ALIAS_LENGTH);
  });

  it('sanitizes the full alias map, dropping malformed and empty entries', () => {
    const sanitized = sanitizeRedisDbAliases({
      'conn-a': { '0': 'cache', '1': '   ', notANumber: 'x' },
      'conn-b': { '0': 'sessions' },
      'conn-empty': { '0': '' },
      '': { '0': 'orphan' },
      bogus: 'not-an-object',
    });
    expect(sanitized).toEqual({
      'conn-a': { '0': 'cache' },
      'conn-b': { '0': 'sessions' },
    });
  });

  it('returns an empty map for non-object input', () => {
    expect(sanitizeRedisDbAliases(undefined)).toEqual({});
    expect(sanitizeRedisDbAliases(null)).toEqual({});
    expect(sanitizeRedisDbAliases(['cache'])).toEqual({});
  });

  it('looks up an alias by connection id and db index', () => {
    const aliases = { 'conn-a': { '0': 'cache' } };
    expect(getRedisDbAlias(aliases, 'conn-a', 0)).toBe('cache');
    expect(getRedisDbAlias(aliases, 'conn-a', 1)).toBe('');
    expect(getRedisDbAlias(aliases, 'conn-b', 0)).toBe('');
    expect(getRedisDbAlias(undefined, 'conn-a', 0)).toBe('');
  });

  it('keeps aliases independent across connections that share a db index', () => {
    let aliases = setRedisDbAlias({}, 'conn-a', 0, 'cache');
    aliases = setRedisDbAlias(aliases, 'conn-b', 0, 'sessions');
    expect(getRedisDbAlias(aliases, 'conn-a', 0)).toBe('cache');
    expect(getRedisDbAlias(aliases, 'conn-b', 0)).toBe('sessions');
  });

  it('clears an alias when set to an empty/whitespace value and prunes the connection', () => {
    let aliases = setRedisDbAlias({}, 'conn-a', 0, 'cache');
    aliases = setRedisDbAlias(aliases, 'conn-a', 0, '   ');
    expect(getRedisDbAlias(aliases, 'conn-a', 0)).toBe('');
    expect(aliases).toEqual({});
  });

  it('does not mutate the input map when setting an alias', () => {
    const original = { 'conn-a': { '0': 'cache' } };
    const next = setRedisDbAlias(original, 'conn-a', 1, 'queue');
    expect(original).toEqual({ 'conn-a': { '0': 'cache' } });
    expect(next).toEqual({ 'conn-a': { '0': 'cache', '1': 'queue' } });
  });

  it('builds the sidebar label with and without an alias', () => {
    expect(buildRedisDbNodeLabel(0, 'cache')).toBe('db0 cache');
    expect(buildRedisDbNodeLabel(3, '')).toBe('db3');
    expect(buildRedisDbNodeLabel(0, '   ')).toBe('db0');
  });

  it('does not append key counts to the sidebar label', () => {
    expect(buildRedisDbNodeLabel(0, '12')).toBe('db0 12');
  });

  it('merges imported aliases over local ones without dropping unrelated labels', () => {
    const current = {
      'conn-a': { '0': 'local-cache', '1': 'local-queue' },
      'conn-b': { '0': 'sessions' },
    };
    const incoming = {
      'conn-a': { '0': 'imported-cache' },
      'conn-c': { '2': 'metrics' },
    };
    expect(mergeRedisDbAliases(current, incoming)).toEqual({
      'conn-a': { '0': 'imported-cache', '1': 'local-queue' },
      'conn-b': { '0': 'sessions' },
      'conn-c': { '2': 'metrics' },
    });
  });
});
