import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

export type ShortcutAction =
  | 'runQuery'
  | 'sendAIChatMessage'
  | 'focusSidebarSearch'
  | 'newQueryTab'
  | 'toggleLogPanel'
  | 'toggleTheme'
  | 'openShortcutManager'
  | 'toggleMacFullscreen';

export interface ShortcutBinding {
  combo: string;
  enabled: boolean;
}

export type ShortcutOptions = Record<ShortcutAction, ShortcutBinding>;

export interface ShortcutActionMeta {
  label: string;
  description: string;
  allowInEditable?: boolean;
  allowWithoutModifier?: boolean;
  scope?: 'global' | 'aiComposer';
  requiredKey?: string;
  disallowShift?: boolean;
  platformOnly?: 'mac';
}

const MODIFIER_ORDER = ['Ctrl', 'Meta', 'Alt', 'Shift'] as const;
const MODIFIER_SET = new Set(MODIFIER_ORDER);

const KEY_ALIASES: Record<string, string> = {
  control: 'Ctrl',
  ctrl: 'Ctrl',
  command: 'Meta',
  cmd: 'Meta',
  meta: 'Meta',
  option: 'Alt',
  alt: 'Alt',
  shift: 'Shift',
  escape: 'Esc',
  esc: 'Esc',
  return: 'Enter',
  enter: 'Enter',
  tab: 'Tab',
  space: 'Space',
  ' ': 'Space',
  backspace: 'Backspace',
  delete: 'Delete',
  del: 'Delete',
  arrowup: 'Up',
  up: 'Up',
  arrowdown: 'Down',
  down: 'Down',
  arrowleft: 'Left',
  left: 'Left',
  arrowright: 'Right',
  right: 'Right',
  pagedown: 'PageDown',
  pageup: 'PageUp',
  home: 'Home',
  end: 'End',
  insert: 'Insert',
  ',': ',',
  '.': '.',
  '/': '/',
  ';': ';',
  "'": "'",
  '[': '[',
  ']': ']',
  '\\': '\\',
  '-': '-',
  '=': '=',
  '`': '`',
};

export const SHORTCUT_ACTION_ORDER: ShortcutAction[] = [
  'runQuery',
  'sendAIChatMessage',
  'focusSidebarSearch',
  'newQueryTab',
  'toggleLogPanel',
  'toggleTheme',
  'openShortcutManager',
  'toggleMacFullscreen',
];

export const SHORTCUT_ACTION_META: Record<ShortcutAction, ShortcutActionMeta> = {
  runQuery: {
    label: '执行 SQL',
    description: '在当前查询页执行 SQL',
  },
  sendAIChatMessage: {
    label: 'AI 聊天发送',
    description: '在 AI 输入框中发送当前消息，Shift+Enter 始终换行',
    allowInEditable: true,
    allowWithoutModifier: true,
    scope: 'aiComposer',
    requiredKey: 'Enter',
    disallowShift: true,
  },
  focusSidebarSearch: {
    label: '聚焦侧边栏搜索',
    description: '定位到左侧连接树搜索框',
    allowInEditable: true,
  },
  newQueryTab: {
    label: '新建查询页',
    description: '创建一个新的 SQL 查询标签页',
  },
  toggleLogPanel: {
    label: '切换日志面板',
    description: '打开或关闭 SQL 执行日志面板',
  },
  toggleTheme: {
    label: '切换主题',
    description: '在亮色和暗色主题之间切换',
  },
  openShortcutManager: {
    label: '打开快捷键管理',
    description: '打开快捷键设置面板',
    allowInEditable: true,
  },
  toggleMacFullscreen: {
    label: '切换原生全屏',
    description: 'macOS 原生窗口控制模式下的全屏切换（⌃⌘F）',
    platformOnly: 'mac',
  },
};

