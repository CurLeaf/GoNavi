import { afterEach, describe, expect, it } from 'vitest';

import {
  applyTableDesignerColumnPaste,
  parseTableDesignerColumns,
  resetTableDesignerColumnsClipboardMemory,
  serializeTableDesignerColumns,
  TABLE_DESIGNER_COLUMN_CLIPBOARD_PREFIX,
  type TableDesignerClipboardColumn,
} from './tableDesignerColumnClipboard';

const column = (overrides: Partial<TableDesignerClipboardColumn> = {}): TableDesignerClipboardColumn => ({
  _key: 'column-1',
  name: 'created_at',
  type: 'datetime',
  nullable: 'NO',
  key: '',
  extra: 'DEFAULT_GENERATED',
  comment: '创建时间',
  default: 'CURRENT_TIMESTAMP',
  hasDefault: true,
  charset: 'utf8mb4',
  collation: 'utf8mb4_bin',
  isAutoIncrement: false,
  ...overrides,
});

describe('tableDesignerColumnClipboard unsigned columns', () => {
  afterEach(() => {
    resetTableDesignerColumnsClipboardMemory();
  });

  it('serializes and parses unsigned column types without UI keys', () => {
    const text = serializeTableDesignerColumns([column({ type: 'bigint unsigned' })]);
    expect(text.startsWith(TABLE_DESIGNER_COLUMN_CLIPBOARD_PREFIX)).toBe(true);
    expect(text).not.toContain('column-1');
    expect(parseTableDesignerColumns(text)).toEqual([expect.objectContaining({
      name: 'created_at',
      type: 'bigint unsigned',
      default: 'CURRENT_TIMESTAMP',
      charset: 'utf8mb4',
    })]);
  });

  it('keeps unsigned on paste when the target table has no primary key', () => {
    const result = applyTableDesignerColumnPaste(
      [column({ name: 'amount', type: 'bigint unsigned' })],
      [column({ name: 'id', type: 'bigint', key: '' })],
    );

    expect(result.columns[0]).toEqual(expect.objectContaining({
      name: 'amount',
      type: 'bigint unsigned',
    }));
  });
});
