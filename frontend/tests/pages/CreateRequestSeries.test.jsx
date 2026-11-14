/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 g (instructions.md) - tests for CreateRequest's series mode: creating a
 *        recurring errand (startAt/startNow, the recurrence picker's output as `rrule`, and
 *        durationMinutes computed from the start/deliver-by gap) and editing one (rrule/
 *        duration change, no startAt sent). Mirrors CreateRequest.test.jsx's mocked style.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-10
 * Scope: Stage 32 (instructions.md) - rewrote the "create" tests: there is no more /series/new
 *        or seriesMode-gated create UI, so creating a delayed and/or recurring errand is now
 *        tested through the unified /requests/new form (Send now/later, Repeat), covering all
 *        three non-plain-order combinations, the one-time COUNT=1 rrule, the duration
 *        validation (before start, over 24h), the "times" end-condition label, and that the
 *        credits remark/hint only show for Send now. The "edit" describe block (series edit)
 *        is unchanged other than the file-level disclosure.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import CreateRequest from '../../src/pages/CreateRequest'

vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ credits: { available: 10 }, isLoggedIn: true, sessionReady: true }),
}))
vi.mock('../../src/api/suppliers', () => ({
  listAllSuppliers: () => Promise.resolve({ data: [{ id: 1, name: 'Deck Cafe' }] }),
  getSupplier: (id) => Promise.resolve({ id: Number(id), name: 'Deck Cafe' }),
}))
vi.mock('../../src/api/lastRequest', () => ({
  getLastRequest: vi.fn(() =>
    Promise.resolve({ last_req_del_loc_id: 3, last_req_del_loc_details: 'Desk' }),
  ),
  saveLastRequest: vi.fn(() => Promise.resolve()),
}))
vi.mock('../../src/api/orders', () => ({
  createOrder: vi.fn(() => Promise.resolve({})),
  editOrder: vi.fn(),
  listMyOrders: vi.fn(() => Promise.resolve({ orders: [] })),
}))
vi.mock('../../src/api/useApi', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useReferenceData: () => ({ locations: [{ location_id: 3, location: 'Library' }] }) }
})

const SERIES = {
  id: 'series-1',
  supplierId: 1,
  description: 'Coffee run',
  deliveryLocationId: 3,
  deliveryDetails: 'Leave at desk',
  credits: 4,
  durationMinutes: 120,
  additionalDetails: null,
  rrule: 'FREQ=DAILY;INTERVAL=1',
  startAt: '2026-11-09T01:00:00.000Z',
}

vi.mock('../../src/api/series', () => ({
  createSeries: vi.fn(() => Promise.resolve({})),
  editSeries: vi.fn(() => Promise.resolve({})),
  getSeries: vi.fn(() => Promise.resolve(SERIES)),
  seriesErrorMessage: (e) => e.message,
}))

const pad = (n) => String(n).padStart(2, '0')
// A date/time one hour from now, split into the <input type="date">/<input type="time">
// values the deliver-by picker expects - keeps the gap from "now" within the 24h cap
// regardless of when the test runs.
function oneHourFromNow() {
  const d = new Date(Date.now() + 60 * 60_000)
  return {
    date: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()),
    time: pad(d.getHours()) + ':' + pad(d.getMinutes()),
  }
}

async function fillCommonFields() {
  fireEvent.change(screen.getByLabelText(/What do you need/), { target: { value: 'Coffee' } })
  // The saved-location prompt fills location + details together, like CreateRequest.test.jsx.
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
}

