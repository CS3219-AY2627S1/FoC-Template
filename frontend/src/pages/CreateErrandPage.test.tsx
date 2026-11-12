/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-17
 * Scope (AI-18): Built and tested the requested errand creation preview and entry points.
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-23
 * Scope (AI-21): Displayed the real balance in the UI and tested its display.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 */



import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createErrand, ErrandApiError } from '../features/errands/errand.api'
import type { CreateErrandResponse } from '../features/errands/errand.types'
import { useCredits } from '../features/credits/useCredits'
import { listSupplierBuildings, listSuppliers } from '../features/suppliers/supplier.api'
import type { Supplier, SupplierReference } from '../features/suppliers/supplier.types'
import { CreateErrandPage } from './CreateErrandPage'

vi.mock('../features/suppliers/supplier.api', () => ({
  listSuppliers: vi.fn(),
  listSupplierBuildings: vi.fn(),
}))

vi.mock('../features/errands/errand.api', () => ({
  createErrand: vi.fn(),
  ErrandApiError: class ErrandApiError extends Error {
    status: number
    issues: Array<{ loc: Array<string | number>; msg: string; type: string }>

    constructor(
      message: string,
      status: number,
      issues: Array<{ loc: Array<string | number>; msg: string; type: string }> = [],
    ) {
      super(message)
      this.name = 'ErrandApiError'
      this.status = status
      this.issues = issues
    }
  },
}))

vi.mock('../features/credits/useCredits', () => ({
  useCredits: vi.fn(),
}))

const listSuppliersMock = vi.mocked(listSuppliers)
const listSupplierBuildingsMock = vi.mocked(listSupplierBuildings)
const createErrandMock = vi.mocked(createErrand)
const useCreditsMock = vi.mocked(useCredits)
const refreshBalanceMock = vi.fn<() => Promise<void>>()

const suppliers: Supplier[] = [
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Central Library Print Centre',
    category: { id: 'category-printing', name: 'Printing' },
    building: { id: 'building-central-library', name: 'Central Library' },
    floor: '1',
    description: null,
    openingTime: '09:00:00',
    closingTime: '18:00:00',
    imageUrl: null,
    status: 'ACTIVE',
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Techno Edge',
    category: { id: 'category-food', name: 'Food & Drinks' },
    building: { id: 'building-techno-edge', name: 'Techno Edge' },
    floor: '1',
    description: null,
    openingTime: '08:00:00',
    closingTime: '20:00:00',
    imageUrl: null,
    status: 'ACTIVE',
  },
]

const buildings: SupplierReference[] = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'COM3' },
  { id: '55555555-5555-4555-8555-555555555555', name: 'Central Library' },
]

const supplierResponse = {
  items: suppliers,
  page: {
    number: 0,
    size: 100,
    totalElements: suppliers.length,
    totalPages: 1,
    hasNext: false,
    hasPrevious: false,
  },
}

const createdErrand: CreateErrandResponse = {
  id: '66666666-6666-4666-8666-666666666666',
  status: 'OPEN',
  requester_id: '77777777-7777-4777-8777-777777777777',
  courier_id: null,
  supplier_id: '22222222-2222-4222-8222-222222222222',
  required_item: 'Two sandwiches and one coffee',
  credit_value: 5,
  delivery_building_id: '11111111-1111-4111-8111-111111111111',
  delivery_floor: '3',
  delivery_description: 'Meet outside room 03-12',
  expires_at: '2026-10-18T04:00:00.000Z',
  created_at: '2026-10-17T04:00:00.000Z',
}

type TestLocation = {
  pathname: string
  search?: string
  state?: unknown
}

function renderPage(initialEntry: string | TestLocation) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <CreateErrandPage />
    </MemoryRouter>,
  )
}

function futureLocalDateTime() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 16)
}

async function fillValidForm() {
  await screen.findByRole('option', { name: 'Central Library Print Centre' })
  const expiresAt = futureLocalDateTime()

  fireEvent.change(screen.getByLabelText(/pickup supplier/i), {
    target: { value: '22222222-2222-4222-8222-222222222222' },
  })
  fireEvent.change(screen.getByLabelText(/requested items/i), {
    target: { value: '  Two sandwiches and one coffee  ' },
  })
  fireEvent.change(screen.getByLabelText(/delivery building/i), {
    target: { value: '11111111-1111-4111-8111-111111111111' },
  })
  fireEvent.change(screen.getByLabelText(/floor/i), { target: { value: '  3  ' } })
  fireEvent.change(screen.getByLabelText(/collect before/i), {
    target: { value: expiresAt },
  })
  fireEvent.change(screen.getByLabelText(/delivery instructions/i), {
    target: { value: '  Meet outside room 03-12  ' },
  })

  return expiresAt
}

