/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Component tests for the N2 description box on the create page: counter and cap, unavailable state,
 *        filling only returned fields, labels, edits during a request, failure and rate-limit messages.
 * Author review: Reviewed and approved by @mattis.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, NetworkError } from '../api/client'
import * as errandApi from '../api/errandApi'
import * as supplierApi from '../api/supplierApi'
import { AuthContext, type AuthApi } from '../auth/authContext'
import type { Supplier } from '../suppliers/types'
import { CreateErrandPage } from './CreateErrandPage'
import { FAILURE_TEXT, FILLED_LABEL, UNAVAILABLE_TEXT } from './extractionCopy'
import { SUPPLIER_ID } from './testFixtures'
import type { ExtractedErrand } from './types'

vi.mock('../api/errandApi', () => ({ createErrand: vi.fn(), getExtractionStatus: vi.fn(), extractErrand: vi.fn() }))
vi.mock('../api/supplierApi', () => ({ getSupplier: vi.fn(), listSuppliers: vi.fn() }))

const supplier: Supplier = {
  id: SUPPLIER_ID,
  name: 'Overnight Coffee',
  categories: ['COFFEE'],
  buildingCode: 'COM3',
  buildingLabel: 'COM3',
  floor: null,
  locationDescription: 'Beside the main entrance',
  latitude: null,
  longitude: null,
  hoursKind: 'ALL_DAY',
  opensAt: null,
  closesAt: null,
  imagePath: null,
  status: 'ACTIVE',
  version: 0,
  createdAt: '2026-09-24T08:00:00Z',
  updatedAt: '2026-09-24T08:00:00Z',
  archivedAt: null,
}

const memberAuth: AuthApi = {
  status: 'loggedIn',
  user: { username: 'member_one', displayName: 'Member One', role: 'MEMBER' },
  notice: null,
  login: vi.fn(),
  logout: vi.fn(),
}

