/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Scope: Implementation, refactoring, and test assistance for the recorded frontend work.
 */
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { RequireAdmin } from './AuthRoutes'
import { useAuth } from './useAuth'

vi.mock('./useAuth', () => ({ useAuth: vi.fn() }))

describe('RequireAdmin', () => {
  it('shows an unauthorized page without changing the requested URL', () => {
    vi.mocked(useAuth).mockReturnValue({
      status: 'authenticated', currentUserId: 'student', currentUserType: 'Student',
      signIn: vi.fn(), signOut: vi.fn(),
    })
    render(<MemoryRouter initialEntries={['/admin']}><Routes>
      <Route element={<RequireAdmin />}><Route path="admin" element={<p>Admin content</p>} /></Route>
    </Routes></MemoryRouter>)
    expect(screen.queryByText('403')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Administrator access required' })).toBeInTheDocument()
    expect(screen.queryByText('Admin content')).not.toBeInTheDocument()
  })
})
