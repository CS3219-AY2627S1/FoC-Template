import { useMemo, useSyncExternalStore } from 'react'
import { getAccessToken, subscribeSession } from '../lib/accessTokenStore'
import { decodeAccessToken } from '../utils/decodeAccessToken'

export const useSession = () => {
  const accessToken = useSyncExternalStore(
    subscribeSession,
    getAccessToken,
    getAccessToken,
  )
  return useMemo(() => {
    const claims = decodeAccessToken(accessToken)
    return {
      userId: claims?.sub,
      roles: claims?.roles ?? [],
    }
  }, [accessToken])
}
