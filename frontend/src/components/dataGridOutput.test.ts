import { describe, expect, it } from 'vitest';

import {
  buildDataGridSelectBaseSql,
  pickDataGridOutputRows,
  resolveDataGridOutputColumnNames,
} from './dataGridOutput';

const rowKeyField = '__gonavi_row_key__';

describe('dataGridOutput helpers', () => {
  it('resolves exportable columns in display order without the internal row key', () => {
    expect(resolveDataGridOutputColumnNames(['name', rowKeyField, 'id'], rowKeyField)).toEqual(['name', 'id']);
  });

  it('keeps exact column names when resolving output order', () => {
    expect(resolveDataGridOutputColumnNames([' full name ', 'id'], rowKeyField)).toEqual([' full name ', 'id']);
  });

  it('picks row values in display column order', () => {
    const rows = pickDataGridOutputRows([
      { [rowKeyField]: 'row-1', id: 1, name: 'alpha', hidden_note: 'A' },
    ], ['name', 'id']);

    expect(Object.keys(rows[0])).toEqual(['name', 'id']);
    expect(rows[0]).toEqual({ name: 'alpha', id: 1 });
  });

  it('builds table SELECT SQL with explicit display columns', () => {
    expect(buildDataGridSelectBaseSql({
      dbType: 'mysql',
      tableName: 'users',
      columnNames: ['name', 'id'],
      whereSql: "WHERE `id` = '7'",
    })).toBe("SELECT `name`, `id` FROM `users` WHERE `id` = '7'");
  });
});
