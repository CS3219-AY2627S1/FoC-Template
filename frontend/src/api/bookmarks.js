/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-05
 * Scope: Calls for the user-service bookmark endpoints, per the 2026-11-05 supplier-bookmarking
 *        spec. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { request } from './http'

// 200 { supplier_ids: [3, 7, 12] }
export const listBookmarks = () => request('/users/me/bookmarks')

// 200 { message, code: 'BOOKMARK_ADDED' }; 422 { message, code: 'BOOKMARK_LIMIT_REACHED' } on the
// 21st (the message is written for the user).
export const addBookmark = (supplierId) =>
  request('/users/me/bookmarks/' + supplierId, { method: 'PUT' })

// 200 { message, code: 'BOOKMARK_REMOVED' }, also when the supplier was not bookmarked.
export const removeBookmark = (supplierId) =>
  request('/users/me/bookmarks/' + supplierId, { method: 'DELETE' })
