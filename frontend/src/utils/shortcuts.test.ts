import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SHORTCUT_OPTIONS,
  findReservedConflict,
  findReservedConflicts,
  describeConflictContext,
  normalizeShortcutCombo,
  RESERVED_SHORTCUTS,
  comboToMonacoKeyBinding,
  getShortcutDisplayLabel,
  resolveShortcutBinding,
  resolveShortcutDisplay,
  sanitizeShortcutOptions,
  SHORTCUT_ACTION_META,
} from './shortcuts';
import type { ConflictInfo } from './shortcuts';

// ─── findReservedConflict ────────────────────────────────────────────

describe('findReservedConflict', () => {
  it('finds Ctrl+F conflict (Monaco Find)', () => {
    const result = findReservedConflict('Ctrl+F');
    expect(result).not.toBeNull();
    expect(result!.label).toBe('编辑器查找');
    expect(result!.context).toBe('monaco');
    expect(result!.monacoCommandId).toBe('actions.find');
  });

  it('finds Ctrl+S conflict (browser save)', () => {
    const result = findReservedConflict('Ctrl+S');
    expect(result).not.toBeNull();
    expect(result!.label).toBe('浏览器保存');
    expect(result!.context).toBe('global');
  });

  it('returns null for non-reserved combo', () => {
    expect(findReservedConflict('Ctrl+Shift+R')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(findReservedConflict('')).toBeNull();
  });

  it('finds Meta+F (macOS variant)', () => {
    const result = findReservedConflict('Meta+F');
    expect(result).not.toBeNull();
    expect(result!.label).toBe('编辑器查找');
    expect(result!.context).toBe('monaco');
  });

  it('matches after normalization (ctrl+f → Ctrl+F)', () => {
    const result = findReservedConflict(normalizeShortcutCombo('ctrl+f'));
    expect(result).not.toBeNull();
    expect(result!.label).toBe('编辑器查找');
  });

  it('finds F2 conflict', () => {
    const result = findReservedConflict('F2');
    expect(result).not.toBeNull();
    expect(result!.context).toBe('monaco');
  });
});

// ─── findReservedConflicts ───────────────────────────────────────────

describe('findReservedConflicts', () => {
  it('returns multiple conflicts for Ctrl+Enter', () => {
    const results = findReservedConflicts('Ctrl+Enter');
    expect(results.length).toBeGreaterThanOrEqual(1);
    const labels = results.map(r => r.label);
    expect(labels).toContain('编辑器在下方插入行');
  });

  it('returns empty array for non-reserved combo', () => {
    expect(findReservedConflicts('Ctrl+Shift+Q')).toEqual([]);
  });

  it('preserves monacoCommandId in results', () => {
    const results = findReservedConflicts('Ctrl+F');
    expect(results[0].monacoCommandId).toBe('actions.find');
  });
});

// ─── describeConflictContext ─────────────────────────────────────────

describe('describeConflictContext', () => {
  it('describes global context', () => {
    expect(describeConflictContext('global')).toBe('浏览器');
  });

  it('describes monaco context', () => {
    expect(describeConflictContext('monaco')).toBe('编辑器');
  });

  it('describes datagrid context', () => {
    expect(describeConflictContext('datagrid')).toBe('数据表格');
  });
});

// ─── RESERVED_SHORTCUTS sanity ───────────────────────────────────────

describe('RESERVED_SHORTCUTS', () => {
  it('all combos are already normalized', () => {
    for (const entry of RESERVED_SHORTCUTS) {
      expect(entry.combo).toBe(normalizeShortcutCombo(entry.combo));
    }
  });

  it('has at least 10 entries', () => {
    expect(RESERVED_SHORTCUTS.length).toBeGreaterThanOrEqual(10);
  });

  it('every entry has a label and context', () => {
    for (const entry of RESERVED_SHORTCUTS) {
      expect(entry.label).toBeTruthy();
      expect(['global', 'monaco', 'datagrid']).toContain(entry.context);
    }
  });
});

// ─── shortcut defaults ───────────────────────────────────────────────

describe('shortcut defaults', () => {
  it('registers select current statement as a query editor shortcut', () => {
    expect(DEFAULT_SHORTCUT_OPTIONS.selectCurrentStatement).toEqual({
      mac: { combo: 'Meta+E', enabled: true },
      windows: { combo: 'Ctrl+E', enabled: true },
    });
    expect(SHORTCUT_ACTION_META.selectCurrentStatement).toMatchObject({
      label: '选择当前语句',
      scope: 'queryEditor',
    });
  });

  // Windows 任务栏恢复后字体异常变大的兜底入口（方案 3）。
  // 自动 fix 路径（9848b8b2）刻意不再 toggle 以避免可见动画，由该快捷键给用户主动触发的修复入口。
  it('registers reset window zoom shortcut with default Ctrl+Shift+0', () => {
    expect(DEFAULT_SHORTCUT_OPTIONS.resetWindowZoom).toEqual({
      mac: { combo: '', enabled: false },
      windows: { combo: 'Ctrl+Shift+0', enabled: true },
    });
    expect(SHORTCUT_ACTION_META.resetWindowZoom).toMatchObject({
      label: '重置窗口缩放',
      allowInEditable: true,
    });
  });

  it('uses Navicat-inspired defaults separately for macOS and Windows/Linux', () => {
    expect(DEFAULT_SHORTCUT_OPTIONS.runQuery).toEqual({
      mac: { combo: 'Meta+R', enabled: true },
      windows: { combo: 'Ctrl+R', enabled: true },
    });
    expect(DEFAULT_SHORTCUT_OPTIONS.newQueryTab).toEqual({
      mac: { combo: 'Meta+Y', enabled: true },
      windows: { combo: 'Ctrl+Q', enabled: true },
    });
    expect(DEFAULT_SHORTCUT_OPTIONS.toggleLogPanel).toEqual({
      mac: { combo: 'Meta+Shift+H', enabled: true },
      windows: { combo: 'Ctrl+H', enabled: true },
    });
  });

  it('registers connection and AI panel actions as real shortcuts', () => {
    expect(DEFAULT_SHORTCUT_OPTIONS.newConnection).toEqual({
      mac: { combo: 'Meta+N', enabled: true },
      windows: { combo: 'Ctrl+N', enabled: true },
    });
    expect(DEFAULT_SHORTCUT_OPTIONS.toggleAIPanel).toEqual({
      mac: { combo: 'Meta+J', enabled: true },
      windows: { combo: 'Ctrl+J', enabled: true },
    });
    expect(SHORTCUT_ACTION_META.newConnection.label).toBe('新建数据源');
    expect(SHORTCUT_ACTION_META.toggleAIPanel.label).toBe('打开 AI 数据洞察');
  });

  it('migrates legacy single-platform shortcut bindings into both platform slots', () => {
    const options = sanitizeShortcutOptions({
      runQuery: { combo: 'Ctrl+Shift+R', enabled: false },
    });

    expect(options.runQuery).toEqual({
      mac: { combo: 'Ctrl+Shift+R', enabled: false },
      windows: { combo: 'Ctrl+Shift+R', enabled: false },
    });
    expect(options.newQueryTab.windows.combo).toBe('Ctrl+Q');
  });

  it('sanitizes partial platform shortcut bindings without losing defaults', () => {
    const options = sanitizeShortcutOptions({
      newQueryTab: {
        mac: { combo: 'Meta+Y', enabled: false },
      },
      sendAIChatMessage: {
        windows: { combo: 'A', enabled: true },
      },
    });

    expect(options.newQueryTab.mac).toEqual({ combo: 'Meta+Y', enabled: false });
    expect(options.newQueryTab.windows).toEqual({ combo: 'Ctrl+Q', enabled: true });
    expect(options.sendAIChatMessage.windows).toEqual({ combo: 'Enter', enabled: true });
  });

  it('resolves and displays platform-specific bindings', () => {
    const options = sanitizeShortcutOptions({
      newQueryTab: {
        mac: { combo: 'Meta+Y', enabled: true },
        windows: { combo: 'Ctrl+Q', enabled: true },
      },
    });

    expect(resolveShortcutBinding(options, 'newQueryTab', 'mac')).toEqual({
      combo: 'Meta+Y',
      enabled: true,
    });
    expect(getShortcutDisplayLabel('Meta+N', 'mac')).toBe('⌘N');
    expect(getShortcutDisplayLabel('Meta+Shift+H', 'mac')).toBe('⌘⇧H');
    expect(getShortcutDisplayLabel('Ctrl+Meta+F', 'mac')).toBe('⌃⌘F');
    expect(resolveShortcutDisplay(options, 'newQueryTab', 'windows')).toBe('Ctrl+Q');
  });
});

// ─── comboToMonacoKeyBinding ─────────────────────────────────────────

describe('comboToMonacoKeyBinding', () => {
  const mockKeyMod = {
    CtrlCmd: 2048,
    WinCtrl: 256,
    Alt: 512,
    Shift: 1024,
  };

  const mockKeyCode = {
    Enter: 3,
    Tab: 2,
    Escape: 9,
    Space: 10,
    Backspace: 1,
    Delete: 20,
    Home: 14,
    End: 13,
    PageUp: 11,
    PageDown: 12,
    UpArrow: 16,
    DownArrow: 17,
    LeftArrow: 15,
    RightArrow: 18,
    Insert: 19,
    KeyA: 31, KeyB: 32, KeyC: 33, KeyD: 34, KeyE: 35,
    KeyF: 41,
    KeyG: 42, KeyH: 43, KeyK: 47, KeyN: 50, KeyP: 52, KeyR: 54, KeyS: 55,
    Digit0: 21, Digit1: 22, Digit2: 23, Digit3: 24, Digit4: 25,
    Digit5: 26, Digit6: 27, Digit7: 28, Digit8: 29, Digit9: 30,
    F1: 61, F2: 62, F3: 63, F4: 64, F5: 65, F6: 66,
    F7: 67, F8: 68, F9: 69, F10: 70, F11: 71, F12: 72,
    Oem1: 80, Oem2: 81, Oem3: 82, Oem4: 83, Oem5: 84,
    Oem6: 85, Oem7: 86, OemComma: 87, OemMinus: 88,
    OemPlus: 89, OemPeriod: 90,
  };

  it('maps Ctrl+Enter correctly', () => {
    expect(comboToMonacoKeyBinding('Ctrl+Enter', mockKeyMod, mockKeyCode)).toEqual({
      keyMod: mockKeyMod.CtrlCmd,
      keyCode: mockKeyCode.Enter,
    });
  });

  it('maps Ctrl+Shift+R correctly', () => {
    expect(comboToMonacoKeyBinding('Ctrl+Shift+R', mockKeyMod, mockKeyCode)).toEqual({
      keyMod: mockKeyMod.CtrlCmd | mockKeyMod.Shift,
      keyCode: mockKeyCode.KeyR,
    });
  });

  it('maps Meta+Enter (macOS variant)', () => {
    expect(comboToMonacoKeyBinding('Meta+Enter', mockKeyMod, mockKeyCode)).toEqual({
      keyMod: mockKeyMod.WinCtrl,
      keyCode: mockKeyCode.Enter,
    });
  });

  it('maps F2 key', () => {
    expect(comboToMonacoKeyBinding('F2', mockKeyMod, mockKeyCode)).toEqual({
      keyMod: 0,
      keyCode: mockKeyCode.F2,
    });
  });

  it('maps Ctrl+, (comma)', () => {
    expect(comboToMonacoKeyBinding('Ctrl+,', mockKeyMod, mockKeyCode)).toEqual({
      keyMod: mockKeyMod.CtrlCmd,
      keyCode: mockKeyCode.OemComma,
    });
  });

  it('returns null for empty combo', () => {
    expect(comboToMonacoKeyBinding('', mockKeyMod, mockKeyCode)).toBeNull();
  });

  it('returns null for combo with only modifiers', () => {
    expect(comboToMonacoKeyBinding('Ctrl+Shift', mockKeyMod, mockKeyCode)).toBeNull();
  });

  it('maps Ctrl+Digit1', () => {
    expect(comboToMonacoKeyBinding('Ctrl+1', mockKeyMod, mockKeyCode)).toEqual({
      keyMod: mockKeyMod.CtrlCmd,
      keyCode: mockKeyCode.Digit1,
    });
  });

  it('maps Ctrl+Alt+Delete', () => {
    expect(comboToMonacoKeyBinding('Ctrl+Alt+Delete', mockKeyMod, mockKeyCode)).toEqual({
      keyMod: mockKeyMod.CtrlCmd | mockKeyMod.Alt,
      keyCode: mockKeyCode.Delete,
    });
  });
});
