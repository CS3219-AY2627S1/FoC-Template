import { describe, expect, it } from 'vitest'
import {
  hasActiveFilters,
  parseSupplierListSearch,
  toCategoryParam,
  toSupplierFilters,
} from './supplierFilters'

describe('parseSupplierListSearch', () => {
  it('keeps valid filters', () => {
    expect(
      parseSupplierListSearch({
        q: ' coffee ',
        category: 'FOOD,COFFEE',
        openNow: true,
        inactive: true,
      }),
    ).toEqual({
      q: 'coffee',
      category: 'FOOD,COFFEE',
      openNow: true,
      inactive: true,
    })
  })

  it('exclude unknown or duplicate categories, and support both case-insensitivity and array formats', () => {
    expect(
      parseSupplierListSearch({ category: 'pizza,food,FOOD' }).category,
    ).toBe('FOOD')
    expect(
      parseSupplierListSearch({ category: ['FOOD', 'COFFEE'] }).category,
    ).toBe('FOOD,COFFEE')
  })

  it('leaves out empty or invalid values', () => {
    expect(
      parseSupplierListSearch({ q: '  ', category: 'PIZZA', openNow: 'yes' }),
    ).toEqual({
      q: undefined,
      category: undefined,
      openNow: undefined,
      inactive: undefined,
    })
  })
})

describe('toSupplierFilters', () => {
  it('splits categories into a list for the API', () => {
    expect(
      toSupplierFilters({ category: 'FOOD,COFFEE', openNow: true }),
    ).toEqual({ category: ['FOOD', 'COFFEE'], openNow: true })
    expect(toSupplierFilters({}).category).toBeUndefined()
  })
})

describe('toCategoryParam', () => {
  it('joins categories or clears the param', () => {
    expect(toCategoryParam(['FOOD', 'COFFEE'])).toBe('FOOD,COFFEE')
    expect(toCategoryParam([])).toBeUndefined()
  })
})

describe('hasActiveFilters', () => {
  it('ignores the deactivated toggle, which widens rather than narrows', () => {
    expect(hasActiveFilters({ inactive: true })).toBe(false)
    expect(hasActiveFilters({ openNow: true })).toBe(true)
    expect(hasActiveFilters({ category: 'FOOD' })).toBe(true)
  })
})
