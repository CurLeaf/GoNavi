import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const secondaryActionsSource = readFileSync(new URL('./DataGridSecondaryActions.tsx', import.meta.url), 'utf8');

describe('DataGrid secondary actions i18n guards', () => {
  it('localizes the object design action label', () => {
    expect(secondaryActionsSource).toContain("translate('data_grid.secondary.object_design')");
    expect(secondaryActionsSource).not.toContain("'对象设计'");
    expect(secondaryActionsSource).not.toContain('>对象设计<');
  });
});
