import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';

import { getTemporalPickerType, resolveTemporalEditorSaveValue } from './dataGridTemporal';

describe('dataGridTemporal helpers', () => {
  it('prefers the picker selected date when form store has not caught up yet', () => {
    expect(resolveTemporalEditorSaveValue(undefined, dayjs('2026-04-12'), 'date')).toBe('2026-04-12');
  });

  it('treats Oracle DATE as datetime because the type stores time to seconds', () => {
    const pickerType = getTemporalPickerType('DATE', 'oracle');

    expect(pickerType).toBe('datetime');
    expect(resolveTemporalEditorSaveValue(undefined, dayjs('2026-06-11 19:42:13'), pickerType))
      .toBe('2026-06-11 19:42:13');
  });

  it('keeps non Oracle DATE columns as date-only values', () => {
    const pickerType = getTemporalPickerType('date', 'mysql');

    expect(pickerType).toBe('date');
    expect(resolveTemporalEditorSaveValue(undefined, dayjs('2026-06-11 19:42:13'), pickerType))
      .toBe('2026-06-11');
  });
});
