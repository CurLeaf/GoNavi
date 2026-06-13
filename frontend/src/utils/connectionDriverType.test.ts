import { describe, expect, it } from 'vitest';

import {
  isPostgresSchemaDialect,
  normalizeDriverType,
  resolveConnectionDriverType,
  resolveSavedConnectionDriverType,
} from './connectionDriverType';

describe('connectionDriverType', () => {
  it('normalizes built-in driver aliases shared by connection modal and sidebar', () => {
    expect(normalizeDriverType('postgresql')).toBe('postgres');
    expect(normalizeDriverType('pgx')).toBe('postgres');
    expect(normalizeDriverType('elastic')).toBe('elasticsearch');
    expect(normalizeDriverType('chromadb')).toBe('chroma');
    expect(normalizeDriverType('chroma-db')).toBe('chroma');
    expect(normalizeDriverType('doris')).toBe('diros');
    expect(normalizeDriverType('open-gauss')).toBe('opengauss');
    expect(normalizeDriverType('InterSystemsIRIS')).toBe('iris');
  });

  it('resolves custom connection driver types from the selected driver field', () => {
    expect(resolveConnectionDriverType('mysql', 'postgresql')).toBe('mysql');
    expect(resolveConnectionDriverType('custom', 'postgresql')).toBe('postgres');
    expect(resolveConnectionDriverType('custom', 'open_gauss')).toBe('opengauss');
    expect(resolveConnectionDriverType('custom', '')).toBe('');
  });

  it('resolves saved custom connections using the same driver aliases', () => {
    const conn = {
      config: {
        type: 'custom',
        driver: 'pg',
      },
    } as any;
    expect(resolveSavedConnectionDriverType(conn)).toBe('postgres');
  });

  it('detects postgres-compatible schema dialects', () => {
    expect(isPostgresSchemaDialect('postgres')).toBe(true);
    expect(isPostgresSchemaDialect('kingbase')).toBe(true);
    expect(isPostgresSchemaDialect('open-gauss')).toBe(true);
    expect(isPostgresSchemaDialect('mysql')).toBe(false);
  });
});
