import { useQuery } from '@tanstack/react-query'
import { sampleLiveOrders, sampleOrderStats } from '../mocks/adminOverview.mock'

export const orderKeys = {
  all: ['orders'] as const,
  live: () => [...orderKeys.all, 'live'] as const,
  stats: () => [...orderKeys.all, 'stats'] as const,
}

// TODO link with API for order service afterwards, now show sample data
export const useLiveOrders = () =>
  useQuery({
    queryKey: orderKeys.live(),
    queryFn: async () => sampleLiveOrders,
  })

export const useOrderStats = () =>
  useQuery({
    queryKey: orderKeys.stats(),
    queryFn: async () => sampleOrderStats,
  })