export const DEFAULT_SHORTCUT_OPTIONS: ShortcutOptions = {
  runQuery: { combo: 'Ctrl+Shift+R', enabled: true },
  sendAIChatMessage: { combo: 'Enter', enabled: true },
  focusSidebarSearch: { combo: 'Ctrl+F', enabled: true },
  newQueryTab: { combo: 'Ctrl+Shift+N', enabled: true },
  toggleLogPanel: { combo: 'Ctrl+Shift+L', enabled: true },
  toggleTheme: { combo: 'Ctrl+Shift+D', enabled: true },
  openShortcutManager: { combo: 'Ctrl+,', enabled: true },
  toggleMacFullscreen: { combo: 'Ctrl+Meta+F', enabled: true },
};

const normalizeKeyToken = (value: string): string => {
  const token = String(value || '').trim();
  if (!token) return '';
  const alias = KEY_ALIASES[token.toLowerCase()];
  if (alias) return alias;
  if (/^f([1-9]|1[0-2])$/i.test(token)) {
    return token.toUpperCase();
  }
  if (token.length === 1) {
    return token === '+' ? '+' : token.toUpperCase();
  }
  return token.length > 1 ? token[0].toUpperCase() + token.slice(1).toLowerCase() : token;
};

export const normalizeShortcutCombo = (combo: string): string => {
  const raw = String(combo || '').trim();
  if (!raw) return '';

  const pieces = raw
    .split('+')
    .map(part => part.trim())
    .filter(Boolean);

  const modifiers: string[] = [];
  let key = '';

  pieces.forEach((part) => {
    const normalized = normalizeKeyToken(part);
    if (!normalized) return;
    if (MODIFIER_SET.has(normalized as typeof MODIFIER_ORDER[number])) {
      if (!modifiers.includes(normalized)) {
        modifiers.push(normalized);
      }
      return;
    }
    key = normalized;
  });

  modifiers.sort((a, b) => MODIFIER_ORDER.indexOf(a as typeof MODIFIER_ORDER[number]) - MODIFIER_ORDER.indexOf(b as typeof MODIFIER_ORDER[number]));
  if (!key) {
    return modifiers.join('+');
  }
  return [...modifiers, key].join('+');
};

const normalizeKeyboardKey = (key: string): string => {
  const token = String(key || '').trim();
  if (!token) return '';
  const alias = KEY_ALIASES[token.toLowerCase()];
  if (alias) return alias;
  if (token.length === 1) {
    if (token === ' ') return 'Space';
    return token.toUpperCase();
  }
  if (/^f([1-9]|1[0-2])$/i.test(token)) {
    return token.toUpperCase();
  }
  return token.length > 1 ? token[0].toUpperCase() + token.slice(1) : token;
};

export const eventToShortcut = (event: KeyboardEvent | ReactKeyboardEvent): string => {
  const key = normalizeKeyboardKey(event.key);
  if (!key || MODIFIER_SET.has(key as typeof MODIFIER_ORDER[number])) {
    return '';
  }

  const modifiers: string[] = [];
  if (event.ctrlKey) modifiers.push('Ctrl');
  if (event.metaKey) modifiers.push('Meta');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');

  return normalizeShortcutCombo([...modifiers, key].join('+'));
};

export const isShortcutMatch = (event: KeyboardEvent | ReactKeyboardEvent, combo: string): boolean => {
  const expected = normalizeShortcutCombo(combo);
  if (!expected) return false;
  const actual = eventToShortcut(event);
  return actual === expected;
};

export const hasModifierKey = (combo: string): boolean => {
  const normalized = normalizeShortcutCombo(combo);
  if (!normalized) return false;
  return normalized.split('+').some(part => MODIFIER_SET.has(part as typeof MODIFIER_ORDER[number]));
};

const getShortcutKeyToken = (combo: string): string => {
  const parts = normalizeShortcutCombo(combo).split('+').filter(Boolean);
  const key = parts[parts.length - 1] || '';
  return MODIFIER_SET.has(key as typeof MODIFIER_ORDER[number]) ? '' : key;
};

