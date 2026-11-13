import type { Order, OrderPage } from '../api/orderApi'
import { sessionKey } from '../auth/session'

export const REQUESTER_ID = '97947588-bb2e-42f2-91ba-9abf8e15a8e7'
export const COURIER_ID = '5b0f3c1e-8a52-4f8e-9d37-2c1b6e4a7f10'
export const STRANGER_ID = 'a1b2c3d4-0000-4000-8000-000000000001'

export function signIn(userId: string, role: 'REQUESTER' | 'COURIER') {
  sessionStorage.setItem(
    sessionKey,
    JSON.stringify({
      accessToken: 'token',
      tokenType: 'Bearer',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      userId,
      username: 'Alex',
      role,
      availableRoles: ['REQUESTER', 'COURIER'],
    }),
  )
}

export function order(overrides: Partial<Order> = {}): Order {
  return {
    id: '3f2a9c4e-6b1d-4e8f-a7c3-5d9e0b1f2a64',
    requesterId: REQUESTER_ID,
    courierId: null,
    title: 'Collect my printed notes',
    description: 'A bound set of CS3219 lecture notes.',
    pickupLocationId: '9fd58f13-c8d5-4320-b757-7893d69a4ae0',
    pickupLocationName: 'Printers@PCCommons',
    dropoffLocationId: 'eb46dc78-e25e-4f07-a7a2-26bff615d170',
    dropoffLocationName: 'PGP Foyer',
    creditReward: 18,
    pendingCreditReward: null,
    pickupDeadline: new Date(Date.now() + 3_600_000).toISOString(),
    state: 'OPEN',
    terminalReason: null,
    version: 1,
    createdAt: new Date().toISOString(),
    stateChangedAt: new Date().toISOString(),
    ...overrides,
  }
}

export function page(items: Order[]): OrderPage {
  return { items, page: 0, size: 20, totalItems: items.length, totalPages: items.length ? 1 : 0 }
}

/** A fetch stub that answers JSON by URL and records each call. */
export function stubFetch(handler: (url: string, init?: RequestInit) => { status?: number; body: unknown }) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fetchMock = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    calls.push({ url, init })
    const { status = 200, body } = handler(url, init)
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
    })
  }
  return { fetchMock, calls }
}
