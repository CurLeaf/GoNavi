import { describe, expect, it } from 'vitest';

import {
  ORACLE_ROWID_LOCATOR_COLUMN,
  filterHiddenLocatorColumns,
  resolveEditRowLocator,
  resolveRowLocatorValues,
} from './rowLocator';

const uniqueIndex = (name: string, columnName: string, seqInIndex = 1) => ({
  name,
  columnName,
  seqInIndex,
  nonUnique: 0,
  indexType: 'BTREE',
});

const normalIndex = (name: string, columnName: string, seqInIndex = 1) => ({
  name,
  columnName,
  seqInIndex,
  nonUnique: 1,
  indexType: 'BTREE',
});

describe('resolveEditRowLocator', () => {
  it('prefers primary keys over unique indexes', () => {
    expect(resolveEditRowLocator({
      dbType: 'mysql',
      resultColumns: ['ID', 'EMAIL'],
      primaryKeys: ['ID'],
      indexes: [uniqueIndex('uk_email', 'EMAIL')],
    })).toEqual({
      strategy: 'primary-key',
      columns: ['ID'],
      valueColumns: ['ID'],
      readOnly: false,
    });
  });

  it('uses a unique index when there is no primary key', () => {
    expect(resolveEditRowLocator({
      dbType: 'mysql',
      resultColumns: ['EMAIL', 'NAME'],
      indexes: [uniqueIndex('uk_email', 'EMAIL')],
    })).toEqual({
      strategy: 'unique-key',
      columns: ['EMAIL'],
      valueColumns: ['EMAIL'],
      readOnly: false,
    });
  });

  it('sorts composite unique index columns by sequence', () => {
    expect(resolveEditRowLocator({
      dbType: 'postgres',
      resultColumns: ['TENANT_ID', 'CODE', 'NAME'],
      indexes: [
        uniqueIndex('uk_tenant_code', 'CODE', 2),
        uniqueIndex('uk_tenant_code', 'TENANT_ID', 1),
      ],
    })).toMatchObject({
      strategy: 'unique-key',
      columns: ['TENANT_ID', 'CODE'],
      valueColumns: ['TENANT_ID', 'CODE'],
      readOnly: false,
    });
  });

  it('ignores non-unique indexes', () => {
    expect(resolveEditRowLocator({
      dbType: 'mysql',
      resultColumns: ['NAME'],
      indexes: [normalIndex('idx_name', 'NAME')],
    })).toMatchObject({
      strategy: 'none',
      readOnly: true,
    });
  });

  it('keeps results read-only when primary key columns are missing from result columns', () => {
    expect(resolveEditRowLocator({
      dbType: 'oracle',
      resultColumns: ['NAME'],
      primaryKeys: ['ID'],
    })).toMatchObject({
      strategy: 'none',
      readOnly: true,
      reason: '结果集中缺少主键列 ID，无法安全提交修改。',
    });
  });

  it('uses Oracle ROWID when no primary or unique key is available', () => {
    expect(resolveEditRowLocator({
      dbType: 'oracle',
      resultColumns: ['NAME', ORACLE_ROWID_LOCATOR_COLUMN],
      allowOracleRowID: true,
    })).toEqual({
      strategy: 'oracle-rowid',
      columns: ['ROWID'],
      valueColumns: [ORACLE_ROWID_LOCATOR_COLUMN],
      hiddenColumns: [ORACLE_ROWID_LOCATOR_COLUMN],
      readOnly: false,
    });
  });
});

describe('resolveRowLocatorValues', () => {
  it('extracts locator values from the original row', () => {
    const locator = resolveEditRowLocator({
      dbType: 'mysql',
      resultColumns: ['EMAIL', 'NAME'],
      indexes: [uniqueIndex('uk_email', 'EMAIL')],
    });

    expect(resolveRowLocatorValues(locator, { EMAIL: 'a@example.com', NAME: 'A' })).toEqual({
      ok: true,
      values: { EMAIL: 'a@example.com' },
    });
  });

  it('rejects nullable unique locator values', () => {
    const locator = resolveEditRowLocator({
      dbType: 'mysql',
      resultColumns: ['EMAIL', 'NAME'],
      indexes: [uniqueIndex('uk_email', 'EMAIL')],
    });

    expect(resolveRowLocatorValues(locator, { EMAIL: null, NAME: 'A' })).toEqual({
      ok: false,
      error: '定位列 EMAIL 的值为空，无法安全提交修改。',
    });
  });
});

describe('filterHiddenLocatorColumns', () => {
  it('removes hidden Oracle ROWID columns from displayed columns', () => {
    const locator = resolveEditRowLocator({
      dbType: 'oracle',
      resultColumns: ['NAME', ORACLE_ROWID_LOCATOR_COLUMN],
      allowOracleRowID: true,
    });

    expect(filterHiddenLocatorColumns(['NAME', ORACLE_ROWID_LOCATOR_COLUMN], locator)).toEqual(['NAME']);
  });
});
