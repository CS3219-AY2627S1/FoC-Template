import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  order,
  REQUESTER_ID,
  signIn,
  STRANGER_ID,
  stubFetch,
} from '../test/fixtures'
import { validate } from '../utils/errandForm'
import { CreateErrandPage } from './CreateErrandPage'

const PICKUP = {
  id: '9fd58f13-c8d5-4320-b757-7893d69a4ae0',
  name: 'Printers@PCCommons',
  building: 'PC Commons',
  floor: '1',
}
const DROPOFF = {
  id: 'eb46dc78-e25e-4f07-a7a2-26bff615d170',
  name: 'PGP Foyer',
  building: 'PGP',
  floor: null,
}

function inAnHour(): string {
  const date = new Date(Date.now() + 3_600_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function api(
  overrides: {
    create?: { status?: number; body: unknown }
    credits?: { status?: number; body: unknown }
    /** Successive GET /api/orders/{id} answers while the page waits; the last one repeats. */
    reads?: unknown[]
  } = {},
) {
  let read = 0
  return stubFetch((url, init) => {
    if (url.startsWith('/api/suppliers'))
      return { body: { items: [PICKUP, DROPOFF], totalPages: 1 } }
    if (url.startsWith('/api/credits/me'))
      return (
        overrides.credits ?? {
          body: { availableBalance: 10, reservedBalance: 0 },
        }
      )
    if (url === '/api/orders' && init?.method === 'POST')
      return overrides.create ?? { status: 201, body: order() }
    if (overrides.reads) {
      const body = overrides.reads[Math.min(read, overrides.reads.length - 1)]
      read += 1
      return { body }
    }
    return { body: order() }
  })
}

function renderPage(path = '/errands/new') {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<CreateErrandPage />} path="/errands/new" />
          <Route element={<h1>Errand page</h1>} path="/errands/:orderId" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const PICKUP_LABEL = 'Printers@PCCommons · PC Commons, level 1'
const DROPOFF_LABEL = 'PGP Foyer · PGP'

/** Picks a location in the searchable picker by typing part of its name. */
async function pickLocation(
  user: ReturnType<typeof userEvent.setup>,
  field: 'Pickup location' | 'Drop-off location',
  search: string,
) {
  const input = await screen.findByRole('combobox', { name: field })
  await waitFor(() => expect(input).toBeEnabled())
  await user.click(input)
  await user.type(input, search)
  await user.click(
    screen.getByRole('option', { name: new RegExp(search, 'i') }),
  )
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByLabelText('Errand title'),
    'Collect my printed notes',
  )
  await pickLocation(user, 'Pickup location', 'Printers')
  await pickLocation(user, 'Drop-off location', 'PGP Foyer')
  await user.type(screen.getByLabelText('Pick up by'), inAnHour())
  await user.type(screen.getByLabelText('Reward (credits)'), '3')
  await user.type(
    screen.getByLabelText('Description'),
    'A bound set of CS3219 lecture notes.',
  )
}

describe('CreateErrandPage', () => {
  beforeEach(() => signIn(REQUESTER_ID, 'REQUESTER'))
  afterEach(() => {
    sessionStorage.clear()
    vi.unstubAllGlobals()
  })

  it('shows the credit card with what this errand reserves', async () => {
    vi.stubGlobal('fetch', api().fetchMock)
    const user = userEvent.setup()
    renderPage()

    expect(
      screen.getByRole('heading', { name: 'Create a campus errand' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      '/errands/mine',
    )
    expect(await screen.findByText('10 cr')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Reward (credits)'), '3')

    expect(
      screen.getByText('Reserve for this errand').nextElementSibling,
    ).toHaveTextContent('3 credits')
    expect(
      screen.getByText('Available after posting').nextElementSibling,
    ).toHaveTextContent('7 credits')
  })

  it('posts the errand with location names and opens it', async () => {
    const { fetchMock, calls } = api()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderPage()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'Post errand' }))

    expect(
      await screen.findByRole('heading', { name: 'Errand page' }),
    ).toBeInTheDocument()
    const post = calls.find((call) => call.init?.method === 'POST')
    const body = JSON.parse(String(post?.init?.body)) as Record<string, unknown>
    expect(body).toMatchObject({
      title: 'Collect my printed notes',
      pickupLocationId: PICKUP.id,
      pickupLocationName: 'Printers@PCCommons',
      dropoffLocationId: DROPOFF.id,
      dropoffLocationName: 'PGP Foyer',
      creditReward: 3,
    })
    expect(String(body.pickupDeadline)).toMatch(/Z$/)
  })

  it('reuses the Idempotency-Key when the same errand is posted again after an error', async () => {
    let posts = 0
    const { fetchMock, calls } = stubFetch((url, init) => {
      if (url.startsWith('/api/suppliers'))
        return { body: { items: [PICKUP, DROPOFF], totalPages: 1 } }
      if (url.startsWith('/api/credits/me'))
        return { body: { availableBalance: 10, reservedBalance: 0 } }
      if (url === '/api/orders' && init?.method === 'POST') {
        posts += 1
        // The first answer is lost (for example a gateway timeout); the errand may exist already.
        return posts === 1
          ? { status: 503, body: { detail: 'Try again' } }
          : { status: 200, body: order() }
      }
      return { body: order() }
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderPage()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'Post errand' }))
    expect(await screen.findByText('Try again')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Post errand' }))

    expect(
      await screen.findByRole('heading', { name: 'Errand page' }),
    ).toBeInTheDocument()
    const keys = calls
      .filter((call) => call.init?.method === 'POST')
      .map((call) => new Headers(call.init?.headers).get('Idempotency-Key'))
    expect(keys).toHaveLength(2)
    expect(keys[0]).toMatch(/^[0-9a-f-]{32,36}$/)
    expect(keys[1]).toBe(keys[0])
  })

  it('uses a new Idempotency-Key once the errand is changed', async () => {
    const { fetchMock, calls } = api({
      create: { status: 503, body: { detail: 'Try again' } },
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderPage()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'Post errand' }))
    expect(await screen.findByText('Try again')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Reward (credits)'))
    await user.type(screen.getByLabelText('Reward (credits)'), '4')
    await user.click(screen.getByRole('button', { name: 'Post errand' }))

    await waitFor(() =>
      expect(calls.filter((call) => call.init?.method === 'POST')).toHaveLength(
        2,
      ),
    )
    const [first, second] = calls
      .filter((call) => call.init?.method === 'POST')
      .map((call) => new Headers(call.init?.headers).get('Idempotency-Key'))
    expect(second).not.toBe(first)
  })

  it('blocks submission and explains missing fields (F1.1.1)', async () => {
    const { fetchMock, calls } = api()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('10 cr')

    await user.click(screen.getByRole('button', { name: 'Post errand' }))

    expect(screen.getByText('Give your errand a title.')).toBeInTheDocument()
    expect(screen.getByText('Choose where to pick up.')).toBeInTheDocument()
    expect(screen.getByText('Offer a reward.')).toBeInTheDocument()
    expect(screen.getByLabelText('Errand title')).toHaveFocus()
    expect(calls.some((call) => call.init?.method === 'POST')).toBe(false)
  })

  it('blocks identical pickup and drop-off (F1.1.1)', async () => {
    const { fetchMock, calls } = api()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderPage()

    await fillValidForm(user)
    await pickLocation(user, 'Drop-off location', 'Printers')
    await user.click(screen.getByRole('button', { name: 'Post errand' }))

    expect(
      screen.getByText('Pickup and drop-off must be different places.'),
    ).toBeInTheDocument()
    expect(calls.some((call) => call.init?.method === 'POST')).toBe(false)
  })

  it('shows the server field errors next to the fields', async () => {
    vi.stubGlobal(
      'fetch',
      api({
        create: {
          status: 400,
          body: { detail: 'invalid', errors: { title: ['must not be blank'] } },
        },
      }).fetchMock,
    )
    const user = userEvent.setup()
    renderPage()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'Post errand' }))

    expect(await screen.findByText('must not be blank')).toBeInTheDocument()
  })

  it('validate rejects a past deadline and non-whole rewards', () => {
    const base = {
      title: 't',
      pickupLocationId: 'a',
      dropoffLocationId: 'b',
      pickupDeadline: '2020-01-01T10:00',
      creditReward: '2.5',
      description: 'd',
    }
    const errors = validate(base)
    expect(errors.pickupDeadline).toBe('Choose a time in the future.')
    expect(errors.creditReward).toBe(
      'Use a whole number of credits, 1 or more.',
    )
  })
  it('blocks posting when the reward is more than the available credits', async () => {
    const { fetchMock, calls } = api({
      credits: { body: { availableBalance: 2, reservedBalance: 0 } },
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('2 cr')

    await fillValidForm(user)
    await user.clear(screen.getByLabelText('Reward (credits)'))
    await user.type(screen.getByLabelText('Reward (credits)'), '5')

    expect(screen.getByRole('button', { name: 'Post errand' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(
      'You have 2 credits. Lower the reward to 2 or less.',
    )
    expect(
      screen.getByText('Available after posting').nextElementSibling,
    ).toHaveTextContent('0 credits')

    await user.click(screen.getByLabelText('Description'))
    await user.keyboard('{Enter}')
    expect(calls.some((call) => call.init?.method === 'POST')).toBe(false)
  })

  it('allows a reward equal to the available credits', async () => {
    vi.stubGlobal(
      'fetch',
      api({ credits: { body: { availableBalance: 3, reservedBalance: 0 } } })
        .fetchMock,
    )
    const user = userEvent.setup()
    renderPage()

    await fillValidForm(user)

    expect(screen.getByRole('button', { name: 'Post errand' })).toBeEnabled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('pauses posting when Credit is unavailable', async () => {
    const { fetchMock, calls } = api({ credits: { status: 503, body: {} } })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderPage()

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        "can't check your credits",
      ),
    )
    await fillValidForm(user)

    expect(screen.getByRole('button', { name: 'Post errand' })).toBeDisabled()
    expect(calls.some((call) => call.init?.method === 'POST')).toBe(false)
  })

  it('blocks posting until a credit account exists, with a link to set it up', async () => {
    vi.stubGlobal(
      'fetch',
      api({ credits: { status: 404, body: {} } }).fetchMock,
    )
    renderPage()

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        "Your credit account isn't set up yet.",
      ),
    )
    expect(
      screen.getByRole('link', { name: 'Set up your credits' }),
    ).toHaveAttribute('href', '/credits')
    expect(screen.getByRole('button', { name: 'Post errand' })).toBeDisabled()
  })

  it('keeps posting disabled while the balance is loading', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.startsWith('/api/credits')
          ? new Promise(() => {})
          : Promise.resolve(
              new Response(
                JSON.stringify({ items: [PICKUP, DROPOFF], totalPages: 1 }),
              ),
            ),
      ),
    )
    renderPage()

    expect(screen.getByRole('button', { name: 'Post errand' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Checking your credits',
    )
  })

  it('waits for Credit to reserve the reward, then opens the errand', async () => {
    const pending = order({ state: 'PENDING_CREDIT', creditReward: 3 })
    vi.stubGlobal(
      'fetch',
      api({
        create: { status: 201, body: pending },
        reads: [pending, pending, order({ state: 'OPEN', creditReward: 3 })],
      }).fetchMock,
    )
    const user = userEvent.setup()
    renderPage()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'Post errand' }))

    expect(
      await screen.findByRole('button', { name: 'Reserving your credits…' }),
    ).toBeDisabled()
    expect(screen.getByLabelText('Errand title')).toBeDisabled()
    expect(
      await screen.findByRole(
        'heading',
        { name: 'Errand page' },
        { timeout: 4000 },
      ),
    ).toBeInTheDocument()
  })

  it('stays on the form and says when there are not enough credits', async () => {
    const pending = order({ state: 'PENDING_CREDIT', creditReward: 3 })
    vi.stubGlobal(
      'fetch',
      api({
        create: { status: 201, body: pending },
        reads: [
          order({
            state: 'RESERVATION_FAILED',
            terminalReason: 'INSUFFICIENT_CREDITS',
            creditReward: 3,
          }),
        ],
      }).fetchMock,
    )
    const user = userEvent.setup()
    renderPage()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'Post errand' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "You don't have enough credits for a reward of 3. Lower it and post again.",
    )
    expect(
      screen.queryByRole('heading', { name: 'Errand page' }),
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('Errand title')).toHaveValue(
      'Collect my printed notes',
    )
    expect(screen.getByLabelText('Errand title')).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Post errand' })).toBeEnabled()

    await user.clear(screen.getByLabelText('Reward (credits)'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('links to credit set-up when Credit has no account for the requester', async () => {
    vi.stubGlobal(
      'fetch',
      api({
        create: { status: 201, body: order({ state: 'PENDING_CREDIT' }) },
        reads: [
          order({
            state: 'RESERVATION_FAILED',
            terminalReason: 'CREDIT_ACCOUNT_NOT_FOUND',
          }),
        ],
      }).fetchMock,
    )
    const user = userEvent.setup()
    renderPage()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'Post errand' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Your credits aren't set up yet")
    expect(
      screen.getByRole('link', { name: 'Set up your credits' }),
    ).toHaveAttribute('href', '/credits')
  })

  it('hands over to the errand after 30 seconds without an answer', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const pending = order({ state: 'PENDING_CREDIT' })
      vi.stubGlobal(
        'fetch',
        api({ create: { status: 201, body: pending }, reads: [pending] })
          .fetchMock,
      )
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      renderPage()

      await fillValidForm(user)
      await user.click(screen.getByRole('button', { name: 'Post errand' }))
      await screen.findByRole('button', { name: 'Reserving your credits…' })

      await act(() => vi.advanceTimersByTimeAsync(30_000))

      expect(
        await screen.findByText(/taking a little longer than usual/),
      ).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'View errand' })).toHaveAttribute(
        'href',
        `/errands/${pending.id}`,
      )
      expect(
        screen.queryByRole('heading', { name: 'Errand page' }),
      ).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  describe('posting an earlier errand again', () => {
    const PAST = order({ id: 'past-1', state: 'COMPLETED', creditReward: 4 })

    it('fills in everything except the pickup time from the requester’s own errand', async () => {
      vi.stubGlobal('fetch', api({ reads: [PAST] }).fetchMock)
      renderPage('/errands/new?from=past-1')

      expect(
        await screen.findByText(/Copied from “Collect my printed notes”/),
      ).toBeInTheDocument()
      expect(screen.getByLabelText('Errand title')).toHaveValue(
        'Collect my printed notes',
      )
      expect(screen.getByLabelText('Pickup location')).toHaveValue(PICKUP_LABEL)
      expect(screen.getByLabelText('Drop-off location')).toHaveValue(
        DROPOFF_LABEL,
      )
      expect(screen.getByLabelText('Reward (credits)')).toHaveValue(4)
      expect(screen.getByLabelText('Description')).toHaveValue(
        'A bound set of CS3219 lecture notes.',
      )
      expect(screen.getByLabelText('Pick up by')).toHaveValue('')
      await waitFor(() =>
        expect(screen.getByLabelText('Pick up by')).toHaveFocus(),
      )
    })

    it('posts the copy as a new errand with the new pickup time', async () => {
      const { fetchMock, calls } = api({ reads: [PAST, order()] })
      vi.stubGlobal('fetch', fetchMock)
      const user = userEvent.setup()
      renderPage('/errands/new?from=past-1')
      await screen.findByText(/Copied from/)

      const deadline = inAnHour()
      await user.type(screen.getByLabelText('Pick up by'), deadline)
      await user.click(screen.getByRole('button', { name: 'Post errand' }))

      expect(
        await screen.findByRole('heading', { name: 'Errand page' }),
      ).toBeInTheDocument()
      const post = calls.find((call) => call.init?.method === 'POST')
      expect(post?.url).toBe('/api/orders')
      const body = JSON.parse(String(post?.init?.body)) as Record<
        string,
        unknown
      >
      expect(body).toMatchObject({
        title: 'Collect my printed notes',
        pickupLocationName: 'Printers@PCCommons',
        dropoffLocationName: 'PGP Foyer',
        creditReward: 4,
        pickupDeadline: new Date(deadline).toISOString(),
      })
    })

    it('clears a location Supplier no longer lists and says which one', async () => {
      const gone = order({
        id: 'past-1',
        state: 'EXPIRED',
        pickupLocationId: 'removed',
        pickupLocationName: 'Old Kiosk',
      })
      vi.stubGlobal('fetch', api({ reads: [gone] }).fetchMock)
      renderPage('/errands/new?from=past-1')

      expect(
        await screen.findByText(
          'Old Kiosk is no longer available. Choose another location.',
        ),
      ).toBeInTheDocument()
      expect(screen.getByLabelText('Pickup location')).toHaveValue('')
      expect(screen.getByLabelText('Drop-off location')).toHaveValue(
        DROPOFF_LABEL,
      )
    })

    it('still checks the copied reward against the available credits', async () => {
      vi.stubGlobal(
        'fetch',
        api({
          reads: [
            order({ id: 'past-1', state: 'COMPLETED', creditReward: 12 }),
          ],
        }).fetchMock,
      )
      renderPage('/errands/new?from=past-1')

      expect(
        await screen.findByText(/Lower the reward to 10 or less/),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Post errand' })).toBeDisabled()
    })

    it.each([
      [
        'someone else’s errand',
        {
          status: 200,
          body: order({ id: 'past-1', requesterId: STRANGER_ID }),
        },
      ],
      [
        'an errand that cannot be loaded',
        { status: 404, body: { code: 'ORDER_NOT_FOUND' } },
      ],
    ])('starts empty for %s', async (_, answer) => {
      const fallback = api().fetchMock
      vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
        String(input) === '/api/orders/past-1'
          ? Promise.resolve(
              new Response(JSON.stringify(answer.body), {
                status: answer.status,
              }),
            )
          : fallback(input, init),
      )
      renderPage('/errands/new?from=past-1')

      expect(
        await screen.findByText(
          "We couldn't copy that errand. Fill in the details below.",
        ),
      ).toBeInTheDocument()
      expect(screen.getByLabelText('Errand title')).toHaveValue('')
    })
  })
})
