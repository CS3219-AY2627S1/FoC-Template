import type { UserListParams } from '../types/user.types'

export const userQueryKeys = {
  all: ['users'] as const,
  lists: ['users', 'list'] as const,
  list: (params: UserListParams) => ['users', 'list', params] as const,
  detail: (id: string) => ['users', 'detail', id] as const,
}
