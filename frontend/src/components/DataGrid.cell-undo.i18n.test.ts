import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dataGridSource = readFileSync(new URL('./DataGrid.tsx', import.meta.url), 'utf8');

describe('DataGrid cell undo i18n guards', () => {
  it('localizes cell undo toast wrappers', () => {
    [
      "translateDataGrid('data_grid.message.undo_added_row_hint')",
      "translateDataGrid('data_grid.message.undo_cell_original_missing')",
      "translateDataGrid('data_grid.message.undo_cell_success')",
    ].forEach((expected) => {
      expect(dataGridSource).toContain(expected);
    });

    [
      '新增行请使用删除选中或整表回滚撤销',
      '未找到该单元格的原始数据，无法撤销',
      '已撤销单元格修改',
    ].forEach((legacyText) => {
      expect(dataGridSource).not.toContain(legacyText);
    });
  });
});
