import { useMutation } from '@tanstack/react-query'

import { getRegisterErrorMessage } from '../utils/getRegisterErrorMessage'
import { registerUser } from '#/features/auth/api/registerUser.api'
import type { RegisterUserRequest } from '#/features/auth/types/auth.types'

export const useRegister = () => {
  const mutation = useMutation({
    // Forward only the request, without Query's mutation context.
    mutationFn: (request: RegisterUserRequest) => registerUser(request),

    // After failure, let the user retry explicitly.
    retry: false,

    // Attempt immediately, including while marked offline.
    networkMode: 'always',

    gcTime: 0,
  })

  return {
    ...mutation,
    errorMessage: getRegisterErrorMessage(mutation.error),
  }
}
