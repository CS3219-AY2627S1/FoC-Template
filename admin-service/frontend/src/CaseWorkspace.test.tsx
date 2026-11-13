import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { App } from './App'
import { saveSession } from './auth/session'

// The header bell polls on its own and has its own tests; keep it out of these fetch sequences.
vi.mock('./components/NotificationBell', () => ({
  NotificationBell: () => null,
}))
vi.mock('./components/NotificationPush', () => ({
  NotificationPush: () => null,
}))

const id = '10000000-0000-4000-8000-000000000001'
const actor = '20000000-0000-4000-8000-000000000001'
const order = '30000000-0000-4000-8000-000000000001'
const summary = {
  caseId: id,
  orderId: order,
  state: 'OPEN',
  reviewerId: null,
  revision: 1,
  createdAt: '2026-10-29T10:00:00Z',
}
function session(
  role: 'ADMIN' | 'REQUESTER' = 'REQUESTER',
  accessToken = 'user-jwt',
) {
  saveSession({
    userId: actor,
    username: 'Tester',
    role,
    accessToken,
    tokenType: 'Bearer',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    availableRoles: ['REQUESTER', 'ADMIN'],
  })
}
function response(data: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => data }
}
function mockServiceFetch(fetcher = vi.fn()) {
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) =>
    url.endsWith('/report-context')
      ? Promise.resolve(
          response({
            orderId: url.split('/')[4],
            status: 'ELIGIBLE',
            caseId: null,
            state: null,
          }),
        )
      : fetcher(url, init),
  )
}
beforeEach(() => {
  sessionStorage.clear()
  mockServiceFetch()
})
afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState({}, '', '/admin')
})

