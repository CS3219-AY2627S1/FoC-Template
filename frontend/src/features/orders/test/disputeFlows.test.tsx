import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { DisputeDecision, OrderDispute } from '../types/dispute.types'
import { OrderDetailPage } from '../pages/OrderDetailPage/OrderDetailPage'
import { AdminOrderDetailPage } from '../pages/AdminOrderDetailPage/AdminOrderDetailPage'
import { AdminDisputeLogPage } from '../pages/AdminDisputeLogPage/AdminDisputeLogPage'
import { orderFixture } from './orderFixtures'
import * as orders from '../api/orders.api'
import * as disputes from '../api/disputes.api'
import { errandQueryKeys } from '../constants/errandQueryKeys'
import { setAccessToken } from '#/features/auth/lib/accessTokenStore'
import { formatOrderTime } from '../utils/orderFormat'

const state = vi.hoisted(() => ({ navigate: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ orderId: '8e1f0000-0000-4000-8000-000000000001' }),
  useSearch: () => ({
    tab: 'active',
    participation: 'all',
    page: 0,
    requesterId: '',
    auditPage: 0,
  }),
  useNavigate: () => state.navigate,
  Link: ({
    children,
    to,
    params,
  }: {
    children: ReactNode
    to: string
    params?: { orderId: string }
  }) => <a href={to.replace('$orderId', params?.orderId ?? '')}>{children}</a>,
}))
// The errand page also shows the chat; it stays quiet here.
vi.mock('#/lib/realtime', () => ({
  connectRealtime: () => ({ on: vi.fn(), off: vi.fn() }),
}))
vi.mock('../api/orders.api', () => ({
  getOrder: vi.fn(),
  createOrder: vi.fn(),
  retryCreation: vi.fn(),
  actOnOrder: vi.fn(),
  getChat: vi.fn(async () => ({ messages: [], reads: [] })),
  sendMessage: vi.fn(),
  sendChatFile: vi.fn(),
  markChatRead: vi.fn(),
}))
vi.mock('../api/disputes.api', () => ({
  reportDispute: vi.fn(),
  respondToDispute: vi.fn(),
  resolveDispute: vi.fn(),
  listDisputes: vi.fn(),
}))

const caseFixture = (overrides: Partial<OrderDispute> = {}): OrderDispute => ({
  id: 'case-1',
  orderId: orderFixture().id,
  reporterId: 'requester',
  complaint: 'The item was not delivered',
  responderId: null,
  response: null,
  respondedAt: null,
  status: 'OPEN',
  decision: null,
  explanation: null,
  adminId: null,
  createdAt: '2030-01-01T00:10:00Z',
  decidedAt: null,
  resolvedAt: null,
  settlementOperationId: null,
  settlementOutcome: null,
  ...overrides,
})
const token = (id: string, role = 'USER') =>
  `header.${btoa(JSON.stringify({ sub: id, roles: [role] }))}.signature`
const clients: Array<QueryClient> = []
const setup = (element: ReactNode) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clients.push(client)
  render(<QueryClientProvider client={client}>{element}</QueryClientProvider>)
  return client
}
beforeEach(() => {
  vi.clearAllMocks()
  setAccessToken(token('requester'))
})
afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
  setAccessToken(null)
})

it('reports from order detail and removes receipt confirmation while the case is open', async () => {
  const user = userEvent.setup()
  let current = orderFixture({
    status: 'PICKED_UP',
    courier: { id: 'courier', name: 'Sam' },
  })
  vi.mocked(orders.getOrder).mockImplementation(async () => current)
  vi.mocked(disputes.reportDispute).mockImplementation(async () => {
    current = {
      ...current,
      dispute: caseFixture({ complaint: 'Delivery problem' }),
    }
    return current.dispute!
  })
  setup(<OrderDetailPage />)
  await user.click(
    await screen.findByRole('button', { name: 'Report dispute' }),
  )
  await user.type(
    screen.getByRole('textbox', { name: 'Reason for dispute' }),
    'Delivery problem',
  )
  await user.click(screen.getByRole('button', { name: 'Submit dispute' }))
  await screen.findByRole('heading', { name: 'Dispute · Open' })
  expect(disputes.reportDispute).toHaveBeenCalledExactlyOnceWith(
    current.id,
    'Delivery problem',
  )
  expect(
    screen.queryByRole('button', { name: 'Confirm received' }),
  ).not.toBeInTheDocument()
  expect(screen.getByText('Delivery problem')).toBeInTheDocument()
})

