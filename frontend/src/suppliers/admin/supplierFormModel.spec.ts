/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Added focused exact-body and validation tests for issue #30.
 * Author review: Reviewed and approved by @ron.
 */
import { describe, expect, it } from 'vitest'
import {
  EMPTY_SUPPLIER_DRAFT,
  mutationFromDraft,
  validateSupplierDraft,
} from './supplierFormModel'

describe('Supplier administrator form model', () => {
  it('omits interval fields for non-interval hours and converts blank optional values to null', () => {
    const mutation = mutationFromDraft({
      ...EMPTY_SUPPLIER_DRAFT,
      name: '  New Supplier  ',
      categories: ['SHOPPING'],
      buildingCode: 'COM2',
      locationDescription: '  Main foyer  ',
      hoursKind: 'ALL_DAY',
      opensAt: '09:00',
      closesAt: '18:00',
    })

    expect(mutation).toEqual({
      name: 'New Supplier',
      categories: ['SHOPPING'],
      buildingCode: 'COM2',
      floor: null,
      locationDescription: 'Main foyer',
      latitude: null,
      longitude: null,
      hoursKind: 'ALL_DAY',
    })
    expect(mutation).not.toHaveProperty('opensAt')
    expect(mutation).not.toHaveProperty('closesAt')
  })

  it('guides required, coordinate-pair, and interval validation before the API remains authoritative', () => {
    const errors = validateSupplierDraft({
      ...EMPTY_SUPPLIER_DRAFT,
      latitude: '1.3',
      hoursKind: 'INTERVAL',
      opensAt: '09:00',
      closesAt: '09:00',
    })

    expect(errors).toMatchObject({
      name: expect.any(String),
      categories: expect.any(String),
      buildingCode: expect.any(String),
      locationDescription: expect.any(String),
      latitude: expect.any(String),
      longitude: expect.any(String),
      closesAt: expect.any(String),
    })
  })
})
