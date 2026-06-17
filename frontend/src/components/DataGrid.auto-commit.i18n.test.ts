import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dataGridSource = readFileSync(new URL('./DataGrid.tsx', import.meta.url), 'utf8');

describe('DataGrid auto commit i18n guards', () => {
  it('localizes auto commit toast wrappers while preserving raw details', () => {
    expect(dataGridSource).toContain("translateDataGrid('data_grid.message.auto_commit_success')");
    expect(dataGridSource).toContain("translateDataGrid('data_grid.message.auto_commit_failed', { detail: res.message })");

    expect(dataGridSource).not.toContain("'自动提交成功'");
    expect(dataGridSource).not.toContain('`自动提交失败: ${res.message}`');
  });
});
