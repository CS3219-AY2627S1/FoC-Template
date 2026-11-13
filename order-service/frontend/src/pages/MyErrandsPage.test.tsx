import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveSession } from '../auth/session'
import {
  COURIER_ID,
  order,
  page,
  REQUESTER_ID,
  signIn,
  stubFetch,
} from '../test/fixtures'
import { MyErrandsPage } from './MyErrandsPage'

function renderPage() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={['/errands/mine']}>
        <MyErrandsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const section = (name: 'Active' | 'Under review' | 'Past') =>
  screen.getByRole('region', { name: new RegExp(`^${name}`) })

describe('MyErrandsPage', () => {
  beforeEach(() => signIn(REQUESTER_ID, 'REQUESTER'))
  afterEach(() => {
    sessionStorage.clear()
    vi.unstubAllGlobals()
  })

  it("shows the requester's active errands above their finished ones (F9.1)", async () => {
    const { fetchMock, calls } = stubFetch((url) => ({
      body: url.includes('status=active')
        ? page([
            order({ id: 'a', state: 'OPEN', title: 'Get my lunch' }),
            order({
              id: 'p',
              state: 'PENDING_CREDIT',
              title: 'Return my book',
            }),
          ])
        : page([
            order({ state: 'COMPLETED', courierId: COURIER_ID }),
            order({ id: 'b', state: 'CANCELLED', title: 'Pick up my coffee' }),
          ]),
    }))
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    expect(screen.getByText('Your activity')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Your recent errands' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Create new errand' }),
    ).toHaveAttribute('href', '/errands/new')
    expect(
      await within(section('Active')).findByRole('heading', {
        name: 'Get my lunch',
      }),
    ).toBeInTheDocument()
    expect(
      within(section('Active')).getByRole('heading', {
        name: 'Return my book',
      }),
    ).toBeInTheDocument()
    expect(
      within(section('Active')).getByRole('link', {
        name: 'View Get my lunch',
      }),
    ).toHaveAttribute('href', '/errands/a')
    expect(
      await within(section('Past')).findByRole('heading', {
        name: 'Collect my printed notes',
      }),
    ).toBeInTheDocument()
    const coffee = within(section('Past'))
      .getByRole('heading', { name: 'Pick up my coffee' })
      .closest('li')!
    expect(within(coffee).getByText('Cancelled')).toBeInTheDocument()
    expect(calls.map((call) => call.url)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\/api\/orders\/me\/requested\?status=active/),
        expect.stringMatching(/\/api\/orders\/me\/requested\?status=past/),
      ]),
    )
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('narrows past errands to one finished state', async () => {
    const { fetchMock, calls } = stubFetch((url) => ({
      body: url.includes('state=EXPIRED')
        ? page([order({ id: 'e', state: 'EXPIRED', title: 'Fetch my parcel' })])
        : page([]),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderPage()
    await within(section('Past')).findByText(
      /once they’re completed, cancelled or expired/,
    )

    await user.click(
      within(section('Past')).getByRole('button', { name: 'Expired' }),
    )

    expect(
      await within(section('Past')).findByRole('heading', {
        name: 'Fetch my parcel',
      }),
    ).toBeInTheDocument()
    expect(
      within(section('Past')).getByRole('button', { name: 'Expired' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(calls.at(-1)?.url).toContain('status=past')
    expect(calls.at(-1)?.url).toContain('state=EXPIRED')
  })

  it('shows the errands a courier session is running and has delivered (F9.2)', async () => {
    signIn(COURIER_ID, 'COURIER')
    const { fetchMock, calls } = stubFetch((url) => {
      if (!url.includes('delivered')) return { body: page([]) }
      return {
        body: url.includes('status=review')
          ? page([
              order({
                id: 'review',
                state: 'ACCEPTED',
                title: 'Review my delivery',
                courierId: COURIER_ID,
                reviewCaseId: '10000000-0000-4000-8000-000000000001',
                reviewResolved: false,
              }),
            ])
          : url.includes('status=active')
            ? page([
                order({
                  id: 'r',
                  state: 'PICKED_UP',
                  title: 'Carry my laptop',
                  courierId: COURIER_ID,
                }),
              ])
            : page([order({ state: 'COMPLETED', title: 'Bring my parcel' })]),
      }
    })
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    expect(screen.getByText('Courier activity')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Campus errands' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Past errands' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      screen.getByRole('heading', { name: 'Past errands you ran' }),
    ).toBeInTheDocument()
    expect(
      await within(section('Under review')).findByRole('heading', {
        name: 'Review my delivery',
      }),
    ).toBeInTheDocument()
    expect(
      within(section('Under review')).getByText('Under review', {
        selector: '.review-badge',
      }),
    ).toBeInTheDocument()
    expect(
      within(section('Under review')).getByText(/Paused at/),
    ).toHaveTextContent('Accepted')
    expect(
      await within(section('Active')).findByRole('heading', {
        name: 'Carry my laptop',
      }),
    ).toBeInTheDocument()
    expect(
      await within(section('Past')).findByRole('heading', {
        name: 'Bring my parcel',
      }),
    ).toBeInTheDocument()
    expect(within(section('Past')).getByText('+18')).toBeInTheDocument()
    expect(within(section('Past')).getByText('Earned')).toBeInTheDocument()
    // A courier's past list has only completed deliveries, so there is nothing to filter.
    expect(
      within(section('Past')).queryByRole('button', { name: 'Completed' }),
    ).not.toBeInTheDocument()
    expect(
      calls.some((call) => call.url.includes('/api/orders/me/requested')),
    ).toBe(false)
    expect(
      calls.some((call) =>
        call.url.includes('/api/orders/me/delivered?status=review'),
      ),
    ).toBe(true)
  })

  it('switches lists when the header role toggle changes the session', async () => {
    const { fetchMock, calls } = stubFetch((url) => ({
      body:
        url.includes('delivered') && url.includes('status=active')
          ? page([
              order({
                id: 'r',
                state: 'ACCEPTED',
                title: 'Carry my laptop',
                courierId: REQUESTER_ID,
              }),
            ])
          : page([]),
    }))
    vi.stubGlobal('fetch', fetchMock)
    renderPage()
    await within(section('Active')).findByText(/Errands you post appear here/)

    act(() => {
      saveSession({
        accessToken: 'courier-token',
        tokenType: 'Bearer',
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        userId: REQUESTER_ID,
        username: 'Alex',
        role: 'COURIER',
        availableRoles: ['REQUESTER', 'COURIER'],
      })
    })

    expect(
      await within(section('Active')).findByRole('heading', {
        name: 'Carry my laptop',
      }),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(
        calls.some((call) =>
          call.url.includes('/api/orders/me/delivered?status=active'),
        ),
      ).toBe(true),
    )
  })

  it('explains empty active and past lists', async () => {
    vi.stubGlobal('fetch', stubFetch(() => ({ body: page([]) })).fetchMock)
    renderPage()

    expect(
      await within(section('Active')).findByText(
        /Errands you post appear here until they finish/,
      ),
    ).toBeInTheDocument()
    expect(
      within(section('Active')).getByRole('link', { name: 'Request help' }),
    ).toHaveAttribute('href', '/errands/new')
    expect(
      await within(section('Past')).findByText(
        /once they’re completed, cancelled or expired/,
      ),
    ).toBeInTheDocument()
    expect(within(section('Past')).queryByRole('link')).not.toBeInTheDocument()
  })

  it('offers Post again on finished requests only', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch((url) => ({
        body: url.includes('status=active')
          ? page([order({ id: 'a', state: 'OPEN', title: 'Get my lunch' })])
          : page([
              order({ id: 'done', state: 'COMPLETED', courierId: COURIER_ID }),
            ]),
      })).fetchMock,
    )
    renderPage()

    expect(
      await within(section('Past')).findByRole('link', {
        name: 'Post Collect my printed notes again',
      }),
    ).toHaveAttribute('href', '/errands/new?from=done')
    await within(section('Active')).findByRole('heading', {
      name: 'Get my lunch',
    })
    expect(
      within(section('Active')).queryByRole('link', { name: /again/ }),
    ).not.toBeInTheDocument()
  })

  it('offers no Post again on errands a courier delivered', async () => {
    signIn(COURIER_ID, 'COURIER')
    vi.stubGlobal(
      'fetch',
      stubFetch((url) => ({
        body: url.includes('status=past')
          ? page([order({ state: 'COMPLETED', courierId: COURIER_ID })])
          : page([]),
      })).fetchMock,
    )
    renderPage()

    await within(section('Past')).findByRole('heading', {
      name: 'Collect my printed notes',
    })
    expect(
      screen.queryByRole('link', { name: /again/ }),
    ).not.toBeInTheDocument()
  })

  it('points a courier with no active errands to the open pool', async () => {
    signIn(COURIER_ID, 'COURIER')
    vi.stubGlobal('fetch', stubFetch(() => ({ body: page([]) })).fetchMock)
    renderPage()

    await screen.findByRole('heading', { name: 'Past errands you ran' })
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: /^Under review/ }),
      ).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('link', { name: 'Open requests' })).toHaveAttribute(
      'href',
      '/errands/browse',
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: /^Active/ }),
      ).not.toBeInTheDocument(),
    )
  })
})

