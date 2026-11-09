/* AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-11-09.
 * Scope: Singapore day-boundary and URL validation regressions for #65.
 * Author review: Reviewed and approved by @phuc. */
import { describe, expect, it } from 'vitest'
import { dateRangeError, historyFilters, transactionQuery } from './historyFilters'

describe('Credit date filters', () => {
  it.each([
    ['2026-11-02', '2026-11-03'], ['2026-12-31', '2027-01-01'],
    ['2024-02-28', '2024-02-29'], ['2024-02-29', '2024-03-01'], ['2026-02-28', '2026-03-01'],
  ])('includes the entire selected Singapore end day %s', (day, following) => {
    expect(transactionQuery({ from: day, to: day, page: 0, size: 20 })).toEqual({
      from: `${day}T00:00:00+08:00`, to: `${following}T00:00:00+08:00`, page: 0, size: 20,
    })
  })
  it('supports no bounds and either date alone', () => {
    expect(transactionQuery({ from: '', to: '', page: 0, size: 20 })).toEqual({ from: undefined, to: undefined, page: 0, size: 20 })
    expect(transactionQuery({ from: '2026-11-02', to: '', page: 0, size: 20 }).to).toBeUndefined()
    expect(transactionQuery({ from: '', to: '2026-11-02', page: 0, size: 20 }).from).toBeUndefined()
  })
  it('rejects reversed, invalid and overflowing dates before calling the endpoint', () => {
    expect(dateRangeError('2026-11-03', '2026-11-02')).toMatch(/end date/)
    for (const to of ['2026-02-29', 'invalid', '0000-01-01', '9999-12-31']) {
      expect(() => transactionQuery({ from: '', to, page: 0, size: 20 })).toThrow()
    }
  })
  it('normalizes unsafe URL paging and unsupported sizes', () => {
    expect(historyFilters(new URLSearchParams('page=9007199254740991&size=100')).page).toBe(0)
    expect(historyFilters(new URLSearchParams('page=-1&size=101'))).toEqual({ from: '', to: '', page: 0, size: 20 })
    expect(historyFilters(new URLSearchParams('page=2&size=50')).page).toBe(2)
  })
})
