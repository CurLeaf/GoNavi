import { describe, expect, it } from 'vitest';

import { buildCopiedRowsForPaste, buildPastedRowsFromCopiedRows } from './dataGridRowClipboard';

const rowKeyField = '__gonavi_row_key__';

describe('dataGridRowClipboard', () => {
  it('copies selected rows in selection order without the internal row key', () => {
    const copiedRows = buildCopiedRowsForPaste({
      rows: [
        { [rowKeyField]: 'row-1', id: 1, name: 'alpha', hidden_note: 'A' },
        { [rowKeyField]: 'row-2', id: 2, name: 'beta', hidden_note: 'B' },
      ],
      selectedRowKeys: ['row-2', 'row-1'],
      columnNames: ['id', 'name', 'hidden_note'],
      rowKeyField,
    });

    expect(copiedRows).toEqual([
      { id: 2, name: 'beta', hidden_note: 'B' },
      { id: 1, name: 'alpha', hidden_note: 'A' },
    ]);
  });

  it('builds pasted rows as new rows with fresh internal keys', () => {
    const pastedRows = buildPastedRowsFromCopiedRows({
      rows: [
        { id: 2, name: 'beta' },
        { id: 1, name: 'alpha' },
      ],
      columnNames: ['id', 'name'],
      rowKeyField,
      createRowKey: (index) => `paste-${index}`,
    });

    expect(pastedRows).toEqual([
      { [rowKeyField]: 'paste-0', id: 2, name: 'beta' },
      { [rowKeyField]: 'paste-1', id: 1, name: 'alpha' },
    ]);
  });
});
