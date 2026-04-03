import { describe, expect, it } from 'vitest';

import { getConnectionWorkbenchState } from './startupReadiness';

describe('startup readiness helpers', () => {
  it('blocks sidebar interactions before local store hydration completes', () => {
    expect(getConnectionWorkbenchState(false, false)).toEqual({
      ready: false,
      message: '正在加载本地配置...',
    });
  });

  it('keeps sidebar blocked until secure config bootstrap finishes', () => {
    expect(getConnectionWorkbenchState(true, false)).toEqual({
      ready: false,
      message: '正在加载安全配置...',
    });
  });

  it('unblocks sidebar after startup configuration is fully applied', () => {
    expect(getConnectionWorkbenchState(true, true)).toEqual({
      ready: true,
      message: '',
    });
  });
});

