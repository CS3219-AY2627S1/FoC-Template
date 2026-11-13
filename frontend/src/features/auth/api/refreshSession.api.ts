import { authRequest } from '../lib/authRequest'
import type { AccessTokenResponse } from '../types/auth.types'

export const refreshSession = (): Promise<AccessTokenResponse> =>
  authRequest<AccessTokenResponse>('/auth/refresh', undefined, 15_000)
