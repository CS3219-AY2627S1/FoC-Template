import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Order, OrderTransition } from '../api/orderApi'
import { COURIER_ID, order, REQUESTER_ID, signIn, stubFetch } from '../test/fixtures'
import { EditErrandPage } from './EditErrandPage'

const ID = '3f2a9c4e-6b1d-4e8f-a7c3-5d9e0b1f2a64'
const PICKUP = { id: '9fd58f13-c8d5-4320-b757-7893d69a4ae0', name: 'Printers@PCCommons', building: 'PC Commons', floor: '1' }
const DROPOFF = { id: 'eb46dc78-e25e-4f07-a7a2-26bff615d170', name: 'PGP Foyer', building: 'PGP', floor: null }

function transition(action: string, orderVersion: number): OrderTransition {
  return {
    action,
    fromState: 'OPEN',
    toState: 'OPEN',
    actorRole: 'SYSTEM',
    actorId: null,
    courierId: null,
    reason: null,
    orderVersion,
    occurredAt: new Date().toISOString(),
  }
}

/** Serves the errand (successive reads after a save come from `reads`), its history and a PATCH answer. */
function api(options: {
  current?: Order
  patch?: { status?: number; body: unknown }
  reads?: Order[]
  history?: OrderTransition[]
  available?: number
}) {
  let read = 0
  let saved = false
  return stubFetch((url, init) => {
    if (url.startsWith('/api/suppliers')) return { body: { items: [PICKUP, DROPOFF], totalPages: 1 } }
    if (url.startsWith('/api/credits/me'))
      return { body: { availableBalance: options.available ?? 10, reservedBalance: 3 } }
    if (init?.method === 'PATCH') {
      saved = true
      return options.patch ?? { body: options.current ?? order() }
    }
    if (url.endsWith('/history')) return { body: options.history ?? [] }
    if (saved && options.reads) {
      const body = options.reads[Math.min(read, options.reads.length - 1)]
      read += 1
      return { body }
    }
    return { body: options.current ?? order({ creditReward: 3 }) }
  })
}

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[`/errands/${ID}/edit`]}>
        <Routes>
          <Route element={<EditErrandPage />} path="/errands/:orderId/edit" />
          <Route element={<h1>Errand page</h1>} path="/errands/:orderId" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('EditErrandPage', () => {
  beforeEach(() => signIn(REQUESTER_ID, 'REQUESTER'))
  afterEach(() => {
    sessionStorage.clear()
    vi.unstubAllGlobals()
  })

  it('fills the form and saves detail changes straight away', async () => {
    const saved = order({ creditReward: 3, title: 'Collect my lecture notes', version: 2 })
    const { fetchMock, calls } = api({ patch: { body: saved } })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderPage()

    const title = await screen.findByLabelText('Errand title')
    expect(title).toHaveValue('Collect my printed notes')
    expect(screen.getByLabelText('Reward (credits)')).toHaveValue(3)
    await user.clear(title)
    await user.type(title, 'Collect my lecture notes')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('heading', { name: 'Errand page' })).toBeInTheDocument()
    const patch = calls.find((call) => call.init?.method === 'PATCH')
    expect(patch?.url).toBe(`/api/orders/${ID}`)
    expect(JSON.parse(String(patch?.init?.body))).toMatchObject({
      version: 1,
      title: 'Collect my lecture notes',
      pickupLocationName: 'Printers@PCCommons',
      dropoffLocationName: 'PGP Foyer',
      creditReward: 3,
    })
  })

  it('waits for Credit to apply a reward change, then opens the errand', async () => {
    const pending = order({ creditReward: 3, pendingCreditReward: 5, version: 2 })
    vi.stubGlobal(
      'fetch',
      api({
        patch: { body: pending },
        reads: [pending, order({ creditReward: 5, version: 3 })],
        history: [transition('REWARD_CHANGE_APPLIED', 3)],
      }).fetchMock,
    )
    const user = userEvent.setup()
    renderPage()

    const reward = await screen.findByLabelText('Reward (credits)')
    await user.clear(reward)
    await user.type(reward, '5')
    expect(screen.getByText('Reserve 2 credits')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('button', { name: 'Updating your reward…' })).toBeDisabled()
    expect(await screen.findByRole('heading', { name: 'Errand page' }, { timeout: 4000 })).toBeInTheDocument()
  })

  it('stays on the form when Credit refuses the higher reward', async () => {
    const pending = order({ creditReward: 3, pendingCreditReward: 5, version: 2 })
    vi.stubGlobal(
      'fetch',
      api({
        patch: { body: pending },
        reads: [order({ creditReward: 3, version: 3 })],
        history: [transition('REWARD_CHANGE_REJECTED', 3)],
      }).fetchMock,
    )
    const user = userEvent.setup()
    renderPage()

    const reward = await screen.findByLabelText('Reward (credits)')
    await user.clear(reward)
    await user.type(reward, '5')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "You don't have enough credits for a reward of 5, so it stays at 3.",
    )
    expect(screen.queryByRole('heading', { name: 'Errand page' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
  })

  it('blocks raising the reward beyond the available credits', async () => {
    vi.stubGlobal('fetch', api({ available: 1 }).fetchMock)
    const user = userEvent.setup()
    renderPage()

    const reward = await screen.findByLabelText('Reward (credits)')
    await waitFor(() => expect(screen.getByText('1 credit')).toBeInTheDocument())
    await user.clear(reward)
    await user.type(reward, '5')

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent("You don't have enough credits for 5. Choose 4 or less.")
  })

  it('explains an errand accepted while editing, and offers a reload', async () => {
    vi.stubGlobal(
      'fetch',
      api({ patch: { status: 409, body: { code: 'INVALID_STATE_TRANSITION', currentState: 'ACCEPTED' } } }).fetchMock,
    )
    const user = userEvent.setup()
    renderPage()

    await screen.findByLabelText('Errand title')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('no longer open')
    expect(screen.getByRole('button', { name: 'Reload errand' })).toBeInTheDocument()
    expect(screen.getByLabelText('Errand title')).toBeDisabled()
  })

  it('explains an edit made elsewhere (version conflict)', async () => {
    vi.stubGlobal('fetch', api({ patch: { status: 409, body: { code: 'VERSION_CONFLICT', currentVersion: 4 } } }).fetchMock)
    const user = userEvent.setup()
    renderPage()

    await screen.findByLabelText('Errand title')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('was just updated')
  })

  it('hands over after 30 seconds while the reward change is still pending', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const pending = order({ creditReward: 3, pendingCreditReward: 5, version: 2 })
      vi.stubGlobal('fetch', api({ patch: { body: pending }, reads: [pending] }).fetchMock)
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      renderPage()

      const reward = await screen.findByLabelText('Reward (credits)')
      await user.clear(reward)
      await user.type(reward, '5')
      await user.click(screen.getByRole('button', { name: 'Save changes' }))
      await screen.findByRole('button', { name: 'Updating your reward…' })

      await act(() => vi.advanceTimersByTimeAsync(30_000))

      expect(await screen.findByText(/Credit is taking longer than usual/)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'View errand' })).toHaveAttribute('href', `/errands/${ID}`)
    } finally {
      vi.useRealTimers()
    }
  })

  it("won't edit an errand that is no longer open", async () => {
    vi.stubGlobal('fetch', api({ current: order({ state: 'ACCEPTED', courierId: COURIER_ID }) }).fetchMock)
    renderPage()

    expect(await screen.findByRole('heading', { name: 'This errand can’t be edited' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Errand title')).not.toBeInTheDocument()
  })
})
