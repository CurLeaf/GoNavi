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
    expect(sanitizeDataGridDisplaySettings({ dataTableColumnWidthMode: 'invalid' as never })).toEqual(DEFAULT_DATA_GRID_DISPLAY_SETTINGS);
  });

  it('resolves standard and compact default column widths', () => {
    expect(resolveDataTableDefaultColumnWidth('standard')).toBe(200);
    expect(resolveDataTableDefaultColumnWidth('compact')).toBe(140);
  });

  it('keeps manual column widths ahead of mode defaults', () => {
    expect(resolveDataTableColumnWidth({ manualWidth: 320, widthMode: 'compact' })).toBe(320);
    expect(resolveDataTableColumnWidth({ manualWidth: undefined, widthMode: 'compact' })).toBe(140);
  });

  it('uses subtle themed vertical border colors and transparent when disabled', () => {
    expect(resolveDataTableVerticalBorderColor({ darkMode: true, visible: true })).toBe('rgba(255, 255, 255, 0.08)');
    expect(resolveDataTableVerticalBorderColor({ darkMode: false, visible: true })).toBe('rgba(15, 23, 42, 0.08)');
    expect(resolveDataTableVerticalBorderColor({ darkMode: false, visible: false })).toBe('transparent');
  });
});
