import { describe, expect, it } from 'vitest';

import {
  findReservedConflict,
  findReservedConflicts,
  describeConflictContext,
  normalizeShortcutCombo,
  RESERVED_SHORTCUTS,
  comboToMonacoKeyBinding,
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
