import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserHeader } from './UserHeader'
import styles from './UserHeader.module.scss'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  logout: vi.fn(() => Promise.resolve()),
  name: 'Alex Tan',
  avatarUrl: null as string | null,
  roles: [] as Array<string>,
  pending: false,
  errorCode: null as string | null,
  balance: null as number | null,
}))

vi.mock('@tanstack/react-router', () => ({
  linkOptions: <T,>(options: T) => options,
  Link: ({
    children,
    onClick,
    to,
  }: {
    children: ReactNode
    onClick?: () => void
    to: string
  }) => (
    <a href={to} onClick={onClick}>
      {children}
    </a>
  ),
  useNavigate: () => mocks.navigate,
}))

vi.mock('../../hooks/useUserProfile', () => ({
  useUserProfile: () => ({
    data: { name: mocks.name, avatarUrl: mocks.avatarUrl },
  }),
}))

vi.mock('../../hooks/useSession', () => ({
  useSession: () => ({ userId: 'user-1', roles: mocks.roles }),
}))

vi.mock('../../providers/AuthProvider', () => ({
  useAuth: () => ({ logout: mocks.logout }),
}))

vi.mock('#/features/credits/hooks/useCreditBalance', () => ({
  useCreditBalance: () => ({
    isPending: mocks.pending,
    isError: mocks.balance == null && !mocks.pending,
    error: mocks.errorCode,
    data:
      mocks.balance == null ? undefined : { availableBalance: mocks.balance },
  }),
}))

beforeEach(() => {
  mocks.balance = 0
})

afterEach(() => {
  mocks.navigate.mockReset()
  mocks.logout.mockClear()
  mocks.name = 'Alex Tan'
  mocks.avatarUrl = null
  mocks.roles = []
  mocks.pending = false
  mocks.errorCode = null
  mocks.balance = 0
})

describe('UserHeader', () => {
  it('renders user navigation and preserves a zero credit balance', () => {
    render(<UserHeader />)

    const navigation = screen.getByRole('navigation', {
      name: 'Main navigation',
    })
    expect(
      within(navigation).getByRole('link', { name: 'Home' }),
    ).toHaveAttribute('href', '/home')
    expect(
      within(navigation).getByRole('link', { name: 'Map' }),
    ).toHaveAttribute('href', '/map')
    expect(
      within(navigation).getByRole('link', { name: 'My Errands' }),
    ).toHaveAttribute('href', '/errands')
    expect(screen.getByText('0 credits')).toBeInTheDocument()
    expect(screen.getByText('AT')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeDisabled()
  })

  it('renders floating map surfaces when requested', () => {
    render(<UserHeader floating />)

    expect(screen.getByRole('banner')).toHaveClass(styles.floating)
    expect(
      screen.getByRole('navigation', { name: 'Main navigation' }).parentElement,
    ).toHaveClass(styles.island)
  })

  it('opens the user menu with the keyboard and logs out', async () => {
    const user = userEvent.setup()
    render(<UserHeader />)
    const trigger = screen.getByRole('button', {
      name: 'Open account for Alex Tan',
    })

    trigger.focus()
    await user.keyboard('{Enter}')
    expect(
      screen.getByRole('menuitem', { name: 'Profile' }),
    ).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()

    await user.click(trigger)
    await user.click(await screen.findByRole('menuitem', { name: 'Log out' }))
    expect(mocks.logout).toHaveBeenCalledOnce()
  })

  it('opens and closes the mobile navigation', async () => {
    const user = userEvent.setup()
    render(<UserHeader />)
    const trigger = screen.getByRole('button', { name: 'Open menu' })

    await user.click(trigger)
    const navigation = screen.getByRole('navigation', {
      name: 'Mobile navigation',
    })
    const home = within(navigation).getByRole('link', { name: 'Home' })
    expect(home.querySelector('svg')).toBeInTheDocument()
    await user.click(home)
    expect(
      screen.queryByRole('navigation', { name: 'Mobile navigation' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.keyboard('{Escape}')
    expect(
      screen.queryByRole('navigation', { name: 'Mobile navigation' }),
    ).not.toBeInTheDocument()
  })

  it('falls back to initials when an avatar fails', () => {
    mocks.avatarUrl = '/first.png'
    const { container, rerender } = render(<UserHeader />)

    fireEvent.error(screen.getByAltText(''))
    expect(screen.getByText('AT')).toBeInTheDocument()
    mocks.avatarUrl = '/second.png'
    rerender(<UserHeader />)
    expect(container.querySelector('img')).toHaveAttribute('src', '/second.png')
  })
})
