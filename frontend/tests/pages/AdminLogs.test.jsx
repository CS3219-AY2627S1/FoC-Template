/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Tests for the new admin audit log page (instructions.md Stage 26e): rendering a page
 *        of entries including "user deleted" for a null actor/target username, each filter and
 *        the sort toggle changing listAuditLogs' params (debounced actor/target, repeatable
 *        action, reasonCode, from/to, sortDir), resetting to page 1 on a filter change, the
 *        empty state, pagination via Pager, and a failure toast. listAuditLogs is mocked.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-08, Codex, model: GPT-6): Updated dropdown interaction tests.
 * Author review: Congchen
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/Toast'
import AdminLogs from '../../src/pages/AdminLogs'
import { listAuditLogs } from '../../src/api/auditLog'

vi.mock('../../src/api/auditLog', () => ({
  listAuditLogs: vi.fn(),
}))

vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ isLoggedIn: true, sessionReady: true }),
}))

function logsPage(logs, overrides) {
  return { logs, page: 1, pageSize: 50, total: logs.length, totalPages: 1, ...overrides }
}

function entry(overrides) {
  return {
    id: 'log-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    actorId: 'admin-1',
    actorUsername: 'admin',
    action: 'USER_SUSPEND',
    targetId: 'user-1',
    targetUsername: 'alice',
    before: { status: 'active' },
    after: { status: 'suspended' },
    reason: 'FRAUD_OR_SCAM',
    userAgent: 'Mozilla/5.0 Test',
    ...overrides,
  }
}

function renderPage() {
  return render(
    <ToastProvider>
      <AdminLogs />
    </ToastProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('AdminLogs rendering', () => {
  it('renders a row with its fields, and "user deleted" for a null actor/target username', async () => {
    listAuditLogs.mockResolvedValue(
      logsPage([entry(), entry({ id: 'log-2', actorUsername: null, targetUsername: null })]),
    )
    renderPage()

    expect(await screen.findByText('alice')).toBeInTheDocument()
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getAllByText('Suspend').length).toBeGreaterThan(0)
    expect(screen.getAllByText('active → suspended')).toHaveLength(2)
    expect(screen.getAllByText('FRAUD_OR_SCAM').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Mozilla/5.0 Test')).toHaveLength(2)
    expect(screen.getAllByText('user deleted')).toHaveLength(2)
  })

  it('shows the empty state when there are no rows', async () => {
    listAuditLogs.mockResolvedValue(logsPage([]))
    renderPage()

    expect(await screen.findByText('No audit log entries match those filters')).toBeInTheDocument()
  })

  it('a load failure shows a toast', async () => {
    listAuditLogs.mockRejectedValue({ code: 'FORBIDDEN' })
    renderPage()

    expect(await screen.findByRole('status')).toHaveTextContent("You don't have access to do that.")
  })
})

describe('AdminLogs filters and sort', () => {
  it('actor/target filters are debounced (300ms) and reset the page to 1', async () => {
    listAuditLogs.mockResolvedValue(logsPage([entry()]))
    renderPage()
    await screen.findByText('alice')
    listAuditLogs.mockClear()

    vi.useFakeTimers()
    fireEvent.change(screen.getByLabelText('Filter by actor'), { target: { value: 'ali' } })
    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(listAuditLogs).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    vi.useRealTimers()

    await waitFor(() =>
      expect(listAuditLogs).toHaveBeenCalledWith(expect.objectContaining({ page: 1, actor: 'ali' })),
    )
  })

  it('action is sent as an array (repeatable param) with the selected values', async () => {
    listAuditLogs.mockResolvedValue(logsPage([entry()]))
    renderPage()
    await screen.findByText('alice')
    listAuditLogs.mockClear()

    fireEvent.focus(screen.getByLabelText('Filter by action'))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Suspend' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Unlock' }))

    await waitFor(() =>
      expect(listAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({ action: ['USER_SUSPEND', 'USER_UNLOCK'] }),
      ),
    )
  })

  it('reasonCode and from/to filters are passed through, AND together', async () => {
    listAuditLogs.mockResolvedValue(logsPage([entry()]))
    renderPage()
    await screen.findByText('alice')
    listAuditLogs.mockClear()

    fireEvent.focus(screen.getByLabelText('Filter by reason code'))
    fireEvent.click(screen.getByRole('option', { name: /Fraud or scam/i }))
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-01-01T00:00' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-01-02T00:00' } })

    await waitFor(() =>
      expect(listAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          reasonCode: 'FRAUD_OR_SCAM',
          from: new Date('2026-01-01T00:00').toISOString(),
          to: new Date('2026-01-02T00:00').toISOString(),
        }),
      ),
    )
  })

  it('clicking the Time header flips sortDir, defaulting to desc', async () => {
    listAuditLogs.mockResolvedValue(logsPage([entry()]))
    renderPage()
    await screen.findByText('alice')
    expect(listAuditLogs).toHaveBeenCalledWith(expect.objectContaining({ sortDir: 'desc' }))
    listAuditLogs.mockClear()

    fireEvent.click(screen.getByRole('button', { name: /Time/ }))

    await waitFor(() => expect(listAuditLogs).toHaveBeenCalledWith(expect.objectContaining({ sortDir: 'asc' })))
  })

  it('changing a filter resets an advanced page back to 1', async () => {
    listAuditLogs.mockResolvedValue(logsPage([entry()], { page: 2, totalPages: 3 }))
    renderPage()
    await screen.findByText('alice')

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    listAuditLogs.mockClear()

    fireEvent.focus(screen.getByLabelText('Filter by reason code'))
    fireEvent.click(screen.getByRole('option', { name: /Fraud or scam/i }))

    await waitFor(() => expect(listAuditLogs).toHaveBeenCalledWith(expect.objectContaining({ page: 1 })))
  })
})