it('submits in participant mode and retries the same key and body after an uncertain response', async () => {
  window.history.replaceState({}, '', '/admin/reports/new?orderId=' + order)
  session()
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('lost response'))
    .mockResolvedValueOnce(
      response(
        {
          case: summary,
          ownStatement: {
            reporterId: actor,
            description: 'Missing item',
            submittedAt: summary.createdAt,
          },
        },
        201,
      ),
    )
  mockServiceFetch(fetcher)
  render(<App />)
  expect(await screen.findByText(order)).toBeVisible()
  expect(
    screen.queryByRole('textbox', { name: 'Errand ID' }),
  ).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('What happened?'), {
    target: { value: 'Missing item' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Submit report' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'not sure your report went through',
  )
  expect(screen.getByLabelText('What happened?')).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Retry submission' }))
  expect(await screen.findByText('Report submitted')).toBeVisible()
  const first = fetcher.mock.calls[0]![1]
  const second = fetcher.mock.calls[1]![1]
  expect(first.headers['Idempotency-Key']).toBe(
    second.headers['Idempotency-Key'],
  )
  expect(first.body).toBe(second.body)
  expect(JSON.parse(first.body)).toEqual({
    orderId: order,
    description: 'Missing item',
  })
  expect(first.headers.Authorization).toBe('Bearer user-jwt')
  expect(sessionStorage.getItem('foc.report-pending.' + actor)).toBeNull()
})
it('requires errand context and does not advertise reporting in administrator navigation', () => {
  window.history.replaceState({}, '', '/admin/reports/new')
  session()
  const fetcher = vi.fn()
  mockServiceFetch(fetcher)
  render(<App />)
  expect(screen.getByText('Choose an errand to report')).toBeVisible()
  expect(
    screen.getByRole('link', { name: 'Go to my errands' }),
  ).toHaveAttribute('href', '/errands/mine')
  expect(
    screen.queryByRole('button', { name: 'Submit report' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('navigation', { name: 'Case navigation' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('link', { name: 'Reports' }),
  ).not.toBeInTheDocument()
  expect(fetcher).not.toHaveBeenCalled()
})
it('does not move an uncertain statement to another errand', async () => {
  window.history.replaceState({}, '', '/admin/reports/new?orderId=' + id)
  session()
  sessionStorage.setItem(
    'foc.report-pending.' + actor,
    JSON.stringify({
      key: id,
      body: { orderId: order, description: 'Existing pending statement' },
    }),
  )
  render(<App />)
  expect(await screen.findByText('Finish your pending report')).toBeVisible()
  expect(
    screen.getByRole('link', { name: 'Resume pending report' }),
  ).toHaveAttribute('href', '/admin/reports/new?orderId=' + order)
  expect(
    screen.queryByRole('button', { name: 'Submit report' }),
  ).not.toBeInTheDocument()
})
it('preserves queue context in case detail without participant navigation links', async () => {
  const context = '?page=2&size=20&status=UNDER_REVIEW&query=' + order
  window.history.replaceState({}, '', '/admin/cases/' + id + context)
  session('ADMIN')
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(response({ userId: actor, role: 'ADMIN' }))
      .mockResolvedValue(response({ case: summary, statements: [] })),
  )
  render(<App />)
  await screen.findByText('Case details')
  expect(
    screen.getByRole('link', { name: 'Back to case queue' }),
  ).toHaveAttribute('href', '/admin/cases' + context)
  expect(
    screen.queryByRole('link', { name: 'Participant reports' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('navigation', { name: 'Case navigation' }),
  ).not.toBeInTheDocument()
})
it('opens the full queue route and restores filters and page from the URL', async () => {
  window.history.replaceState(
    {},
    '',
    '/admin/cases?page=2&size=20&status=UNDER_REVIEW&query=' + order,
  )
  session('ADMIN')
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ userId: actor, role: 'ADMIN' }))
    .mockResolvedValue(
      response({
        content: [{ ...summary, state: 'UNDER_REVIEW' }],
        page: 2,
        size: 20,
        totalElements: 45,
        totalPages: 3,
      }),
    )
  mockServiceFetch(fetcher)
  render(<App />)
  const review = await screen.findByRole('link', { name: 'Review case ' + id })
  expect(fetcher.mock.calls[1]![0]).toBe(
    '/api/admin/cases?page=2&size=20&status=UNDER_REVIEW&query=' + order,
  )
  expect(screen.getByRole('button', { name: 'Under review' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(screen.getByText('Page 3 of 3')).toBeVisible()
  expect(review).toHaveAttribute(
    'href',
    '/admin/cases/' + id + '?page=2&size=20&status=UNDER_REVIEW&query=' + order,
  )
})
it('keeps all-reports selection on a reload without sending the UI marker to the API', async () => {
  window.history.replaceState({}, '', '/admin/cases?status=ALL')
  session('ADMIN')
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ userId: actor, role: 'ADMIN' }))
    .mockResolvedValue(
      response({
        content: [],
        page: 0,
        size: 20,
        totalElements: 0,
        totalPages: 0,
      }),
    )
  mockServiceFetch(fetcher)
  render(<App />)
  expect(await screen.findByText('No cases match these filters')).toBeVisible()
  expect(screen.getByRole('button', { name: 'All cases' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(fetcher.mock.calls[1]![0]).toBe('/api/admin/cases?page=0&size=20')
})
it('resumes a pending report after reload instead of generating another request', async () => {
  window.history.replaceState({}, '', '/admin/reports/new?orderId=' + order)
  session()
  sessionStorage.setItem(
    'foc.report-pending.' + actor,
    JSON.stringify({
      key: id,
      body: { orderId: order, description: 'Pending statement' },
    }),
  )
  const fetcher = vi
    .fn()
    .mockResolvedValue(response({ detail: 'Already submitted.' }, 409))
  mockServiceFetch(fetcher)
  render(<App />)
  expect(await screen.findByLabelText('What happened?')).toHaveValue(
    'Pending statement',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Retry submission' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Already submitted.',
  )
  expect(fetcher.mock.calls[0]![1].headers['Idempotency-Key']).toBe(id)
  expect(screen.getByLabelText('What happened?')).toBeEnabled()
})
it('shows only the reporters own statement and hides it on identity replacement', async () => {
  window.history.replaceState({}, '', '/admin/reports/' + id)
  session()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      response({
        case: summary,
        ownStatement: {
          reporterId: actor,
          description: 'My private statement',
          submittedAt: summary.createdAt,
        },
      }),
    ),
  )
  render(<App />)
  expect(await screen.findByText('My private statement')).toBeVisible()
  expect(screen.getByText('Waiting for review')).toBeVisible()
  expect(screen.getByText('Awaiting assignment')).toBeVisible()
  expect(screen.queryByText('Revision')).not.toBeInTheDocument()
  expect(screen.queryByText('Reviewer')).not.toBeInTheDocument()
  expect(screen.queryByText('Participant statements')).not.toBeInTheDocument()
  session('ADMIN', 'replacement')
  await waitFor(() =>
    expect(screen.queryByText('My private statement')).not.toBeInTheDocument(),
  )
})

it('routes an already-submitted errand to the private report instead of offering a second statement', async () => {
  window.history.replaceState({}, '', '/admin/reports/new?orderId=' + order)
  session()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      response({
        orderId: order,
        status: 'OWN_REPORT',
        caseId: id,
        state: 'RESOLVED',
      }),
    ),
  )
  render(<App />)
  expect(
    await screen.findByRole('link', { name: 'View your report' }),
  ).toHaveAttribute('href', '/admin/reports/' + id)
  expect(
    screen.queryByRole('button', { name: 'Submit report' }),
  ).not.toBeInTheDocument()
})
it('does not offer reporting when context is unavailable', async () => {
  window.history.replaceState({}, '', '/admin/reports/new?orderId=' + order)
  session()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(response({ detail: 'Chat unavailable' }, 503)),
  )
  render(<App />)
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'couldn’t load this',
  )
  expect(
    screen.queryByRole('button', { name: 'Submit report' }),
  ).not.toBeInTheDocument()
})
it('does not query the queue until live administrator eligibility is confirmed', async () => {
  window.history.replaceState({}, '', '/admin/cases')
  session('ADMIN')
  const fetcher = vi.fn().mockResolvedValue(response({}, 403))
  mockServiceFetch(fetcher)
  render(<App />)
  expect(
    await screen.findByText(
      'Switch to the right role in your account menu to see this.',
    ),
  ).toBeVisible()
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(fetcher.mock.calls[0]![0]).toBe('/api/admin/session')
})
it('loads queue filters and empty results from the live API', async () => {
  window.history.replaceState({}, '', '/admin/cases')
  session('ADMIN')
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ userId: actor, role: 'ADMIN' }))
    .mockResolvedValue(
      response({
        content: [],
        page: 0,
        size: 20,
        totalElements: 0,
        totalPages: 0,
      }),
    )
  mockServiceFetch(fetcher)
  render(<App />)
  expect(await screen.findByText('No open cases')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Open' }))
  fireEvent.change(screen.getByLabelText('Find a case or errand'), {
    target: { value: order },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
  await waitFor(() =>
    expect(fetcher.mock.calls.at(-1)?.[0]).toBe(
      '/api/admin/cases?page=0&size=20&status=OPEN&query=' + order,
    ),
  )
})
it('claims using the displayed revision and explains conflicts without claiming success', async () => {
  window.history.replaceState({}, '', '/admin/cases/' + id)
  session('ADMIN')
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ userId: actor, role: 'ADMIN' }))
    .mockResolvedValueOnce(response({ case: summary, statements: [] }))
    .mockResolvedValue(
      response(
        { detail: 'This case has changed. Refresh it before claiming.' },
        409,
      ),
    )
  mockServiceFetch(fetcher)
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Assign to me' }))
  expect(
    await screen.findByText(
      'This case just changed. Refresh, then assign it to yourself.',
    ),
  ).toBeVisible()
  const call = fetcher.mock.calls.find((call) => call[1]?.method === 'POST')!
  expect(call[0]).toBe('/api/admin/cases/' + id + '/claim')
  expect(JSON.parse(call[1].body)).toEqual({ expectedRevision: 1 })
  expect(screen.queryByText('Case assigned to you.')).not.toBeInTheDocument()
})

