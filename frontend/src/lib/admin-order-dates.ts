/** Native calendar dates represent local days; the HTTP API always receives explicit instants. */
export function adminOrderDateBounds(fromDate?: string, toDate?: string) {
  const localDay = (value: string) => {
    const date = new Date(value + "T00:00:00")
    const [year, month, day] = value.split("-").map(Number)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime())
      || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      throw new Error("Choose a valid calendar date.")
    }
    return date
  }
  if (fromDate && toDate && fromDate > toDate) throw new Error("The end date must be on or after the start date.")
  const from = fromDate ? localDay(fromDate) : null
  const before = toDate ? localDay(toDate) : null
  if (before) before.setDate(before.getDate() + 1)
  return { createdFrom: from?.toISOString(), createdBefore: before?.toISOString() }
}
