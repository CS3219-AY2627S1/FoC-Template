/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Test for RequestBoard.jsx's empty state, created for instructions.md Stage 22's "Find
 *        errands empty state" row ("Remove the 'Post an errand' button. Heading: 'No errands
 *        available'. Text: 'Check back in a bit.'"). listOrders, useReferenceData and
 *        useLocationNames are mocked; AuthContext is mocked logged-in so the page's own
 *        session gate does not interfere.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RequestBoard from '../../src/pages/RequestBoard'

vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ isLoggedIn: true, sessionReady: true }),
}))

vi.mock('../../src/api/orders', () => ({
  listOrders: vi.fn(() => Promise.resolve({ orders: [], nextCursor: null })),
}))

vi.mock('../../src/api/lookups', () => ({
  useLocationNames: () => () => '',
}))

vi.mock('../../src/api/useApi', () => ({
  useReferenceData: () => ({ locations: [], categories: [] }),
}))

describe('RequestBoard empty state', () => {
  it('has no "Post an errand" button and reads "No errands available" / "Check back in a bit."', async () => {
    render(<RequestBoard />)

    await waitFor(() => expect(screen.getByText('No errands available')).toBeInTheDocument())
    expect(screen.getByText('Check back in a bit.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Post an errand' })).not.toBeInTheDocument()
  })
})
