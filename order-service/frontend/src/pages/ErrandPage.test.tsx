import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Order } from '../api/orderApi'
import { sessionChangedEvent } from '../auth/session'
import {
  COURIER_ID,
  order,
  REQUESTER_ID,
  signIn,
  STRANGER_ID,
  stubFetch,
} from '../test/fixtures'
import { ErrandPage } from './ErrandPage'

const ORDER_URL = '/api/orders/3f2a9c4e-6b1d-4e8f-a7c3-5d9e0b1f2a64'

/** Serves `current` for GET and applies `next` for a POST action (or a problem). */
function serve(
  current: Order,
  onAction?: (action: string) => { status?: number; body: unknown },
) {
  return stubFetch((url, init) => {
    if (url.startsWith('/api/admin/orders/'))
      return {
        body: {
          orderId: current.id,
          status: 'ELIGIBLE',
          caseId: null,
          state: null,
        },
      }
    if (init?.method === 'POST' && onAction)
      return onAction(url.split('/').at(-1) ?? '')
    return { body: current }
  })
}

function renderErrand() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter
        initialEntries={['/errands/3f2a9c4e-6b1d-4e8f-a7c3-5d9e0b1f2a64']}
      >
        <Routes>
          <Route element={<ErrandPage />} path="/errands/:orderId" />
          <Route element={<h1>Request help</h1>} path="/errands/new" />
          <Route element={<h1>My errands</h1>} path="/errands/mine" />
          <Route element={<h1>Run errands</h1>} path="/errands/browse" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ErrandPage', () => {
  afterEach(() => {
    sessionStorage.clear()
    vi.unstubAllGlobals()
  })

  describe('for a courier browsing an open errand (Errand details)', () => {
    it('shows the reward card and asks for confirmation before accepting (F5.1.1, F5.1.2)', async () => {
      signIn(STRANGER_ID, 'COURIER')
      const { fetchMock, calls } = serve(order(), () => ({
        body: order({ state: 'ACCEPTED', courierId: STRANGER_ID }),
      }))
      vi.stubGlobal('fetch', fetchMock)
      const user = userEvent.setup()
      renderErrand()

      expect(
        await screen.findByRole('heading', {
          name: 'Collect my printed notes',
        }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('heading', { name: 'Earn 18 credits' }),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('heading', { name: 'Need help with this errand?' }),
      ).not.toBeInTheDocument()
      expect(
        calls.some((call) => call.url.startsWith('/api/admin/orders/')),
      ).toBe(false)

      await user.click(screen.getByRole('button', { name: 'Accept errand' }))
      const dialog = screen.getByRole('dialog', { name: 'Accept this errand?' })
      expect(calls.filter((call) => call.init?.method === 'POST')).toHaveLength(
        0,
      )

      await user.click(
        within(dialog).getByRole('button', { name: 'Accept errand' }),
      )
      expect(
        await screen.findByRole('heading', { name: "You're the courier" }),
      ).toBeInTheDocument()
      expect(calls.find((call) => call.init?.method === 'POST')?.url).toBe(
        `${ORDER_URL}/accept`,
      )
      expect(
        await screen.findByRole('link', { name: 'Report an issue' }),
      ).toBeInTheDocument()
    })

    it('cancelling the popup does not accept', async () => {
      signIn(STRANGER_ID, 'COURIER')
      const { fetchMock, calls } = serve(order())
      vi.stubGlobal('fetch', fetchMock)
      const user = userEvent.setup()
      renderErrand()

      await user.click(
        await screen.findByRole('button', { name: 'Accept errand' }),
      )
      await user.click(screen.getByRole('button', { name: 'Not now' }))

      expect(calls.filter((call) => call.init?.method === 'POST')).toHaveLength(
        0,
      )
    })

    it('explains losing an acceptance race (F5.3.1) and shows the latest state', async () => {
      signIn(STRANGER_ID, 'COURIER')
      const taken = order({ state: 'ACCEPTED', courierId: COURIER_ID })
      let accepted = false
      const fetchMock = stubFetch((_url, init) => {
        if (_url.startsWith('/api/admin/orders/'))
          return {
            body: {
              orderId: order().id,
              status: 'INELIGIBLE',
              caseId: null,
              state: null,
            },
          }
        if (init?.method === 'POST') {
          accepted = true
          return {
            status: 409,
            body: {
              detail: 'taken',
              code: 'ORDER_ALREADY_ACCEPTED',
              currentState: 'ACCEPTED',
            },
          }
        }
        return { body: accepted ? taken : order() }
      }).fetchMock
      vi.stubGlobal('fetch', fetchMock)
      const user = userEvent.setup()
      renderErrand()

      await user.click(
        await screen.findByRole('button', { name: 'Accept errand' }),
      )
      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', {
          name: 'Accept errand',
        }),
      )

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Another courier accepted this errand first.',
      )
    })

    it('explains an errand that expired before acceptance (F5.4.2)', async () => {
      signIn(STRANGER_ID, 'COURIER')
      vi.stubGlobal(
        'fetch',
        serve(order(), () => ({
          status: 409,
          body: { detail: 'x', code: 'ORDER_EXPIRED', currentState: 'EXPIRED' },
        })).fetchMock,
      )
      const user = userEvent.setup()
      renderErrand()

      await user.click(
        await screen.findByRole('button', { name: 'Accept errand' }),
      )
      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', {
          name: 'Accept errand',
        }),
      )

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'expired before it could be accepted',
      )
    })
  })

  describe('for the assigned courier (Courier active order)', () => {
    it('offers pickup, then delivery', async () => {
      signIn(COURIER_ID, 'COURIER')
      let current = order({ state: 'ACCEPTED', courierId: COURIER_ID })
      const { fetchMock, calls } = stubFetch((url, init) => {
        if (init?.method === 'POST') {
          current = order({
            state: url.endsWith('/pickup') ? 'PICKED_UP' : 'DELIVERED',
            courierId: COURIER_ID,
          })
        }
        return { body: current }
      })
      vi.stubGlobal('fetch', fetchMock)
      const user = userEvent.setup()
      renderErrand()

      expect(
        await screen.findByRole('heading', { name: "You're the courier" }),
      ).toBeInTheDocument()
      expect(screen.getByText('Next: pick up the item.')).toBeInTheDocument()
      expect(
        screen.getByRole('heading', { name: 'Progress' }),
      ).toBeInTheDocument()

      await user.click(
        screen.getByRole('button', { name: 'Mark as picked up' }),
      )
      await user.click(
        await screen.findByRole('button', { name: 'Mark as delivered' }),
      )

      expect(
        await screen.findByText(
          "Delivered. You'll get your reward once they confirm.",
        ),
      ).toBeInTheDocument()
      expect(
        calls
          .filter((call) => call.init?.method === 'POST')
          .map((call) => call.url),
      ).toEqual([`${ORDER_URL}/pickup`, `${ORDER_URL}/deliver`])
    })

    it('confirms before withdrawing', async () => {
      signIn(COURIER_ID, 'COURIER')
      const { fetchMock, calls } = serve(
        order({ state: 'ACCEPTED', courierId: COURIER_ID }),
        () => ({
          body: order(),
        }),
      )
      vi.stubGlobal('fetch', fetchMock)
      const user = userEvent.setup()
      renderErrand()

      await user.click(await screen.findByRole('button', { name: 'Withdraw' }))
      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', {
          name: 'Withdraw',
        }),
      )

      expect(calls.find((call) => call.init?.method === 'POST')?.url).toBe(
        `${ORDER_URL}/withdraw`,
      )
    })

    it('still explains a role refusal from the backend', async () => {
      signIn(COURIER_ID, 'COURIER')
      vi.stubGlobal(
        'fetch',
        serve(order({ state: 'ACCEPTED', courierId: COURIER_ID }), () => ({
          status: 403,
          body: { detail: 'no' },
        })).fetchMock,
      )
      const user = userEvent.setup()
      renderErrand()

      await user.click(
        await screen.findByRole('button', { name: 'Mark as picked up' }),
      )

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Switch your role at the top of the page',
      )
    })
  })

  describe('for the requester (Requester active order)', () => {
    it('asks for confirmation before confirming receipt and transferring the reward (F6.3)', async () => {
      signIn(REQUESTER_ID, 'REQUESTER')
      const { fetchMock, calls } = serve(
        order({ state: 'DELIVERED', courierId: COURIER_ID }),
        () => ({
          body: order({ state: 'COMPLETED', courierId: COURIER_ID }),
        }),
      )
      vi.stubGlobal('fetch', fetchMock)
      const user = userEvent.setup()
      renderErrand()

      expect(
        await screen.findByRole('heading', {
          name: 'Have you received your item?',
        }),
      ).toBeInTheDocument()
      expect(
        screen.getByText('Only confirm once you have your item'),
      ).toBeInTheDocument()

      await user.click(
        screen.getByRole('button', { name: 'I got it · Pay 18 credits' }),
      )
      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', {
          name: 'Yes, pay 18 credits',
        }),
      )

      expect(
        await screen.findByRole('heading', { name: 'Errand completed' }),
      ).toBeInTheDocument()
      expect(calls.find((call) => call.init?.method === 'POST')?.url).toBe(
        `${ORDER_URL}/complete`,
      )
    })

    it('warns about compensation when cancelling an accepted errand (F3.3)', async () => {
      signIn(REQUESTER_ID, 'REQUESTER')
      vi.stubGlobal(
        'fetch',
        serve(order({ state: 'ACCEPTED', courierId: COURIER_ID })).fetchMock,
      )
      const user = userEvent.setup()
      renderErrand()

      await user.click(
        await screen.findByRole('button', { name: 'Cancel errand' }),
      )

      expect(screen.getByRole('dialog')).toHaveTextContent(
        'Your courier gets 20% of the reward for their time.',
      )
    })

    it('offers a full refund when cancelling once the courier is late', async () => {
      signIn(REQUESTER_ID, 'REQUESTER')
      const late = order({
        state: 'ACCEPTED',
        courierId: COURIER_ID,
        pickupDeadline: new Date(Date.now() - 60_000).toISOString(),
      })
      vi.stubGlobal('fetch', serve(late).fetchMock)
      const user = userEvent.setup()
      renderErrand()

      await user.click(
        await screen.findByRole('button', { name: 'Cancel errand' }),
      )

      expect(screen.getByRole('dialog')).toHaveTextContent(
        "Your courier is late, so you'll get all your credits back.",
      )
      expect(screen.getByRole('dialog')).not.toHaveTextContent('20%')
    })

    it('explains a cancellation after the courier was late', async () => {
      signIn(REQUESTER_ID, 'REQUESTER')
      vi.stubGlobal(
        'fetch',
        serve(
          order({
            state: 'CANCELLED',
            terminalReason: 'REQUESTER_CANCELLED_COURIER_LATE',
          }),
        ).fetchMock,
      )
      renderErrand()

      expect(
        await screen.findByRole('heading', {
          level: 1,
          name: 'Errand cancelled',
        }),
      ).toBeInTheDocument()
      expect(screen.getByText(/Your courier was late/)).toBeInTheDocument()
    })

    it('offers Edit errand while the errand is open', async () => {
      signIn(REQUESTER_ID, 'REQUESTER')
      vi.stubGlobal('fetch', serve(order({ state: 'OPEN' })).fetchMock)
      renderErrand()

      expect(
        await screen.findByRole('link', { name: 'Edit errand' }),
      ).toHaveAttribute(
        'href',
        '/errands/3f2a9c4e-6b1d-4e8f-a7c3-5d9e0b1f2a64/edit',
      )
    })

    it.each([
      ['accepted', order({ state: 'ACCEPTED', courierId: COURIER_ID })],
      [
        'waiting on a reward change',
        order({ state: 'OPEN', pendingCreditReward: 20 }),
      ],
    ])('offers no Edit errand once %s', async (_, current) => {
      signIn(REQUESTER_ID, 'REQUESTER')
      vi.stubGlobal('fetch', serve(current).fetchMock)
      renderErrand()

      await screen.findByRole('heading', { level: 1 })
      expect(
        screen.queryByRole('link', { name: 'Edit errand' }),
      ).not.toBeInTheDocument()
    })

    it('offers no Edit errand in a Courier session', async () => {
      signIn(REQUESTER_ID, 'COURIER')
      vi.stubGlobal('fetch', serve(order({ state: 'OPEN' })).fetchMock)
      renderErrand()

      await screen.findByRole('heading', { level: 1 })
      expect(
        screen.queryByRole('link', { name: 'Edit errand' }),
      ).not.toBeInTheDocument()
    })

    it.each([
      'COMPLETED',
      'CANCELLED',
      'EXPIRED',
      'RESERVATION_FAILED',
    ] as const)('offers Post again once the errand is %s', async (state) => {
      signIn(REQUESTER_ID, 'REQUESTER')
      vi.stubGlobal('fetch', serve(order({ state })).fetchMock)
      renderErrand()

      expect(
        await screen.findByRole('link', { name: 'Post again' }),
      ).toHaveAttribute(
        'href',
        '/errands/new?from=3f2a9c4e-6b1d-4e8f-a7c3-5d9e0b1f2a64',
      )
    })

    it('offers no Post again while the errand is still active', async () => {
      signIn(REQUESTER_ID, 'REQUESTER')
      vi.stubGlobal(
        'fetch',
        serve(order({ state: 'DELIVERED', courierId: COURIER_ID })).fetchMock,
      )
      renderErrand()

      await screen.findByRole('heading', {
        name: 'Have you received your item?',
      })
      expect(
        screen.queryByRole('link', { name: 'Post again' }),
      ).not.toBeInTheDocument()
    })

    it('offers no cancel once the item is picked up (F3.4)', async () => {
      signIn(REQUESTER_ID, 'REQUESTER')
      vi.stubGlobal(
        'fetch',
        serve(order({ state: 'PICKED_UP', courierId: COURIER_ID })).fetchMock,
      )
      renderErrand()

      expect(
        await screen.findByRole('heading', {
          name: 'Your item has been picked up',
        }),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Cancel errand' }),
      ).not.toBeInTheDocument()
    })
  })

  describe('for the requester of an errand Credit refused to reserve', () => {
    it.each([
      [
        'INSUFFICIENT_CREDITS',
        'Not enough credits',
        /didn't have enough credits for this reward/,
        false,
      ],
      [
        'CREDIT_ACCOUNT_NOT_FOUND',
        'Credit account not set up',
        /Set up your credits, then post it again/,
        true,
      ],
      [
        'CREDIT_RESERVATION_REJECTED',
        'Errand not posted',
        /Please post it again/,
        false,
      ],
    ])('explains %s', async (terminalReason, heading, detail, setUp) => {
      signIn(REQUESTER_ID, 'REQUESTER')
      vi.stubGlobal(
        'fetch',
        serve(order({ state: 'RESERVATION_FAILED', terminalReason })).fetchMock,
      )
      renderErrand()

      expect(
        await screen.findByRole('heading', { level: 1, name: heading }),
      ).toBeInTheDocument()
      expect(screen.getByText(detail)).toBeInTheDocument()
      expect(
        screen.queryByRole('link', { name: 'Set up your credits' }) !== null,
      ).toBe(setUp)
    })
  })

  describe('for the requester of an errand that expired', () => {
    it('says Credit never confirmed it, not that nobody picked it up', async () => {
      signIn(REQUESTER_ID, 'REQUESTER')
      vi.stubGlobal(
        'fetch',
        serve(
          order({
            state: 'EXPIRED',
            terminalReason: 'CREDIT_RESERVATION_TIMEOUT',
          }),
        ).fetchMock,
      )
      renderErrand()

      expect(
        await screen.findByRole('heading', {
          level: 1,
          name: 'Errand not posted',
        }),
      ).toBeInTheDocument()
      expect(screen.getByText(/Your credits are safe/)).toBeInTheDocument()
      expect(screen.queryByText(/Nobody picked it up/)).not.toBeInTheDocument()
    })

    it('keeps the deadline wording for an errand that reached the pool', async () => {
      signIn(REQUESTER_ID, 'REQUESTER')
      vi.stubGlobal(
        'fetch',
        serve(
          order({ state: 'EXPIRED', terminalReason: 'PICKUP_DEADLINE_PASSED' }),
        ).fetchMock,
      )
      renderErrand()

      expect(
        await screen.findByRole('heading', {
          level: 1,
          name: 'Errand expired',
        }),
      ).toBeInTheDocument()
      expect(screen.getByText(/Nobody picked it up/)).toBeInTheDocument()
    })
  })

  describe('in a header role the errand does not belong to', () => {
    it.each([
      [
        'their own errand as a Courier',
        REQUESTER_ID,
        'COURIER',
        order(),
        'Run errands',
      ],
      [
        'an errand they run as a Requester',
        COURIER_ID,
        'REQUESTER',
        order({ state: 'ACCEPTED', courierId: COURIER_ID }),
        'My errands',
      ],
      [
        "someone else's open errand as a Requester",
        STRANGER_ID,
        'REQUESTER',
        order(),
        'My errands',
      ],
    ] as const)(
      "sends a user opening %s to that role's screen",
      async (_, userId, role, current, home) => {
        signIn(userId, role)
        vi.stubGlobal('fetch', serve(current).fetchMock)
        renderErrand()

        expect(
          await screen.findByRole('heading', { name: home }),
        ).toBeInTheDocument()
        expect(
          screen.queryByRole('button', {
            name: /Accept errand|Cancel errand|Mark as picked up/,
          }),
        ).not.toBeInTheDocument()
      },
    )

    it.each([
      [
        'the requester switching to Courier',
        REQUESTER_ID,
        'REQUESTER',
        'COURIER',
        order(),
        'Waiting for a courier',
        'Run errands',
      ],
      [
        'the courier switching to Requester',
        COURIER_ID,
        'COURIER',
        'REQUESTER',
        order({ state: 'ACCEPTED', courierId: COURIER_ID }),
        "You're the courier",
        'My errands',
      ],
    ] as const)(
      'leaves the errand on %s',
      async (_, userId, from, to, current, heading, home) => {
        signIn(userId, from)
        vi.stubGlobal('fetch', serve(current).fetchMock)
        renderErrand()
        expect(
          await screen.findByRole('heading', { name: heading }),
        ).toBeInTheDocument()

        act(() => {
          signIn(userId, to)
          window.dispatchEvent(new Event(sessionChangedEvent))
        })

        expect(
          await screen.findByRole('heading', { name: home }),
        ).toBeInTheDocument()
        expect(
          screen.queryByRole('heading', { name: heading }),
        ).not.toBeInTheDocument()
      },
    )
  })

  it('shows a not-found state for a hidden or missing errand', async () => {
    signIn(STRANGER_ID, 'COURIER')
    vi.stubGlobal(
      'fetch',
      stubFetch(() => ({ status: 404, body: { code: 'ORDER_NOT_FOUND' } }))
        .fetchMock,
    )
    renderErrand()

    expect(
      await screen.findByRole('heading', { name: 'Errand not found' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Back to errands' }),
    ).toHaveAttribute('href', '/errands')
  })

  it('shows placeholders while the errand loads', () => {
    signIn(STRANGER_ID, 'COURIER')
    vi.stubGlobal('fetch', () => new Promise(() => {}))
    renderErrand()

    expect(screen.getByRole('status')).toHaveTextContent('Loading errand…')
  })

  it('offers a retry when the errand fails to load', async () => {
    signIn(STRANGER_ID, 'COURIER')
    let failing = true
    vi.stubGlobal(
      'fetch',
      stubFetch((url) => {
        if (url.startsWith('/api/admin/orders/'))
          return {
            body: {
              orderId: order().id,
              status: 'INELIGIBLE',
              caseId: null,
              state: null,
            },
          }
        return failing
          ? { status: 500, body: { detail: 'Server unavailable' } }
          : { body: order() }
      }).fetchMock,
    )
    const user = userEvent.setup()
    renderErrand()

    expect(
      await screen.findByRole('heading', {
        name: "We couldn't load this errand",
      }),
    ).toBeInTheDocument()
    failing = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(
      await screen.findByRole('heading', { name: 'Collect my printed notes' }),
    ).toBeInTheDocument()
  })
})

