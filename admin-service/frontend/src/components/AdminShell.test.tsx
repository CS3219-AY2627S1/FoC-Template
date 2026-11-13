import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AdminShell } from './AdminShell'
import { saveSession, expireSession, type WorkspaceRole } from '../auth/session'

vi.mock('./NotificationBell', () => ({ NotificationBell: () => null }))
vi.mock('./NotificationPush', () => ({ NotificationPush: () => null }))
vi.mock('../navigation', () => ({ navigateTo: vi.fn() }))

function session(role: WorkspaceRole, adminEligible = false) {
  saveSession({
    accessToken: 'signed-token',
    tokenType: 'Bearer',
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    userId: 'participant',
    username: 'xueting',
    role,
    availableRoles: adminEligible
      ? ['REQUESTER', 'COURIER', 'ADMIN']
      : ['REQUESTER', 'COURIER'],
  })
}

afterEach(() => {
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
})

it('preserves the participant report destination in the header sign-in link', () => {
  window.history.replaceState(
    null,
    '',
    '/admin/reports/new?orderId=test-errand',
  )
  render(<AdminShell administratorAccess={false}>Report</AdminShell>)
  expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
    'href',
    '/?returnTo=%2Fadmin%2Freports%2Fnew%3ForderId%3Dtest-errand',
  )
})

it.each(['REQUESTER', 'COURIER'] as const)(
  'hides admin navigation on reports in %s mode',
  (role) => {
    session(role)
    window.history.replaceState(null, '', '/admin/reports/test-case')
    render(<AdminShell administratorAccess={false}>Your report</AdminShell>)
    expect(
      screen.queryByRole('link', { name: 'Admin' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Manage users' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Switch to Admin' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Suppliers' })).toHaveAttribute(
      'href',
      '/suppliers',
    )
    expect(
      screen.getByRole('button', {
        name: role === 'COURIER' ? 'Courier' : 'Requester',
      }),
    ).toHaveAttribute('aria-pressed', 'true')
  },
)

it('shows Admin only in active Admin mode and removes it when the session ends', () => {
  session('REQUESTER', true)
  render(<AdminShell administratorAccess={false}>Report</AdminShell>)
  expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
  act(() => session('ADMIN', true))
  expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute(
    'href',
    '/admin',
  )
  const adminNav = screen.getByRole('navigation', { name: 'Main navigation' })
  expect(screen.queryByRole('link', { name: 'Errands' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Credits' })).not.toBeInTheDocument()
  expect(
    Array.from(adminNav.querySelectorAll('a')).map((link) => link.textContent),
  ).toEqual(['Admin', 'Suppliers'])
  expect(screen.queryByRole('link', { name: 'Home' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Friend on Campus' })).toHaveAttribute(
    'href',
    '/admin',
  )
  act(() => session('COURIER', true))
  expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
  act(() => session('ADMIN', true))
  act(() => expireSession())
  expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
})
