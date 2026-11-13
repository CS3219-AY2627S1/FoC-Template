import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { SupplierRemoteProps } from '@relay/contracts'
import SupplierApp from '../../../supplier-service/frontend/src/App'

vi.mock('../../../supplier-service/frontend/src/components/SupplierMap', () => ({
  SupplierMap: () => <div>Supplier map</div>,
  getSupplierAnchor: vi.fn(),
}))

afterEach(cleanup)

it('requests the errand Updates view through the host callback instead of loading a supplier-owned card', async () => {
  const openErrandView = vi.fn()
  const getErrands = vi.fn()
  const props = {
    openErrandView,
    supplierApi: { getSuppliers: vi.fn().mockResolvedValue({ suppliers: [] }) },
    errandApi: { getErrands },
    supplierMode: 'explore',
    mapActive: true,
    mapViewport: { center: { lat: 1.3, lng: 103.78 }, zoom: 16 },
  } as unknown as SupplierRemoteProps
  await act(async () => render(<SupplierApp {...props} />))
  const button = screen.getByRole('button', { name: 'Updates' })
  vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
    top: 600,
    left: 20,
    right: 120,
    bottom: 650,
  } as DOMRect)
  fireEvent.click(button)
  expect(openErrandView).toHaveBeenCalledWith({
    view: 'updates',
    anchor: { top: 600, left: 20, right: 120, bottom: 650 },
  })
  expect(getErrands).not.toHaveBeenCalled()
  expect(screen.queryByRole('heading', { name: 'Updates' })).toBeNull()
})
