import { describe, expect, it } from 'vitest';

import {
  MAX_PAGE_LIMIT,
  PAGE_SIZE,
  clampPageWindow,
  mergePage,
  nextPageWindow,
} from '@/lib/paging';

const item = (id: string) => ({ id });

describe('nextPageWindow', () => {
  it('re-reads from the start while the list fits in one request', () => {
    expect(nextPageWindow(PAGE_SIZE)).toEqual({
      offset: 0,
      limit: PAGE_SIZE * 2,
    });
    expect(nextPageWindow(MAX_PAGE_LIMIT - PAGE_SIZE)).toEqual({
      offset: 0,
      limit: MAX_PAGE_LIMIT,
    });
  });

  it('falls back to offset paging past the service limit', () => {
    expect(nextPageWindow(MAX_PAGE_LIMIT)).toEqual({
      offset: MAX_PAGE_LIMIT,
      limit: PAGE_SIZE,
    });
  });
});

describe('clampPageWindow', () => {
  it('bounds offset and limit to what the services accept', () => {
    expect(clampPageWindow({ offset: -5, limit: 500 })).toEqual({
      offset: 0,
      limit: MAX_PAGE_LIMIT,
    });
    expect(clampPageWindow({ offset: 2.7, limit: -3 })).toEqual({
      offset: 2,
      limit: 1,
    });
    expect(clampPageWindow({ offset: NaN, limit: NaN })).toEqual({
      offset: 0,
      limit: PAGE_SIZE,
    });
  });
});

describe('mergePage', () => {
  it('replaces the list when reading from the start', () => {
    // `b` left the list between reads; a re-read drops it instead of skipping `d`.
    const merged = mergePage(
      [item('a'), item('b'), item('c')],
      [item('a'), item('c'), item('d')],
      {
        offset: 0,
        limit: 40,
      },
    );
    expect(merged.map((i) => i.id)).toEqual(['a', 'c', 'd']);
  });

  it('appends a later page, skipping items already shown', () => {
    const merged = mergePage([item('a'), item('b')], [item('b'), item('c')], {
      offset: 2,
      limit: 20,
    });
    expect(merged.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });
});