it.each(['PAY_COURIER', 'RELEASE_CREDITS', 'DISMISS'] as const)(
  'records %s from admin detail and displays the confirmed outcome',
  async (decision: DisputeDecision) => {
    setAccessToken(token('admin', 'ADMIN'))
    const user = userEvent.setup()
    let current = orderFixture({
      status: 'PICKED_UP',
      courier: { id: 'courier', name: 'Sam' },
      dispute: caseFixture(),
    })
    vi.mocked(orders.getOrder).mockImplementation(async () => current)
    vi.mocked(disputes.resolveDispute).mockImplementation(async () => {
      current = {
        ...current,
        status:
          decision === 'PAY_COURIER'
            ? 'COMPLETED'
            : decision === 'RELEASE_CREDITS'
              ? 'CANCELLED'
              : 'PICKED_UP',
        creditState:
          decision === 'PAY_COURIER'
            ? 'SETTLEMENT_PENDING'
            : decision === 'RELEASE_CREDITS'
              ? 'RELEASE_PENDING'
              : 'RESERVED',
        dispute: caseFixture({
          decision,
          explanation: 'Reviewed the case',
          adminId: 'admin',
          status: decision === 'DISMISS' ? 'RESOLVED' : 'PROCESSING',
          decidedAt: '2030-01-01T00:15:00Z',
          resolvedAt: decision === 'DISMISS' ? '2030-01-01T00:15:00Z' : null,
        }),
      }
      return current.dispute!
    })
    const client = setup(<AdminOrderDetailPage />)
    const selector = await screen.findByRole('combobox', { name: 'Decision' })
    await user.selectOptions(selector, decision)
    await user.type(
      screen.getByRole('textbox', { name: 'Resolution explanation' }),
      'Reviewed the case',
    )
    await user.click(screen.getByRole('button', { name: 'Review decision' }))
    await user.click(
      await screen.findByRole('button', { name: 'Confirm decision' }),
    )
    await waitFor(() =>
      expect(disputes.resolveDispute).toHaveBeenCalledExactlyOnceWith(
        'case-1',
        decision,
        'Reviewed the case',
      ),
    )
    if (decision !== 'DISMISS') {
      await screen.findByText(
        'The admin decision is recorded. Waiting for credit confirmation.',
      )
      expect(
        screen.queryByText(/Payment confirmed\.|Reserved credits released\./),
      ).not.toBeInTheDocument()
      current = {
        ...current,
        creditState: decision === 'PAY_COURIER' ? 'SETTLED' : 'RELEASED',
        dispute: {
          ...current.dispute!,
          status: 'RESOLVED',
          resolvedAt: '2030-01-01T00:16:00Z',
        },
      }
      await client.invalidateQueries({
        queryKey: errandQueryKeys.detail('admin', current.id),
      })
    }
    await screen.findByRole('heading', { name: 'Dispute · Resolved' })
    expect(
      screen.queryByRole('button', { name: 'Review decision' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Reviewed the case')).toBeInTheDocument()
  },
)

it('shows recorded disputes on the Audit log and links to the existing order page', async () => {
  setAccessToken(token('admin', 'ADMIN'))
  vi.mocked(disputes.listDisputes).mockResolvedValue({
    items: [caseFixture()],
    total: 1,
    page: 0,
    size: 20,
  })
  setup(<AdminDisputeLogPage />)
  const link = await screen.findByRole('link', { name: /Order #/ })
  expect(link).toHaveAttribute('href', `/admin/orders/${orderFixture().id}`)
  expect(screen.getByRole('cell', { name: 'Open' })).toBeInTheDocument()
  expect(
    screen.getByRole('cell', { name: 'Awaiting admin decision' }),
  ).toBeInTheDocument()
})

it('prevents an admin from deciding their own order dispute', async () => {
  setAccessToken(token('requester', 'ADMIN'))
  vi.mocked(orders.getOrder).mockResolvedValue(
    orderFixture({ status: 'PICKED_UP', dispute: caseFixture() }),
  )
  setup(<AdminOrderDetailPage />)
  await screen.findByText(
    'Another admin must resolve a dispute involving your own order.',
  )
  expect(
    screen.queryByRole('button', { name: 'Review decision' }),
  ).not.toBeInTheDocument()
})

it('shows a recorded decision after its response is lost without offering another confirmation', async () => {
  setAccessToken(token('admin', 'ADMIN'))
  const user = userEvent.setup()
  let current = orderFixture({
    status: 'PICKED_UP',
    courier: { id: 'courier', name: 'Sam' },
    dispute: caseFixture(),
  })
  vi.mocked(orders.getOrder).mockImplementation(async () => current)
  vi.mocked(disputes.resolveDispute).mockImplementation(async () => {
    current = {
      ...current,
      status: 'COMPLETED',
      creditState: 'SETTLEMENT_PENDING',
      dispute: caseFixture({
        status: 'PROCESSING',
        decision: 'PAY_COURIER',
        explanation: 'Reviewed',
        adminId: 'admin',
        decidedAt: '2030-01-01T00:15:00Z',
      }),
    }
    throw new AxiosError('Response timed out', 'ECONNABORTED')
  })
  setup(<AdminOrderDetailPage />)
  await user.type(
    await screen.findByRole('textbox', { name: 'Resolution explanation' }),
    'Reviewed',
  )
  await user.click(screen.getByRole('button', { name: 'Review decision' }))
  await user.click(
    await screen.findByRole('button', { name: 'Confirm decision' }),
  )
  await screen.findByText(
    'The admin decision is recorded. Waiting for credit confirmation.',
  )
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Review decision' }),
  ).not.toBeInTheDocument()
  expect(disputes.resolveDispute).toHaveBeenCalledTimes(1)
})

it.each(['requester', 'courier'] as const)(
  'lets the other participant respond when the reporter is %s',
  async (reporterId) => {
    const responderId = reporterId === 'requester' ? 'courier' : 'requester'
    const responderName = responderId === 'courier' ? 'Sam' : 'Alex'
    setAccessToken(token(responderId))
    const user = userEvent.setup()
    let current = orderFixture({
      status: 'ACCEPTED',
      courier: { id: 'courier', name: 'Sam' },
      dispute: caseFixture({ reporterId }),
    })
    vi.mocked(orders.getOrder).mockImplementation(async () => current)
    vi.mocked(disputes.respondToDispute).mockImplementation(
      async (_id, response) => {
        current = {
          ...current,
          dispute: {
            ...current.dispute!,
            responderId,
            response,
            respondedAt: '2030-01-01T00:12:00Z',
          },
        }
        return current.dispute!
      },
    )
    setup(<OrderDetailPage />)
    const input = await screen.findByRole('textbox', { name: 'Your response' })
    expect(
      screen.getByRole('button', { name: 'Submit response' }),
    ).toBeDisabled()
    await user.type(input, '  My explanation  ')
    await user.click(screen.getByRole('button', { name: 'Submit response' }))

    await screen.findByText('My explanation')
    expect(disputes.respondToDispute).toHaveBeenCalledExactlyOnceWith(
      'case-1',
      'My explanation',
    )
    expect(
      screen.getByText(new RegExp(`Responded by ${responderName}`)),
    ).toHaveTextContent(formatOrderTime('2030-01-01T00:12:00Z'))
    expect(screen.getByText('The item was not delivered')).toBeInTheDocument()
    expect(
      screen.queryByRole('textbox', { name: 'Your response' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Dispute · Open' }),
    ).toBeInTheDocument()
  },
)

it('shows both statements with their authors and timestamps in the admin order detail', async () => {
  setAccessToken(token('admin', 'ADMIN'))
  vi.mocked(orders.getOrder).mockResolvedValue(
    orderFixture({
      status: 'ACCEPTED',
      courier: { id: 'courier', name: 'Sam' },
      dispute: caseFixture({
        responderId: 'courier',
        response: 'We agreed to meet at the library entrance',
        respondedAt: '2030-01-01T00:12:00Z',
      }),
    }),
  )
  setup(<AdminOrderDetailPage />)
  const evidence = within(
    await screen.findByRole('region', { name: 'Order dispute' }),
  )
  expect(
    evidence.getByRole('heading', { name: 'Complaint' }),
  ).toBeInTheDocument()
  expect(
    evidence.getByRole('heading', { name: 'Participant response' }),
  ).toBeInTheDocument()
  expect(evidence.getByText('The item was not delivered')).toBeInTheDocument()
  expect(
    evidence.getByText('We agreed to meet at the library entrance'),
  ).toBeInTheDocument()
  expect(evidence.getByText(/Reported by Alex/)).toHaveTextContent(
    formatOrderTime('2030-01-01T00:10:00Z'),
  )
  expect(evidence.getByText(/Responded by Sam/)).toHaveTextContent(
    formatOrderTime('2030-01-01T00:12:00Z'),
  )
  expect(
    evidence.queryByRole('textbox', { name: 'Your response' }),
  ).not.toBeInTheDocument()
  expect(
    evidence.getByRole('combobox', { name: 'Decision' }),
  ).toBeInTheDocument()
  expect(screen.getByText('Reserved')).toBeInTheDocument()
})

it('does not offer the reporter a response form', async () => {
  vi.mocked(orders.getOrder).mockResolvedValue(
    orderFixture({
      status: 'ACCEPTED',
      courier: { id: 'courier', name: 'Sam' },
      dispute: caseFixture(),
    }),
  )
  setup(<OrderDetailPage />)
  await screen.findByText('The other participant has not responded yet.')
  expect(
    screen.queryByRole('textbox', { name: 'Your response' }),
  ).not.toBeInTheDocument()
})

it('does not offer a response form after dismissal', async () => {
  setAccessToken(token('courier'))
  vi.mocked(orders.getOrder).mockResolvedValue(
    orderFixture({
      status: 'ACCEPTED',
      courier: { id: 'courier', name: 'Sam' },
      dispute: caseFixture({
        status: 'RESOLVED',
        decision: 'DISMISS',
        explanation: 'Continue the delivery',
        adminId: 'admin',
        decidedAt: '2030-01-01T00:15:00Z',
        resolvedAt: '2030-01-01T00:15:00Z',
      }),
    }),
  )
  setup(<OrderDetailPage />)
  await screen.findByText('No response was submitted.')
  expect(
    screen.queryByRole('textbox', { name: 'Your response' }),
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: "I've collected it" }),
  ).toBeInTheDocument()
})

it('shows a recorded participant response after its HTTP response is lost', async () => {
  setAccessToken(token('courier'))
  const user = userEvent.setup()
  let current = orderFixture({
    status: 'ACCEPTED',
    courier: { id: 'courier', name: 'Sam' },
    dispute: caseFixture(),
  })
  vi.mocked(orders.getOrder).mockImplementation(async () => current)
  vi.mocked(disputes.respondToDispute).mockImplementation(async () => {
    current = {
      ...current,
      dispute: {
        ...current.dispute!,
        responderId: 'courier',
        response: 'My recorded explanation',
        respondedAt: '2030-01-01T00:12:00Z',
      },
    }
    throw new AxiosError('Response timed out', 'ECONNABORTED')
  })
  setup(<OrderDetailPage />)
  await user.type(
    await screen.findByRole('textbox', { name: 'Your response' }),
    'My recorded explanation',
  )
  await user.click(screen.getByRole('button', { name: 'Submit response' }))
  await screen.findByText('My recorded explanation')
  expect(
    screen.queryByRole('button', { name: 'Submit response' }),
  ).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(disputes.respondToDispute).toHaveBeenCalledTimes(1)
})
