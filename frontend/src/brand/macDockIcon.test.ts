import { describe, expect, it } from 'vitest';
import { shouldSyncMacOSDockIcon } from './macDockIcon';

describe('shouldSyncMacOSDockIcon', () => {
  it('only allows the native macOS runtime', () => {
    expect(shouldSyncMacOSDockIcon({ platform: 'darwin', buildType: 'production' })).toBe(true);
    expect(shouldSyncMacOSDockIcon({ platform: 'DARWIN', buildType: 'debug' })).toBe(true);
  });

  it('skips browser and non-macOS runtimes before image composition', () => {
    expect(shouldSyncMacOSDockIcon({ platform: 'darwin', buildType: 'web' })).toBe(false);
    expect(shouldSyncMacOSDockIcon({ platform: 'windows', buildType: 'production' })).toBe(false);
    expect(shouldSyncMacOSDockIcon({ platform: 'linux', buildType: 'production' })).toBe(false);
    expect(shouldSyncMacOSDockIcon()).toBe(false);
  });
});
