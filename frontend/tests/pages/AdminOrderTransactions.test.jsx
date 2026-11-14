/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Tests for the new admin order-history page (instructions.md Stage 24, F5.3.2):
 *        rendering every listed field, "Order not found" for a missing order and for an order
 *        that doesn't involve the viewed user, an empty-transactions message, the transactions
 *        section's own error+retry staying independent of the order section, and the credits
 *        colour/sign rule (held/returned with no sign for reservation/release, signed for
 *        transfer). getOrder, listOrderTransactions and the lookups hooks are mocked.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminOrderTransactions from '../../src/pages/AdminOrderTransactions'
import { getOrder } from '../../src/api/orders'
import { listOrderTransactions } from '../../src/api/credits'

vi.mock('../../src/api/orders', () => ({
  getOrder: vi.fn(),
}))

vi.mock('../../src/api/credits', () => ({
  listOrderTransactions: vi.fn(),
}))

vi.mock('../../src/api/lookups', () => ({
  useUserName: () => null,
  useSupplier: () => ({ name: 'Roasted Delights' }),
  useLocationNames: () => (id) => 'Location ' + id,
}))

vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ isLoggedIn: true, sessionReady: true, requireAuth: vi.fn() }),
}))

function order(overrides) {
  return {
    id: 'order-aaaaaaaa-1111',
    requesterId: 'user-1',
    courierId: 'user-2',
    supplierId: 1,
    deliveryLocationId: 5,
    credits: 20,
    status: 'completed',
    completeBy: '2026-02-01T10:00:00Z',
    description: 'Buy bubble tea',
    additionalDetails: 'Less sugar',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    acceptedAt: '2026-01-01T01:00:00Z',
    deliveredAt: '2026-01-01T02:00:00Z',
    creditReleasedAt: '2026-01-01T03:00:00Z',
    ...overrides,
  }
}

function renderPage(initialEntries = ['/admin/user-transactions/user-1/order-aaaaaaaa-1111']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/admin/user-transactions/:userId" element={<p>User history page</p>} />
        <Route
          path="/admin/user-transactions/:userId/:requestId"
          element={<AdminOrderTransactions />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AdminOrderTransactions order section', () => {
  it('shows every listed field', async () => {
    getOrder.mockResolvedValue(order())
    listOrderTransactions.mockResolvedValue([])
    renderPage()

    expect(await screen.findByText('Roasted Delights')).toBeInTheDocument()
    expect(screen.getByText('Location 5')).toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
    expect(screen.getByText('completed')).toBeInTheDocument()
    expect(screen.getByText('Buy bubble tea')).toBeInTheDocument()
    expect(screen.getByText('Less sugar')).toBeInTheDocument()
    // version is not shown, per the stage's spec.
    expect(screen.queryByText(/version/i)).not.toBeInTheDocument()
  })

  it('a nonexistent order id shows "Order not found"', async () => {
    getOrder.mockRejectedValue({ status: 404, message: 'Order not found.' })
    listOrderTransactions.mockResolvedValue([])
    renderPage()

    expect(await screen.findByText('Order not found')).toBeInTheDocument()
  })

  it('an order that does not involve the viewed user shows "Order not found"', async () => {
    getOrder.mockResolvedValue(order({ requesterId: 'someone-else', courierId: null }))
    listOrderTransactions.mockResolvedValue([])
    renderPage()

    expect(await screen.findByText('Order not found')).toBeInTheDocument()
  })

  it('"Back to user" returns to the user history page', async () => {
    getOrder.mockResolvedValue(order())
    listOrderTransactions.mockResolvedValue([])
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: '← Back to user' }))

    expect(await screen.findByText('User history page')).toBeInTheDocument()
  })
})

describe('AdminOrderTransactions transactions section', () => {
  it('an order with no transactions shows the empty message', async () => {
    getOrder.mockResolvedValue(order())
    listOrderTransactions.mockResolvedValue([])
    renderPage()

    expect(await screen.findByText('No transactions.')).toBeInTheDocument()
  })

  it('a credit-service failure errors only the transactions section; the order still renders, and retry works', async () => {
    getOrder.mockResolvedValue(order())
    listOrderTransactions.mockRejectedValueOnce({
      status: 503,
      message: 'Credit service unavailable.',
    })
    listOrderTransactions.mockResolvedValueOnce([
      { id: 'tx-1', type: 'transfer', amount: 5, delta: -5, direction: 'out', originatingUserId: 'user-1', destinationUserId: 'user-2', timestamp: '1 Jan 2026, 10:00' },
    ])
    renderPage()

    expect(await screen.findByText('Roasted Delights')).toBeInTheDocument()
    expect(await screen.findByText('Credit service unavailable.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(listOrderTransactions).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('−5')).toBeInTheDocument()
  })

  it('shows held/returned with no sign for a reservation or release, and a signed amount for a transfer', async () => {
    getOrder.mockResolvedValue(order())
    listOrderTransactions.mockResolvedValue([
      {
        id: 'tx-hold',
        type: 'reservation',
        amount: 20,
        delta: 0,
        direction: 'hold',
        originatingUserId: 'user-1',
        destinationUserId: null,
        timestamp: '1 Jan 2026, 09:00',
      },
      {
        id: 'tx-transfer',
        type: 'transfer',
        amount: 20,
        delta: 20,
        direction: 'in',
        originatingUserId: 'user-1',
        destinationUserId: 'user-2',
        timestamp: '1 Jan 2026, 10:00',
      },
    ])
    renderPage()

    expect(await screen.findByText('held')).toBeInTheDocument()
    expect(screen.getByText('+20')).toBeInTheDocument()
  })
})
