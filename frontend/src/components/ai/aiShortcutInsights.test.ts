import { describe, expect, it } from 'vitest';

import { buildShortcutSnapshot } from './aiShortcutInsights';
import {
  cloneShortcutOptions,
  DEFAULT_SHORTCUT_OPTIONS,
} from '../../utils/shortcuts';

describe('aiShortcutInsights', () => {
  it('returns current-platform and cross-platform shortcut bindings with customization markers', () => {
    const shortcutOptions = cloneShortcutOptions(DEFAULT_SHORTCUT_OPTIONS);
    shortcutOptions.toggleQueryResultsPanel.windows = {
      combo: 'Ctrl+Shift+Y',
      enabled: true,
    };

    const snapshot = buildShortcutSnapshot({
      shortcutOptions,
      currentPlatform: 'windows',
    });

    const resultPanelShortcut = snapshot.actions.find(
      (item) => item?.action === 'toggleQueryResultsPanel',
    );

    expect(snapshot.currentPlatform).toBe('windows');
    expect(snapshot.totalActionCount).toBeGreaterThan(10);
    expect(resultPanelShortcut?.currentPlatformBinding.combo).toBe('Ctrl+Shift+Y');
    expect(resultPanelShortcut?.currentPlatformBinding.isCustomized).toBe(true);
    expect(resultPanelShortcut?.platforms?.mac.combo).toBe('Meta+Shift+M');
  });

  it('supports filtering by action key or shortcut-related keywords', () => {
    const byAction = buildShortcutSnapshot({
      currentPlatform: 'windows',
      action: 'toggleQueryResultsPanel',
    });
    const byKeyword = buildShortcutSnapshot({
      currentPlatform: 'windows',
      keyword: '结果区',
    });

    expect(byAction.matchedActionCount).toBe(1);
    expect(byAction.actions[0]?.action).toBe('toggleQueryResultsPanel');
    expect(byKeyword.actions.some((item) => item?.action === 'toggleQueryResultsPanel')).toBe(true);
  });
});
