import { getAccessToken } from '../lib/accessTokenStore'
import { decodeAccessToken } from './decodeAccessToken'

export const hasAdminRole = () => {
  try {
    const claims = decodeAccessToken(getAccessToken())
    return claims?.roles?.includes('ADMIN') ?? false
  } catch {
    // if a token cannot be decoded, then just treat as not admin users
    return false
  }
}