const nothing: ExtractedErrand = {
  supplierId: null,
  items: null,
  dropoffLocation: null,
  notes: null,
  creditAmount: null,
  listingDeadline: null,
  pickupDeadline: null,
  deliveryDeadline: null,
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const description = () => screen.getByLabelText(/Say what you need/)
const fillButton = () => screen.getByRole('button', { name: /Fill in the form|Filling in…/ })
const labels = () => screen.queryAllByText(FILLED_LABEL)

describe('Describe your errand', () => {
  beforeEach(() => {
    vi.mocked(errandApi.getExtractionStatus).mockResolvedValue({ available: true, reason: null })
    vi.mocked(supplierApi.getSupplier).mockResolvedValue({ supplier, etag: '"v0"' })
    vi.mocked(supplierApi.listSuppliers).mockResolvedValue({ items: [supplier], page: 0, size: 6, totalItems: 1, totalPages: 1 })
  })
  afterEach(() => vi.useRealTimers())

  it('counts characters and stops at 1000', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(await screen.findByLabelText(/Say what you need/), 'Latte')
    expect(screen.getByText('5/1000')).toBeInTheDocument()
    expect(description()).toHaveAttribute('maxLength', '1000')
    fireEvent.change(description(), { target: { value: 'x'.repeat(1005) } })
    expect(description()).toHaveValue('x'.repeat(1000))
    expect(screen.getByText('1000/1000')).toBeInTheDocument()
  })

  it.each([
    ['the feature is off', () => vi.mocked(errandApi.getExtractionStatus).mockResolvedValue({ available: false, reason: 'DISABLED' })],
    ['there is no API key', () => vi.mocked(errandApi.getExtractionStatus).mockResolvedValue({ available: false, reason: 'NOT_CONFIGURED' })],
    ['the status call fails', () => vi.mocked(errandApi.getExtractionStatus).mockRejectedValue(new NetworkError())],
  ])('shows the box as unavailable when %s', async (_name, arrange) => {
    arrange()
    renderPage()

    expect(await screen.findByText(UNAVAILABLE_TEXT)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Fill in the form' })).not.toBeInTheDocument()
    // The form itself still works
    expect(screen.getByRole('button', { name: 'Post errand' })).toBeEnabled()
  })

  it('fills only the fields that came back with a value, labels them, and submits nothing', async () => {
    vi.mocked(errandApi.extractErrand).mockResolvedValue({
      ...nothing,
      supplierId: SUPPLIER_ID,
      items: [
        { name: 'Iced latte', quantity: 2 },
        { name: 'Croissant', quantity: null },
      ],
      notes: 'Less ice',
      creditAmount: 15,
    })
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('Drop-off location'), 'My desk')
    const listingBefore = (screen.getByLabelText('Accepted by') as HTMLInputElement).value
    await user.type(await screen.findByLabelText(/Say what you need/), 'Two iced lattes and a croissant from Overnight Coffee')
    await user.click(fillButton())

    expect(await screen.findByText('Overnight Coffee')).toBeInTheDocument()
    expect(errandApi.extractErrand).toHaveBeenCalledWith('Two iced lattes and a croissant from Overnight Coffee')
    expect(screen.getByLabelText('Item 1', { exact: true })).toHaveValue('Iced latte')
    expect(screen.getAllByLabelText('Qty').map((input) => (input as HTMLInputElement).value)).toEqual(['2', '1'])
    expect(screen.getByLabelText('Item 2', { exact: true })).toHaveValue('Croissant')
    expect(screen.getByLabelText(/Notes for the courier/)).toHaveValue('Less ice')
    expect(screen.getByLabelText(/Credits offered/)).toHaveValue(15)
    // Left alone: what was typed, and the default deadlines
    expect(screen.getByLabelText('Drop-off location')).toHaveValue('My desk')
    expect(screen.getByLabelText('Accepted by')).toHaveValue(listingBefore)
    expect(labels()).toHaveLength(4) // supplier, items, notes, credits
    expect(errandApi.createErrand).not.toHaveBeenCalled()
  })

  it('removes a label as soon as its field is edited', async () => {
    vi.mocked(errandApi.extractErrand).mockResolvedValue({ ...nothing, notes: 'Less ice', creditAmount: 15, dropoffLocation: 'COM1' })
    const user = userEvent.setup()
    renderPage()

    await user.type(await screen.findByLabelText(/Say what you need/), 'Latte to COM1')
    await user.click(fillButton())
    await vi.waitFor(() => expect(labels()).toHaveLength(3))

    await user.type(screen.getByLabelText(/Notes for the courier/), '!')
    expect(labels()).toHaveLength(2)
    await user.clear(screen.getByLabelText(/Credits offered/))
    expect(labels()).toHaveLength(1)
    expect(screen.getByLabelText('Drop-off location')).toHaveValue('COM1')
  })

  it('keeps an edit made while the request runs, even if the result has a value for that field', async () => {
    const pending = deferred<ExtractedErrand>()
    vi.mocked(errandApi.extractErrand).mockReturnValue(pending.promise)
    const user = userEvent.setup()
    renderPage()

    await user.type(await screen.findByLabelText(/Say what you need/), '15 credits, less ice')
    await user.click(fillButton())
    expect(fillButton()).toHaveTextContent('Filling in…')
    expect(fillButton()).toBeDisabled()

    // The form stays editable while the request runs
    await user.type(screen.getByLabelText(/Credits offered/), '7')
    await act(async () => pending.resolve({ ...nothing, creditAmount: 15, notes: 'Less ice' }))

    expect(screen.getByLabelText(/Credits offered/)).toHaveValue(7)
    expect(screen.getByLabelText(/Notes for the courier/)).toHaveValue('Less ice')
    expect(labels()).toHaveLength(1) // notes only
    expect(fillButton()).toHaveTextContent('Fill in the form')
  })

  it.each([
    ['a 502', new ApiError(502, 'EXTRACTION_FAILED', 'Could not')],
    ['a 503', new ApiError(503, 'SERVICE_UNAVAILABLE', 'Down')],
    ['no connection', new NetworkError()],
  ])('shows one failure message and leaves the form as it was after %s', async (_name, error) => {
    vi.mocked(errandApi.extractErrand).mockRejectedValue(error)
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('Drop-off location'), 'My desk')
    await user.type(await screen.findByLabelText(/Say what you need/), 'Latte')
    await user.click(fillButton())

    expect(await screen.findByText(FAILURE_TEXT)).toBeInTheDocument()
    expect(screen.getByLabelText('Drop-off location')).toHaveValue('My desk')
    expect(screen.getByLabelText('Item 1', { exact: true })).toHaveValue('')
    expect(labels()).toHaveLength(0)
    expect(fillButton()).toBeEnabled()
  })

  it('counts down from Retry-After when rate limited, with the button disabled until it ends', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(errandApi.extractErrand).mockRejectedValue(
      new ApiError(429, 'RATE_LIMITED', 'Too many', {}, { retryAfterSeconds: 2 }),
    )
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderPage()

    await user.type(await screen.findByLabelText(/Say what you need/), 'Latte')
    await user.click(fillButton())

    expect(await screen.findByText(/Try again in 2 seconds\./)).toBeInTheDocument()
    expect(screen.queryByText(FAILURE_TEXT)).not.toBeInTheDocument()
    expect(fillButton()).toBeDisabled()
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(screen.getByText(/Try again in 1 second\./)).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(screen.queryByText(/Try again in/)).not.toBeInTheDocument()
    expect(fillButton()).toBeEnabled()
  })
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/errands/new']}>
      <AuthContext.Provider value={memberAuth}>
        <Routes>
          <Route path="/errands/new" element={<CreateErrandPage />} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}
