/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27.
 * Scope: Added a regression test for the persistent Supplier navigation bar.
 * Author review: Reviewed and approved by @ron.
 */
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthApi } from '../auth/authContext'
import { TopBar } from './TopBar'

const authenticatedAdmin: AuthApi = {
  status: 'loggedIn',
  user: { username: 'demo_admin', displayName: 'Demo Admin', role: 'ADMINISTRATOR' },
  notice: null,
  login: vi.fn(),
  logout: vi.fn(),
}

describe('TopBar', () => {
  it('remains visible at the top while the page scrolls', () => {
    render(
      <MemoryRouter>
        <AuthContext.Provider value={authenticatedAdmin}>
          <TopBar />
        </AuthContext.Provider>
      </MemoryRouter>,
    )

    expect(screen.getByRole('banner')).toHaveClass('sticky', 'top-0', 'z-50')
  })
})
