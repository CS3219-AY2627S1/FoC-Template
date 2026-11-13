// The user service returns timestamps as Postgres text, e.g. "2026-10-11 17:24:26.326292+00",
// which not every browser parses; this also accepts ISO 8601. NaN if it cannot be read.
export function parseTimestamp (value: string): number {
  return new Date(value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')).getTime()
}

// e.g. "12 Oct 2026"
export function formatDate (value: string): string {
  const time = parseTimestamp(value)
  return Number.isNaN(time) ? '' : new Date(time).toLocaleDateString('en-SG', { dateStyle: 'medium' })
}
