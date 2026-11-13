import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '#/features/auth/hooks/useSession'
import { creditQueryKeys } from '#/features/credits/constants/creditQueryKeys'
import { errandQueryKeys } from '../constants/errandQueryKeys'
import {
  getDeliveryPhotos,
  getOrder,
  listAvailableOrders,
  listMyOrders,
  listRequesterOrders,
} from '../api/orders.api'
import { inaccessibleOrder } from '../utils/orderErrors'
import type { Errand, MineParams } from '../types/errand.types'

export const orderQueryOptions = {
  staleTime: 0,
  refetchOnMount: 'always' as const,
  refetchOnWindowFocus: 'always' as const,
  refetchIntervalInBackground: false,
  retry: false,
}
export const detailInterval = (order?: Errand) =>
  !order ||
  ['CREATING', 'OPEN', 'ACCEPTED', 'PICKED_UP', 'DELIVERED'].includes(
    order.status,
  ) ||
  ['SETTLEMENT_PENDING', 'RELEASE_PENDING'].includes(order.creditState ?? '')
    ? 5_000
    : false
export const useMyErrands = (params: MineParams) => {
  const { userId } = useSession()
  const query = useQuery({
    ...orderQueryOptions,
    queryKey: errandQueryKeys.mine(userId, params),
    queryFn: ({ signal }) => listMyOrders(params, signal),
    enabled: !!userId,
    refetchInterval: 15_000,
  })
  return {
    ...query,
    userId,
  }
}
export const useAvailableOrders = (q: string, page: number) => {
  const { userId } = useSession()
  const query = useQuery({
    ...orderQueryOptions,
    queryKey: errandQueryKeys.available(userId, q, page),
    queryFn: ({ signal }) => listAvailableOrders({ q, page, size: 20 }, signal),
    enabled: !!userId,
    refetchInterval: 15_000,
  })
  return {
    ...query,
    userId,
  }
}
export const useAdminOrders = (requesterId: string, page: number) => {
  const { userId } = useSession()
  const query = useQuery({
    ...orderQueryOptions,
    queryKey: errandQueryKeys.admin(userId, requesterId, page),
    queryFn: ({ signal }) => listRequesterOrders(requesterId, page, signal),
    enabled: !!userId && !!requesterId,
    refetchInterval: 15_000,
  })
  return {
    ...query,
    userId,
  }
}
export const useOrder = (id: string) => {
  const { userId } = useSession()
  const client = useQueryClient()
  const query = useQuery({
    ...orderQueryOptions,
    queryKey: errandQueryKeys.detail(userId, id),
    queryFn: ({ signal }) => getOrder(id, signal),
    enabled: !!userId && !!id,
    refetchInterval: (q) =>
      inaccessibleOrder(q.state.error) ? false : detailInterval(q.state.data),
  })
  const creditState = query.data?.creditState
  useEffect(() => {
    if (userId && (creditState === 'SETTLED' || creditState === 'RELEASED'))
      void client.invalidateQueries({ queryKey: creditQueryKeys.user(userId) })
  }, [client, userId, creditState])
  return {
    ...query,
    userId,
  }
}
// the photo links will expire after 10 minutes, so they will be fetched again
export const useDeliveryPhotos = (order: Errand) => {
  const { userId } = useSession()
  return useQuery({
    queryKey: errandQueryKeys.deliveryPhotos(userId, order.id),
    queryFn: ({ signal }) => getDeliveryPhotos(order.id, signal),
    enabled: !!userId && order.hasDeliveryPhoto,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: false,
  })
}
