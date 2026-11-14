/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 g (instructions.md) - tests for the `failed` status: shows the Failed chip
 *        and its failure reason, no "Open chat" action, and the "from a recurring errand" tag
 *        on an order with a seriesId. Mirrors MyActivitySplit.test.jsx's mocked-API style.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import MyErrands from '../../src/pages/MyErrands'

vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ isLoggedIn: true, sessionReady: true, requireAuth: vi.fn() }),
}))

vi.mock('../../src/api/lookups', () => ({
  useLocationNames: () => () => 'The Deck',
  useSupplier: () => null,
  useUserName: () => null,
}))

vi.mock('../../src/api/series', () => ({
  listMySeries: () => Promise.resolve({ ok: true, series: [] }),
}))

const FAILED_ERRAND = {
  id: 'o-failed',
  status: 'failed',
  failureReason: 'SERIES_SUPPLIER_CLOSED',
  description: 'Recurring coffee',
  credits: 4,
  deliveryLocationId: 1,
  supplierId: 's-1',
  seriesId: 'series-1',
}

vi.mock('../../src/api/orders', () => ({
  listMyOrders: vi.fn((as) =>
    Promise.resolve({ orders: as === 'requester' ? [FAILED_ERRAND] : [] }),
  ),
  listActiveDeliveries: vi.fn(() => Promise.resolve({ orders: [] })),
  orderErrorMessage: (err) => err.message,
  pickupOrder: () => {},
  deliverOrder: () => {},
  completeOrder: () => {},
  cancelOrder: () => {},
}))

describe('failed errand', () => {
  it('shows the Failed chip, the failure reason, the series tag, and no Open chat button', async () => {
    render(
      <MemoryRouter>
        <MyErrands />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('Recurring coffee')).toBeInTheDocument())
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(
      screen.getByText('The supplier was closed and could not reopen in time.'),
    ).toBeInTheDocument()
    expect(screen.getByText('From a recurring errand')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open chat' })).not.toBeInTheDocument()
  })
})
