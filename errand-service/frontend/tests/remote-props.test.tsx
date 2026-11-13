import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ErrandRemoteProps, Supplier } from '@relay/contracts'
import App from '../src/App'

vi.mock('../src/components/ErrandMap', () => ({
  ErrandMap: () => <div>Map</div>,
  getErrandAnchor: vi.fn(),
}))

const supplier: Supplier = {
  id: 'supplier-1',
  name: 'Techno Edge',
  location: {
    lat: 1.297,
    lng: 103.77,
    buildingName: 'Techno Edge',
    floorNumber: 2,
  },
  isOperational: true,
  operatingHours: {
    openingTime: '08:00',
    closingTime: '20:00',
    daysOfWeek: [0, 1, 2, 3, 4],
  },
  serviceTypes: [0],
}

function remoteProps(): ErrandRemoteProps {
  return {
    userProfile: null,
    creditBalance: {
      userId: 'user-1',
      availableCredit: 42,
      reserveCredit: 0,
      lastUpdated: new Date(),
    },
    authenticatedSubject: 'cognito-sub-1',
    invalidateCreditBalance: vi.fn(),
    navigateTo: vi.fn(),
    openProfile: vi.fn(),
    openCredit: vi.fn(),
    openErrandView: vi.fn(),
    errandViewContext: { view: 'create' },
    requestUserLocation: vi.fn(async () => undefined),
    presentation: 'card',
    mapViewport: { center: { lat: 1.2966, lng: 103.7764 }, zoom: 16 },
    mapActive: false,
    errandApi: {
      getErrands: vi.fn(async () => ({ errands: [] })),
      getErrand: vi.fn(),
      createErrand: vi.fn(),
      acceptErrand: vi.fn(),
      pickupErrand: vi.fn(),
      deliverErrand: vi.fn(),
      confirmErrand: vi.fn(),
      cancelErrand: vi.fn(),
      dropErrand: vi.fn(),
      deleteErrand: vi.fn(),
    },
    supplierApi: {
      getSuppliers: vi.fn(async () => ({ suppliers: [supplier] })),
    },
  }
}

beforeEach(() => {
  vi.stubGlobal(
    'EventSource',
    class {
      close() {}
    },
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('carries the errand remote session and balance through the credit estimation flow', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ minCredits: 10, maxCredits: 20, reason: 'A suitable reward.' }),
  })
  vi.stubGlobal('fetch', fetchMock)

  render(<App {...remoteProps()} />)

  fireEvent.change(await screen.findByLabelText(/What do you need\?/), {
    target: { value: 'Collect lunch' },
  })
  fireEvent.change(screen.getByLabelText(/Description/), {
    target: { value: 'Collect a packed lunch and deliver it.' },
  })
  fireEvent.click(screen.getByTitle('Estimate credits based on errand details'))

  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
  const [, request] = fetchMock.mock.calls[0]
  expect(JSON.parse(request.body)).toMatchObject({
    userId: 'cognito-sub-1',
    availableCredit: 42,
  })
  expect(await screen.findByDisplayValue('15')).toBeTruthy()
})
