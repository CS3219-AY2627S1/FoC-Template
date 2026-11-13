import { useState, useTransition } from 'react';

import type { PageResult } from '@/lib/action-result';
import {
  FIRST_PAGE,
  type PageWindow,
  mergePage,
  nextPageWindow,
} from '@/lib/paging';

type ListState<T> = {
  items: T[];
  total: number;
  error: string | null;
  /** Server time of the last successful read; 0 if there was none. */
  loadedAt: number;
};

function initialState<T>(result: PageResult<T>): ListState<T> {
  return result.ok
    ? {
        items: result.items,
        total: result.total,
        error: null,
        loadedAt: result.loadedAt,
      }
    : { items: [], total: 0, error: result.message, loadedAt: 0 };
}

/**
 * A server-rendered first page with refresh and "Load more". A failed read
 * keeps the items already shown and reports the error alongside them.
 */
export function usePagedList<T extends { id: string }>(
  initial: PageResult<T>,
  load: (window: PageWindow) => Promise<PageResult<T>>,
) {
  const [state, setState] = useState(() => initialState(initial));
  const [isLoading, startLoading] = useTransition();

  function read(window: PageWindow) {
    startLoading(async () => {
      let result: PageResult<T>;
      try {
        result = await load(window);
      } catch {
        result = {
          ok: false,
          status: 0,
          message: 'Could not reach the server.',
        };
      }
      setState((prev) =>
        result.ok
          ? {
              items: mergePage(prev.items, result.items, window),
              total: result.total,
              error: null,
              loadedAt: result.loadedAt,
            }
          : { ...prev, error: result.message },
      );
    });
  }

  return {
    ...state,
    isLoading,
    hasMore: state.items.length < state.total,
    refresh: () => read(FIRST_PAGE),
    loadMore: () => read(nextPageWindow(state.items.length)),
    /** Swaps in a changed item, e.g. after an action on its card. */
    replace: (item: T) =>
      setState((prev) => ({
        ...prev,
        items: prev.items.map((i) => (i.id === item.id ? item : i)),
      })),
  };
}
