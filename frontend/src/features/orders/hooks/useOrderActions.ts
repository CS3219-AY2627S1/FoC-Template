import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  actOnOrder,
  createOrder,
  deliverOrder,
  retryCreation,
} from '../api/orders.api'
import { errandQueryKeys } from '../constants/errandQueryKeys'
import { useSession } from '#/features/auth/hooks/useSession'
import { creditQueryKeys } from '#/features/credits/constants/creditQueryKeys'
import type { CreateOrderRequest, OrderAction } from '../types/errand.types'

export const useOrderActions = () => {
  const client = useQueryClient()
  const { userId } = useSession()
  const refreshLists = () => {
    void client.invalidateQueries({
      queryKey: errandQueryKeys.lists(userId),
    })
  }
  const refreshDetail = async (id: string) => {
    refreshLists()
    await client.invalidateQueries({
      queryKey: errandQueryKeys.detail(userId, id),
      exact: true,
    })
  }
  const create = useMutation({
    networkMode: 'always',
    gcTime: 0,
    mutationFn: (input: CreateOrderRequest) => createOrder(input),
    retry: false,
    onSettled: () => {
      refreshLists()
      void client.invalidateQueries({ queryKey: creditQueryKeys.user(userId) })
    },
  })
  const retry = useMutation({
    networkMode: 'always',
    gcTime: 0,
    mutationFn: (id: string) => retryCreation(id),
    retry: false,
    onSettled: (_result, _error, id) => {
      void client.invalidateQueries({
        queryKey: creditQueryKeys.user(userId),
      })
      return refreshDetail(id)
    },
  })
  const action = useMutation({
    networkMode: 'always',
    gcTime: 0,
    mutationFn: ({
      id,
      action: operation,
    }: {
      id: string
      action: OrderAction
    }) => actOnOrder(id, operation),
    retry: false,
    onSettled: (_result, _error, { id }) => refreshDetail(id),
  })
  const deliver = useMutation({
    networkMode: 'always',
    gcTime: 0,
    mutationFn: ({ id, photos }: { id: string; photos: Array<File> }) =>
      deliverOrder(id, photos),
    retry: false,
    onSettled: (_result, _error, { id }) => refreshDetail(id),
  })
  return { create, retry, action, deliver }
}
