import { useQuery } from '@tanstack/react-query'
import { getCreditBalance } from '../api/credits.api'
import { creditQueryKeys } from '../constants/creditQueryKeys'

export const useCreditBalance = (userId?: string) =>
  useQuery({
    queryKey: creditQueryKeys.user(userId),
    queryFn: ({ signal }) => getCreditBalance(signal),
    enabled: !!userId,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: false,
  })
