import { authRequest } from '../lib/authRequest'
import type { AccessTokenResponse, LoginRequest } from '../types/auth.types'

export const loginUser = async (
  request: LoginRequest,
): Promise<AccessTokenResponse> => {
  const { email, password } = request
  return authRequest<AccessTokenResponse>('/auth/login', {
    email,
    password,
  })
}
