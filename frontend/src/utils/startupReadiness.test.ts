import { describe, expect, it } from 'vitest';

import { getConnectionWorkbenchState } from './startupReadiness';

describe('startup readiness helpers', () => {
  it('blocks sidebar interactions before local store hydration completes', () => {
    const translate = (key: string) => `T(${key})`;

    expect(getConnectionWorkbenchState(false, false, translate)).toEqual({
      ready: false,
      message: 'T(app.startup_readiness.loading_local_config)',
    });
  });

  it('keeps sidebar blocked until secure config bootstrap finishes', () => {
    const translate = (key: string) => `T(${key})`;

    expect(getConnectionWorkbenchState(true, false, translate)).toEqual({
      ready: false,
      message: 'T(app.startup_readiness.loading_security_config)',
    });
  });

  it('unblocks sidebar after startup configuration is fully applied', () => {
    expect(getConnectionWorkbenchState(true, true)).toEqual({
      ready: true,
      message: '',
    });
  });
});