it('prioritises review status and removes normal actions while retaining the original paused stage', async () => {
  signIn(REQUESTER_ID, 'REQUESTER')
  vi.stubGlobal(
    'fetch',
    serve(
      order({
        state: 'ACCEPTED',
        courierId: COURIER_ID,
        reviewCaseId: '10000000-0000-4000-8000-000000000001',
        reviewResolved: false,
      }),
    ).fetchMock,
  )
  renderErrand()
  expect(
    await screen.findByRole('heading', { name: 'Under review' }),
  ).toBeVisible()
  expect(screen.getByText(/Paused at: Accepted/)).toBeVisible()
  expect(
    screen.queryByRole('button', { name: /Cancel errand/ }),
  ).not.toBeInTheDocument()
  expect(screen.getByText('Progress is paused during review.')).toBeVisible()
})
it('finishes a reviewed errand without displaying unperformed delivery milestones', async () => {
  signIn(REQUESTER_ID, 'REQUESTER')
  vi.stubGlobal(
    'fetch',
    serve(
      order({
        state: 'COMPLETED',
        courierId: COURIER_ID,
        reviewCaseId: '10000000-0000-4000-8000-000000000001',
        reviewResolved: true,
        terminalReason: 'DISPUTE_RESOLVED',
      }),
    ).fetchMock,
  )
  renderErrand()
  expect(
    await screen.findByRole('heading', {
      name: 'Resolved after review',
    }),
  ).toBeVisible()
  expect(screen.getByText('Finished after dispute review.')).toBeVisible()
  expect(document.querySelector('ol.progress')).not.toBeInTheDocument()
})