it('places paused errands in a distinct review section and keeps finished reviews in Past', async () => {
  signIn(REQUESTER_ID, 'REQUESTER')
  vi.stubGlobal(
    'fetch',
    stubFetch((url) => ({
      body: url.includes('status=review')
        ? page([
            order({
              title: 'Review fixture',
              state: 'ACCEPTED',
              reviewCaseId: '10000000-0000-4000-8000-000000000001',
              reviewResolved: false,
            }),
          ])
        : url.includes('status=past')
          ? page([
              order({
                title: 'Finished fixture',
                state: 'COMPLETED',
                reviewCaseId: '10000000-0000-4000-8000-000000000002',
                reviewResolved: true,
              }),
            ])
          : page([]),
    })).fetchMock,
  )
  renderPage()
  const review = screen.getByRole('region', { name: /^Under review/ })
  expect(
    await within(review).findByRole('heading', { name: 'Review fixture' }),
  ).toBeVisible()
  expect(
    within(review).getByText('Under review', { selector: '.review-badge' }),
  ).toBeVisible()
  expect(within(review).getByText(/Paused at/)).toHaveTextContent('Accepted')
  expect(
    await within(section('Past')).findByText('Resolved after review'),
  ).toBeVisible()
  expect(
    within(section('Active')).queryByText('Review fixture'),
  ).not.toBeInTheDocument()
})

