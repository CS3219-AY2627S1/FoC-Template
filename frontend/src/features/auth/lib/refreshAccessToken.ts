import { refreshSession } from '../api/refreshSession.api'
import { getAccessToken, setAccessToken } from './accessTokenStore'
import { AuthRequestError } from './authRequest'
import { decodeAccessToken } from '../utils/decodeAccessToken'

let refreshPromise: Promise<string | null> | null = null
let discardResult: (() => void) | null = null

// Invalidate the current refresh result and return its promise so logout can wait for it.
export const invalidateRefresh = () => {
  discardResult?.()
  return refreshPromise
}

export const refreshAccessToken = (): Promise<string | null> => {
  if (refreshPromise) return refreshPromise

  const userId = decodeAccessToken(getAccessToken())?.sub
  let invalidated = false
  discardResult = () => {
    invalidated = true
  }

  refreshPromise = refreshSession()
    .then(({ accessToken }) => {
      if (invalidated) return getAccessToken()
      // Shared refresh cookies may now belong to an account logged in from another tab.
      if (userId && decodeAccessToken(accessToken)?.sub !== userId)
        throw new AuthRequestError(401, 'The login session changed')
      setAccessToken(accessToken)
      return accessToken
    })
    .catch((error: unknown) => {
      if (invalidated) return getAccessToken()
      throw error
    })
    .finally(() => {
      refreshPromise = null
      discardResult = null
    })

  return refreshPromise
}
