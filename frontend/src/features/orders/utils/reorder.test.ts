import { expect, it } from 'vitest'
import { orderFixture } from '../test/orderFixtures'
import { findSameActiveRequest, reorderValues } from './reorder'
import { shortOrderId } from './orderFormat'

const cafe = {
  id: '8e1f0000-0000-4000-8000-000000000002',
  name: 'Campus Cafe',
  address: 'COM1',
}

it('copies a past errand, keeping it open about as long as before', () => {
  const past = orderFixture({
    notes: 'Call when you arrive',
    creditReward: 7,
    createdAt: '2030-01-01T00:00:00Z',
    expiresAt: '2030-01-01T01:30:00Z',
  })

  expect(reorderValues(past, [cafe])).toEqual({
    pickup: cafe,
    deliveryLocation: 'Library',
    description: 'Lunch',
    notes: 'Call when you arrive',
    creditReward: 7,
    expiryMinutes: 120,
  })
})

it('leaves the pickup empty when the supplier is no longer listed', () => {
  expect(reorderValues(orderFixture(), []).pickup).toBeNull()
})

it('finds the same request in progress, ignoring case and spacing', () => {
  const active = [orderFixture({ id: 'active', description: ' lunch  ' })]
  const values = reorderValues(orderFixture(), [cafe])

  expect(findSameActiveRequest(values, active)?.id).toBe('active')
  expect(
    findSameActiveRequest({ ...values, description: 'Dinner' }, active),
  ).toBeUndefined()
})

it('shortens the errand ID to its first block', () => {
  expect(shortOrderId('05215444-1973-4eea-9e9f-51b10e3c0fc2')).toBe('05215444')
})
