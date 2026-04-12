import { describe, expect, it } from 'vitest';

import { shouldEnableMacWindowDiagnostics } from './macWindowDiagnostics';

describe('macWindowDiagnostics', () => {
  it('stays disabled outside macOS runtime', () => {
    expect(shouldEnableMacWindowDiagnostics(false, true)).toBe(false);
  });

  it('stays disabled for production builds on macOS', () => {
    expect(shouldEnableMacWindowDiagnostics(true, false)).toBe(false);
  });

  it('enables diagnostics only for macOS development builds', () => {
    expect(shouldEnableMacWindowDiagnostics(true, true)).toBe(true);
  });
});
