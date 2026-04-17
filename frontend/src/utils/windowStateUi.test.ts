import { describe, expect, it } from 'vitest';

import { resolveTitleBarToggleIconKey, shouldToggleMaximisedWindowForScaleFix } from './windowStateUi';

describe('windowStateUi', () => {
  it('does not re-toggle a maximized window on activation when focus returns', () => {
    expect(shouldToggleMaximisedWindowForScaleFix('activation', true)).toBe(false);
  });

  it('switches the titlebar toggle icon to restore when the window is maximized', () => {
    expect(resolveTitleBarToggleIconKey('maximized')).toBe('restore');
  });
});
