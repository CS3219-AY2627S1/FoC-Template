import { act, render, screen, within } from '@testing-library/react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { describe, expect, it, vi } from 'vitest'
import { AccountLayout } from './AccountLayout'

vi.mock('../../hooks/useUserProfile', () => ({
  useUserProfile: () => ({ data: { name: 'Alex Tan', avatarUrl: null } }),
}))

vi.mock('../../hooks/useSession', () => ({
  useSession: () => ({ userId: 'user-1', roles: [] }),
}))

vi.mock('../../providers/AuthProvider', () => ({
  useAuth: () => ({ logout: vi.fn() }),
}))

vi.mock('#/features/credits/hooks/useCreditBalance', () => ({
  useCreditBalance: () => ({
    isPending: false,
    isError: false,
    error: null,
    data: { availableBalance: 15 },
  }),
}))

describe('AccountLayout', () => {
  it('keeps one account header while child routes change', async () => {
    const root = createRootRoute()
    const layout = createRoute({
      getParentRoute: () => root,
      id: 'account',
      component: AccountLayout,
    })
    const requester = createRoute({
      getParentRoute: () => layout,
      path: '/requester',
      component: () => <h1>What do you need?</h1>,
    })
    const courier = createRoute({
      getParentRoute: () => layout,
      path: '/courier',
      component: () => <h1>Find an errand</h1>,
    })
    const home = createRoute({
      getParentRoute: () => layout,
      path: '/home',
      component: () => null,
    })
    const map = createRoute({
      getParentRoute: () => layout,
      path: '/map',
      component: () => null,
    })
    const errands = createRoute({
      getParentRoute: () => layout,
      path: '/errands',
      component: () => null,
    })
    const router = createRouter({
      routeTree: root.addChildren([
        layout.addChildren([requester, courier, home, map, errands]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/requester'] }),
    })

    render(<RouterProvider router={router} />)
    await screen.findByRole('heading', { name: 'What do you need?' })
    const header = screen.getByRole('banner')
    expect(within(header).getByText('Alex Tan')).toBeInTheDocument()

    await act(async () => {
      router.history.push('/courier')
      await router.load()
    })

    expect(
      await screen.findByRole('heading', { name: 'Find an errand' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBe(header)
    expect(within(header).getByText('15 credits')).toBeInTheDocument()
    expect(screen.getAllByRole('main')).toHaveLength(1)
  })
})
