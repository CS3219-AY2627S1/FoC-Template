// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5-5), date: 2026-11-05
// Scope: Bookmarks service (20-per-user cap, repeat-safe add and remove), per the 2026-11-05
//        supplier-bookmarking spec. No requirements, architecture, schema, or API decisions were
//        made by the AI tool.
// Author review:

import { withTransaction } from "../db/transaction.js";
import * as queries from "../db/queries/bookmarks.queries.js";
import { AppError } from "../utils/AppError.js";

export const MAX_BOOKMARKS = 20;
export const BOOKMARK_LIMIT_MESSAGE =
  "You can bookmark up to 20 suppliers. Remove one before adding another.";

export async function listBookmarks(userId: string): Promise<{ supplier_ids: number[] }> {
  return { supplier_ids: await queries.listSupplierIds(userId) };
}

export async function addBookmark(
  userId: string,
  supplierId: number,
): Promise<{ message: string; code: string }> {
  await withTransaction(async (client) => {
    // Serialise adds for this user so the count below cannot go stale.
    await queries.lockUser(userId, client);
    // A repeat of a saved supplier succeeds even at the limit.
    if (await queries.bookmarkExists(userId, supplierId, client)) return;
    if ((await queries.countBookmarks(userId, client)) >= MAX_BOOKMARKS) {
      throw new AppError(422, BOOKMARK_LIMIT_MESSAGE, "BOOKMARK_LIMIT_REACHED");
    }
    await queries.insertBookmark(userId, supplierId, client);
  });
  return { message: "Supplier bookmarked", code: "BOOKMARK_ADDED" };
}

export const BOOKMARK_REMOVED_RESPONSE = {
  message: "Bookmark removed",
  code: "BOOKMARK_REMOVED",
};

export async function removeBookmark(
  userId: string,
  supplierId: number,
): Promise<{ message: string; code: string }> {
  await queries.deleteBookmark(userId, supplierId);
  return BOOKMARK_REMOVED_RESPONSE;
}
