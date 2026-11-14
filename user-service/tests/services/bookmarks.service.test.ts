// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5-5), date: 2026-11-05
// Scope: Tests for the bookmarks service (cap, repeat safety, race safety), per the 2026-11-05
//        supplier-bookmarking spec. No requirements, architecture, schema, or API decisions were
//        made by the AI tool.
// Author review:
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as users from '../../src/db/queries/users.queries.js';
import {
  BOOKMARK_LIMIT_MESSAGE,
  MAX_BOOKMARKS,
  addBookmark,
  listBookmarks,
  removeBookmark,
} from '../../src/services/bookmarks.service.js';
import { AppError } from '../../src/utils/AppError.js';
import { getBookmarkRows, truncateAll } from '../helpers/db.js';

let userId: string;

beforeEach(async () => {
  await truncateAll();
  userId = (
    await users.createUser({ username: 'alice', email: 'alice@example.com', passwordHash: 'h', status: 'active' })
  ).id;
});
afterEach(truncateAll);

async function fill(count: number) {
  for (let id = 1; id <= count; id += 1) await addBookmark(userId, id);
}

describe('addBookmark', () => {
  it('stores the bookmark and answers with the added code', async () => {
    expect(await addBookmark(userId, 7)).toEqual({ message: 'Supplier bookmarked', code: 'BOOKMARK_ADDED' });
    expect(await listBookmarks(userId)).toEqual({ supplier_ids: [7] });
  });

  it('is safe to repeat: same answer, still one row', async () => {
    await addBookmark(userId, 7);
    expect(await addBookmark(userId, 7)).toEqual({ message: 'Supplier bookmarked', code: 'BOOKMARK_ADDED' });
    expect(await getBookmarkRows(userId)).toHaveLength(1);
  });

  it('allows exactly the limit', async () => {
    await fill(MAX_BOOKMARKS);
    expect(await getBookmarkRows(userId)).toHaveLength(MAX_BOOKMARKS);
  });

  it('rejects the next one with 422 BOOKMARK_LIMIT_REACHED and the user-facing message', async () => {
    await fill(MAX_BOOKMARKS);
    const err = await addBookmark(userId, 99).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ status: 422, code: 'BOOKMARK_LIMIT_REACHED', message: BOOKMARK_LIMIT_MESSAGE });
    expect(BOOKMARK_LIMIT_MESSAGE).toBe(
      'You can bookmark up to 20 suppliers. Remove one before adding another.',
    );
    expect(await getBookmarkRows(userId)).toHaveLength(MAX_BOOKMARKS);
  });

  it('still accepts a repeat of an existing bookmark when at the limit', async () => {
    await fill(MAX_BOOKMARKS);
    await expect(addBookmark(userId, 1)).resolves.toMatchObject({ code: 'BOOKMARK_ADDED' });
  });

  it('never exceeds the limit when adds race', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: MAX_BOOKMARKS + 5 }, (_, i) => addBookmark(userId, i + 1)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(MAX_BOOKMARKS);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(5);
    expect(await getBookmarkRows(userId)).toHaveLength(MAX_BOOKMARKS);
  });
});

describe('removeBookmark', () => {
  it('removes the bookmark and frees a slot', async () => {
    await fill(MAX_BOOKMARKS);
    expect(await removeBookmark(userId, 3)).toEqual({ message: 'Bookmark removed', code: 'BOOKMARK_REMOVED' });
    await expect(addBookmark(userId, 99)).resolves.toMatchObject({ code: 'BOOKMARK_ADDED' });
  });

  it('answers the same when the bookmark was not saved', async () => {
    expect(await removeBookmark(userId, 42)).toEqual({ message: 'Bookmark removed', code: 'BOOKMARK_REMOVED' });
  });
});

describe('listBookmarks', () => {
  it('returns an empty list for a user with none', async () => {
    expect(await listBookmarks(userId)).toEqual({ supplier_ids: [] });
  });
});
