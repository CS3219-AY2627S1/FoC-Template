import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { login, logout, refreshSession } from './auth.api'
import { AuthProvider } from './AuthProvider'
import { clearAccessToken } from './auth.token'
import { useAuth } from './useAuth'

vi.mock('./auth.api', () => ({
  AuthApiError: class AuthApiError extends Error {
    status: number

    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  },
  login: vi.fn(),
  logout: vi.fn(),
  refreshSession: vi.fn(),
}))

const loginMock = vi.mocked(login)
const logoutMock = vi.mocked(logout)
const refreshSessionMock = vi.mocked(refreshSession)

function AuthProbe() {
  const { status, currentUserId, signIn, signOut } = useAuth()

  return (
    <div>
      <span>{status}</span>
      <span>{currentUserId ?? 'no-user'}</span>
      <button
        type="button"
        onClick={() => signIn({ email: 'student@u.nus.edu', password: 'password' })}
      >
        Test login
      </button>
      <button type="button" onClick={() => signOut()}>
        Test logout
      </button>
    </div>
  )
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    loginMock.mockReset()
    logoutMock.mockReset()
    refreshSessionMock.mockReset()
    clearAccessToken()
  })

  it('skips session restoration when mock authentication is enabled in development', () => {
    vi.stubEnv('VITE_MOCK_AUTH', 'true')

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    expect(screen.getByText('authenticated')).toBeInTheDocument()
    expect(refreshSessionMock).not.toHaveBeenCalled()
  })

  it('restores a browser session through the refresh cookie and logs out that session', async () => {
    refreshSessionMock.mockResolvedValue({
      accessToken: 'restored-token',
      tokenType: 'Bearer',
      expiresIn: 900,
    })
    logoutMock.mockResolvedValue()

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await screen.findByText('authenticated')
    fireEvent.click(screen.getByRole('button', { name: 'Test logout' }))

    await screen.findByText('unauthenticated')
    expect(logoutMock).toHaveBeenCalledWith('restored-token')
  })

  it('signs in after startup refresh finds no existing session', async () => {
    refreshSessionMock.mockRejectedValue(new Error('no refresh cookie'))
    loginMock.mockResolvedValue({
      accessToken: 'login-token',
      tokenType: 'Bearer',
      expiresIn: 900,
    })

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await screen.findByText('unauthenticated')
    fireEvent.click(screen.getByRole('button', { name: 'Test login' }))

    await waitFor(() => expect(screen.getByText('authenticated')).toBeInTheDocument())
    expect(loginMock).toHaveBeenCalledWith({
      email: 'student@u.nus.edu',
      password: 'password',
    })
  })
})
