import { createElement } from 'react'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { connectRealtime } from '#/lib/realtime'
import { describe, expect, it, vi } from 'vitest'
import { supplierKeys } from './useSuppliers'
import {
  applySupplierChanged,
  useSupplierRealtimeUpdates,
} from './useSupplierRealtimeUpdates'
import type { Supplier } from '../types/supplier.types'

vi.mock('#/lib/realtime', () => ({ connectRealtime: vi.fn() }))

const createSupplier = (id: string, active: boolean): Supplier => ({
  id,
  name: `Supplier ${id}`,
  category: 'FOOD',
  building: 'Building',
  floor: null,
  locationDescription: null,
  latitude: null,
  longitude: null,
  openingHours: [],
  imageUrl: null,
  active,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
})

describe('applySupplierChanged', () => {
  it.each([
    { change: 'ACTIVATED' as const, active: true },
    { change: 'DEACTIVATED' as const, active: false },
  ])('updates cached active state for $change', ({ change, active }) => {
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const supplier = createSupplier('supplier-1', !active)
    const otherSupplier = createSupplier('supplier-2', !active)
    queryClient.setQueryData(supplierKeys.detail(supplier.id), supplier)
    queryClient.setQueryData(supplierKeys.list({}), [supplier, otherSupplier])

    applySupplierChanged(queryClient, { supplierId: supplier.id, change })

    expect(
      queryClient.getQueryData<Supplier>(supplierKeys.detail(supplier.id))
        ?.active,
    ).toBe(active)
    expect(queryClient.getQueryData<Supplier[]>(supplierKeys.list({}))).toEqual(
      [{ ...supplier, active }, otherSupplier],
    )
    expect(invalidate).toHaveBeenCalledWith({ queryKey: supplierKeys.all })
  })

  it.each(['CREATED', 'UPDATED', 'IMAGE_CHANGED'] as const)(
    'only invalidates supplier queries for %s',
    (change) => {
      const queryClient = new QueryClient()
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
      const supplier = createSupplier('supplier-1', true)
      queryClient.setQueryData(supplierKeys.detail(supplier.id), supplier)
      queryClient.setQueryData(supplierKeys.list({}), [supplier])

      applySupplierChanged(queryClient, {
        supplierId: supplier.id,
        change,
      })

      expect(
        queryClient.getQueryData(supplierKeys.detail(supplier.id)),
      ).toEqual(supplier)
      expect(queryClient.getQueryData(supplierKeys.list({}))).toEqual([
        supplier,
      ])
      expect(invalidate).toHaveBeenCalledWith({ queryKey: supplierKeys.all })
    },
  )

  it('does not create cache entries for an uncached supplier', () => {
    const queryClient = new QueryClient()

    applySupplierChanged(queryClient, {
      supplierId: 'supplier-1',
      change: 'DEACTIVATED',
    })

    expect(
      queryClient.getQueryData(supplierKeys.detail('supplier-1')),
    ).toBeUndefined()
  })
})

describe('useSupplierChanges', () => {
  it('invalidates supplier queries on initial connection and reconnection', () => {
    const listeners = new Map<string, (payload?: unknown) => void>()
    const socket = {
      on: vi.fn((event, listener) => listeners.set(event, listener)),
      off: vi.fn(),
    }
    vi.mocked(connectRealtime).mockReturnValue(
      socket as unknown as ReturnType<typeof connectRealtime>,
    )
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { unmount } = renderHook(() => useSupplierRealtimeUpdates(), {
      wrapper: ({ children }) =>
        createElement(QueryClientProvider, { client }, children),
    })

    act(() => {
      listeners.get('connect')!()
      listeners.get('connect')!()
    })
    expect(invalidate).toHaveBeenCalledTimes(2)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: supplierKeys.all })

    unmount()
    client.clear()
  })
})
