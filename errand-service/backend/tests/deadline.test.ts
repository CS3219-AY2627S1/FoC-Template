import { describe, expect, it } from 'vitest'
import { endOfSingaporeDay } from '../src/utils/deadline.js'

describe('endOfSingaporeDay', () => {
  it('returns the end of the Singapore calendar day', () => {
    const deadline = endOfSingaporeDay(new Date('2026-10-18T03:00:00.000Z'))

    expect(deadline.toISOString()).toBe('2026-10-18T15:59:59.999Z')
  })
})
