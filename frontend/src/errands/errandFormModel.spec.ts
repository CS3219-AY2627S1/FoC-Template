/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Tests for the create-errand form checks against the Order Service rules.
 * Author review: Reviewed and approved by @mattis.
 */
import { describe, expect, it } from 'vitest'
import { defaultFormValues, toDateTimeLocal, validateErrandForm, type ErrandFormValues } from './errandFormModel'
import { SUPPLIER_ID } from './testFixtures'

const now = new Date(2026, 10, 9, 10, 7) // local time
const at = (hours: number) => toDateTimeLocal(new Date(now.getTime() + hours * 60 * 60 * 1000))

function filled(overrides: Partial<ErrandFormValues> = {}): ErrandFormValues {
  return {
    ...defaultFormValues(now, SUPPLIER_ID),
    items: [{ key: 0, name: '  Iced latte ', quantity: '2' }],
    dropoffLocation: ' COM1 level 2 ',
    creditAmount: '15',
    ...overrides,
  }
}

describe('create-errand form', () => {
  it('defaults the deadlines to 1, 2 and 3 hours ahead on the quarter hour', () => {
    const values = defaultFormValues(now)
    expect(values.listingDeadline).toBe(toDateTimeLocal(new Date(2026, 10, 9, 11, 15)))
    expect(values.pickupDeadline).toBe(toDateTimeLocal(new Date(2026, 10, 9, 12, 15)))
    expect(values.deliveryDeadline).toBe(toDateTimeLocal(new Date(2026, 10, 9, 13, 15)))
  })

  it('builds the request body with trimmed text, numbers and UTC deadlines', () => {
    const result = validateErrandForm(filled(), now)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.request).toEqual({
      supplierId: SUPPLIER_ID,
      items: [{ name: 'Iced latte', quantity: 2 }],
      dropoffLocation: 'COM1 level 2',
      creditAmount: 15,
      listingDeadline: new Date(2026, 10, 9, 11, 15).toISOString(),
      pickupDeadline: new Date(2026, 10, 9, 12, 15).toISOString(),
      deliveryDeadline: new Date(2026, 10, 9, 13, 15).toISOString(),
    })
    expect(result.request).not.toHaveProperty('notes')
  })

  it('keeps notes when given', () => {
    const result = validateErrandForm(filled({ notes: ' Less ice ' }), now)
    expect(result.ok && result.request.notes).toBe('Less ice')
  })

  it('reports problems under the server field names', () => {
    const result = validateErrandForm(
      filled({
        supplierId: '',
        items: [
          { key: 0, name: '', quantity: '0' },
          { key: 1, name: 'x'.repeat(101), quantity: '1.5' },
        ],
        dropoffLocation: '   ',
        notes: 'n'.repeat(501),
        creditAmount: '1001',
      }),
      now,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(Object.keys(result.errors).sort()).toEqual(
      [
        'creditAmount',
        'dropoffLocation',
        'items[0].name',
        'items[0].quantity',
        'items[1].name',
        'items[1].quantity',
        'notes',
        'supplierId',
      ].sort(),
    )
  })

  it('requires future deadlines in order', () => {
    const past = validateErrandForm(filled({ listingDeadline: at(-1) }), now)
    expect(!past.ok && past.errors.listingDeadline).toBe('This must be in the future.')

    const unordered = validateErrandForm(
      filled({ listingDeadline: at(3), pickupDeadline: at(2), deliveryDeadline: at(1) }),
      now,
    )
    expect(!unordered.ok && unordered.errors).toMatchObject({
      pickupDeadline: 'Pickup cannot be before the listing deadline.',
      deliveryDeadline: 'Delivery cannot be before the pickup deadline.',
    })

    const equal = validateErrandForm(filled({ listingDeadline: at(2), pickupDeadline: at(2), deliveryDeadline: at(2) }), now)
    expect(equal.ok).toBe(true)

    const empty = validateErrandForm(filled({ deliveryDeadline: '' }), now)
    expect(!empty.ok && empty.errors.deliveryDeadline).toBe('Pick a date and time.')
  })
})
