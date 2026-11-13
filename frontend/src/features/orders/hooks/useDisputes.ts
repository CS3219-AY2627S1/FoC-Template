import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '#/features/auth/hooks/useSession'
import {
  listDisputes,
  reportDispute,
  respondToDispute,
  resolveDispute,
} from '../api/disputes.api'
import { errandQueryKeys } from '../constants/errandQueryKeys'
import { orderQueryOptions } from './useOrders'
import type { DisputeDecision } from '../types/dispute.types'

export const useDisputes = (page: number) => {
  const { userId } = useSession()
  return useQuery({
    ...orderQueryOptions,
    queryKey: [...errandQueryKeys.user(userId), 'disputes', page],
    queryFn: ({ signal }) => listDisputes(page, signal),
    enabled: !!userId,
    refetchInterval: 15_000,
  })
}

export const useDisputeActions = (orderId: string) => {
  const client = useQueryClient()
  const { userId } = useSession()
  const refresh = async () => {
    void client.invalidateQueries({
      queryKey: [...errandQueryKeys.user(userId), 'disputes'],
    })
    void client.invalidateQueries({ queryKey: errandQueryKeys.lists(userId) })
    await client.invalidateQueries({
      queryKey: errandQueryKeys.detail(userId, orderId),
      exact: true,
    })
  }
  const report = useMutation({
    mutationFn: (complaint: string) => reportDispute(orderId, complaint),
    networkMode: 'always',
    gcTime: 0,
    retry: false,
    onSettled: refresh,
  })
  const resolve = useMutation({
    mutationFn: ({
      id,
      decision,
      explanation,
    }: {
      id: string
      decision: DisputeDecision
      explanation: string
    }) => resolveDispute(id, decision, explanation),
    networkMode: 'always',
    gcTime: 0,
    retry: false,
    onSettled: refresh,
  })
  const respond = useMutation({
    mutationFn: ({ id, response }: { id: string; response: string }) =>
      respondToDispute(id, response),
    networkMode: 'always',
    gcTime: 0,
    retry: false,
    onSettled: refresh,
  })
  return { report, resolve, respond }
}
