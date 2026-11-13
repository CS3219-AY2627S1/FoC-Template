/** Page size for the feed, order lists and credit history. */
export const PAGE_SIZE = 20;

/** Order Service and Credit Service both cap a page at 100 items. */
export const MAX_PAGE_LIMIT = 100;

export type PageWindow = { offset: number; limit: number };

export const FIRST_PAGE: PageWindow = { offset: 0, limit: PAGE_SIZE };

/**
 * The window for "Load more" after `loaded` items. The lists are newest first
 * and offset-based, so an item leaving the list (an errand accepted by another
 * courier) shifts later pages up and an offset read would skip one. Re-reading
 * from the start avoids that while it fits in one request; past the service's
 * limit it falls back to offset paging, where that skip can still happen.
 */
export function nextPageWindow(loaded: number): PageWindow {
  const limit = loaded + PAGE_SIZE;
  return limit <= MAX_PAGE_LIMIT
    ? { offset: 0, limit }
    : { offset: loaded, limit: PAGE_SIZE };
}

/** Server Actions are public endpoints, so bound whatever the caller sent. */
export function clampPageWindow({ offset, limit }: PageWindow): PageWindow {
  return {
    offset: Math.max(0, Math.trunc(offset) || 0),
    limit: Math.min(
      MAX_PAGE_LIMIT,
      Math.max(1, Math.trunc(limit) || PAGE_SIZE),
    ),
  };
}

/**
 * A window read from the start replaces the list. A later window is appended,
 * skipping items already shown, since new items shift newest-first pages down.
 */
export function mergePage<T extends { id: string }>(
  prev: T[],
  next: T[],
  window: PageWindow,
): T[] {
  if (window.offset === 0) return next;
  const seen = new Set(prev.map((item) => item.id));
  return [...prev, ...next.filter((item) => !seen.has(item.id))];
}
