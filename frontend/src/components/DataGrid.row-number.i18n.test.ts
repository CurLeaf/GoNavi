import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./DataGrid.tsx', import.meta.url), 'utf8');
const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'de-DE', 'ru-RU'] as const;
const rowNumberAriaKey = 'data_grid.aria.row_number';

describe('DataGrid row number i18n', () => {
  it('localizes the row number column aria label', () => {
    expect(source).toContain(`aria-label={translateDataGrid('${rowNumberAriaKey}')}`);
    expect(source).not.toContain('aria-label="行号"');
  });

  it('keeps the row number aria label available in every locale', () => {
    locales.forEach((locale) => {
      const catalog = JSON.parse(readFileSync(new URL(`../../../shared/i18n/${locale}.json`, import.meta.url), 'utf8')) as Record<string, string>;
      expect(catalog[rowNumberAriaKey], `${locale}:${rowNumberAriaKey}`).toBeTruthy();
    });
  });
});
