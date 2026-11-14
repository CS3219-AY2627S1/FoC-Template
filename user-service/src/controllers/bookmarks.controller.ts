// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5-5), date: 2026-11-05
// Scope: Controller for GET/PUT/DELETE /users/me/bookmarks, per the 2026-11-05
//        supplier-bookmarking spec. No requirements, architecture, schema, or API decisions were
//        made by the AI tool.
// Author review:

import { z } from 'zod';
import * as bookmarksService from '../services/bookmarks.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// The Supplier Service ids are integers; 2147483647 is the largest the column can hold.
const supplierIdParams = z.object({
  supplierId: z
    .string()
    .refine(
      (value) => /^[1-9]\d{0,9}$/.test(value) && Number(value) <= 2147483647,
      'Supplier id must be a positive whole number',
    )
    .transform(Number),
});

export const list = asyncHandler(async (req, res) => {
  // authenticate has run, so req.user is set. The id never comes from the request.
  res.status(200).json(await bookmarksService.listBookmarks(req.user!.user_id));
});

export const add = asyncHandler(async (req, res) => {
  const { supplierId } = supplierIdParams.parse(req.params);
  res.status(200).json(await bookmarksService.addBookmark(req.user!.user_id, supplierId));
});

export const remove = asyncHandler(async (req, res) => {
  const parsed = supplierIdParams.safeParse(req.params);
  // A malformed id can never have been bookmarked, so there is nothing to remove and the call must
  // not fail (spec B23): the frontend uses this to drop records the Supplier Service called invalid.
  if (!parsed.success) {
    res.status(200).json(bookmarksService.BOOKMARK_REMOVED_RESPONSE);
    return;
  }
  res.status(200).json(await bookmarksService.removeBookmark(req.user!.user_id, parsed.data.supplierId));
});
