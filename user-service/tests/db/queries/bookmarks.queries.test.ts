// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5-5), date: 2026-11-05
// Scope: Integration tests for bookmarks.queries.ts against the real test DB, per the
//        2026-11-05 supplier-bookmarking spec. No requirements, architecture, schema, or API
//        decisions were made by the AI tool.
// Author review:
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import pool from '../../../src/db/pool.js';
import * as bookmarks from '../../../src/db/queries/bookmarks.queries.js';
import * as users from '../../../src/db/queries/users.queries.js';
import { getBookmarkRows, truncateAll } from '../../helpers/db.js';

let userId: string;
let otherUserId: string;

beforeEach(async () => {
  await truncateAll();
  userId = (
    await users.createUser({ username: 'alice', email: 'alice@example.com', passwordHash: 'h', status: 'active' })
  ).id;
  otherUserId = (
    await users.createUser({ username: 'bob', email: 'bob@example.com', passwordHash: 'h', status: 'active' })
  ).id;
});
afterEach(truncateAll);

describe('insertBookmark', () => {
  it('inserts a row and reports it', async () => {
    expect(await bookmarks.insertBookmark(userId, 5, pool)).toBe(true);
    expect((await getBookmarkRows(userId)).map((r) => r.supplier_id)).toEqual([5]);
  });

  it('ignores a repeat of the same pair and reports false', async () => {
    await bookmarks.insertBookmark(userId, 5, pool);
    expect(await bookmarks.insertBookmark(userId, 5, pool)).toBe(false);
    expect(await getBookmarkRows(userId)).toHaveLength(1);
  });

  it('lets two users bookmark the same supplier', async () => {
    await bookmarks.insertBookmark(userId, 5, pool);
    expect(await bookmarks.insertBookmark(otherUserId, 5, pool)).toBe(true);
  });
});

describe('listSupplierIds', () => {
  it('returns the user’s ids oldest first and nobody else’s', async () => {
    await bookmarks.insertBookmark(userId, 9, pool);
    await bookmarks.insertBookmark(userId, 3, pool);
    await bookmarks.insertBookmark(otherUserId, 4, pool);
    await bookmarks.insertBookmark(userId, 5, pool);
    expect(await bookmarks.listSupplierIds(userId)).toEqual([9, 3, 5]);
  });

  it('returns an empty list for a user with none', async () => {
    expect(await bookmarks.listSupplierIds(userId)).toEqual([]);
  });
});

describe('countBookmarks and bookmarkExists', () => {
  it('count only the given user’s rows', async () => {
    await bookmarks.insertBookmark(userId, 1, pool);
    await bookmarks.insertBookmark(userId, 2, pool);
    await bookmarks.insertBookmark(otherUserId, 1, pool);
    expect(await bookmarks.countBookmarks(userId)).toBe(2);
    expect(await bookmarks.bookmarkExists(userId, 2)).toBe(true);
    expect(await bookmarks.bookmarkExists(userId, 3)).toBe(false);
  });
});

describe('deleteBookmark', () => {
  it('removes the row once, then reports false', async () => {
    await bookmarks.insertBookmark(userId, 5, pool);
    expect(await bookmarks.deleteBookmark(userId, 5)).toBe(true);
    expect(await bookmarks.deleteBookmark(userId, 5)).toBe(false);
  });
});

describe('user deletion', () => {
  it('removes that user’s bookmarks', async () => {
    await bookmarks.insertBookmark(userId, 5, pool);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    expect(await getBookmarkRows(userId)).toEqual([]);
  });
});

describe('table constraints', () => {
  it('rejects a non-positive supplier id', async () => {
    await expect(bookmarks.insertBookmark(userId, 0, pool)).rejects.toThrow();
  });
});
