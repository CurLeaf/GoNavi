import { describe, expect, it } from 'vitest';

import {
  applyMySQLUnsignedColumnTypeInput,
  getColumnDefinitionType,
  normalizeColumnDefinition,
  normalizeMySQLUnsignedColumnType,
  setMySQLUnsignedColumnType,
  supportsMySQLUnsignedColumnType,
  supportsMySQLUnsignedDialect,
} from './columnDefinition';

describe('columnDefinition unsigned MySQL types', () => {
  it('keeps UNSIGNED in stored column type text when reading existing columns', () => {
    expect(normalizeColumnDefinition({
      Name: 'amount',
      Type: 'bigint(20) unsigned',
    })).toMatchObject({ type: 'bigint(20) unsigned' });
    expect(getColumnDefinitionType({
      DATA_TYPE: 'bigint',
      COLUMN_TYPE: 'bigint(20) unsigned',
    })).toBe('bigint(20) unsigned');
  });

  it('separates the MySQL unsigned modifier from numeric column types', () => {
    expect(normalizeMySQLUnsignedColumnType('BIGINT(20) UNSIGNED ZEROFILL')).toEqual({
      type: 'BIGINT(20) ZEROFILL',
      unsigned: true,
    });
    expect(normalizeMySQLUnsignedColumnType('int zerofill').unsigned).toBe(true);
    for (const dialect of ['mysql', 'mariadb', 'tidb', 'oceanbase']) {
      expect(supportsMySQLUnsignedDialect(dialect)).toBe(true);
      expect(supportsMySQLUnsignedColumnType(dialect, 'bigint(20)')).toBe(true);
    }
    for (const dialect of ['oracle', 'starrocks', 'diros', 'sphinx']) {
      expect(supportsMySQLUnsignedDialect(dialect)).toBe(false);
      expect(supportsMySQLUnsignedColumnType(dialect, 'bigint')).toBe(false);
    }
    expect(supportsMySQLUnsignedColumnType('mysql', 'decimal(12, 2)')).toBe(false);
    expect(supportsMySQLUnsignedColumnType('mysql', 'float')).toBe(false);
    expect(supportsMySQLUnsignedColumnType('mysql', 'varchar(32)')).toBe(false);
    expect(normalizeMySQLUnsignedColumnType('decimal(12,2) unsigned')).toEqual({
      type: 'decimal(12,2) unsigned',
      unsigned: false,
    });
  });

  it('toggles MySQL unsigned without duplicating or applying it to text types', () => {
    expect(setMySQLUnsignedColumnType('int unsigned', true)).toBe('int unsigned');
    expect(setMySQLUnsignedColumnType('int unsigned', false)).toBe('int');
    expect(setMySQLUnsignedColumnType('int unsigned zerofill', true)).toBe('int unsigned zerofill');
    expect(setMySQLUnsignedColumnType('int unsigned zerofill', false)).toBe('int');
    expect(setMySQLUnsignedColumnType('int signed', true)).toBe('int unsigned');
    expect(setMySQLUnsignedColumnType('varchar(32)', true)).toBe('varchar(32)');
  });

  it('preserves unsigned when the type editor changes the base type', () => {
    expect(applyMySQLUnsignedColumnTypeInput('int unsigned', 'bigint')).toBe('bigint unsigned');
    expect(applyMySQLUnsignedColumnTypeInput('int', 'bigint unsigned')).toBe('bigint unsigned');
    expect(applyMySQLUnsignedColumnTypeInput('int unsigned', 'varchar(32)')).toBe('varchar(32)');
  });
});
