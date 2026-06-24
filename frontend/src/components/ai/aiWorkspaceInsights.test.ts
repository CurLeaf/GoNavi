import { describe, expect, it } from 'vitest';

import { t as translateCatalog } from '../../i18n/catalog';
import { buildActiveTabSnapshot } from './aiWorkspaceInsights';

describe('buildActiveTabSnapshot', () => {
  it('localizes the empty active-tab message', () => {
    const snapshot = buildActiveTabSnapshot({
      tabs: [],
      activeTabId: null,
      connections: [],
      translate: (key, params) => translateCatalog('en-US', key, params),
    });

    expect(snapshot).toEqual({
      hasActiveTab: false,
      message: 'No active tab is currently selected',
    });
  });
});
