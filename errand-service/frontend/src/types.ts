import type { ErrandStatus, ServiceType, Supplier } from '@relay/contracts'

export type ErrandLocation = {
  lat: number
  lng: number
  buildingName: string
  floorNumber: number
}

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  0: 'Food',
  1: 'Drink',
  2: 'Shopping',
  3: 'Printing',
  4: 'Parcel',
}

export const STATUS_LABELS: Record<ErrandStatus, string> = {
  OPEN: 'Open',
  ACCEPTED: 'Accepted',
  PICKED_UP: 'Collected',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  CONFIRMED: 'Confirmed',
  DELETED: 'Deleted',
}

export function statusTone(status: ErrandStatus): 'neutral' | 'success' | 'danger' | 'warning' {
  if (status === 'OPEN' || status === 'DELIVERED' || status === 'CONFIRMED') return 'success'
  if (status === 'CANCELLED' || status === 'EXPIRED' || status === 'DELETED') return 'danger'
  if (status === 'ACCEPTED' || status === 'PICKED_UP') return 'warning'
  return 'neutral'
}

export function formatDeadline(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  )
}

export function formatRoute(location: ErrandLocation): string {
  return `${location.buildingName} · Level ${location.floorNumber}`
}
