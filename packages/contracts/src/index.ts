export type ServiceId = 'supplier' | 'user' | 'errand' | 'credit' | 'credit-estimation'

export type ServiceMetadata = {
  id: ServiceId
  label: string
  description: string
  path: string
}

export type Session = {
  token: string // raw JWT string to pass to backend
  userData: {
    id: string
    email: string
    emailVerified: boolean
    profileCreated: boolean
    isAdmin: boolean
  }
}

export type SessionError = {
  code: 'SESSION INVALIDATED'
  message: string
}

type FetchSessionOptions = { forceRefresh?: boolean }

export type FetchSessionHandler = (options?: FetchSessionOptions) => Promise<Session>

export type ErrandViewContext =
  | {
      view: 'create'
      supplierId?: string
      anchor?: {
        top: number
        left: number
        right: number
        bottom: number
      }
    }
  | {
      /** Open the errand-owned notification history, anchored to the caller's button. */
      view: 'updates'
      anchor: {
        top: number
        left: number
        right: number
        bottom: number
      }
    }
  | {
      view: 'requests'
    }
  | {
      view: 'my-errands'
    }
  | {
      view: 'explore'
    }
  | {
      view: 'supplier'
      supplierId: string
      scope: 'explore' | 'mine'
      supplier?: import('./supplier/models').Supplier
    }

export type UserLocation = {
  lat: number
  lng: number
}

export type MapViewport = {
  center: UserLocation
  zoom: number
}

export * from './frontend/remotes'

export type ProfileAnchor = {
  top: number
  left: number
  right: number
  bottom: number
  width: number
  height: number
}

export const SERVICE_METADATA: Record<ServiceId, ServiceMetadata> = {
  supplier: {
    id: 'supplier',
    label: 'Supplier service',
    description: 'Find campus shops, facilities, and collection points.',
    path: '/suppliers',
  },
  user: {
    id: 'user',
    label: 'User service',
    description: 'Manage your Relay profile and student identity.',
    path: '/users',
  },
  errand: {
    id: 'errand',
    label: 'Errand service',
    description: 'Create, accept, and track campus errand requests.',
    path: '/errands',
  },
  credit: {
    id: 'credit',
    label: 'Credit service',
    description: 'View your balance and closed-economy transactions.',
    path: '/credits',
  },
  'credit-estimation': {
    id: 'credit-estimation',
    label: 'Credit Estimation service',
    description: 'AI-powered credit estimation for errands.',
    path: '/estimation',
  },
}

export * from './user'
export * from './supplier'
export * from './errand'
export * from './credit'
export * from './credit-estimation'
