import type { CreditBalance } from '../credit/models'
import type { ErrandApi } from '../errand/api'
import type { SupplierApi } from '../supplier/api'
import type { User } from '../user/models'
import type {
  ErrandViewContext,
  FetchSessionHandler,
  MapViewport,
  ProfileAnchor,
  UserLocation,
} from '../index'

// Retain existing wire names so separately deployed remotes can migrate independently.
export type MarketplaceNavigation = {
  navigateTo: (service: 'user' | 'supplier') => void
  openProfile: (anchor: ProfileAnchor) => void
  openCredit: (anchor: ProfileAnchor) => void
  openErrandView: (context: ErrandViewContext) => void
}

export type MarketplaceMapProps = {
  mapViewport: MapViewport
  /** Omitted when this map is read-only or hidden; it must not overwrite the active viewport. */
  onMapViewportChange?: (viewport: MapViewport) => void
  mapActive: boolean
}

export type UserRemoteProps = {
  fetchSession: FetchSessionHandler
  authVersion: number
  navigateTo: (service: 'user' | 'supplier') => void
  closeProfile: () => void
  refreshUserProfile: () => Promise<void>
  presentation: 'full' | 'card'
}

export type CreditRemoteProps = {
  creditBalance: CreditBalance | null
  authenticatedSubject?: string
  authVersion: number
  closeCredit: () => void
  creditHistoryOpen: boolean
  showCreditHistory: () => void
  showCreditBalance: () => void
}

export type SupplierRemoteProps = MarketplaceNavigation &
  MarketplaceMapProps & {
    userProfile: User | null
    creditBalance: CreditBalance | null
    authVersion: number
    supplierMode: 'explore' | 'requests' | 'my-errands'
    supplierApi: Pick<
      SupplierApi,
      'getSuppliers' | 'addSupplier' | 'updateSupplier' | 'removeSupplier'
    >
    errandApi: Pick<ErrandApi, 'getErrands' | 'getSupplierErrandView' | 'acceptErrand'>
    onErrandAccepted: () => void
  }

export type ErrandRemoteProps = MarketplaceNavigation &
  MarketplaceMapProps & {
    userProfile: User | null
    creditBalance: CreditBalance | null
    authenticatedSubject?: string
    invalidateCreditBalance: () => void
    /** Absent until navigation selects a view; the remote defaults to requests. */
    errandViewContext?: ErrandViewContext
    userLocation?: UserLocation
    requestUserLocation: () => Promise<UserLocation | undefined>
    presentation: 'full' | 'card'
    errandApi: Pick<
      ErrandApi,
      | 'getErrands'
      | 'getErrand'
      | 'createErrand'
      | 'acceptErrand'
      | 'pickupErrand'
      | 'deliverErrand'
      | 'confirmErrand'
      | 'cancelErrand'
      | 'dropErrand'
      | 'deleteErrand'
    >
    supplierApi: Pick<SupplierApi, 'getSuppliers'>
  }

export type RemotePropsByService = {
  credit: CreditRemoteProps
  supplier: SupplierRemoteProps
  errand: ErrandRemoteProps
  user: UserRemoteProps
}

/** Only services exposing a frontend; credit-estimation is backend-only. */
export type RemoteServiceId = keyof RemotePropsByService
