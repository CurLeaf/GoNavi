import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DATA_GRID_DISPLAY_SETTINGS,
  resolveDataTableColumnWidth,
  resolveDataTableDefaultColumnWidth,
  resolveDataTableVerticalBorderColor,
  sanitizeDataGridDisplaySettings,
} from './dataGridDisplay';

describe('dataGridDisplay helpers', () => {
  it('sanitizes missing display settings to safe defaults', () => {
    expect(sanitizeDataGridDisplaySettings(undefined)).toEqual(DEFAULT_DATA_GRID_DISPLAY_SETTINGS);
    expect(sanitizeDataGridDisplaySettings({ dataTableDensity: 'invalid' as never })).toEqual(DEFAULT_DATA_GRID_DISPLAY_SETTINGS);
  });

  it('resolves density-based default column widths', () => {
    expect(resolveDataTableDefaultColumnWidth('comfortable')).toBe(180);
    expect(resolveDataTableDefaultColumnWidth('standard')).toBe(140);
    expect(resolveDataTableDefaultColumnWidth('compact')).toBe(100);
  });

  it('keeps manual column widths ahead of density defaults', () => {
    expect(resolveDataTableColumnWidth({ manualWidth: 320, density: 'compact' })).toBe(320);
    expect(resolveDataTableColumnWidth({ manualWidth: undefined, density: 'compact' })).toBe(100);
  });

  it('uses subtle themed vertical border colors and transparent when disabled', () => {
    expect(resolveDataTableVerticalBorderColor({ darkMode: true, visible: true })).toBe('rgba(255, 255, 255, 0.08)');
    expect(resolveDataTableVerticalBorderColor({ darkMode: false, visible: true })).toBe('rgba(15, 23, 42, 0.08)');
    expect(resolveDataTableVerticalBorderColor({ darkMode: false, visible: false })).toBe('transparent');
  });
});
