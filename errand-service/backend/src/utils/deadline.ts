/**
 * Returns 23:59:59.999 on the supplied date's calendar day in Singapore.
 * Singapore uses UTC+08:00 without daylight-saving changes.
 */
export function endOfSingaporeDay(date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const get = (type: 'year' | 'month' | 'day'): number => {
    const value = parts.find((part) => part.type === type)?.value
    if (!value) throw new Error(`Unable to determine Singapore ${type}.`)
    return Number(value)
  }

  return new Date(Date.UTC(get('year'), get('month') - 1, get('day'), 15, 59, 59, 999))
}
