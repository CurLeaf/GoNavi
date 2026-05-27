import { describe, expect, it } from 'vitest';

import { safeWindowRuntimeCall } from './wailsRuntime';

describe('safeWindowRuntimeCall', () => {
  it('accepts synchronous runtime return values', async () => {
    await expect(safeWindowRuntimeCall(() => true, false)).resolves.toBe(true);
    await expect(safeWindowRuntimeCall(() => ({ w: 1280, h: 720 }), null)).resolves.toEqual({ w: 1280, h: 720 });
  });

  it('keeps supporting Promise based runtime return values', async () => {
    await expect(safeWindowRuntimeCall(async () => false, true)).resolves.toBe(false);
  });

  it('falls back when the runtime call throws or rejects', async () => {
    await expect(safeWindowRuntimeCall(() => {
      throw new Error('sync failure');
    }, false)).resolves.toBe(false);
    await expect(safeWindowRuntimeCall(async () => Promise.reject(new Error('async failure')), true)).resolves.toBe(true);
  });
});
