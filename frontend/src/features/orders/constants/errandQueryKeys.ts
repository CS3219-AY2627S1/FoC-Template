import type { MineParams } from '../types/errand.types'

export const errandQueryKeys = {
  user: (userId?: string) => ['errands', userId] as const,
  lists: (userId?: string) =>
    [...errandQueryKeys.user(userId), 'list'] as const,
  mine: (userId: string | undefined, params: MineParams) =>
    [...errandQueryKeys.lists(userId), 'mine', params] as const,
  available: (userId: string | undefined, q: string, page: number) =>
    [...errandQueryKeys.lists(userId), 'available', q, page] as const,
  admin: (userId: string | undefined, requesterId: string, page: number) =>
    [...errandQueryKeys.lists(userId), 'admin', requesterId, page] as const,
  detail: (userId: string | undefined, id: string) =>
    [...errandQueryKeys.user(userId), 'detail', id] as const,
  messages: (userId: string | undefined, id: string) =>
    [...errandQueryKeys.detail(userId, id), 'messages'] as const,
  deliveryPhotos: (userId: string | undefined, id: string) =>
    [...errandQueryKeys.detail(userId, id), 'delivery-photos'] as const,
}
