import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const legacyMenuSource = readFileSync(new URL('./DataGridLegacyCellContextMenu.tsx', import.meta.url), 'utf8');
const v2MenuSource = readFileSync(new URL('./V2TableContextMenu.tsx', import.meta.url), 'utf8');

describe('DataGrid cell undo menu i18n guards', () => {
  it('localizes cell undo action labels in legacy and v2 menus', () => {
    [
      legacyMenuSource,
      v2MenuSource,
    ].forEach((source) => {
      expect(source).toContain("data_grid.context_menu.undo_cell_change");
      expect(source).not.toContain('撤销此单元格修改');
    });
  });
});