const getShortcutModifierTokens = (combo: string): string[] => (
  normalizeShortcutCombo(combo)
    .split('+')
    .filter(part => MODIFIER_SET.has(part as typeof MODIFIER_ORDER[number]))
);

export const canRecordShortcutForAction = (action: ShortcutAction, combo: string): boolean => {
  const normalized = normalizeShortcutCombo(combo);
  if (!normalized || !getShortcutKeyToken(normalized)) {
    return false;
  }

  const meta = SHORTCUT_ACTION_META[action];
  if (meta.requiredKey && getShortcutKeyToken(normalized) !== normalizeShortcutCombo(meta.requiredKey)) {
    return false;
  }
  if (meta.disallowShift && normalized.split('+').includes('Shift')) {
    return false;
  }
  if (meta.allowWithoutModifier) {
    return getShortcutModifierTokens(normalized).length <= 1;
  }
  return hasModifierKey(normalized);
};

export const cloneShortcutOptions = (value: ShortcutOptions): ShortcutOptions => {
  return SHORTCUT_ACTION_ORDER.reduce((acc, action) => {
    acc[action] = {
      combo: normalizeShortcutCombo(value[action]?.combo || DEFAULT_SHORTCUT_OPTIONS[action].combo),
      enabled: value[action]?.enabled !== false,
    };
    return acc;
  }, {} as ShortcutOptions);
};

export const sanitizeShortcutOptions = (value: unknown): ShortcutOptions => {
  const raw = (value && typeof value === 'object') ? value as Record<string, unknown> : {};
  const defaults = cloneShortcutOptions(DEFAULT_SHORTCUT_OPTIONS);

  SHORTCUT_ACTION_ORDER.forEach((action) => {
    const actionRaw = raw[action];
    if (!actionRaw || typeof actionRaw !== 'object') {
      return;
    }
    const binding = actionRaw as Record<string, unknown>;
    const combo = normalizeShortcutCombo(String(binding.combo || defaults[action].combo));
    defaults[action] = {
      combo: combo && canRecordShortcutForAction(action, combo) ? combo : defaults[action].combo,
      enabled: binding.enabled === false ? false : true,
    };
  });

  return defaults;
};

export const isEditableElement = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName.toLowerCase();
  if (target.isContentEditable) {
    return true;
  }
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    return true;
  }
  if (target.closest('.monaco-editor, .monaco-inputbox, .ant-select, .ant-picker, .ant-input')) {
    return true;
  }
  return false;
};

export const getShortcutDisplay = (combo: string): string => {
  const normalized = normalizeShortcutCombo(combo);
  return normalized || '-';
};

export type ConflictContext = 'global' | 'monaco' | 'datagrid';

export interface ReservedShortcut {
  combo: string;
  label: string;
  context: ConflictContext;
  monacoCommandId?: string;
}

export interface ConflictInfo {
  label: string;
  context: ConflictContext;
  monacoCommandId?: string;
}

