import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const toolbarSource = readFileSync(new URL('./DataGridToolbarFrame.tsx', import.meta.url), 'utf8');

describe('DataGridToolbarFrame i18n guards', () => {
  it('localizes data edit commit mode controls', () => {
    [
      'data_grid.toolbar.commit_mode.tooltip',
      'data_grid.toolbar.commit_mode.manual',
      'data_grid.toolbar.commit_mode.auto',
      'data_grid.toolbar.commit_mode.auto_countdown',
    ].forEach((key) => {
      expect(toolbarSource).toContain(`translate('${key}'`);
    });

    [
      '控制表数据编辑后的提交方式',
      "label: '手动提交'",
      "label: '自动提交'",
      's 后提交',
    ].forEach((legacyText) => {
      expect(toolbarSource).not.toContain(legacyText);
    });
  });
});
