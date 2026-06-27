import { describe, expect, it } from 'vitest';

import {
  DUCKDB_ROWID_LOCATOR_COLUMN,
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
      reason: 'No primary key or usable unique index was found, so changes cannot be submitted safely.',
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
      reason: 'The result set is missing primary key column ID, so changes cannot be submitted safely.',
    });
  });

  it('localizes read-only reasons while preserving raw locator names', () => {
    const translate = (key: string, params?: Record<string, string | number | boolean | null | undefined>) => ({
      'data_viewer.read_only.reason.primary_key_column_missing': `結果集中缺少主鍵欄位 ${params?.columns}，無法安全提交修改。`,
      'data_viewer.read_only.reason.no_safe_locator': '未偵測到主鍵或可用唯一索引，無法安全提交修改。',
      'data_viewer.read_only.reason.oracle_rowid_missing': '未偵測到主鍵或可用唯一索引，且結果集中缺少 Oracle ROWID，無法安全提交修改。',
      'data_viewer.read_only.reason.duckdb_rowid_missing': '未偵測到主鍵、可用唯一索引或 DuckDB rowid，無法安全提交修改。',
    }[key] ?? key);

    expect(resolveEditRowLocator({
      dbType: 'mysql',
      resultColumns: ['NAME'],
      primaryKeys: ['TENANT_ID', 'ID'],
      translate,
    })).toMatchObject({
      strategy: 'none',
      readOnly: true,
      reason: '結果集中缺少主鍵欄位 TENANT_ID, ID，無法安全提交修改。',
    });

    expect(resolveEditRowLocator({
      dbType: 'oracle',
      resultColumns: ['NAME'],
      allowOracleRowID: true,
      translate,
    })).toMatchObject({
      strategy: 'none',
      readOnly: true,
      reason: '未偵測到主鍵或可用唯一索引，且結果集中缺少 Oracle ROWID，無法安全提交修改。',
    });

    expect(resolveEditRowLocator({
      dbType: 'duckdb',
      resultColumns: ['name'],
      allowDuckDBRowID: true,
      translate,
    })).toMatchObject({
      strategy: 'none',
      readOnly: true,
      reason: '未偵測到主鍵、可用唯一索引或 DuckDB rowid，無法安全提交修改。',
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

  it('uses DuckDB rowid when no primary or unique key is available', () => {
    expect(resolveEditRowLocator({
      dbType: 'duckdb',
      resultColumns: ['name', DUCKDB_ROWID_LOCATOR_COLUMN],
      allowDuckDBRowID: true,
    })).toEqual({
      strategy: 'duckdb-rowid',
      columns: ['rowid'],
      valueColumns: [DUCKDB_ROWID_LOCATOR_COLUMN],
      hiddenColumns: [DUCKDB_ROWID_LOCATOR_COLUMN],
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

    expect(resolveRowLocatorValues(locator, { EMAIL: null, NAME: 'A' }, {
      emptyLocatorValue: (column) => `Locator column ${column} is empty, so changes cannot be submitted safely.`,
    })).toEqual({
      ok: false,
      error: 'Locator column EMAIL is empty, so changes cannot be submitted safely.',
    });
  });

  it('uses injected messages when no safe locator is available', () => {
    expect(resolveRowLocatorValues(undefined, { EMAIL: 'a@example.com' }, {
      noSafeLocator: () => 'No safe row locator is available for this result set.',
    })).toEqual({
      ok: false,
      error: 'No safe row locator is available for this result set.',
    });
  });

  it('extracts DuckDB rowid locator values from the original row', () => {
    const locator = resolveEditRowLocator({
      dbType: 'duckdb',
      resultColumns: ['name', DUCKDB_ROWID_LOCATOR_COLUMN],
      allowDuckDBRowID: true,
    });

    expect(resolveRowLocatorValues(locator, { name: 'launch', [DUCKDB_ROWID_LOCATOR_COLUMN]: 17 })).toEqual({
      ok: true,
      values: { rowid: 17 },
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

  it('removes hidden DuckDB rowid columns from displayed columns', () => {
    const locator = resolveEditRowLocator({
      dbType: 'duckdb',
      resultColumns: ['name', DUCKDB_ROWID_LOCATOR_COLUMN],
      allowDuckDBRowID: true,
    });

    expect(filterHiddenLocatorColumns(['name', DUCKDB_ROWID_LOCATOR_COLUMN], locator)).toEqual(['name']);
  });
});
