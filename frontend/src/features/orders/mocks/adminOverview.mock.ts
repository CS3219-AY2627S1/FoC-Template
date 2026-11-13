import type { AdminOverviewOrderSummary } from '../types/adminOverview.types'

// temporary sample data for the admin overview.
// TODO after the corresponding part done, link tgt
export const sampleOrderStats = {
  openErrands: 37,
  openErrandsSinceYesterday: 6,
  openDisputes: 3,
}

export const sampleLiveOrders: Array<AdminOverviewOrderSummary> = [
  {
    id: 1001,
    requester: 'Jamie Lee',
    courier: 'Akshay',
    pickup: 'Cool Spot',
    status: 'DELIVERED',
    credits: 3,
  },
  {
    id: 1002,
    requester: null,
    courier: 'Keyo',
    pickup: 'Printer @ Com 2',
    status: 'PICKED_UP',
    credits: 2,
  },
  {
    id: 1003,
    requester: 'Aisha',
    courier: 'Ting Kai',
    pickup: 'Supersnacks',
    status: 'ACCEPTED',
    credits: 3,
  },
  {
    id: 1004,
    requester: 'Marcus Ong',
    courier: null,
    pickup: 'TOMORO COFFEE',
    status: 'REQUESTED',
    credits: 4,
  },
]
