import { create } from 'zustand';
import {
  CUSTOM_THEME_MAX_COUNT,
  CUSTOM_THEME_MAX_TOTAL_BYTES,
  CUSTOM_THEME_SCHEMA_VERSION,
  createCustomThemeId,
  getCustomThemeByteLength,
  sanitizeCustomThemeBaseMode,
  sanitizeCustomThemeDefinition,
  sanitizeCustomThemeFileName,
  sanitizeCustomThemeList,
  sanitizeCustomThemeName,
  validateCustomThemeCss,
  type CustomThemeBaseMode,
  type CustomThemeDefinition,
  type CustomThemeValidationReason,
} from './utils/customTheme';
import {
  resolveAvailableCustomTheme,
  resolveBuiltinCustomThemePreset,
} from './utils/customThemePresets';

export const CUSTOM_THEME_STORAGE_KEY = 'gonavi-custom-themes-v1';

type CustomThemeStoreError =
  | CustomThemeValidationReason
  | 'max-count'
  | 'max-total-size'
  | 'not-found'
  | 'storage-failed';

export type CustomThemeStoreResult =
  | { ok: true; theme?: CustomThemeDefinition }
  | { ok: false; reason: CustomThemeStoreError };

type CustomThemeSnapshot = {
  version: 1;
  themes: CustomThemeDefinition[];
  activeThemeId: string | null;
};

type CustomThemeStorage = Pick<Storage, 'getItem' | 'setItem'>;

type ImportCustomThemeInput = {
  name: string;
  sourceFileName: string;
  baseMode?: CustomThemeBaseMode;
  css: string;
};

type UpdateCustomThemeInput = Partial<Pick<
  CustomThemeDefinition,
  'name' | 'sourceFileName' | 'baseMode' | 'css'
>>;

interface CustomThemeState extends CustomThemeSnapshot {
  importCustomTheme: (input: ImportCustomThemeInput) => CustomThemeStoreResult;
  updateCustomTheme: (id: string, patch: UpdateCustomThemeInput) => CustomThemeStoreResult;
  selectCustomTheme: (id: string | null) => CustomThemeStoreResult;
  removeCustomTheme: (id: string) => CustomThemeStoreResult;
  reloadCustomThemes: () => void;
}

const EMPTY_CUSTOM_THEME_SNAPSHOT: CustomThemeSnapshot = {
  version: 1,
  themes: [],
  activeThemeId: null,
};

const getBrowserStorage = (): CustomThemeStorage | null => {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    return null;
  }
};

export const sanitizeCustomThemeSnapshot = (value: unknown): CustomThemeSnapshot => {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (raw.version !== CUSTOM_THEME_SCHEMA_VERSION) return { ...EMPTY_CUSTOM_THEME_SNAPSHOT };
  // builtin-* IDs are a reserved catalog namespace. Persisted user data is an
  // untrusted boundary and must not shadow an immutable built-in theme.
  const themes = sanitizeCustomThemeList(raw.themes).filter(
    (theme) => !resolveBuiltinCustomThemePreset(theme.id),
  );
  const activeTheme = resolveAvailableCustomTheme(themes, raw.activeThemeId);
  return {
    version: 1,
    themes,
    activeThemeId: activeTheme?.id ?? null,
  };
};

export const loadCustomThemeSnapshot = (
  storage: CustomThemeStorage | null = getBrowserStorage(),
): CustomThemeSnapshot => {
  if (!storage) return { ...EMPTY_CUSTOM_THEME_SNAPSHOT };
  try {
    const raw = storage.getItem(CUSTOM_THEME_STORAGE_KEY);
    if (!raw) return { ...EMPTY_CUSTOM_THEME_SNAPSHOT };
    return sanitizeCustomThemeSnapshot(JSON.parse(raw));
  } catch {
    return { ...EMPTY_CUSTOM_THEME_SNAPSHOT };
  }
};

