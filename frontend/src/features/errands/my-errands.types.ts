export type MyErrandRole = 'requester' | 'courier'

export type MyErrandProgress =
  | 'waiting-for-courier'
  | 'accepted'
  | 'ready-for-collection'
  | 'awaiting-confirmation'

export type MyErrandItem = {
  id: string
  requiredItem: string
  pickupLocation: string
  deliveryLocation: string
  creditValue: number
  role: MyErrandRole
  progress: MyErrandProgress
  expiresAt: string
}

export type MyErrandFilter = 'all' | 'requester' | 'courier'
