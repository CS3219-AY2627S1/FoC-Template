/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-14
 * Scope (AI-15): Implemented and tested the requested create-account UI.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { register } from '../features/auth/auth.api'
import { RegisterPage } from './RegisterPage'

vi.mock('../features/auth/auth.api', () => ({
  register: vi.fn(),
}))

const registerMock = vi.mocked(register)

function LoginDestination() {
  const location = useLocation()
  const registrationComplete = (location.state as { registrationComplete?: boolean } | null)
    ?.registrationComplete

  return <p>{registrationComplete ? 'Registration complete' : 'Registration state missing'}</p>
}

function renderRegisterPage() {
  render(
    <MemoryRouter initialEntries={['/register']}>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginDestination />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RegisterPage', () => {
  beforeEach(() => {
    registerMock.mockReset()
  })

  it('submits the backlog registration fields and returns to login', async () => {
    registerMock.mockResolvedValue()
    renderRegisterPage()

    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: '  Alex Tan  ' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'NUS email' }), {
      target: { value: '  alex@u.nus.edu  ' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'CampusCouriers123!' },
    })
    fireEvent.submit(screen.getByRole('button', { name: 'Create account' }).closest('form')!)

    await waitFor(() =>
      expect(registerMock).toHaveBeenCalledWith({
        name: 'Alex Tan',
        email: 'alex@u.nus.edu',
        password: 'CampusCouriers123!',
      }),
    )
    expect(await screen.findByText('Registration complete')).toBeInTheDocument()
  })

  it('shows registration errors without leaving the page', async () => {
    registerMock.mockRejectedValue(new Error('An account already exists for this email.'))
    renderRegisterPage()

    fireEvent.submit(screen.getByRole('button', { name: 'Create account' }).closest('form')!)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An account already exists for this email.',
    )
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument()
  })
})
