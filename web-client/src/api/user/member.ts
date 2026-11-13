import { useQuery } from '@tanstack/react-query'
import { request } from '@/lib/http'

// Its own key: ['user', 'detail', id] already holds the full account in the admin pages.
export function useName(id: string, enabled = true) {
  return useQuery({
    queryKey: ['user', 'name', id],
    queryFn: ({ signal }) => request<string>('user', `/users/name/${id}`, { signal }),
    enabled,
  })
}
