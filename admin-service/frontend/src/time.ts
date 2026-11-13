const singaporeTime = new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
})

export function formatSingaporeTime(value: string) {
  const instant = new Date(value)
  return Number.isNaN(instant.getTime())
    ? 'Time unavailable'
    : `${singaporeTime.format(instant)} SGT`
}
