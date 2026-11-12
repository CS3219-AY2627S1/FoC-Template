import type { ErrandStatus } from './errand.types'

export type ErrandViewerRole = 'requester' | 'courier'

export type ErrandDetails = {
  id: string
  status: ErrandStatus
  viewerRole: ErrandViewerRole
  requiredItem: string
  creditValue: number
  supplierName: string
  pickupLocation: string
  deliveryBuilding: string
  deliveryFloor: string | null
  deliveryDescription: string | null
  requesterName: string
  courierName: string | null
  createdAt: string
  expiresAt: string
  acceptedAt: string | null
  deliveredAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  failedAt: string | null
  failureReason: string | null
}

