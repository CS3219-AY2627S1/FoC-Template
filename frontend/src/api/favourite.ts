// Frontend API client for favourites in the user service: suppliers, and building spots
// (building + floor + optional room, e.g. "Home").
// Favourites only store ids; the user service adds the live supplier/building details and quietly
// drops favourites whose supplier or building has been deleted.
import client from './http'

export type FavouriteKind = 'SUPPLIER' | 'LOCATION'

// the live supplier fields a bookmark carries
export interface FavouriteSupplier {
  id: number
  name: string
  type: string[]
  floor: number | null
  locationId: number
  imageUrl: string | null
  opensAt: string | null
  closesAt: string | null
}

export interface Favourite {
  id: number
  kind: FavouriteKind
  // supplier id or building (location) id
  targetId: number
  // LOCATION: the saved floor (1 = ground, negative = basement); SUPPLIER: 0
  floor: number
  // LOCATION: room/unit, e.g. "#05-12"; null when there is none
  room: string | null
  label: string | null
  createdAt: string
  // live details; null while the supplier service could not be reached
  supplier?: FavouriteSupplier | null
  location?: { id: number, name: string } | null
}

export type NewFavourite
  = | { kind: 'SUPPLIER', targetId: number, label?: string | null }
    | { kind: 'LOCATION', targetId: number, floor: number, room?: string | null, label?: string | null }

// the user service's limits
export const MAX_FAVOURITES = 20
export const MAX_LABEL_LENGTH = 30

// the signed-in user's favourites, newest first
export async function listFavourites () {
  const response = await client.get<{ data: Favourite[] }>('/public/user/favourite')
  return response.data.data
}

// adding the same place twice returns the favourite already saved
export async function addFavourite (body: NewFavourite) {
  const response = await client.post<Favourite>('/public/user/favourite', body)
  return response.data
}

// a blank label clears it
export async function renameFavourite (id: number, label: string | null) {
  const response = await client.patch<Favourite>(`/public/user/favourite/${id}`, { label })
  return response.data
}

export async function removeFavourite (id: number) {
  await client.delete(`/public/user/favourite/${id}`)
}
