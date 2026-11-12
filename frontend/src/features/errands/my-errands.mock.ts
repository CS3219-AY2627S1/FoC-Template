import type { MyErrandItem } from './my-errands.types'

export const MOCK_MY_ERRANDS: MyErrandItem[] = [
  {
    id: '2fdf7658-f477-4a52-94ed-cbbf2447e005',
    requiredItem: 'Print and bind project report',
    pickupLocation: 'Central Library Print Centre',
    deliveryLocation: 'COM3, Level 2 lobby',
    creditValue: 12,
    role: 'requester',
    progress: 'awaiting-confirmation',
    expiresAt: '2026-10-21T11:00:00.000Z',
  },
  {
    id: '6376fe09-c727-43df-b59c-56cc7e0c7de8',
    requiredItem: 'Collect parcel from locker',
    pickupLocation: 'PGP Parcel Station',
    deliveryLocation: 'COM2, Level 1',
    creditValue: 7,
    role: 'courier',
    progress: 'ready-for-collection',
    expiresAt: '2026-10-21T12:30:00.000Z',
  },
  {
    id: '585635b2-21c6-4817-9263-9981bc1c0504',
    requiredItem: 'Nasi Lemak + Iced Milo',
    pickupLocation: 'The Deck, Arts',
    deliveryLocation: 'UTown Residence',
    creditValue: 8,
    role: 'courier',
    progress: 'accepted',
    expiresAt: '2026-10-21T13:30:00.000Z',
  },
  {
    id: '54a639e7-98f6-4254-8ac3-3a7f1e003bf9',
    requiredItem: 'Coffee Bean order',
    pickupLocation: 'Coffee Bean @ COM3',
    deliveryLocation: 'PGP Foyer',
    creditValue: 6,
    role: 'requester',
    progress: 'waiting-for-courier',
    expiresAt: '2026-10-21T14:00:00.000Z',
  },
]