export const RESERVED_SHORTCUTS: ReservedShortcut[] = [
  // Browser / WebView built-in shortcuts
  { combo: 'Ctrl+S',           label: '浏览器保存',        context: 'global' },
  { combo: 'Ctrl+P',           label: '浏览器打印',        context: 'global' },
  { combo: 'Ctrl+W',           label: '浏览器关闭标签页',  context: 'global' },
  { combo: 'Ctrl+T',           label: '浏览器新建标签页',  context: 'global' },
  { combo: 'Ctrl+N',           label: '浏览器新建窗口',    context: 'global' },
  { combo: 'Ctrl+Shift+N',     label: '浏览器新建隐身窗口', context: 'global' },

  // Monaco editor built-in shortcuts
  { combo: 'Ctrl+F',           label: '编辑器查找',               context: 'monaco', monacoCommandId: 'actions.find' },
  { combo: 'Meta+F',           label: '编辑器查找',               context: 'monaco', monacoCommandId: 'actions.find' },
  { combo: 'Ctrl+H',           label: '编辑器替换',               context: 'monaco', monacoCommandId: 'editor.action.startFindReplaceAction' },
  { combo: 'Meta+H',           label: '编辑器替换',               context: 'monaco', monacoCommandId: 'editor.action.startFindReplaceAction' },
  { combo: 'Ctrl+G',           label: '编辑器跳转行',             context: 'monaco', monacoCommandId: 'editor.action.gotoLine' },
  { combo: 'Meta+G',           label: '编辑器跳转行',             context: 'monaco', monacoCommandId: 'editor.action.gotoLine' },
  { combo: 'Ctrl+P',           label: '编辑器快速打开',           context: 'monaco', monacoCommandId: 'actions.quickOpen' },
  { combo: 'Meta+P',           label: '编辑器快速打开',           context: 'monaco', monacoCommandId: 'actions.quickOpen' },
  { combo: 'Ctrl+Shift+F',     label: '编辑器全局查找',           context: 'monaco', monacoCommandId: 'actions.quickOpenNavigate' },
  { combo: 'Meta+Shift+F',     label: '编辑器全局查找',           context: 'monaco', monacoCommandId: 'actions.quickOpenNavigate' },
  { combo: 'Ctrl+D',           label: '编辑器添加选区',           context: 'monaco', monacoCommandId: 'editor.action.addSelectionToNextFindMatch' },
  { combo: 'Meta+D',           label: '编辑器添加选区',           context: 'monaco', monacoCommandId: 'editor.action.addSelectionToNextFindMatch' },
  { combo: 'Ctrl+Shift+K',     label: '编辑器删除行',             context: 'monaco', monacoCommandId: 'editor.action.deleteLines' },
  { combo: 'Meta+Shift+K',     label: '编辑器删除行',             context: 'monaco', monacoCommandId: 'editor.action.deleteLines' },
  { combo: 'Ctrl+Enter',       label: '编辑器在下方插入行',       context: 'monaco', monacoCommandId: 'editor.action.insertLineAfter' },
  { combo: 'Meta+Enter',       label: '编辑器在下方插入行',       context: 'monaco', monacoCommandId: 'editor.action.insertLineAfter' },
  { combo: 'Ctrl+Shift+Enter', label: '编辑器在上方插入行',       context: 'monaco', monacoCommandId: 'editor.action.insertLineBefore' },
  { combo: 'Meta+Shift+Enter', label: '编辑器在上方插入行',       context: 'monaco', monacoCommandId: 'editor.action.insertLineBefore' },
  { combo: 'F2',               label: '编辑器重命名符号',         context: 'monaco', monacoCommandId: 'editor.action.rename' },

  // DataGrid shortcuts
  { combo: 'Ctrl+C',           label: '数据表格复制',     context: 'datagrid' },
  { combo: 'Meta+C',           label: '数据表格复制',     context: 'datagrid' },
];

const CONTEXT_DESCRIPTION: Record<ConflictContext, string> = {
  global: '浏览器',
  monaco: '编辑器',
  datagrid: '数据表格',
};

export const describeConflictContext = (context: ConflictContext): string => {
  return CONTEXT_DESCRIPTION[context] || context;
};

export const splitConflictsByContext = (conflicts: ConflictInfo[]) => {
  const monaco = conflicts.filter(c => c.context === 'monaco');
  const other = conflicts.filter(c => c.context !== 'monaco');
  const dedupe = (items: ConflictInfo[], fn: (c: ConflictInfo) => string) =>
    [...new Set(items.map(fn))].join('、');
  return {
    monacoLabels: dedupe(monaco, c => c.label),
    otherLabels: dedupe(other, c => c.label),
    otherContexts: dedupe(other, c => describeConflictContext(c.context)),
    hasMonaco: monaco.length > 0,
    hasOther: other.length > 0,
  };
};

