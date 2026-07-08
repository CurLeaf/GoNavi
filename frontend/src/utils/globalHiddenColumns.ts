import { useEffect, useState } from 'react';

export const GLOBAL_HIDDEN_COLUMNS_STORAGE_KEY = 'gonavi.globalHiddenColumns.v1';
export const GLOBAL_HIDDEN_COLUMNS_CHANGED_EVENT = 'gonavi:global-hidden-columns-changed';

export const normalizeGlobalHiddenColumnName = (value: unknown): string => (
  String(value ?? '').trim().toLowerCase()
);

export const parseGlobalHiddenColumnsText = (value: unknown): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  String(value ?? '')
    .split(/[\n\r,，;；\t]+/)
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .forEach((item) => {
      const normalized = normalizeGlobalHiddenColumnName(item);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      result.push(item);
    });
  return result;
};

export const normalizeGlobalHiddenColumns = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return parseGlobalHiddenColumnsText(value.join('\n'));
  }
  return parseGlobalHiddenColumnsText(value);
};

export const serializeGlobalHiddenColumns = (columns: unknown): string => (
  normalizeGlobalHiddenColumns(columns).join('\n')
);

export const loadGlobalHiddenColumns = (): string[] => {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(GLOBAL_HIDDEN_COLUMNS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return normalizeGlobalHiddenColumns(parsed);
  } catch {
    return [];
  }
};

export const saveGlobalHiddenColumns = (columns: unknown): string[] => {
  const normalized = normalizeGlobalHiddenColumns(columns);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(GLOBAL_HIDDEN_COLUMNS_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Ignore storage failures; still notify in-memory listeners.
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(GLOBAL_HIDDEN_COLUMNS_CHANGED_EVENT, {
      detail: { columns: normalized },
    }));
  }
  return normalized;
};

export const subscribeGlobalHiddenColumns = (callback: (columns: string[]) => void): (() => void) => {
  if (typeof window === 'undefined') {
    return () => {};
  }
  const handleCustomEvent = (event: Event) => {
    const detail = (event as CustomEvent<{ columns?: unknown }>).detail;
    callback(normalizeGlobalHiddenColumns(detail?.columns));
  };
  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key !== GLOBAL_HIDDEN_COLUMNS_STORAGE_KEY) return;
    callback(loadGlobalHiddenColumns());
  };
  window.addEventListener(GLOBAL_HIDDEN_COLUMNS_CHANGED_EVENT, handleCustomEvent as EventListener);
  window.addEventListener('storage', handleStorageEvent);
  return () => {
    window.removeEventListener(GLOBAL_HIDDEN_COLUMNS_CHANGED_EVENT, handleCustomEvent as EventListener);
    window.removeEventListener('storage', handleStorageEvent);
  };
};

export const useGlobalHiddenColumns = (): string[] => {
  const [columns, setColumns] = useState<string[]>(() => loadGlobalHiddenColumns());

  useEffect(() => subscribeGlobalHiddenColumns(setColumns), []);

  return columns;
};

export const filterColumnNamesByGlobalHiddenColumns = (
  columnNames: string[],
  hiddenColumns: unknown,
): string[] => {
  const hiddenSet = new Set(
    normalizeGlobalHiddenColumns(hiddenColumns).map(normalizeGlobalHiddenColumnName),
  );
  if (hiddenSet.size === 0) {
    return columnNames;
  }
  return (columnNames || []).filter((columnName) => !hiddenSet.has(normalizeGlobalHiddenColumnName(columnName)));
};
