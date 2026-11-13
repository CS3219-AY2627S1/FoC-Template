import { expect, it } from 'vitest'
import { formatSingaporeTime } from './time'

it('renders UTC instants as readable Singapore time with an explicit zone', () => {
  expect(formatSingaporeTime('2026-10-29T10:00:00Z')).toBe(
    '29 Oct 2026, 6:00:00 pm SGT',
  )
})

it('preserves the instant across offsets and the Singapore date boundary', () => {
  expect(formatSingaporeTime('2026-12-31T23:30:00Z')).toBe(
    '1 Jan 2027, 7:30:00 am SGT',
  )
  expect(formatSingaporeTime('2026-12-31T15:30:00-08:00')).toBe(
    '1 Jan 2027, 7:30:00 am SGT',
  )
})

it('handles an unavailable timestamp without displaying an invalid date', () => {
  expect(formatSingaporeTime('invalid')).toBe('Time unavailable')
})