export const findReservedConflict = (normalizedCombo: string): ConflictInfo | null => {
  const conflict = RESERVED_SHORTCUTS.find((r) => r.combo === normalizedCombo);
  if (!conflict) return null;
  return { label: conflict.label, context: conflict.context, monacoCommandId: conflict.monacoCommandId };
};

export const findReservedConflicts = (normalizedCombo: string): ConflictInfo[] => {
  return RESERVED_SHORTCUTS
    .filter((r) => r.combo === normalizedCombo)
    .map((r) => ({ label: r.label, context: r.context, monacoCommandId: r.monacoCommandId }));
};

export interface MonacoKeyBinding {
  keyMod: number;
  keyCode: number;
}

/** Map key token (after normalization) to a function that returns KeyCode.
 *  The function receives the KeyCode enum to avoid importing monaco at module level. */
type KeyCodeResolver = (kc: Record<string, number>) => number;

const MONACO_KEY_MAP: Record<string, KeyCodeResolver> = {
  Enter:          (kc) => kc.Enter,
  Tab:            (kc) => kc.Tab,
  Esc:            (kc) => kc.Escape,
  Space:          (kc) => kc.Space,
  Backspace:      (kc) => kc.Backspace,
  Delete:         (kc) => kc.Delete,
  Home:           (kc) => kc.Home,
  End:            (kc) => kc.End,
  PageUp:         (kc) => kc.PageUp,
  PageDown:       (kc) => kc.PageDown,
  Up:             (kc) => kc.UpArrow,
  Down:           (kc) => kc.DownArrow,
  Left:           (kc) => kc.LeftArrow,
  Right:          (kc) => kc.RightArrow,
  Insert:         (kc) => kc.Insert,
  '/':            (kc) => kc.Oem2,
  ',':            (kc) => kc.OemComma,
  '-':            (kc) => kc.OemMinus,
  '=':            (kc) => kc.OemPlus,
  '.':            (kc) => kc.OemPeriod,
  ';':            (kc) => kc.Oem1,
  "'":            (kc) => kc.Oem7,
  '[':            (kc) => kc.Oem4,
  ']':            (kc) => kc.Oem6,
  '\\':           (kc) => kc.Oem5,
  '`':            (kc) => kc.Oem3,
};

function resolveKeyCode(token: string, kc: Record<string, number>): number | null {
  // F1-F12
  const fMatch = token.match(/^F([1-9]|1[0-2])$/);
  if (fMatch) {
    return kc['F' + fMatch[1]] ?? null;
  }
  // A-Z
  if (/^[A-Z]$/.test(token)) {
    return kc['Key' + token] ?? null;
  }
  // 0-9
  if (/^[0-9]$/.test(token)) {
    return kc['Digit' + token] ?? null;
  }
  // Special keys map
  const resolver = MONACO_KEY_MAP[token];
  if (resolver) {
    return resolver(kc);
  }
  return null;
}

export const comboToMonacoKeyBinding = (
  combo: string,
  keyModEnum: Record<string, number>,
  keyCodeEnum: Record<string, number>,
): MonacoKeyBinding | null => {
  const normalized = normalizeShortcutCombo(combo);
  if (!normalized) return null;

  const pieces = normalized.split('+');
  let keyMod = 0;
  let keyCode: number | null = null;

  for (const piece of pieces) {
    if (piece === 'Ctrl') {
      keyMod |= keyModEnum.CtrlCmd ?? 0;
    } else if (piece === 'Meta') {
      keyMod |= keyModEnum.WinCtrl ?? 0;
    } else if (piece === 'Alt') {
      keyMod |= keyModEnum.Alt ?? 0;
    } else if (piece === 'Shift') {
      keyMod |= keyModEnum.Shift ?? 0;
    } else {
      keyCode = resolveKeyCode(piece, keyCodeEnum);
    }
  }

  if (keyCode == null) return null;
  return { keyMod, keyCode };
};

