/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-05
 * Scope: Tests for the bookmark API calls, per the 2026-11-05 supplier-bookmarking spec.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/api/http', () => ({ request: vi.fn() }))

import { request } from '../../src/api/http'
import { addBookmark, listBookmarks, removeBookmark } from '../../src/api/bookmarks'

beforeEach(() => request.mockReset())

describe('bookmark calls', () => {
  it('listBookmarks calls GET /users/me/bookmarks and returns the body', async () => {
    request.mockResolvedValueOnce({ supplier_ids: [3, 7] })
    expect(await listBookmarks()).toEqual({ supplier_ids: [3, 7] })
    expect(request).toHaveBeenCalledWith('/users/me/bookmarks')
  })

  it('addBookmark calls PUT /users/me/bookmarks/:id', async () => {
    request.mockResolvedValueOnce({ code: 'BOOKMARK_ADDED' })
    await addBookmark(7)
    expect(request).toHaveBeenCalledWith('/users/me/bookmarks/7', { method: 'PUT' })
  })

  it('removeBookmark calls DELETE /users/me/bookmarks/:id', async () => {
    request.mockResolvedValueOnce({ code: 'BOOKMARK_REMOVED' })
    await removeBookmark(7)
    expect(request).toHaveBeenCalledWith('/users/me/bookmarks/7', { method: 'DELETE' })
  })
})
