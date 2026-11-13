// Relay serves one campus, so dates and times are shown in campus time on every device,
// the same clock the supplier-service uses for opening hours.
const CAMPUS = { locale: 'en-SG', timeZone: 'Asia/Singapore' } as const

const dateFormat = new Intl.DateTimeFormat(CAMPUS.locale, {
  timeZone: CAMPUS.timeZone,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const timeFormat = new Intl.DateTimeFormat(CAMPUS.locale, {
  timeZone: CAMPUS.timeZone,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

// "2026-08-12T10:22:00.000Z" becomes "12 Aug 2026".
export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso))
}

// "2026-08-12T10:22:00.000Z" becomes "18:22".
export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso))
}

// "2026-08-12T10:22:00.000Z" becomes "12 Aug 2026, 18:22".
export function formatDateTime(iso: string): string {
  return `${formatDate(iso)}, ${formatTime(iso)}`
}