/**
 * Per-database aliases for Redis connections.
 *
 * Redis exposes logical databases as bare numeric indices (db0..db15). When a
 * user works with several connections that each use those indices for a
 * different purpose, the numbers are indistinguishable in the sidebar. An alias
 * map lets the user label, for example, `db0` as `cache` and have the sidebar
 * render `db0 (cache)`.
 *
 * The map is purely a client-side display preference and is keyed by
 * connection id so aliases stay independent across connections. The underlying
 * Redis SELECT index is never affected.
 */

/** Aliases for a single connection, keyed by the numeric DB index. */
export type RedisConnectionDbAliasMap = Record<string, string>;

/** Alias map for every connection, keyed by connection id. */
export type RedisDbAliasMap = Record<string, RedisConnectionDbAliasMap>;

export const DEFAULT_REDIS_DB_ALIASES: RedisDbAliasMap = {};

/**
 * Mirrors `MAX_SIDEBAR_PERSISTED_FILTER_LENGTH` in store.ts: a single alias is
 * a short human label, so cap it to keep persisted state bounded.
 */
export const MAX_REDIS_DB_ALIAS_LENGTH = 64;

const isValidDbIndexKey = (value: string): boolean => /^\d+$/.test(value);

/** Trim, collapse newlines, and length-cap an alias. Empty -> empty string. */
export const sanitizeRedisDbAlias = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_REDIS_DB_ALIAS_LENGTH);
};

const sanitizeConnectionAliasMap = (value: unknown): RedisConnectionDbAliasMap => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const result: RedisConnectionDbAliasMap = {};
  Object.entries(value as Record<string, unknown>).forEach(([dbIndex, alias]) => {
    if (!isValidDbIndexKey(dbIndex)) {
      return;
    }
    const sanitized = sanitizeRedisDbAlias(alias);
    if (sanitized) {
      result[dbIndex] = sanitized;
    }
  });
  return result;
};

/**
 * Normalize an arbitrary persisted/runtime value into a well-formed alias map,
 * dropping malformed entries and empty aliases so the persisted state never
 * grows unbounded or carries blank labels.
 */
export const sanitizeRedisDbAliases = (value: unknown): RedisDbAliasMap => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_REDIS_DB_ALIASES };
  }
  const result: RedisDbAliasMap = {};
  Object.entries(value as Record<string, unknown>).forEach(([connectionId, aliases]) => {
    const trimmedId = String(connectionId).trim();
    if (!trimmedId) {
      return;
    }
    const connectionAliases = sanitizeConnectionAliasMap(aliases);
    if (Object.keys(connectionAliases).length > 0) {
      result[trimmedId] = connectionAliases;
    }
  });
  return result;
};

/** Look up the alias for a given connection + DB index, or '' if none. */
export const getRedisDbAlias = (
  aliases: RedisDbAliasMap | undefined,
  connectionId: string,
  dbIndex: number,
): string => {
  if (!aliases) {
    return '';
  }
  const connectionAliases = aliases[connectionId];
  if (!connectionAliases) {
    return '';
  }
  return sanitizeRedisDbAlias(connectionAliases[String(dbIndex)]);
};

/**
 * Return a new alias map with the alias for a connection + DB index set, or
 * cleared when the sanitized alias is empty. Pure: never mutates the input.
 */
export const setRedisDbAlias = (
  aliases: RedisDbAliasMap | undefined,
  connectionId: string,
  dbIndex: number,
  alias: string,
): RedisDbAliasMap => {
  const base = sanitizeRedisDbAliases(aliases);
  const trimmedId = String(connectionId).trim();
  if (!trimmedId) {
    return base;
  }
  const sanitized = sanitizeRedisDbAlias(alias);
  const dbKey = String(dbIndex);
  const nextConnectionAliases: RedisConnectionDbAliasMap = { ...(base[trimmedId] || {}) };

  if (sanitized) {
    nextConnectionAliases[dbKey] = sanitized;
  } else {
    delete nextConnectionAliases[dbKey];
  }

  const next: RedisDbAliasMap = { ...base };
  if (Object.keys(nextConnectionAliases).length > 0) {
    next[trimmedId] = nextConnectionAliases;
  } else {
    delete next[trimmedId];
  }
  return next;
};

/**
 * Build the sidebar label for a Redis DB node. Returns `dbN` when there is no
 * alias, and `dbN (alias)` when one is set. `suffix` carries the existing
 * key-count fragment (e.g. ` (12)`) and is always appended last so the alias
 * stays adjacent to the index.
 */
export const buildRedisDbNodeLabel = (
  dbIndex: number,
  alias: string,
  suffix = '',
): string => {
  const base = `db${dbIndex}`;
  const sanitizedAlias = sanitizeRedisDbAlias(alias);
  const labelled = sanitizedAlias ? `${base} (${sanitizedAlias})` : base;
  return `${labelled}${suffix}`;
};
