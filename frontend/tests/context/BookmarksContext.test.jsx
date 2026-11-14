/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-05
 * Scope: Tests for BookmarksProvider, per the 2026-11-05 supplier-bookmarking spec.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BookmarksProvider, useBookmarks } from '../../src/context/BookmarksContext'
import { addBookmark, listBookmarks, removeBookmark } from '../../src/api/bookmarks'

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }))

vi.mock('../../src/api/bookmarks', () => ({
  listBookmarks: vi.fn(),
  addBookmark: vi.fn(),
  removeBookmark: vi.fn(),
}))
vi.mock('../../src/components/Toast', () => ({ useToast: () => ({ showToast }) }))

let auth
vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => auth }))

let latest
function Probe() {
  latest = useBookmarks()
  return (
    <div>
      <span data-testid="ids">{latest.ids.join(',')}</span>
      <span data-testid="ready">{String(latest.ready)}</span>
      <button onClick={() => latest.toggle(7)}>toggle7</button>
    </div>
  )
}

const mount = () =>
  render(
    <BookmarksProvider>
      <Probe />
    </BookmarksProvider>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  auth = { isLoggedIn: true, sessionReady: true }
  listBookmarks.mockResolvedValue({ supplier_ids: [3, 5] })
  addBookmark.mockResolvedValue({ code: 'BOOKMARK_ADDED' })
  removeBookmark.mockResolvedValue({ code: 'BOOKMARK_REMOVED' })
})

describe('BookmarksProvider', () => {
  it('loads the user’s ids once logged in, then reports ready', async () => {
    mount()
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))
    expect(screen.getByTestId('ids')).toHaveTextContent('3,5')
    expect(latest.isBookmarked(3)).toBe(true)
    expect(latest.isBookmarked(4)).toBe(false)
  })

  it('stays empty and ready, without a request, when logged out', async () => {
    auth = { isLoggedIn: false, sessionReady: true }
    mount()
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))
    expect(listBookmarks).not.toHaveBeenCalled()
    expect(screen.getByTestId('ids')).toHaveTextContent('')
  })

  it('toggle adds an unsaved supplier, then removes it on the next click', async () => {
    mount()
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))

    fireEvent.click(screen.getByText('toggle7'))
    await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('3,5,7'))
    expect(addBookmark).toHaveBeenCalledWith(7)

    fireEvent.click(screen.getByText('toggle7'))
    await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('3,5'))
    expect(removeBookmark).toHaveBeenCalledWith(7)
  })

  it('shows the server message and keeps the ids when an add is refused', async () => {
    addBookmark.mockRejectedValueOnce(
      new Error('You can bookmark up to 20 suppliers. Remove one before adding another.'),
    )
    mount()
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))

    fireEvent.click(screen.getByText('toggle7'))

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        'You can bookmark up to 20 suppliers. Remove one before adding another.',
        'error',
      ),
    )
    expect(screen.getByTestId('ids')).toHaveTextContent('3,5')
  })

  it('pruneDeleted removes deleted and invalid entries and keeps hidden ones', async () => {
    mount()
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))

    await act(async () => {
      await latest.pruneDeleted([
        { id: 3, status: 'deleted' },
        { id: 5, status: 'hidden' },
        { id: 'abc', status: 'invalid' },
      ])
    })

    expect(removeBookmark).toHaveBeenCalledTimes(2)
    expect(removeBookmark).toHaveBeenCalledWith(3)
    expect(removeBookmark).toHaveBeenCalledWith('abc')
    expect(screen.getByTestId('ids')).toHaveTextContent('5')
  })

  it('pruneDeleted keeps a bookmark whose removal failed', async () => {
    removeBookmark.mockRejectedValueOnce(new Error('boom'))
    mount()
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))

    await act(async () => {
      await latest.pruneDeleted([{ id: 3, status: 'deleted' }])
    })

    expect(screen.getByTestId('ids')).toHaveTextContent('3,5')
  })
})
