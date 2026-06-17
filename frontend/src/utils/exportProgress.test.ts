import { describe, expect, it } from 'vitest';
import {
  formatExportElapsed,
  formatExportProgressRows,
  resolveExportElapsedMs,
  resolveExportProgressPercent,
  shouldUseExactExportProgress,
  shouldUseIndeterminateExportProgress,
} from './exportProgress';

describe('exportProgress', () => {
  it('uses actual percent when total row count is known', () => {
    expect(resolveExportProgressPercent('running', 25, 100, true)).toBe(25);
  });

  it('does not fabricate percentages when total row count is unknown', () => {
    expect(resolveExportProgressPercent('running', 5000, 0, false)).toBe(0);
    expect(resolveExportProgressPercent('finalizing', 5000, 0, false)).toBe(0);
    expect(shouldUseExactExportProgress('running', 0, false)).toBe(false);
    expect(shouldUseIndeterminateExportProgress('running', false)).toBe(true);
  });

  it('formats row summary for known and unknown totals', () => {
    expect(formatExportProgressRows(12345, 0, false)).toBe('已写入 12,345 行');
    expect(formatExportProgressRows(12345, 880000, true)).toBe('已写入 12,345 / 880,000 行');
  });

  it('resolves and formats elapsed export duration', () => {
    expect(resolveExportElapsedMs(1000, 91_000)).toBe(90_000);
    expect(resolveExportElapsedMs(1000, 0, 31_500)).toBe(30_500);
    expect(formatExportElapsed(30_500)).toBe('00:30');
    expect(formatExportElapsed(3_723_000)).toBe('01:02:03');
  });
});
