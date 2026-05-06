import { describe, expect, it } from 'vitest';

import {
  buildClipboardCsv,
  buildClipboardJson,
  buildClipboardMarkdown,
  pickRowsForClipboard,
} from './dataGridClipboardExport';

describe('dataGridClipboardExport', () => {
  it('copies aggregate query rows without treating aggregate columns as table fields', () => {
    const rows = pickRowsForClipboard({
      rows: [
        { __gonavi_row_key__: 0, 'COUNT(*)': 12, 'sum(price)': 99.5 },
      ],
      selectedRowKeys: [],
      columnNames: ['COUNT(*)', 'sum(price)'],
      rowKeyField: '__gonavi_row_key__',
    });

    expect(rows).toEqual([{ 'COUNT(*)': 12, 'sum(price)': 99.5 }]);
    expect(buildClipboardCsv(rows, ['COUNT(*)', 'sum(price)'])).toBe('"COUNT(*)","sum(price)"\n"12","99.5"');
    expect(buildClipboardMarkdown(rows, ['COUNT(*)', 'sum(price)'])).toBe('| COUNT(*) | sum(price) |\n| --- | --- |\n| 12 | 99.5 |');
    expect(buildClipboardJson(rows)).toBe('[\n  {\n    "COUNT(*)": 12,\n    "sum(price)": 99.5\n  }\n]');
  });

  it('copies only selected rows when row selection exists', () => {
    const rows = pickRowsForClipboard({
      rows: [
        { __gonavi_row_key__: 'row-1', total: 1 },
        { __gonavi_row_key__: 'row-2', total: 2 },
      ],
      selectedRowKeys: ['row-2'],
      columnNames: ['total'],
      rowKeyField: '__gonavi_row_key__',
    });

    expect(rows).toEqual([{ total: 2 }]);
  });
});
