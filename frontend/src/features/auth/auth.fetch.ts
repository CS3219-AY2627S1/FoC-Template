import { getAccessToken, refreshAccessToken } from './auth.token'

function withAccessToken(init: RequestInit, accessToken: string | null) {
  const headers = new Headers(init.headers)

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  } else {
    headers.delete('Authorization')
  }

  return { ...init, headers }
}

export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const response = await fetch(input, withAccessToken(init, getAccessToken()))

  if (response.status !== 401) return response

  try {
    const accessToken = await refreshAccessToken()
    return await fetch(input, withAccessToken(init, accessToken))
  } catch {
    return response
  }
}
