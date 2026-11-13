import { useQuery } from '@tanstack/react-query'
import { getUser } from '../api/getUser.api'
import { userQueryKeys } from '../constants/userQueryKeys'

export const useUserQuery = (id: string) =>
  useQuery({
    queryKey: userQueryKeys.detail(id),
    queryFn: () => getUser(id),
    enabled: !!id,
    staleTime: 0,
    refetchInterval: 5 * 60_000,
  })
