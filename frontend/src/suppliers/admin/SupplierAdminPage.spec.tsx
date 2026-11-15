/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Tested current-ETag archive confirmation and member route protection
 * for issue #30.
 * Author review: Reviewed and approved by @ron.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { AuthContext, type AuthApi } from '../../auth/authContext'
import { ToastContext } from '../../components/toast/toastContext'
import type { Supplier, SupplierPage } from '../types'
import { SupplierAdminPage } from './SupplierAdminPage'

const supplierApi = vi.hoisted(() => ({
  archiveSupplier: vi.fn(),
  getSupplier: vi.fn(),
  listSuppliers: vi.fn(),
  restoreSupplier: vi.fn(),
}))

vi.mock('../../api/supplierApi', () => supplierApi)

afterEach(cleanup)

describe('SupplierAdminPage', () => {
  it('fetches current detail before confirmed archive and refreshes live data', async () => {
    const user = userEvent.setup()
    const active = supplier()
    supplierApi.listSuppliers.mockResolvedValue(page(active))
    supplierApi.getSupplier.mockResolvedValue({ supplier: active, etag: '"v4"' })
    supplierApi.archiveSupplier.mockResolvedValue(undefined)

    renderAdmin('ADMINISTRATOR')
    await user.click(await screen.findByRole('button', { name: 'Archive' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Archive Supplier?' })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Archive Supplier' }))

    await waitFor(() => expect(supplierApi.archiveSupplier).toHaveBeenCalledWith(active.id, '"v4"'))
    expect(supplierApi.getSupplier).toHaveBeenCalledWith(active.id)
    await waitFor(() => expect(supplierApi.listSuppliers).toHaveBeenCalledTimes(2))
  })

  it('shows no management controls and makes no Supplier call for a member', async () => {
    renderAdmin('MEMBER')

    expect(screen.getByRole('heading', { name: 'Administrator access required' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Add Supplier' })).not.toBeInTheDocument()
    expect(supplierApi.listSuppliers).not.toHaveBeenCalled()
  })
})

function renderAdmin(role: 'MEMBER' | 'ADMINISTRATOR') {
  const auth: AuthApi = {
    status: 'loggedIn',
    user: { username: 'person', displayName: 'Person', role },
    notice: null,
    login: vi.fn(),
    logout: vi.fn(),
  }
  return render(
    <ToastContext.Provider value={{ showToast: vi.fn() }}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={['/suppliers/admin']}>
          <SupplierAdminPage />
        </MemoryRouter>
      </AuthContext.Provider>
    </ToastContext.Provider>,
  )
}

function page(item: Supplier): SupplierPage {
  return { items: [item], page: 0, size: 12, totalItems: 1, totalPages: 1 }
}

function supplier(): Supplier {
  return {
    id: 'supplier-id',
    name: 'Printer @ COM2',
    categories: ['PRINTING'],
    buildingCode: 'COM2',
    buildingLabel: 'COM2',
    floor: '1',
    locationDescription: 'Next to LT19',
    latitude: null,
    longitude: null,
    hoursKind: 'UNKNOWN',
    opensAt: null,
    closesAt: null,
    imagePath: null,
    status: 'ACTIVE',
    version: 4,
    createdAt: '2026-09-27T00:00:00Z',
    updatedAt: '2026-09-27T00:00:00Z',
    archivedAt: null,
  }
}
