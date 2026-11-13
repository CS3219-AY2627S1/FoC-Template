import { useQuery } from '@tanstack/react-query'
import { useSession } from '#/features/auth/hooks/useSession'
import { getErrandAiCapabilities } from '../api/errandAi.api'

export function useErrandAiCapabilities() {
  const { userId } = useSession()
  const query = useQuery({
    queryKey: ['orders', 'ai', 'capabilities', userId],
    queryFn: ({ signal }) => getErrandAiCapabilities(signal),
    enabled: !!userId,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  return { ...query, userId }
}
