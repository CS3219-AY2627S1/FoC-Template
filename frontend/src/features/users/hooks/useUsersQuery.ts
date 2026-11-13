import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getUsers } from '../api/getUsers.api'
import type { UserListParams } from '../types/user.types'
import { userQueryKeys } from '../constants/userQueryKeys'

export const useUsersQuery = (params: UserListParams) =>
  useQuery({
    queryKey: userQueryKeys.list(params),
    queryFn: () => getUsers(params),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  })
