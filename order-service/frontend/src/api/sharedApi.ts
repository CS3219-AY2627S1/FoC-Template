import { readSession } from '../auth/session'

/**
 * Read-only calls to other services' published APIs, made by the browser on the shared gateway
 * origin. Order Service itself never calls them.
 */

/** Mirrors Supplier's SupplierResponse (fields this UI uses). */
export type CampusLocation = {
  id: string
  name: string
  building: string
  floor: string | null
}

type SupplierPage = { items: CampusLocation[]; totalPages: number }

/** Every ACTIVE supplier location (public endpoint), A–Z, for the pickup and drop-off pickers. */
export async function fetchCampusLocations(): Promise<CampusLocation[]> {
  const locations: CampusLocation[] = []
  for (let page = 0; ; page++) {
    const response = await fetch(
      `/api/suppliers?page=${page}&size=100&sort=name,asc`,
      {
        headers: { Accept: 'application/json' },
      },
    )
    if (!response.ok)
      throw new Error('Campus locations are unavailable right now.')
    const body = (await response.json()) as SupplierPage
    locations.push(...body.items)
    if (page + 1 >= body.totalPages) return locations
  }
}

/** Mirrors Credit's balance response. */
export type CreditBalance = {
  availableBalance: number
  reservedBalance: number
}

/** The caller's own balance; null when Credit has no account for them yet. */
export async function fetchMyCredits(): Promise<CreditBalance | null> {
  const session = readSession()
  if (!session) return null
  const response = await fetch('/api/credits/me', {
    headers: {
      Accept: 'application/json',
      Authorization: `${session.tokenType} ${session.accessToken}`,
    },
  })
  if (response.status === 404) return null
  if (!response.ok)
    throw new Error('Your credit balance is unavailable right now.')
  return (await response.json()) as CreditBalance
}
