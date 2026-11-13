export function formatTime(value?: string | null) {
  if (!value) return null

  const [hours, minutes] = value.split(':').map(Number)
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return value

  return new Intl.DateTimeFormat('en-SG', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2020, 0, 1, hours, minutes)))
}

export function formatOperatingHours(
  openingTime?: string | null,
  closingTime?: string | null,
) {
  const opening = formatTime(openingTime)
  const closing = formatTime(closingTime)

  if (opening && closing) return `${opening}–${closing}`
  if (opening) return `Opens ${opening}`
  if (closing) return `Closes ${closing}`
  return 'Hours not provided'
}

export function formatBuilding(building?: string, floor?: string | null) {
  if (!building) return 'Building not provided'
  return floor ? `${building} · Floor ${floor}` : building
}

export function displayImageUrl(value?: string | null) {
  const normalizedValue = value?.trim()
  if (!normalizedValue) return null

  const match = normalizedValue.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/,
  )
  if (!match) return normalizedValue

  const [, owner, repository, branch, path] = match
  return `https://raw.githubusercontent.com/${owner}/${repository}/${branch}/${path}`
}

export function isUuid(value: string | undefined): value is string {
  return Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    ),
  )
}
