import { AxiosHeaders, CanceledError, isAxiosError } from 'axios'
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios'

import { getAccessToken, getCurrentUserId } from './accessTokenStore'
import { refreshAccessToken } from './refreshAccessToken'
import { AuthRequestError } from './authRequest'
import { decodeAccessToken } from '../utils/decodeAccessToken'

type AuthConfig = InternalAxiosRequestConfig & {
  sentAccessToken?: string | null
  authRetried?: boolean
}

const isCurrentUser = (config: AuthConfig) => {
  const userId = decodeAccessToken(config.sentAccessToken ?? null)?.sub
  return !!userId && userId === getCurrentUserId()
}

type AuthEvents = {
  canRefresh: () => boolean
  authenticationFailed: () => void
}

export const setupAuthInterceptors = (
  client: AxiosInstance,
  auth: AuthEvents,
) => {
  const requestId = client.interceptors.request.use(
    (config: AuthConfig) => {
      if (config.authRetried && !isCurrentUser(config))
        throw new CanceledError('The signed-in user changed')
      // Restrict automatic credentials to this application's business APIs.
      const url = config.url ?? ''
      const baseURL = config.baseURL ?? ''
      if (
        !url.startsWith('/') ||
        url.startsWith('//') ||
        (baseURL !== '' && baseURL !== '/api') ||
        /^\/(?:api\/)?auth(?:\/|\?|$)/.test(url)
      ) {
        throw new Error(
          'Use a relative business API path with the authenticated client.',
        )
      }

      const token = getAccessToken()
      config.headers = AxiosHeaders.from(config.headers)
      if (token) config.headers.set('Authorization', `Bearer ${token}`)
      else config.headers.delete('Authorization')
      config.sentAccessToken = token
      return config
    },
    (error: unknown) => {
      throw error
    },
    { synchronous: true },
  )

  const responseId = client.interceptors.response.use(
    (response) => {
      if (!isCurrentUser(response.config as AuthConfig))
        throw new CanceledError('The signed-in user changed')
      return response
    },
    async (error: unknown) => {
      if (
        isAxiosError(error) &&
        error.config &&
        !isCurrentUser(error.config as AuthConfig)
      )
        throw new CanceledError('The signed-in user changed')
      if (
        !isAxiosError(error) ||
        error.response?.status !== 401 ||
        !error.config
      )
        throw error
      const config = error.config as AuthConfig
      if (!auth.canRefresh()) throw error

      const currentToken = getAccessToken()
      if (config.authRetried) {
        // A late retry failure must not discard credentials obtained since it was sent.
        if (currentToken === config.sentAccessToken) auth.authenticationFailed()
        throw error
      }

      let token = currentToken
      if (!token || token === config.sentAccessToken) {
        try {
          token = await refreshAccessToken()
        } catch (refreshError) {
          if (
            refreshError instanceof AuthRequestError &&
            refreshError.status === 401 &&
            isCurrentUser(config) &&
            auth.canRefresh()
          ) {
            auth.authenticationFailed()
          }
          throw refreshError
        }
      }

      if (!isCurrentUser(config))
        throw new CanceledError('The signed-in user changed')
      if (!token || !auth.canRefresh()) throw error
      config.authRetried = true
      return client.request(config)
    },
  )

  return () => {
    client.interceptors.request.eject(requestId)
    client.interceptors.response.eject(responseId)
  }
}
