import { describe, expect, it } from 'vitest';

import { resolveWailsWindowVisibleViewport } from './wailsWindowViewport';

describe('wailsWindowViewport', () => {
  it('keeps browser work-area offsets for platforms that use absolute screen coordinates', () => {
    expect(resolveWailsWindowVisibleViewport(
      { availWidth: 1728, availHeight: 1040, availLeft: -1728, availTop: 40 },
      { innerWidth: 1440, innerHeight: 900 },
    )).toEqual({
      availWidth: 1728,
      availHeight: 1040,
      availLeft: -1728,
      availTop: 40,
    });
  });

  it('uses current-monitor local origin for macOS Wails window positioning', () => {
    expect(resolveWailsWindowVisibleViewport(
      { availWidth: 1728, availHeight: 1040, availLeft: -1728, availTop: 40 },
      { innerWidth: 1440, innerHeight: 900 },
      { useMonitorLocalOrigin: true },
    )).toEqual({
      availWidth: 1728,
      availHeight: 1040,
      availLeft: 0,
      availTop: 0,
    });
  });

  it('falls back to window inner size when screen size is unavailable', () => {
    expect(resolveWailsWindowVisibleViewport(
      null,
      { innerWidth: 1280, innerHeight: 720 },
      { useMonitorLocalOrigin: true },
    )).toEqual({
      availWidth: 1280,
      availHeight: 720,
      availLeft: 0,
      availTop: 0,
    });
  });
});