describe('recent errands section layout', () => {
  beforeEach(() => signIn(REQUESTER_ID, 'REQUESTER'))
  afterEach(() => {
    sessionStorage.clear()
    vi.unstubAllGlobals()
  })
  it('keeps active and past headings visible and omits a confirmed empty review section', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch((url) => ({
        body: url.includes('status=review')
          ? page([])
          : page([
              order({
                title: url.includes('status=past')
                  ? 'Past fixture'
                  : 'Active fixture',
              }),
            ]),
      })).fetchMock,
    )
    renderPage()
    await screen.findByRole('heading', { name: 'Active fixture' })
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: /^Under review/ }),
      ).not.toBeInTheDocument(),
    )
    expect(
      within(section('Active')).getByRole('heading', {
        name: 'Active',
      }),
    ).toBeVisible()
    const past = section('Past')
    expect(within(past).getByRole('heading', { name: 'Past' })).toBeVisible()
    expect(
      within(past).getByRole('group', { name: 'Filter past errands' }),
    ).toBeVisible()
    expect(
      screen.queryByText('No under review errands'),
    ).not.toBeInTheDocument()
  })
  it('keeps a failed review lookup visible instead of claiming there are no review cases', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch((url) =>
        url.includes('status=review')
          ? { status: 503, body: { detail: 'Review lookup unavailable' } }
          : { body: page([]) },
      ).fetchMock,
    )
    renderPage()
    expect(
      await within(section('Under review')).findByRole('alert'),
    ).toHaveTextContent('Review lookup unavailable')
    expect(
      screen.queryByText('No under review errands'),
    ).not.toBeInTheDocument()
  })
})
