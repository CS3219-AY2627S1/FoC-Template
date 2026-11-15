/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Component tests for posting an errand: supplier choice, the request body, and server errors.
 * Author review: Reviewed and approved by @mattis.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: the errand API mock gains the N2 status and extract calls. Author review: Reviewed and approved by @mattis.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import * as errandApi from '../api/errandApi'
import * as supplierApi from '../api/supplierApi'
import { AuthContext, type AuthApi } from '../auth/authContext'
import type { Supplier } from '../suppliers/types'
import { CreateErrandPage } from './CreateErrandPage'
import { SUPPLIER_ID, makeErrand } from './testFixtures'

vi.mock('../api/errandApi', () => ({
  createErrand: vi.fn(),
  getExtractionStatus: vi.fn(async () => ({ available: false, reason: 'DISABLED' })),
  extractErrand: vi.fn(),
}))
vi.mock('../api/supplierApi', () => ({ getSupplier: vi.fn(), listSuppliers: vi.fn() }))

const supplier: Supplier = {
  id: SUPPLIER_ID,
  name: 'Overnight Coffee',
  categories: ['COFFEE'],
  buildingCode: 'COM3',
  buildingLabel: 'COM3',
  floor: '1',
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

describe('Post an errand', () => {
  beforeEach(() => {
    vi.mocked(supplierApi.getSupplier).mockResolvedValue({ supplier, etag: '"v0"' })
    vi.mocked(supplierApi.listSuppliers).mockResolvedValue({
      items: [supplier],
      page: 0,
      size: 6,
      totalItems: 1,
      totalPages: 1,
    })
  })

  it('posts the errand for a supplier chosen from search and opens it', async () => {
    vi.mocked(errandApi.createErrand).mockResolvedValue(makeErrand({ state: 'PENDING_RESERVATION' }))
    const user = userEvent.setup()
    renderPage('/errands/new')

    await user.click(await screen.findByRole('button', { name: /Overnight Coffee/ }))
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Item 1'), 'Iced latte')
    await user.clear(screen.getByLabelText('Qty'))
    await user.type(screen.getByLabelText('Qty'), '2')
    await user.click(screen.getByRole('button', { name: 'Add another item' }))
    await user.type(screen.getByLabelText('Item 2'), 'Croissant')
    await user.type(screen.getByLabelText('Drop-off location'), 'COM1 level 2')
    await user.type(screen.getByLabelText(/Credits offered/), '15')
    await user.click(screen.getByRole('button', { name: 'Post errand' }))

    expect(errandApi.createErrand).toHaveBeenCalledWith(
      expect.objectContaining({
        supplierId: SUPPLIER_ID,
        items: [
          { name: 'Iced latte', quantity: 2 },
          { name: 'Croissant', quantity: 1 },
        ],
        dropoffLocation: 'COM1 level 2',
        creditAmount: 15,
      }),
    )
    expect(await screen.findByRole('heading', { name: 'Errand page' })).toBeInTheDocument()
  })

  it('preselects the supplier from the link and stops on missing fields without calling the server', async () => {
    const user = userEvent.setup()
    renderPage(`/errands/new?supplierId=${SUPPLIER_ID}`)

    expect(await screen.findByText('Overnight Coffee')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Post errand' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Check the highlighted fields')
    expect(screen.getByText('Enter what to get.')).toBeInTheDocument()
    expect(screen.getByText('Say where the items should be dropped off.')).toBeInTheDocument()
    expect(errandApi.createErrand).not.toHaveBeenCalled()
  })

  it('shows the server field errors and an unavailable supplier', async () => {
    vi.mocked(errandApi.createErrand)
      .mockRejectedValueOnce(
        new ApiError(400, 'VALIDATION_ERROR', 'Request is invalid', {
          dropoffLocation: 'dropoffLocation must be 1 to 200 characters',
        }),
      )
      .mockRejectedValueOnce(new ApiError(422, 'SUPPLIER_UNAVAILABLE', 'The supplier does not exist or is no longer active'))
    const user = userEvent.setup()
    renderPage(`/errands/new?supplierId=${SUPPLIER_ID}`)

    await screen.findByText('Overnight Coffee')
    await user.type(screen.getByLabelText('Item 1'), 'Latte')
    await user.type(screen.getByLabelText('Drop-off location'), 'COM1')
    await user.type(screen.getByLabelText(/Credits offered/), '5')
    await user.click(screen.getByRole('button', { name: 'Post errand' }))
    expect(await screen.findByText('dropoffLocation must be 1 to 200 characters')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Post errand' }))
    expect(await screen.findByText('That supplier is no longer available')).toBeInTheDocument()
    expect(screen.getByText('Choose another supplier.')).toBeInTheDocument()
  })
})

function renderPage(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthContext.Provider value={memberAuth}>
        <Routes>
          <Route path="/errands/new" element={<CreateErrandPage />} />
          <Route path="/errands/:id" element={<h1>Errand page</h1>} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}