describe('CreateErrandPage', () => {
  beforeEach(() => {
    listSuppliersMock.mockReset()
    listSupplierBuildingsMock.mockReset()
    createErrandMock.mockReset()
    refreshBalanceMock.mockReset()
    refreshBalanceMock.mockResolvedValue()
    useCreditsMock.mockReturnValue({
      availableBalance: 24,
      status: 'ready',
      error: null,
      refreshBalance: refreshBalanceMock,
    })
    listSuppliersMock.mockResolvedValue(supplierResponse)
    listSupplierBuildingsMock.mockResolvedValue({ items: buildings })
    createErrandMock.mockResolvedValue(createdErrand)
  })

  it('loads suppliers and delivery buildings from the Supplier Service', async () => {
    renderPage('/errands/new')

    expect(screen.getByLabelText(/pickup supplier/i)).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Create errand' })).toBeDisabled()

    expect(
      await screen.findByRole('option', { name: 'Central Library Print Centre' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'COM3' })).toBeInTheDocument()
    expect(screen.getByLabelText(/pickup supplier/i)).toBeEnabled()
    expect(listSuppliersMock).toHaveBeenCalledWith(
      { size: 100 },
      expect.any(AbortSignal),
    )
    expect(listSupplierBuildingsMock).toHaveBeenCalledWith(expect.any(AbortSignal))
  })

  it('uses the wallet balance for display and credit validation', async () => {
    useCreditsMock.mockReturnValue({
      availableBalance: 7,
      status: 'ready',
      error: null,
      refreshBalance: refreshBalanceMock,
    })
    renderPage('/errands/new')
    await fillValidForm()

    expect(screen.getByText('7 available')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/credits/i), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create errand' }))

    expect(screen.getByText('You only have 7 credits available.')).toBeInTheDocument()
    expect(createErrandMock).not.toHaveBeenCalled()
  })

  it('prevents submission while the wallet balance is loading', async () => {
    useCreditsMock.mockReturnValue({
      availableBalance: null,
      status: 'loading',
      error: null,
      refreshBalance: refreshBalanceMock,
    })
    renderPage('/errands/new')

    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Loading your balance…')
    expect(screen.getByLabelText(/credits/i)).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Create errand' })).toBeDisabled()
  })

  it('allows retrying a failed wallet balance request', () => {
    useCreditsMock.mockReturnValue({
      availableBalance: null,
      status: 'error',
      error: 'Wallet unavailable',
      refreshBalance: refreshBalanceMock,
    })
    renderPage('/errands/new')

    expect(screen.getByRole('alert')).toHaveTextContent('Wallet unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refreshBalanceMock).toHaveBeenCalledOnce()
  })

  it('starts without a supplier when opened directly', async () => {
    renderPage('/errands/new')

    await screen.findByRole('option', { name: 'Central Library Print Centre' })
    expect(screen.getByRole('heading', { name: 'Create an errand' })).toBeInTheDocument()
    expect(screen.getByLabelText(/pickup supplier/i)).toHaveValue('')
    expect(screen.getByLabelText(/category/i)).toHaveValue('')
  })

  it('preselects a supplier from the supplier browser after options load', async () => {
    renderPage({
      pathname: '/errands/new',
      search: '?supplierId=44444444-4444-4444-8444-444444444444',
    })

    await waitFor(() =>
      expect(screen.getByLabelText(/pickup supplier/i)).toHaveValue(
        '44444444-4444-4444-8444-444444444444',
      ),
    )
    expect(screen.getByLabelText(/category/i)).toHaveValue('Food & Drinks')
  })

  it('clears an unknown preselected supplier', async () => {
    renderPage('/errands/new?supplierId=unknown-supplier')

    await screen.findByRole('option', { name: 'Central Library Print Centre' })
    expect(screen.getByLabelText(/pickup supplier/i)).toHaveValue('')
  })

  it('updates the read-only category when the supplier changes', async () => {
    renderPage('/errands/new')
    await screen.findByRole('option', { name: 'Central Library Print Centre' })

    fireEvent.change(screen.getByLabelText(/pickup supplier/i), {
      target: { value: '22222222-2222-4222-8222-222222222222' },
    })

    expect(screen.getByLabelText(/category/i)).toHaveValue('Printing')
    expect(screen.getByLabelText(/category/i)).toHaveAttribute('readonly')
  })

  it('shows an error and retries loading the form options', async () => {
    listSuppliersMock.mockRejectedValueOnce(new Error('Supplier Service is unavailable.'))
    renderPage('/errands/new')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Supplier Service is unavailable.',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(
      await screen.findByRole('option', { name: 'Central Library Print Centre' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(listSuppliersMock).toHaveBeenCalledTimes(2)
  })

  it('shows empty states when no options are available', async () => {
    listSuppliersMock.mockResolvedValue({
      ...supplierResponse,
      items: [],
      page: { ...supplierResponse.page, totalElements: 0, totalPages: 0 },
    })
    listSupplierBuildingsMock.mockResolvedValue({ items: [] })
    renderPage('/errands/new')

    expect(
      await screen.findByText('No active suppliers are currently available.'),
    ).toBeInTheDocument()
    expect(screen.getByText('No delivery buildings are currently available.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create errand' })).toBeDisabled()
  })

  it('shows local validation errors without creating an errand', async () => {
    renderPage('/errands/new')
    await screen.findByRole('option', { name: 'Central Library Print Centre' })

    fireEvent.click(screen.getByRole('button', { name: 'Create errand' }))

    expect(screen.getByText('Choose a pickup supplier.')).toBeInTheDocument()
    expect(screen.getByText('Describe the items you need.')).toBeInTheDocument()
    expect(screen.getByText('Choose a delivery building.')).toBeInTheDocument()
    expect(createErrandMock).not.toHaveBeenCalled()
  })

  it('creates an errand with trimmed values and a UTC expiry', async () => {
    renderPage('/errands/new')
    const expiresAt = await fillValidForm()

    fireEvent.click(screen.getByRole('button', { name: 'Create errand' }))

    expect(await screen.findByText(/Errand created successfully/)).toHaveTextContent(
      createdErrand.id,
    )
    expect(screen.getByRole('link', { name: 'View errand' })).toHaveAttribute('href', `/errands/${createdErrand.id}`)
    expect(createErrandMock).toHaveBeenCalledWith(
      {
        supplier_id: '22222222-2222-4222-8222-222222222222',
        required_item: 'Two sandwiches and one coffee',
        credit_value: 5,
        delivery_building_id: '11111111-1111-4111-8111-111111111111',
        delivery_floor: '3',
        delivery_description: 'Meet outside room 03-12',
        expires_at: new Date(expiresAt).toISOString(),
      },
      expect.any(AbortSignal),
    )
    expect(screen.getByRole('button', { name: 'Errand created' })).toBeDisabled()
    expect(refreshBalanceMock).toHaveBeenCalledOnce()
  })

  it('prevents duplicate submissions while creation is in progress', async () => {
    let resolveRequest!: (value: CreateErrandResponse) => void
    createErrandMock.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve
      }),
    )
    renderPage('/errands/new')
    await fillValidForm()

    fireEvent.click(screen.getByRole('button', { name: 'Create errand' }))

    const submittingButton = await screen.findByRole('button', { name: 'Creating errand…' })
    expect(submittingButton).toBeDisabled()
    fireEvent.click(submittingButton)
    expect(createErrandMock).toHaveBeenCalledTimes(1)

    await act(async () => resolveRequest(createdErrand))
    expect(await screen.findByText(/Errand created successfully/)).toBeInTheDocument()
  })

  it('maps backend validation issues to form fields', async () => {
    createErrandMock.mockRejectedValue(
      new ErrandApiError('Expiry is invalid.', 422, [
        {
          loc: ['body', 'expires_at'],
          msg: 'The collection deadline is no longer in the future.',
          type: 'value_error',
        },
      ]),
    )
    renderPage('/errands/new')
    await fillValidForm()

    fireEvent.click(screen.getByRole('button', { name: 'Create errand' }))

    expect(
      await screen.findByText('The collection deadline is no longer in the future.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/collect before/i)).toHaveFocus()
  })

  it('shows a service error that is not tied to a form field', async () => {
    createErrandMock.mockRejectedValue(
      new ErrandApiError('Supplier Service is unavailable', 503),
    )
    renderPage('/errands/new')
    await fillValidForm()

    fireEvent.click(screen.getByRole('button', { name: 'Create errand' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Supplier Service is unavailable',
    )
  })

  it('shows a session-expired message after an unauthorized response', async () => {
    createErrandMock.mockRejectedValue(new ErrandApiError('Unauthorized', 401))
    renderPage('/errands/new')
    await fillValidForm()

    fireEvent.click(screen.getByRole('button', { name: 'Create errand' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your session has expired. Please sign in again.',
    )
  })

  it('cancels an active creation request when leaving the page', async () => {
    let requestSignal: AbortSignal | undefined
    createErrandMock.mockImplementation((_request, signal) => {
      requestSignal = signal
      return new Promise(() => undefined)
    })
    const { unmount } = renderPage('/errands/new')
    await fillValidForm()

    fireEvent.click(screen.getByRole('button', { name: 'Create errand' }))
    await waitFor(() => expect(requestSignal).toBeDefined())

    unmount()
    expect(requestSignal?.aborted).toBe(true)
  })
})
