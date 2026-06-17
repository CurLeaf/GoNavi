import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dataGridSource = readFileSync(new URL('./DataGrid.tsx', import.meta.url), 'utf8');

describe('DataGrid auto commit delay i18n guards', () => {
  it('localizes auto commit delay option labels', () => {
    expect(dataGridSource).toContain("translateDataGrid('data_grid.toolbar.commit_delay.seconds', { seconds: item.seconds })");

    [
      "label: '3 秒'",
      "label: '5 秒'",
      "label: '10 秒'",
      "label: '30 秒'",
    ].forEach((legacyText) => {
      expect(dataGridSource).not.toContain(legacyText);
    });
  });
});
