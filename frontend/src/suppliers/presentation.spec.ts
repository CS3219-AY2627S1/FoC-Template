/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Added focused tests for shared Supplier presentation helpers in issue #28.
 * Author review: Reviewed and approved by @ron.
 */
import { describe, expect, it } from 'vitest'

import { formatSupplierCategories, formatTypicalHours } from './presentation'

describe('Supplier presentation', () => {
  it('formats controlled categories for people', () => {
    expect(formatSupplierCategories(['FOOD', 'PICKUP_POINT'])).toBe('Food, Pickup point')
  })

  it('describes unknown, all-day, same-day, and overnight typical hours', () => {
    expect(formatTypicalHours({ hoursKind: 'UNKNOWN', opensAt: null, closesAt: null })).toBe(
      'Typical hours unavailable',
    )
    expect(formatTypicalHours({ hoursKind: 'ALL_DAY', opensAt: null, closesAt: null })).toBe('Open all day')
    expect(formatTypicalHours({ hoursKind: 'INTERVAL', opensAt: '09:00', closesAt: '18:00' })).toBe(
      '09:00–18:00',
    )
    expect(formatTypicalHours({ hoursKind: 'INTERVAL', opensAt: '11:00', closesAt: '02:00' })).toBe(
      '11:00–02:00 (closes next day)',
    )
  })
})
