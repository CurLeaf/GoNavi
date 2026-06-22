import { describe, expect, it, vi } from 'vitest';

import type { AIToolCall } from '../../types';
import { setCurrentLanguage } from '../../i18n';
import { executeLocalAIToolCall } from './aiLocalToolExecutor';
import {
  cloneShortcutOptions,
  DEFAULT_SHORTCUT_OPTIONS,
} from '../../utils/shortcuts';

const buildToolCall = (
  name: string,
  args: Record<string, unknown>,
): AIToolCall => ({
  id: `call-${name}`,
  type: 'function',
  function: {
    name,
    arguments: JSON.stringify(args),
  },
});

describe('aiLocalToolExecutor inspect_shortcuts', () => {
  it('returns the real shortcut snapshot so the model can answer Win/Mac shortcut questions from state', async () => {
    setCurrentLanguage('en-US');

    const shortcutOptions = cloneShortcutOptions(DEFAULT_SHORTCUT_OPTIONS);
    shortcutOptions.toggleQueryResultsPanel.windows = {
      combo: 'Ctrl+Shift+Y',
      enabled: true,
    };

    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_shortcuts', {
        keyword: '结果区',
      }),
      connections: [],
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
        getShortcutOptions: vi.fn().mockResolvedValue(shortcutOptions),
        getShortcutPlatform: vi.fn().mockResolvedValue('windows'),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"currentPlatform":"windows"');
    expect(result.content).toContain('"action":"toggleQueryResultsPanel"');
    expect(result.content).toContain('"combo":"Ctrl+Shift+Y"');
    expect(result.content).toContain('"defaultCombo":"Ctrl+Shift+M"');
    expect(result.content).toContain('"isCustomized":true');
  });
});
