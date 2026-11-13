import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { navigateTo } from '../navigation'
import { saveSession } from '../auth/session'
import { COURIER_ID, REQUESTER_ID, signIn } from '../test/fixtures'
import { ErrandTabs } from './ErrandTabs'
import { OrderShell } from './OrderShell'

vi.mock('../navigation', () => ({
  navigateTo: vi.fn(),
  signInPath: () => '/?returnTo=%2Ferrands',
}))
vi.mock('./NotificationBell', () => ({
  NotificationBell: () => <span data-testid="notification-bell" />,
}))
vi.mock('./NotificationPush', () => ({ NotificationPush: () => null }))

describe('OrderShell', () => {
  afterEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })
  it('shows only administrator destinations in Admin mode', () => {
    signIn(REQUESTER_ID, 'REQUESTER')
    const session = JSON.parse(sessionStorage.getItem('foc.user-session')!)
    session.role = 'ADMIN'
    sessionStorage.setItem('foc.user-session', JSON.stringify(session))
    render(<OrderShell>content</OrderShell>)
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Admin', 'Suppliers'])
    expect(within(nav).queryByRole('link', { name: 'Home' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Friend on Campus' })).toHaveAttribute(
      'href',
      '/admin',
    )
    expect(
      within(nav).queryByRole('link', { name: 'Errands' }),
    ).not.toBeInTheDocument()
    expect(
      within(nav).queryByRole('link', { name: 'Credits' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByTestId('notification-bell')).not.toBeInTheDocument()
  })

  it('uses the same main navigation as the User, Supplier and Credit headers, plus Errands', () => {
    signIn(REQUESTER_ID, 'REQUESTER')
    render(<OrderShell>content</OrderShell>)

    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Home', 'Errands', 'Suppliers', 'Credits'])
    expect(within(nav).getByRole('link', { name: 'Errands' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByRole('link', { name: 'Errands' })).toHaveAttribute(
      'href',
      '/errands/mine',
    )
  })

  it('opens the Admin home after a successful account-menu switch', async () => {
    saveSession({
      accessToken: 'requester-token',
      tokenType: 'Bearer',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      userId: REQUESTER_ID,
      username: 'Alex',
      role: 'REQUESTER',
      availableRoles: ['REQUESTER', 'ADMIN'],
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            accessToken: 'admin-token',
            tokenType: 'Bearer',
            expiresAt: new Date(Date.now() + 600_000).toISOString(),
            userId: REQUESTER_ID,
            username: 'Alex',
            role: 'ADMIN',
            availableRoles: ['REQUESTER', 'ADMIN'],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )
    const user = userEvent.setup()
    render(<OrderShell>content</OrderShell>)

    await user.click(screen.getByLabelText('Open account menu for Alex'))
    await user.click(screen.getByRole('button', { name: 'Switch to Admin' }))

    await waitFor(() => expect(navigateTo).toHaveBeenCalledWith('/admin'))
    expect(screen.queryByTestId('notification-bell')).not.toBeInTheDocument()
  })
})

describe('ErrandTabs', () => {
  afterEach(() => sessionStorage.clear())

  const tabs = (path: string) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <ErrandTabs />
      </MemoryRouter>,
    )
    return within(screen.getByRole('navigation', { name: /Errands/i }))
  }

  it('shows Request help and My errands to a requester, marking the current one', () => {
    signIn(REQUESTER_ID, 'REQUESTER')
    const nav = tabs('/errands/mine')

    expect(
      nav
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['Request help', '/errands/new'],
      ['My errands', '/errands/mine'],
    ])
    expect(nav.getByRole('link', { name: 'My errands' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(nav.getByRole('link', { name: 'Request help' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('shows route-backed open and past tabs to a courier', () => {
    signIn(COURIER_ID, 'COURIER')
    const nav = tabs('/errands/browse')

    expect(
      nav
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['Open requests', '/errands/browse'],
      ['Past errands', '/errands/mine'],
    ])
    expect(nav.getByRole('link', { name: 'Open requests' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})
