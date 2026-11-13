"use client"

import { useCallback } from "react"

import { useAuth } from "@/components/providers/auth-provider"
import { useConfig } from "@/components/providers/config-provider"
import { ApiError, apiRequest, requireBearerToken, type RequestOptions } from "@/lib/api"

// Returns a request function that always sends the signed-in user's Firebase ID token.
export function useApi() {
  const { apiBaseUrl } = useConfig()
  const { getIdToken, loading: authLoading, user } = useAuth()

  return useCallback(
    async <T,>(path: string, options: Omit<RequestOptions, "token"> = {}) => {
      // Do not let any browser request reach the gateway without a settled
      // Firebase user and bearer token. AuthProvider restores the session
      // asynchronously after a hard refresh.
      if (authLoading) {
        throw new ApiError(0, "AUTH_NOT_READY", "Authentication is still loading.")
      }
      if (!user) {
        throw new ApiError(401, "UNAUTHENTICATED", "Sign in to continue.")
      }

      const token = requireBearerToken(await getIdToken())

      return apiRequest<T>(apiBaseUrl, path, { ...options, token })
    },
    [apiBaseUrl, authLoading, getIdToken, user],
  )
}
