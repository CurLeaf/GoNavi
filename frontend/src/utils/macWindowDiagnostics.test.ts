import { describe, expect, it } from 'vitest';

import { shouldEnableMacWindowDiagnostics } from './macWindowDiagnostics';

describe('macWindowDiagnostics', () => {
  it('stays disabled outside macOS runtime', () => {
    expect(shouldEnableMacWindowDiagnostics(false, true, 'true')).toBe(false);
  });

  it('stays disabled for production builds on macOS', () => {
    expect(shouldEnableMacWindowDiagnostics(true, false, 'true')).toBe(false);
  });

  it('stays disabled by default for macOS development builds', () => {
    expect(shouldEnableMacWindowDiagnostics(true, true)).toBe(false);
    expect(shouldEnableMacWindowDiagnostics(true, true, '')).toBe(false);
    expect(shouldEnableMacWindowDiagnostics(true, true, '0')).toBe(false);
  });

  it('enables diagnostics only when explicitly opted in on macOS development builds', () => {
    expect(shouldEnableMacWindowDiagnostics(true, true, '1')).toBe(true);
    expect(shouldEnableMacWindowDiagnostics(true, true, 'true')).toBe(true);
    expect(shouldEnableMacWindowDiagnostics(true, true, 'yes')).toBe(true);
  });
});