it('blocks a known historical courier from claiming and gives brief feedback without a claim request', async () => {
  window.history.replaceState({}, '', '/admin/cases/' + id)
  session('ADMIN')
  const at = summary.createdAt
  const fetcher = vi.fn().mockImplementation(async (url: string) => {
    if (url.endsWith('/session'))
      return response({ userId: actor, role: 'ADMIN' })
    if (url.endsWith('/conversations')) return response([])
    if (url.includes('/timeline'))
      return response({
        caseId: id,
        orderId: order,
        evidenceRevision: 'test-only',
        order: {
          orderId: order,
          requesterId: id,
          courierId: null,
          status: 'COMPLETED',
          title: 'Test-only errand',
          description: 'Lunch',
          creditReward: 5,
          pickupDeadline: at,
          pickupLocationId: id,
          dropoffLocationId: id,
          pickupLocationName: 'Canteen',
          dropoffLocationName: 'Library',
        },
        participants: [
          {
            userId: actor,
            relationship: 'HISTORICAL_COURIER',
            assignedAt: at,
            unassignedAt: at,
          },
        ],
        records: [],
        coverage: {
          status: 'UNKNOWN',
          asOf: at,
          checkpoints: [],
          blockingGaps: [],
        },
        nextCursor: null,
      })
    return response({ case: summary, statements: [], actions: [] })
  })
  mockServiceFetch(fetcher)
  render(<App />)
  await screen.findByText('Test-only errand')
  fireEvent.click(screen.getByRole('button', { name: 'Assign to me' }))
  expect(screen.getByRole('status')).toHaveTextContent(
    'You took part in this errand. Another admin must review it.',
  )
  expect(fetcher.mock.calls.some((call) => call[0].endsWith('/claim'))).toBe(
    false,
  )
})
it.each([
  [
    403,
    'You cannot review this case because you requested the errand or were one of its couriers. An independent administrator must review it.',
  ],
  [
    503,
    'Reviewer independence could not be verified. Refresh the evidence and try again. The case remains open.',
  ],
])(
  'explains blocked review and preserves the open case (%s)',
  async (status, detail) => {
    window.history.replaceState({}, '', '/admin/cases/' + id)
    session('ADMIN')
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ userId: actor, role: 'ADMIN' }))
      .mockResolvedValueOnce(response({ case: summary, statements: [] }))
      .mockResolvedValue(response({ detail }, status as number))
    mockServiceFetch(fetcher)
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Assign to me' }))
    expect(
      await within(
        screen
          .getByRole('heading', { name: 'Case details' })
          .closest('section')!,
      ).findByText(
        status === 503
          ? 'We couldn’t confirm you weren’t part of this errand. Refresh the evidence and try again.'
          : detail,
      ),
    ).toBeVisible()
    expect(
      screen.queryByText(
        /You cannot review a case if you requested the errand/,
      ),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Open')).toBeVisible()
    expect(screen.queryByText('Case assigned to you.')).not.toBeInTheDocument()
  },
)
it('removes protected queue data when a later live administrator check denies access', async () => {
  window.history.replaceState({}, '', '/admin/cases')
  session('ADMIN')
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ userId: actor, role: 'ADMIN' }))
    .mockResolvedValueOnce(
      response({
        content: [summary],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
      }),
    )
    .mockResolvedValue(response({}, 403))
  mockServiceFetch(fetcher)
  render(<App />)
  expect(await screen.findByText('Case ' + id)).toBeVisible()
  fireEvent.focus(window)
  expect(
    await screen.findByText(
      'Switch to the right role in your account menu to see this.',
    ),
  ).toBeVisible()
  expect(screen.queryByText('Case ' + id)).not.toBeInTheDocument()
})

