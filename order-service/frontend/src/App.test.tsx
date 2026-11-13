import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppRoutes } from './App'
import { saveSession, sessionKey } from './auth/session'

function signIn(role: 'REQUESTER' | 'COURIER' = 'COURIER') {
  sessionStorage.setItem(
    sessionKey,
    JSON.stringify({
      accessToken: 'token',
      tokenType: 'Bearer',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      userId: '5b0f3c1e-8a52-4f8e-9d37-2c1b6e4a7f10',
      username: 'Alex',
      role,
      availableRoles: ['REQUESTER', 'COURIER'],
    }),
  )
}

describe('AppRoutes', () => {
  afterEach(() => {
    sessionStorage.clear()
    vi.unstubAllGlobals()
  })

  it('asks a signed-out visitor to sign in', () => {
    render(
      <MemoryRouter initialEntries={['/errands/browse']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('heading', { name: 'Sign in to see errands' }),
    ).toBeInTheDocument()
  })

  function renderAt(path: string) {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  it("sends /errands to each role's own screen", () => {
    signIn('COURIER')
    renderAt('/errands')
    expect(
      screen.getByRole('heading', { name: 'Campus errands' }),
    ).toBeInTheDocument()
  })

  it('sends a requester to their errand history', () => {
    signIn('REQUESTER')
    renderAt('/errands')
    expect(
      screen.getByRole('heading', { name: 'My errands' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Create new errand' }),
    ).toHaveAttribute('href', '/errands/new')
  })

  it("keeps each role off the other role's screen", () => {
    signIn('REQUESTER')
    renderAt('/errands/browse')
    expect(
      screen.getByRole('heading', { name: 'My errands' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Campus errands' }),
    ).not.toBeInTheDocument()
  })

  it('moves to the new role’s screen when the header toggle switches role', () => {
    signIn('REQUESTER')
    renderAt('/errands/new')
    expect(
      screen.getByRole('heading', { name: 'Create a campus errand' }),
    ).toBeInTheDocument()

    act(() => {
      saveSession({
        accessToken: 'courier-token',
        tokenType: 'Bearer',
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        userId: '5b0f3c1e-8a52-4f8e-9d37-2c1b6e4a7f10',
        username: 'Alex',
        role: 'COURIER',
        availableRoles: ['REQUESTER', 'COURIER'],
      })
    })

    expect(
      screen.getByRole('heading', { name: 'Campus errands' }),
    ).toBeInTheDocument()
  })
})