const persistCustomThemeSnapshot = (snapshot: CustomThemeSnapshot): boolean => {
  const storage = getBrowserStorage();
  // Server-side/test imports may intentionally run without a browser. In an
  // actual app window, unavailable storage must not be reported as persisted.
  if (!storage) return typeof window === 'undefined';
  try {
    storage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
};

const getTotalThemeBytes = (themes: CustomThemeDefinition[]): number => themes.reduce(
  (total, theme) => total + getCustomThemeByteLength(theme.css),
  0,
);

const createSnapshot = (
  themes: CustomThemeDefinition[],
  activeThemeId: string | null,
): CustomThemeSnapshot => ({ version: 1, themes, activeThemeId });

const initialSnapshot = loadCustomThemeSnapshot();

export const useCustomThemeStore = create<CustomThemeState>((set, get) => ({
  ...initialSnapshot,

  importCustomTheme: (input) => {
    const validation = validateCustomThemeCss(input.css);
    if (!validation.ok) return { ok: false, reason: validation.reason };
    const state = get();
    if (state.themes.length >= CUSTOM_THEME_MAX_COUNT) {
      return { ok: false, reason: 'max-count' };
    }
    if (getTotalThemeBytes(state.themes) + validation.byteLength > CUSTOM_THEME_MAX_TOTAL_BYTES) {
      return { ok: false, reason: 'max-total-size' };
    }
    let id = createCustomThemeId();
    const existingIds = new Set(state.themes.map((theme) => theme.id));
    while (existingIds.has(id)) id = createCustomThemeId();
    const now = Date.now();
    const theme = sanitizeCustomThemeDefinition({
      schemaVersion: CUSTOM_THEME_SCHEMA_VERSION,
      id,
      name: sanitizeCustomThemeName(input.name),
      sourceFileName: sanitizeCustomThemeFileName(input.sourceFileName),
      baseMode: sanitizeCustomThemeBaseMode(input.baseMode),
      css: validation.css,
      createdAt: now,
      updatedAt: now,
    });
    if (!theme) return { ok: false, reason: 'invalid-syntax' };
    const nextSnapshot = createSnapshot([theme, ...state.themes], state.activeThemeId);
    if (!persistCustomThemeSnapshot(nextSnapshot)) {
      return { ok: false, reason: 'storage-failed' };
    }
    set(nextSnapshot);
    return { ok: true, theme };
  },

  updateCustomTheme: (id, patch) => {
    const state = get();
    const currentIndex = state.themes.findIndex((theme) => theme.id === id);
    if (currentIndex < 0) return { ok: false, reason: 'not-found' };
    const current = state.themes[currentIndex];
    const nextCss = patch.css ?? current.css;
    const validation = validateCustomThemeCss(nextCss);
    if (!validation.ok) return { ok: false, reason: validation.reason };
    const otherBytes = getTotalThemeBytes(state.themes) - getCustomThemeByteLength(current.css);
    if (otherBytes + validation.byteLength > CUSTOM_THEME_MAX_TOTAL_BYTES) {
      return { ok: false, reason: 'max-total-size' };
    }
    const nextTheme = sanitizeCustomThemeDefinition({
      ...current,
      ...patch,
      schemaVersion: CUSTOM_THEME_SCHEMA_VERSION,
      name: sanitizeCustomThemeName(patch.name ?? current.name, current.name),
      sourceFileName: sanitizeCustomThemeFileName(patch.sourceFileName ?? current.sourceFileName),
      baseMode: sanitizeCustomThemeBaseMode(patch.baseMode ?? current.baseMode),
      css: validation.css,
      createdAt: current.createdAt,
      updatedAt: Date.now(),
    });
    if (!nextTheme) return { ok: false, reason: 'invalid-syntax' };
    const themes = state.themes.map((theme, index) => index === currentIndex ? nextTheme : theme);
    const nextSnapshot = createSnapshot(themes, state.activeThemeId);
    if (!persistCustomThemeSnapshot(nextSnapshot)) {
      return { ok: false, reason: 'storage-failed' };
    }
    set(nextSnapshot);
    return { ok: true, theme: nextTheme };
  },

  selectCustomTheme: (id) => {
    const state = get();
    if (id !== null && !resolveAvailableCustomTheme(state.themes, id)) {
      return { ok: false, reason: 'not-found' };
    }
    const nextSnapshot = createSnapshot(state.themes, id);
    if (!persistCustomThemeSnapshot(nextSnapshot)) {
      // Deactivation is also the recovery path for a malformed theme. It must
      // remain available in-memory even when localStorage is blocked or full.
      if (id === null) set(nextSnapshot);
      return { ok: false, reason: 'storage-failed' };
    }
    set(nextSnapshot);
    return { ok: true, theme: resolveAvailableCustomTheme(state.themes, id) ?? undefined };
  },

  removeCustomTheme: (id) => {
    const state = get();
    if (!state.themes.some((theme) => theme.id === id)) {
      return { ok: false, reason: 'not-found' };
    }
    const themes = state.themes.filter((theme) => theme.id !== id);
    const activeThemeId = state.activeThemeId === id ? null : state.activeThemeId;
    const nextSnapshot = createSnapshot(themes, activeThemeId);
    if (!persistCustomThemeSnapshot(nextSnapshot)) {
      return { ok: false, reason: 'storage-failed' };
    }
    set(nextSnapshot);
    return { ok: true };
  },

  reloadCustomThemes: () => set(loadCustomThemeSnapshot()),
}));