it('shows saved preparation without claiming the report or freeze has completed', async () => {
  window.history.replaceState({}, '', '/admin/reports/' + id)
  session()
  mockServiceFetch(
    vi.fn().mockResolvedValue(
      response({
        case: { ...summary, reviewStatus: 'PREPARING' },
        ownStatement: null,
        preparation: { operationId: id, status: 'PENDING' },
      }),
    ),
  )
  render(<App />)
  expect(
    await screen.findByText(/The errand pauses when Order processes it/),
  ).toBeVisible()
  expect(screen.getByText('Preparing review')).toBeVisible()
  expect(screen.queryByText('Report submitted')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('link', { name: 'Add your statement' }),
  ).not.toBeInTheDocument()
})

it('allows a preparation form without claiming synchronous Chat eligibility', async () => {
  window.history.replaceState({}, '', '/admin/reports/new?orderId=' + order)
  session()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      response({
        orderId: order,
        status: 'REPORT_REQUEST_AVAILABLE',
        caseId: null,
        state: null,
      }),
    ),
  )
  render(<App />)
  expect(await screen.findByLabelText('What happened?')).toBeVisible()
  expect(
    screen.queryByText('Reporting is not available'),
  ).not.toBeInTheDocument()
  expect(screen.queryByText('Report submitted')).not.toBeInTheDocument()
})

it('shows a saved preparation from the entry link without offering a duplicate form', async () => {
  window.history.replaceState({}, '', '/admin/reports/new?orderId=' + order)
  session()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      response({
        orderId: order,
        status: 'PREPARING_REVIEW',
        caseId: id,
        state: 'OPEN',
      }),
    ),
  )
  render(<App />)
  expect(
    await screen.findByRole('heading', { name: 'Preparing review' }),
  ).toBeVisible()
  expect(screen.getByText(/Your request is saved/)).toBeVisible()
  expect(screen.queryByLabelText('What happened?')).not.toBeInTheDocument()
  expect(
    screen.queryByText('You already reported this errand'),
  ).not.toBeInTheDocument()
})
it.each([
  { status: 'PREPARING_REVIEW', caseId: null, state: 'OPEN' },
  { status: 'CASE_PARTICIPANT', caseId: null, state: null },
  { status: 'REPORT_REQUEST_AVAILABLE', caseId: id, state: 'OPEN' },
  { status: 'UNKNOWN', caseId: null, state: null },
])('rejects malformed report entry $status', async (body) => {
  window.history.replaceState({}, '', '/admin/reports/new?orderId=' + order)
  session()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(response({ orderId: order, ...body })),
  )
  render(<App />)
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'We couldn’t check reporting access',
  )
  expect(screen.queryByLabelText('What happened?')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('link', { name: 'View case' }),
  ).not.toBeInTheDocument()
})

