/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Shared errand fixtures for frontend tests.
 * Author review: Reviewed and approved by @mattis.
 */
import type { ErrandDetail, ErrandPage } from './types'

export const REQUESTER_ID = '11111111-1111-4111-8111-111111111111'
export const COURIER_ID = '22222222-2222-4222-8222-222222222222'
export const OTHER_ID = '33333333-3333-4333-8333-333333333333'
export const SUPPLIER_ID = '64f945d5-c7ef-4f40-8f39-6cb45bb1afec'

/** An unsigned JWT-shaped token carrying `sub`, as tokenSubject.ts reads it. */
export function tokenFor(sub: string): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub, exp: 4102444800 })}.signature`
}

const hour = 60 * 60 * 1000
const inHours = (hours: number) => new Date(Date.now() + hours * hour).toISOString()

export function makeErrand(overrides: Partial<ErrandDetail> = {}): ErrandDetail {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    requesterId: REQUESTER_ID,
    courierId: null,
    supplierId: SUPPLIER_ID,
    supplierName: 'Overnight Coffee',
    supplierBuildingCode: 'COM3',
    supplierLocationDescription: 'Beside the main entrance',
    items: [
      { name: 'Iced latte', quantity: 2 },
      { name: 'Croissant', quantity: 1 },
    ],
    dropoffLocation: 'COM1 level 2 study area',
    notes: 'Less ice please',
    creditAmount: 15,
    state: 'OPEN',
    rejectionReason: null,
    reservationDeadline: inHours(-1),
    listingDeadline: inHours(1),
    pickupDeadline: inHours(2),
    deliveryDeadline: inHours(3),
    confirmDeadline: null,
    createdAt: inHours(-1),
    updatedAt: inHours(-1),
    acceptedAt: null,
    pickedUpAt: null,
    deliveredAt: null,
    closedAt: null,
    history: [
      { fromState: null, toState: 'PENDING_RESERVATION', action: 'create', actorType: 'USER', actorId: null, reason: null, at: inHours(-1) },
      { fromState: 'PENDING_RESERVATION', toState: 'OPEN', action: 'reserved', actorType: 'CREDIT', actorId: null, reason: null, at: inHours(-1) },
    ],
    ...overrides,
  }
}

export function pageOf(items: ErrandDetail[], overrides: Partial<ErrandPage> = {}): ErrandPage {
  return { items, page: 0, size: 20, totalItems: items.length, ...overrides }
}
