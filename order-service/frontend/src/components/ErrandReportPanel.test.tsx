import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { ErrandReportPanel } from './ErrandReportPanel'
import {
  order,
  signIn,
  REQUESTER_ID,
  STRANGER_ID,
  stubFetch,
} from '../test/fixtures'
import {
  sessionChangedEvent,
  sessionExpiredEvent,
  readSession,
} from '../auth/session'

const id = order().id
const caseId = '10000000-0000-4000-8000-000000000001'
afterEach(() => {
  sessionStorage.clear()
  vi.unstubAllGlobals()
})

it('clears the prior report link when identity changes and offers sign-in after expiry', async () => {
  signIn(REQUESTER_ID, 'REQUESTER')
  vi.stubGlobal(
    'fetch',
    stubFetch(() => ({
      body:
        readSession()?.userId === REQUESTER_ID
          ? { orderId: id, status: 'OWN_REPORT', caseId, state: 'OPEN' }
          : { orderId: id, status: 'INELIGIBLE', caseId: null, state: null },
    })).fetchMock,
  )
  show()
  expect(
    await screen.findByRole('link', { name: 'View your report' }),
  ).toBeVisible()
  act(() => {
    signIn(STRANGER_ID, 'COURIER')
    window.dispatchEvent(new Event(sessionChangedEvent))
  })
  await waitFor(() => {
    expect(
      screen.queryByText('Need help with this errand?'),
    ).not.toBeInTheDocument()
  })
  expect(
    screen.queryByRole('link', { name: 'View your report' }),
  ).not.toBeInTheDocument()
  act(() => {
    sessionStorage.clear()
    window.dispatchEvent(new Event(sessionExpiredEvent))
  })
  expect(
    screen.getByRole('link', { name: 'Sign in to view your report' }),
  ).toHaveAttribute(
    'href',
    '/?returnTo=' + encodeURIComponent('/errands/' + id),
  )
})
function show() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ErrandReportPanel orderId={id} />
    </QueryClientProvider>,
  )
}
it.each(['REQUESTER', 'COURIER'] as const)(
  'offers reporting only after Admin verifies a %s participant',
  async (role) => {
    signIn(REQUESTER_ID, role)
    const { fetchMock, calls } = stubFetch(() => ({
      body: { orderId: id, status: 'ELIGIBLE', caseId: null, state: null },
    }))
    vi.stubGlobal('fetch', fetchMock)
    show()
    expect(
      await screen.findByRole('link', { name: 'Report an issue' }),
    ).toHaveAttribute('href', `/admin/reports/new?orderId=${id}`)
    expect(calls[0]?.url).toBe(`/api/admin/orders/${id}/report-context`)
  },
)
it('links only to the callers own existing report including resolved status', async () => {
  signIn(REQUESTER_ID, 'REQUESTER')
  vi.stubGlobal(
    'fetch',
    stubFetch(() => ({
      body: { orderId: id, status: 'OWN_REPORT', caseId, state: 'RESOLVED' },
    })).fetchMock,
  )
  show()
  expect(
    await screen.findByRole('link', { name: 'View your report' }),
  ).toHaveAttribute('href', `/admin/reports/${caseId}`)
  expect(screen.getByText(/Your report is resolved/)).toBeVisible()
  expect(
    screen.queryByRole('link', { name: 'Report an issue' }),
  ).not.toBeInTheDocument()
})
it('distinguishes an unavailable dependency from ineligibility and retries', async () => {
  signIn(REQUESTER_ID, 'COURIER')
  let failed = true
  vi.stubGlobal(
    'fetch',
    stubFetch(() =>
      failed
        ? { status: 503, body: { detail: 'Chat unavailable' } }
        : {
            body: {
              orderId: id,
              status: 'INELIGIBLE',
              caseId: null,
              state: null,
            },
          },
    ).fetchMock,
  )
  show()
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'We can’t load reports right now',
  )
  expect(
    screen.queryByRole('link', { name: 'Report an issue' }),
  ).not.toBeInTheDocument()
  failed = false
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Retry report access' }))
  await waitFor(() => {
    expect(
      screen.queryByText('Need help with this errand?'),
    ).not.toBeInTheDocument()
  })
})
it('fails closed on malformed context rather than offering reporting', async () => {
  signIn(REQUESTER_ID, 'REQUESTER')
  vi.stubGlobal(
    'fetch',
    stubFetch(() => ({
      body: { orderId: id, status: 'OWN_REPORT', caseId: null, state: null },
    })).fetchMock,
  )
  show()
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'We can’t load reports right now',
  )
})

