/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Tests for Home.jsx (the "/" route), created for instructions.md Stage 22's "/ (home)"
 *        row and its "Watch for" note (must not redirect until session restore has finished).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import Home from '../../src/pages/Home'

const mockUseAuth = vi.fn()
vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<p>Login page</p>} />
        <Route path="/suppliers" element={<p>Suppliers page</p>} />
        <Route path="/requests" element={<p>Find errands page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Home', () => {
  it('redirects nowhere (renders nothing) while the session is still restoring', () => {
    mockUseAuth.mockReturnValue({ status: 'loading', isLoggedIn: false, user: null })
    const { container } = renderHome()
    expect(container).toBeEmptyDOMElement()
  })

  it('redirects a logged-out visitor to /login', () => {
    mockUseAuth.mockReturnValue({ status: 'anonymous', isLoggedIn: false, user: null })
    renderHome()
    expect(screen.getByText('Login page')).toBeInTheDocument()
  })

  it('redirects a logged-in requester to /suppliers', () => {
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      isLoggedIn: true,
      user: { activeView: 'requester' },
    })
    renderHome()
    expect(screen.getByText('Suppliers page')).toBeInTheDocument()
  })

  it('redirects a logged-in courier to /requests', () => {
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      isLoggedIn: true,
      user: { activeView: 'courier' },
    })
    renderHome()
    expect(screen.getByText('Find errands page')).toBeInTheDocument()
  })
})
