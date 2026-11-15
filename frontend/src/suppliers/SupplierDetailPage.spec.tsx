/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Added focused member Supplier detail component tests for issue #29.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), 2026-11-09. Scope: the
 * detail page now links to posting an errand. Author review: Reviewed and approved by @mattis.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import * as supplierApi from '../api/supplierApi'
import { AuthContext, type AuthApi } from '../auth/authContext'
import type { Supplier } from './types'
import { SupplierDetailPage } from './SupplierDetailPage'

vi.mock('../api/supplierApi', () => ({ getSupplier: vi.fn() }))

const supplier: Supplier = {
  id: '64f945d5-c7ef-4f40-8f39-6cb45bb1afec',
  name: 'Overnight Coffee',
  categories: ['FOOD', 'COFFEE'],
  buildingCode: 'COM3',
  buildingLabel: 'COM3',
  floor: null,
  locationDescription: 'Beside the main entrance',
  latitude: 1.295,
  longitude: 103.773,
  hoursKind: 'INTERVAL',
  opensAt: '11:00',
  closesAt: '02:00',
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

describe('Supplier member detail', () => {
  beforeEach(() => {
    vi.mocked(supplierApi.getSupplier).mockResolvedValue({ supplier, etag: '"v0"' })
  })

  it('shows description, typical hours, coordinates, and a link to post an errand from it', async () => {
    renderDetail()

    expect(await screen.findByRole('heading', { name: 'Overnight Coffee' })).toBeInTheDocument()
    expect(screen.getByText('Food')).toBeInTheDocument()
    expect(screen.getByText('Coffee')).toBeInTheDocument()
    expect(screen.getByText('Beside the main entrance')).toBeInTheDocument()
    expect(screen.getByText('11:00–02:00 (closes next day)')).toBeInTheDocument()
    expect(screen.getByText('1.295, 103.773')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'No image available for Overnight Coffee' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Request an errand from here' })).toHaveAttribute(
      'href',
      `/errands/new?supplierId=${supplier.id}`,
    )
  })

  it('conceals unavailable detail as not found and permits retry', async () => {
    vi.mocked(supplierApi.getSupplier)
      .mockRejectedValueOnce(new ApiError(404, 'SUPPLIER_NOT_FOUND', 'Not found'))
      .mockResolvedValueOnce({ supplier, etag: '"v0"' })
    const user = userEvent.setup()
    renderDetail()

    expect(await screen.findByRole('heading', { name: 'Supplier not found' })).toBeInTheDocument()
    expect(screen.getByText('This Supplier is unavailable or does not exist.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Overnight Coffee' })).toBeInTheDocument()
  })
})

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={[`/suppliers/${supplier.id}`]}>
      <AuthContext.Provider value={memberAuth}>
        <Routes>
          <Route path="/suppliers/:id" element={<SupplierDetailPage />} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}
