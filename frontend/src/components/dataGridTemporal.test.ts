import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';

import { resolveTemporalEditorSaveValue } from './dataGridTemporal';

describe('dataGridTemporal helpers', () => {
  it('prefers the picker selected date when form store has not caught up yet', () => {
    expect(resolveTemporalEditorSaveValue(undefined, dayjs('2026-04-12'), 'date')).toBe('2026-04-12');
  });
});
