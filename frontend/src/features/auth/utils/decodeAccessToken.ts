import { jwtDecode } from 'jwt-decode'
import type { UserRole } from '#/features/users/types/user.types'

export type AccessTokenClaims = {
  sub?: string
  roles?: UserRole[]
}

export const decodeAccessToken = (
  accessToken: string | null,
): AccessTokenClaims | null => {
  if (!accessToken) return null

  try {
    return jwtDecode<AccessTokenClaims>(accessToken)
  } catch {
    return null
  }
}
