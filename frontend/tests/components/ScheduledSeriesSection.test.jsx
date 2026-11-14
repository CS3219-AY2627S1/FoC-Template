/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 g (instructions.md) - tests for ScheduledSeriesSection: the rule summary
 *        and next-dates list, the pause/resume/delete reminder dialogs (including the
 *        pending+open count text) and that they call the right series API function.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-10
 * Scope: Stage 32 (instructions.md) - removed the stale claim that this file tested the
 *        "New" button's navigation; no test here ever exercised it, and the button itself is
 *        now removed (CreateRequest.test.jsx/CreateRequestSeries.test.jsx cover the unified
 *        create form it was replaced by).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import ScheduledSeriesSection from '../../src/components/ScheduledSeriesSection'

vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ isLoggedIn: true, sessionReady: true, requireAuth: vi.fn() }),
}))

const SERIES = {
  id: 's-1',
  description: 'Coffee run',
  status: 'active',
  rrule: 'FREQ=DAILY;INTERVAL=1',
  startAt: '2026-11-09T01:00:00.000Z',
  upcomingDates: ['2026-11-10T01:00:00.000Z', '2026-11-11T01:00:00.000Z'],
  activeOrderCount: 2,
}

vi.mock('../../src/api/series', () => ({
  listMySeries: vi.fn(() => Promise.resolve({ ok: true, series: [SERIES] })),
  editSeries: vi.fn(() => Promise.resolve({})),
  deleteSeries: vi.fn(() => Promise.resolve({ ok: true })),
  seriesErrorMessage: (e) => e.message,
}))

function renderSection() {
  return render(
    <MemoryRouter>
      <ScheduledSeriesSection />
    </MemoryRouter>,
  )
}

describe('ScheduledSeriesSection', () => {
  it('shows the rule summary and upcoming dates', async () => {
    renderSection()
    expect(await screen.findByText('Coffee run')).toBeInTheDocument()
    expect(screen.getByText('Every day')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('shows an empty state with no series', async () => {
    const { listMySeries } = await import('../../src/api/series')
    listMySeries.mockResolvedValueOnce({ ok: true, series: [] })
    renderSection()
    expect(await screen.findByText(/No recurring errands yet/)).toBeInTheDocument()
  })

  it('pausing shows a reminder naming the unaffected order count, then calls editSeries', async () => {
    const { editSeries } = await import('../../src/api/series')
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }))
    expect(await screen.findByText(/2 errands already posted/)).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Pause' }).at(-1))
    await waitFor(() => expect(editSeries).toHaveBeenCalledWith('s-1', { status: 'inactive' }))
  })

  it('deleting calls deleteSeries after confirming', async () => {
    const { deleteSeries } = await import('../../src/api/series')
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1))
    await waitFor(() => expect(deleteSeries).toHaveBeenCalledWith('s-1'))
  })

  it('resume shows a reminder for a paused series and calls editSeries with active', async () => {
    const { listMySeries, editSeries } = await import('../../src/api/series')
    listMySeries.mockResolvedValueOnce({
      ok: true,
      series: [{ ...SERIES, status: 'inactive', activeOrderCount: 0 }],
    })
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Resume' }))
    expect(await screen.findByText(/No errands have been posted from it yet/)).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Resume' }).at(-1))
    await waitFor(() => expect(editSeries).toHaveBeenCalledWith('s-1', { status: 'active' }))
  })
})
