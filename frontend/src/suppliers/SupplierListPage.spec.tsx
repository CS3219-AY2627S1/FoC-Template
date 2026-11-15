/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Added focused member catalogue component tests for issue #29.
 * Author review: Reviewed and approved by @ron.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NetworkError } from '../api/client'
import * as supplierApi from '../api/supplierApi'
import { AuthContext, type AuthApi } from '../auth/authContext'
import type { Supplier, SupplierPage } from './types'
import { SupplierListPage } from './SupplierListPage'

vi.mock('../api/supplierApi', () => ({
  getSupplierMetadata: vi.fn(),
  listSuppliers: vi.fn(),
}))

const printer: Supplier = {
  id: '64f945d5-c7ef-4f40-8f39-6cb45bb1afec',
  name: 'Printer @ Com 2',
  categories: ['PRINTING'],
  buildingCode: 'COM2',
  buildingLabel: 'COM2',
  floor: '1',
  locationDescription: 'Next to LT19',
  latitude: 1.2938,
  longitude: 103.7744,
  hoursKind: 'INTERVAL',
  opensAt: '00:00',
  closesAt: '23:59',
  imagePath: '/assets/suppliers/missing.jpeg',
  status: 'ACTIVE',
  version: 0,
  createdAt: '2026-09-24T08:00:00Z',
  updatedAt: '2026-09-24T08:00:00Z',
  archivedAt: null,
}

const page: SupplierPage = {
  items: [printer],
  page: 0,
  size: 12,
  totalItems: 13,
  totalPages: 2,
}

const memberAuth: AuthApi = {
  status: 'loggedIn',
  user: { username: 'member_one', displayName: 'Member One', role: 'MEMBER' },
  notice: null,
  login: vi.fn(),
  logout: vi.fn(),
}

describe('Supplier member catalogue', () => {
  beforeEach(() => {
    vi.mocked(supplierApi.getSupplierMetadata).mockResolvedValue({
      buildingCodes: [
        { code: 'COM2', label: 'COM2' },
        { code: 'CENTRAL_LIBRARY', label: 'Central Library' },
      ],
    })
    vi.mocked(supplierApi.listSuppliers).mockResolvedValue(page)
  })

  it('renders live Supplier fields and falls back when an image fails', async () => {
    renderCatalogue()

    expect(await screen.findByRole('heading', { name: 'Printer @ Com 2' })).toBeInTheDocument()
    expect(screen.getAllByText('Printing')).toHaveLength(2)
    expect(screen.getByText('COM2, floor 1')).toBeInTheDocument()
    expect(screen.getByText('Next to LT19')).toBeInTheDocument()
    expect(screen.getByText('00:00–23:59')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add|edit|archive/i })).not.toBeInTheDocument()

    fireEvent.error(screen.getByRole('img', { name: 'Printer @ Com 2 location' }))
    expect(screen.getByRole('img', { name: 'No image available for Printer @ Com 2' })).toBeInTheDocument()
  })

  it('sends URL-backed search, metadata building, category, sort, and page controls to the API', async () => {
    const user = userEvent.setup()
    renderCatalogue(['/suppliers?page=1'])
    await screen.findByRole('heading', { name: 'Printer @ Com 2' })

    const search = screen.getByRole('searchbox', { name: 'Search name or location' })
    await user.type(search, '  printer  ')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await user.selectOptions(await screen.findByLabelText('Building'), 'COM2')
    await user.selectOptions(screen.getByLabelText('Category'), 'PRINTING')
    await user.selectOptions(screen.getByLabelText('Sort by'), 'name,desc')

    await waitFor(() => {
      expect(supplierApi.listSuppliers).toHaveBeenLastCalledWith(
        expect.objectContaining({
          q: 'printer',
          buildingCode: 'COM2',
          category: 'PRINTING',
          sort: 'name,desc',
          page: 0,
        }),
        expect.any(AbortSignal),
      )
    })

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => {
      expect(supplierApi.listSuppliers).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1 }),
        expect.any(AbortSignal),
      )
    })
  })

  it('does not let an older request replace a newer search result', async () => {
    const oldRequest = deferred<SupplierPage>()
    const newRequest = deferred<SupplierPage>()
    vi.mocked(supplierApi.listSuppliers)
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise)
    const user = userEvent.setup()
    renderCatalogue()

    await user.type(screen.getByRole('searchbox', { name: 'Search name or location' }), 'coffee')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    newRequest.resolve({ ...page, items: [{ ...printer, id: 'new-id', name: 'New Coffee Result' }] })
    expect(await screen.findByRole('heading', { name: 'New Coffee Result' })).toBeInTheDocument()

    oldRequest.resolve({ ...page, items: [{ ...printer, id: 'old-id', name: 'Old Printer Result' }] })
    await Promise.resolve()
    expect(screen.queryByRole('heading', { name: 'Old Printer Result' })).not.toBeInTheDocument()
  })

  it('shows an empty state and a retryable network state', async () => {
    vi.mocked(supplierApi.listSuppliers)
      .mockRejectedValueOnce(new NetworkError())
      .mockResolvedValueOnce({ ...page, items: [], totalItems: 0, totalPages: 0 })
    const user = userEvent.setup()
    renderCatalogue()

    expect(await screen.findByRole('heading', { name: "We couldn't reach Supplier Service" })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'No Suppliers match these filters' })).toBeInTheDocument()
  })
})

function renderCatalogue(initialEntries: string[] = ['/suppliers']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthContext.Provider value={memberAuth}>
        <SupplierListPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