function renderCreate() {
  return render(
    <MemoryRouter initialEntries={['/requests/new?supplier=1']}>
      <Routes>
        <Route path="/requests/new" element={<CreateRequest />} />
        <Route path="/my-errands" element={<p>Saved</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('CreateRequest: scheduled/recurring creation (Stage 32)', () => {
  it('Send later, Repeat unticked: posts a series with COUNT=1 and startAt', async () => {
    const { createSeries, editSeries } = await import('../../src/api/series')
    const { createOrder } = await import('../../src/api/orders')
    renderCreate()
    await fillCommonFields()

    fireEvent.click(screen.getByRole('button', { name: 'Send later' }))
    // ASAP is hidden once Send later is chosen; only "By a specific time" remains, and the
    // date/time picker for it is already expanded alongside the start date/time picker.
    expect(screen.queryByRole('button', { name: 'ASAP' })).not.toBeInTheDocument()
    const [startDateInput, deliverByDateInput] = screen.getAllByLabelText('Date')
    const [startTimeInput, deliverByTimeInput] = screen.getAllByLabelText('Time')
    fireEvent.change(startDateInput, { target: { value: '2026-12-01' } })
    fireEvent.change(startTimeInput, { target: { value: '09:00' } })
    fireEvent.change(deliverByDateInput, { target: { value: '2026-12-01' } })
    fireEvent.change(deliverByTimeInput, { target: { value: '10:30' } })

    expect(screen.getByRole('button', { name: 'Schedule errand' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Schedule errand' }))

    await screen.findByText('Saved')
    expect(createSeries).toHaveBeenCalledWith(
      expect.objectContaining({
        supplierId: 1,
        description: 'Coffee',
        deliveryLocationId: 3,
        deliveryDetails: 'Desk',
        credits: 4,
        durationMinutes: 90,
        startAt: new Date('2026-12-01T09:00').toISOString(),
      }),
    )
    expect(createSeries.mock.calls[0][0].rrule).toContain('COUNT=1')
    expect(createOrder).not.toHaveBeenCalled()
    expect(editSeries).not.toHaveBeenCalled()
  })

  it('Send now, Repeat ticked: posts a series with startNow, the chosen rule, and shows the credits remark', async () => {
    const { createSeries } = await import('../../src/api/series')
    renderCreate()
    await fillCommonFields()

    // Send now is the default, so the credits remark/hint show.
    expect(screen.getByText(/credits will be reserved until this errand/)).toBeInTheDocument()
    expect(screen.getByText((_, el) => el.tagName === 'P' && /of \d+ credits available/.test(el.textContent))).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Repeat this errand' }))
    fireEvent.click(screen.getByRole('button', { name: 'Week' }))

    fireEvent.click(screen.getByRole('button', { name: 'By a specific time' }))
    const [deliverByDateInput] = screen.getAllByLabelText('Date')
    const [deliverByTimeInput] = screen.getAllByLabelText('Time')
    const { date: inAnHourDate, time: inAnHourTime } = oneHourFromNow()
    fireEvent.change(deliverByDateInput, { target: { value: inAnHourDate } })
    fireEvent.change(deliverByTimeInput, { target: { value: inAnHourTime } })

    expect(screen.getByRole('button', { name: 'Schedule errand' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Schedule errand' }))

    await screen.findByText('Saved')
    expect(createSeries).toHaveBeenCalledWith(
      expect.objectContaining({ startNow: true, rrule: expect.stringContaining('FREQ=WEEKLY') }),
    )
  })

  it('Send later, Repeat ticked: posts a series with startAt and the chosen rule', async () => {
    const { createSeries } = await import('../../src/api/series')
    renderCreate()
    await fillCommonFields()

    fireEvent.click(screen.getByRole('button', { name: 'Send later' }))
    // Credits remark/hint are hidden once Send later is chosen.
    expect(screen.queryByText(/credits will be reserved until this errand/)).not.toBeInTheDocument()
    expect(screen.queryByText((_, el) => el.tagName === 'P' && /of \d+ credits available/.test(el.textContent))).not.toBeInTheDocument()

    const [startDateInput, deliverByDateInput] = screen.getAllByLabelText('Date')
    const [startTimeInput, deliverByTimeInput] = screen.getAllByLabelText('Time')
    fireEvent.change(startDateInput, { target: { value: '2026-12-01' } })
    fireEvent.change(startTimeInput, { target: { value: '09:00' } })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Repeat this errand' }))

    fireEvent.change(deliverByDateInput, { target: { value: '2026-12-01' } })
    fireEvent.change(deliverByTimeInput, { target: { value: '10:00' } })

    fireEvent.click(screen.getByRole('button', { name: 'Schedule errand' }))

    await screen.findByText('Saved')
    expect(createSeries).toHaveBeenCalledWith(
      expect.objectContaining({ startAt: new Date('2026-12-01T09:00').toISOString(), durationMinutes: 60 }),
    )
  })

  it('shows "times" after the after-N-occurrences end condition count', async () => {
    renderCreate()
    await fillCommonFields()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Repeat this errand' }))
    fireEvent.click(screen.getByRole('button', { name: 'After' }))
    expect(screen.getByText('time')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('More occurrences'))
    expect(screen.getByText('times')).toBeInTheDocument()
  })

  it('rejects a complete-by before the start, and more than 24h after it', async () => {
    renderCreate()
    await fillCommonFields()
    fireEvent.click(screen.getByRole('button', { name: 'Send later' }))
    const [startDateInput, deliverByDateInput] = screen.getAllByLabelText('Date')
    const [startTimeInput, deliverByTimeInput] = screen.getAllByLabelText('Time')
    fireEvent.change(startDateInput, { target: { value: '2026-12-01' } })
    fireEvent.change(startTimeInput, { target: { value: '09:00' } })

    // Before the start.
    fireEvent.change(deliverByDateInput, { target: { value: '2026-12-01' } })
    fireEvent.change(deliverByTimeInput, { target: { value: '08:00' } })
    expect(screen.getByRole('button', { name: 'Schedule errand' })).toBeDisabled()
    expect(screen.getByText(/has to be after/)).toBeInTheDocument()

    // More than 24h after the start.
    fireEvent.change(deliverByDateInput, { target: { value: '2026-12-02' } })
    fireEvent.change(deliverByTimeInput, { target: { value: '09:01' } })
    expect(screen.getByRole('button', { name: 'Schedule errand' })).toBeDisabled()
    expect(screen.getByText(/at most 24 hours/)).toBeInTheDocument()
  })
})

describe('CreateRequest series mode: edit', () => {
  it('loads the series and saves via editSeries with the rebuilt rrule, without startAt', async () => {
    const { editSeries } = await import('../../src/api/series')
    render(
      <MemoryRouter initialEntries={['/series/series-1/edit']}>
        <Routes>
          <Route path="/series/:id/edit" element={<CreateRequest seriesMode />} />
          <Route path="/my-errands" element={<p>Saved</p>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByLabelText(/Exact delivery details/)).toHaveValue('Leave at desk')
    expect(screen.getByText('Edit recurring errand')).toBeInTheDocument()
    // startAt can't be edited: no "When should this order be sent?" section.
    expect(screen.queryByText('When should this order be sent?')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByText('Saved')
    expect(editSeries).toHaveBeenCalledWith(
      'series-1',
      expect.objectContaining({
        rrule: 'FREQ=DAILY;INTERVAL=1',
        deliveryDetails: 'Leave at desk',
      }),
    )
  })
})
