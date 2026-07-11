import { useEffect } from 'react';

export const SIDEBAR_FILTER_PERSIST_DELAY_MS = 240;

type SidebarFilterPersistenceOptions = {
  enabled: boolean;
  searchValue: string;
  persistedFilter: string;
  onPersist: (value: string) => void;
};

/**
 * Keeps the search input responsive by delaying writes to the persisted app
 * store until the user pauses typing. The tree can still use the local value
 * immediately (through React's deferred rendering path).
 */
export const useSidebarFilterPersistence = ({
  enabled,
  searchValue,
  persistedFilter,
  onPersist,
}: SidebarFilterPersistenceOptions) => {
  useEffect(() => {
    if (!enabled) return;

    const nextFilter = searchValue.trim();
    if (nextFilter === persistedFilter) return;

    const timer = setTimeout(() => {
      onPersist(nextFilter);
    }, SIDEBAR_FILTER_PERSIST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [enabled, onPersist, persistedFilter, searchValue]);
};
