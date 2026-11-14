/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-05
 * Scope: Tests for the SupplierCard bookmark icon, per the 2026-11-05 supplier-bookmarking spec.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SupplierCard from '../../src/components/SupplierCard'

const toggle = vi.fn()
const requireAuth = vi.fn((_message, callback) => callback())
let bookmarkedIds

vi.mock('../../src/context/BookmarksContext', () => ({
  useBookmarks: () => ({ isBookmarked: (id) => bookmarkedIds.includes(id), toggle }),
}))
vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ requireAuth }) }))

const supplier = {
  id: 5,
  name: 'Frontier',
  faculty: 'Computing',
  isOpen: true,
  categories: [],
  photos: [],
}

const renderCard = () =>
  render(
    <MemoryRouter>
      <SupplierCard supplier={supplier} showAction={false} />
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  bookmarkedIds = []
})

describe('SupplierCard bookmark icon', () => {
  it('shows an unpressed icon for a supplier that is not bookmarked and toggles it on click', () => {
    renderCard()
    const button = screen.getByRole('button', { name: 'Bookmark this place' })
    expect(button).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(button)

    expect(toggle).toHaveBeenCalledWith(5)
  })

  it('shows a pressed icon for a bookmarked supplier and toggles it on click', () => {
    bookmarkedIds = [5]
    renderCard()
    const button = screen.getByRole('button', { name: 'Remove bookmark' })
    expect(button).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(button)

    expect(toggle).toHaveBeenCalledWith(5)
  })

  it('asks a logged-out visitor to sign in instead of toggling', () => {
    requireAuth.mockImplementationOnce(() => {})
    renderCard()

    fireEvent.click(screen.getByRole('button', { name: 'Bookmark this place' }))

    expect(requireAuth).toHaveBeenCalledWith('You need an account to bookmark a supplier.', expect.any(Function))
    expect(toggle).not.toHaveBeenCalled()
  })
})