it.each([400, 503, 202])(
  'freezes the case during a delayed closure and handles response %s safely',
  async (status) => {
    window.history.replaceState({}, '', '/admin/cases/' + id)
    session('ADMIN')
    const current = {
      ...summary,
      state: 'UNDER_REVIEW',
      reviewerId: actor,
      reviewStatus: 'READY',
    }
    let finish!: (value: ReturnType<typeof response>) => void
    const delayed = new Promise<ReturnType<typeof response>>((resolve) => {
      finish = resolve
    })
    const fetcher = vi
      .fn()
      .mockImplementation((url: string, init?: RequestInit) => {
        if (url.endsWith('/session'))
          return Promise.resolve(response({ userId: actor, role: 'ADMIN' }))
        if (url.endsWith('/resolve') && init?.method === 'POST') return delayed
        if (url.includes('/timeline')) return Promise.resolve(response({}, 503))
        if (url.endsWith('/conversations')) return Promise.resolve(response([]))
        if (url.includes('/accounts'))
          return Promise.resolve(response({ content: [] }))
        return Promise.resolve(
          response({
            case: current,
            statements: [
              {
                reporterId: order,
                description: 'Test statement',
                submittedAt: summary.createdAt,
              },
            ],
            actions: [],
          }),
        )
      })
    vi.stubGlobal('fetch', fetcher)
    render(<App />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Adjust credits' }),
    )
    expect(screen.getByLabelText('Number of credits')).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Internal resolution reason'), {
      target: { value: 'Reviewed evidence' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Review case closure' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Close case permanently' }),
    )
    expect(screen.queryByLabelText('Number of credits')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Adjust credits' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Ban account' }),
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('Internal resolution reason')).toBeDisabled()
    expect(screen.getByText(/Case closure is in progress/)).toBeVisible()
    const sent = fetcher.mock.calls.find((call) => call[1]?.method === 'POST')!
    const operationKey = (sent[1]!.headers as Record<string, string>)[
      'Idempotency-Key'
    ]
    await act(async () =>
      finish(
        status === 202
          ? response(
              {
                case: current,
                closure: {
                  operationId: operationKey,
                  resolution: 'Reviewed evidence',
                  revision: 1,
                  explanations: [],
                },
              },
              202,
            )
          : response({ detail: 'Test closure unavailable' }, status),
      ),
    )
    if (status === 400) {
      expect(
        await screen.findByRole('button', { name: 'Adjust credits' }),
      ).toBeEnabled()
      expect(screen.getByLabelText('Number of credits')).toBeEnabled()
    } else {
      expect(
        screen.queryByRole('button', { name: 'Adjust credits' }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByLabelText('Number of credits'),
      ).not.toBeInTheDocument()
      expect(
        sessionStorage.getItem(`foc.resolve-pending.${actor}.${id}`),
      ).toContain(operationKey!)
    }
    expect(
      fetcher.mock.calls.filter((call) => call[1]?.method === 'POST'),
    ).toHaveLength(1)
  },
)

it('restores a pending closure as read-only before another action can be started', async () => {
  window.history.replaceState({}, '', '/admin/cases/' + id)
  session('ADMIN')
  sessionStorage.setItem(
    `foc.resolve-pending.${actor}.${id}`,
    JSON.stringify({
      key: order,
      body: {
        resolution: 'Saved decision',
        expectedRevision: 1,
        rejectedActionExplanations: [],
      },
    }),
  )
  const current = { ...summary, state: 'UNDER_REVIEW', reviewerId: actor }
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation((url: string) =>
        Promise.resolve(
          url.endsWith('/session')
            ? response({ userId: actor, role: 'ADMIN' })
            : url.includes('/timeline')
              ? response({}, 503)
              : url.endsWith('/conversations')
                ? response([])
                : url.includes('/accounts')
                  ? response({ content: [] })
                  : response({
                      case: current,
                      statements: [
                        {
                          reporterId: order,
                          description: 'Test',
                          submittedAt: summary.createdAt,
                        },
                      ],
                      actions: [],
                    }),
        ),
      ),
  )
  render(<App />)
  expect(
    await screen.findByRole('button', { name: 'Check case closure' }),
  ).toBeEnabled()
  expect(
    screen.queryByRole('button', { name: 'Adjust credits' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Ban account' }),
  ).not.toBeInTheDocument()
  expect(screen.getByText(/Case closure is in progress/)).toBeVisible()
})
