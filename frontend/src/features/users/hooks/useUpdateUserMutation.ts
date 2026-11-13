import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateUser } from '../api/updateUser.api'
import type { UpdateUserRequest } from '../types/user.types'
import { userQueryKeys } from '../constants/userQueryKeys'

export const useUpdateUserMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, request }: { id: string; request: UpdateUserRequest }) =>
      updateUser(id, request),
    onSuccess: (updated) => {
      queryClient.setQueryData(userQueryKeys.detail(updated.id), updated)
      void queryClient.invalidateQueries({ queryKey: userQueryKeys.lists })
    },
    networkMode: 'always',
  })
}
