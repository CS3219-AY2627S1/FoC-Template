import { useMutation } from '@tanstack/react-query'

import { getLoginErrorMessage } from '../utils/getLoginErrorMessage'
import { loginUser } from '../api/loginUser.api'
import type { LoginRequest } from '../types/auth.types'

export const useLogin = () => {
  const mutation = useMutation({
    mutationFn: (request: LoginRequest) => loginUser(request),
    retry: false,
    networkMode: 'always',
    gcTime: 0,
  })

  return { ...mutation, errorMessage: getLoginErrorMessage(mutation.error) }
}
