/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Tested administrator duplicate handling and stale-draft recovery for
 * issue #30.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-27.
 * Scope: aligned metadata fixtures with the open Building Code domain type for
 * issue #34. Author review: Reviewed and approved by @ron.
 */
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ApiError } from '../../api/client'
import { AuthContext, type AuthApi } from '../../auth/authContext'
import { ToastContext } from '../../components/toast/toastContext'
import type { Supplier, SupplierWithEtag } from '../types'
import { SupplierFormPage } from './SupplierFormPage'

const supplierApi = vi.hoisted(() => ({
  createSupplier: vi.fn(),
  getSupplier: vi.fn(),
  getSupplierMetadata: vi.fn(),
  updateSupplier: vi.fn(),
}))

vi.mock('../../api/supplierApi', () => supplierApi)

afterEach(cleanup)

describe('SupplierFormPage', () => {
  it('preserves the draft on 412 and reloads latest values only when requested', async () => {
    const user = userEvent.setup()
    const original = supplier('Original name', 2)
    const latest = supplier('Changed by another admin', 3)
    supplierApi.getSupplierMetadata.mockResolvedValue(metadata)
    supplierApi.getSupplier
      .mockResolvedValueOnce(withEtag(original, '"v2"'))
      .mockResolvedValueOnce(withEtag(latest, '"v3"'))
    supplierApi.updateSupplier.mockRejectedValue(
      new ApiError(412, 'SUPPLIER_VERSION_CONFLICT', 'The Supplier changed.'),
    )

    renderForm('edit')
    const name = await screen.findByLabelText('Supplier name')
    await user.clear(name)
    await user.type(name, 'My unsaved draft')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('This Supplier changed on the server')).toBeInTheDocument()
    expect(name).toHaveValue('My unsaved draft')
    await user.click(screen.getByRole('button', { name: 'Compare with latest' }))
    expect(screen.getByRole('heading', { name: 'Your draft compared with latest' })).toBeInTheDocument()
    expect(screen.getByText('Changed by another admin')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reload latest' }))
    expect(name).toHaveValue('Changed by another admin')
  })

  it('keeps create values and links to the existing Supplier after duplicate 409', async () => {
    const user = userEvent.setup()
    supplierApi.getSupplierMetadata.mockResolvedValue(metadata)
    supplierApi.createSupplier.mockRejectedValue(
      new ApiError(409, 'SUPPLIER_ALREADY_EXISTS', 'This Supplier already exists.', {}, {
        existingSupplierId: 'existing-supplier',
      }),
    )

    renderForm('create')
    await user.type(await screen.findByLabelText('Supplier name'), 'Duplicate draft')
    await user.selectOptions(screen.getByLabelText('Building'), 'COM2')
    await user.click(screen.getByLabelText('Shopping'))
    await user.type(screen.getByLabelText('Location description'), 'Main foyer')
    await user.click(screen.getByRole('button', { name: 'Create Supplier' }))

    expect(await screen.findByText('Supplier already exists')).toBeInTheDocument()
    expect(screen.getByLabelText('Supplier name')).toHaveValue('Duplicate draft')
    expect(screen.getByRole('link', { name: 'Open existing Supplier' })).toHaveAttribute(
      'href',
      '/suppliers/existing-supplier',
    )
  })

  it('shows server field errors without clearing valid create values', async () => {
    const user = userEvent.setup()
    supplierApi.getSupplierMetadata.mockResolvedValue(metadata)
    supplierApi.createSupplier.mockRejectedValue(
      new ApiError(400, 'SUPPLIER_VALIDATION_FAILED', 'Please correct the Supplier details.', {}, {
        fieldErrors: { locationDescription: 'Use more specific directions.' },
      }),
    )

    renderForm('create')
    await user.type(await screen.findByLabelText('Supplier name'), 'My new Supplier')
    await user.selectOptions(screen.getByLabelText('Building'), 'COM2')
    await user.click(screen.getByLabelText('Shopping'))
    await user.type(screen.getByLabelText('Location description'), 'Foyer')
    await user.click(screen.getByRole('button', { name: 'Create Supplier' }))

    expect(await screen.findByText('Use more specific directions.')).toBeInTheDocument()
    expect(screen.getByLabelText('Supplier name')).toHaveValue('My new Supplier')
    expect(screen.getByLabelText('Location description')).toHaveValue('Foyer')
  })
})

function renderForm(mode: 'create' | 'edit') {
  const auth: AuthApi = {
    status: 'loggedIn',
    user: { username: 'admin', displayName: 'Admin', role: 'ADMINISTRATOR' },
    notice: null,
    login: vi.fn(),
    logout: vi.fn(),
  }
  return render(
    <ToastContext.Provider value={{ showToast: vi.fn() }}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[mode === 'edit' ? '/suppliers/supplier-id/edit' : '/suppliers/new']}>
          <Routes>
            <Route path="/suppliers/new" element={<SupplierFormPage mode="create" />} />
            <Route path="/suppliers/:id/edit" element={<SupplierFormPage mode="edit" />} />
            <Route path="/suppliers/admin" element={<p>Management page</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </ToastContext.Provider>,
  )
}

const metadata = { buildingCodes: [{ code: 'COM2', label: 'COM2' }] }

function withEtag(value: Supplier, etag: string): SupplierWithEtag {
  return { supplier: value, etag }
}

function supplier(name: string, version: number): Supplier {
  return {
    id: 'supplier-id',
    name,
    categories: ['SHOPPING'],
    buildingCode: 'COM2',
    buildingLabel: 'COM2',
    floor: null,
    locationDescription: 'Main foyer',
    latitude: null,
    longitude: null,
    hoursKind: 'UNKNOWN',
    opensAt: null,
    closesAt: null,
    imagePath: null,
    status: 'ACTIVE',
    version,
    createdAt: '2026-09-27T00:00:00Z',
    updatedAt: '2026-09-27T00:00:00Z',
    archivedAt: null,
  }
}
