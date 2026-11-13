import { expect, it } from 'vitest'
import { transactionLabel } from './creditFormatting'

it('identifies administrative corrections separately from errand rewards and reservations', () => {
  expect(transactionLabel('ADMIN_CORRECTION')).toBe('Adjusted by an admin')
})