it('explains a report to a verified nonreporter and offers their statement and admin contact', async () => {
  signIn(REQUESTER_ID, 'REQUESTER')
  vi.stubGlobal(
    'fetch',
    stubFetch(() => ({
      body: { orderId: id, status: 'CASE_PARTICIPANT', caseId, state: 'OPEN' },
    })).fetchMock,
  )
  show()
  expect(
    await screen.findByText(/You have not submitted a statement/),
  ).toBeVisible()
  expect(
    screen.getByRole('link', { name: 'Add your statement' }),
  ).toHaveAttribute('href', '/admin/reports/new?orderId=' + id)
  expect(
    screen.getByRole('link', { name: 'View case and contact admin' }),
  ).toHaveAttribute('href', '/admin/reports/' + caseId)
})

// Exercise the actual producer schema, rather than repeating a stale status list in mocks.
// Read only when the tests run; the service-only Docker context does not contain root docs.
const contextBranches: {
  properties: {
    status: { enum: string[] }
    caseId: { type: string }
    state: { type: string }
  }
}[] = JSON.parse(
  readFileSync(
    resolve(process.cwd(), '../../docs/contracts/n2h.openapi.json'),
    'utf8',
  ),
).components.schemas.ReportContext.oneOf
const publishedContexts = contextBranches.flatMap((branch) =>
  branch.properties.status.enum.map((status) => ({
    orderId: id,
    status,
    caseId: branch.properties.caseId.type === 'null' ? null : caseId,
    state: branch.properties.state.type === 'null' ? null : 'OPEN',
  })),
)
it.each(publishedContexts)(
  'supports published Admin report-context $status',
  async (body) => {
    signIn(REQUESTER_ID, 'REQUESTER')
    vi.stubGlobal('fetch', stubFetch(() => ({ body })).fetchMock)
    show()
    const labels: Record<string, string> = {
      REPORT_REQUEST_AVAILABLE: 'Report an issue',
      PREPARING_REVIEW: 'View review progress',
      OWN_REPORT: 'View your report',
      CASE_PARTICIPANT: 'View case and contact admin',
    }
    expect(labels[body.status]).toBeDefined()
    expect(
      await screen.findByRole('link', { name: labels[body.status] }),
    ).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    if (body.status === 'PREPARING_REVIEW') {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Your request is saved',
      )
      expect(
        screen.queryByRole('link', { name: 'Report an issue' }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByText(/Your report is awaiting review/),
      ).not.toBeInTheDocument()
    }
  },
)
it('accepts the previous available spelling while older Admin deployments drain', async () => {
  signIn(REQUESTER_ID, 'REQUESTER')
  vi.stubGlobal(
    'fetch',
    stubFetch(() => ({
      body: {
        orderId: id,
        status: 'PREPARATION_AVAILABLE',
        caseId: null,
        state: null,
      },
    })).fetchMock,
  )
  show()
  expect(
    await screen.findByRole('link', { name: 'Report an issue' }),
  ).toBeVisible()
})
it.each([
  { status: 'PREPARING_REVIEW', caseId: null, state: 'OPEN' },
  { status: 'PREPARING_REVIEW', caseId, state: null },
  { status: 'REPORT_REQUEST_AVAILABLE', caseId, state: 'OPEN' },
  { status: 'UNRECOGNIZED_STATUS', caseId: null, state: null },
])('rejects malformed or unsupported context $status', async (body) => {
  signIn(REQUESTER_ID, 'REQUESTER')
  vi.stubGlobal(
    'fetch',
    stubFetch(() => ({ body: { orderId: id, ...body } })).fetchMock,
  )
  show()
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'We can’t load reports right now',
  )
  expect(
    screen.queryByRole('link', { name: 'Report an issue' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('link', { name: 'View review progress' }),
  ).not.toBeInTheDocument()
})
it('polls a saved preparation until the report is accepted without submitting another request', async () => {
  signIn(REQUESTER_ID, 'REQUESTER')
  let ready = false
  const { fetchMock, calls } = stubFetch(() => ({
    body: {
      orderId: id,
      status: ready ? 'OWN_REPORT' : 'PREPARING_REVIEW',
      caseId,
      state: 'OPEN',
    },
  }))
  vi.stubGlobal('fetch', fetchMock)
  show()
  await screen.findByRole('link', { name: 'View review progress' })
  ready = true
  expect(
    await screen.findByRole(
      'link',
      { name: 'View your report' },
      { timeout: 6000 },
    ),
  ).toBeVisible()
  expect(calls.length).toBeGreaterThan(1)
  expect(
    calls.every((call) => !call.init?.method || call.init.method === 'GET'),
  ).toBe(true)
})
