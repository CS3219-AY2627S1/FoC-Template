/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-14
 * Scope (AI-15): Implemented and tested the requested create-account UI.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Scope: Implementation, refactoring, and test assistance for the recorded frontend work.
 */
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../features/auth/auth.context'
import { LoginPage } from './LoginPage'

describe('LoginPage', () => {
  it('links to account registration and confirms completed registration', () => {
    render(
      <AuthContext.Provider
        value={{
          status: 'unauthenticated',
          currentUserId: null,
          currentUserType: null,
          signIn: vi.fn(),
          signOut: vi.fn(),
        }}
      >
        <MemoryRouter
          initialEntries={[{ pathname: '/login', state: { registrationComplete: true } }]}
        >
          <LoginPage />
        </MemoryRouter>
      </AuthContext.Provider>,
    )

    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/register',
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Account created. Sign in with your new credentials.',
    )
  })
})
