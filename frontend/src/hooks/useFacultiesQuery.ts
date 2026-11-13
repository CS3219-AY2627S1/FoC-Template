import { useQuery } from '@tanstack/react-query'
import { getFaculties } from '#/api/getFaculties.api'

export const useFacultiesQuery = () =>
  useQuery({
    queryKey: ['users', 'faculties'],
    queryFn: getFaculties,
    staleTime: 60 * 60 * 1000,
  })
