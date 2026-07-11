import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SIDEBAR_FILTER_PERSIST_DELAY_MS,
  useSidebarFilterPersistence,
} from './useSidebarFilterPersistence';

const FilterPersistenceProbe = ({
  enabled,
  searchValue,
  persistedFilter,
  onPersist,
}: {
  enabled: boolean;
  searchValue: string;
  persistedFilter: string;
  onPersist: (value: string) => void;
}) => {
  useSidebarFilterPersistence({
    enabled,
    searchValue,
    persistedFilter,
    onPersist,
  });
  return null;
};

describe('useSidebarFilterPersistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('buffers rapid filter input and only persists the final value', () => {
    const onPersist = vi.fn();
    let renderer: ReturnType<typeof create>;

    act(() => {
      renderer = create(
        <FilterPersistenceProbe
          enabled
          searchValue="o"
          persistedFilter=""
          onPersist={onPersist}
        />,
      );
    });
    act(() => {
      renderer!.update(
        <FilterPersistenceProbe
          enabled
          searchValue="orders"
          persistedFilter=""
          onPersist={onPersist}
        />,
      );
    });
    act(() => {
      vi.advanceTimersByTime(SIDEBAR_FILTER_PERSIST_DELAY_MS - 1);
    });

    expect(onPersist).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(onPersist).toHaveBeenCalledTimes(1);
    expect(onPersist).toHaveBeenCalledWith('orders');
  });

  it('does not write an unchanged persisted filter', () => {
    const onPersist = vi.fn();

    act(() => {
      create(
        <FilterPersistenceProbe
          enabled
          searchValue="  orders  "
          persistedFilter="orders"
          onPersist={onPersist}
        />,
      );
      vi.runAllTimers();
    });

    expect(onPersist).not.toHaveBeenCalled();
  });
});
