import createClient from 'openapi-fetch'
import type { paths } from './schema'
import { expireSession, readSession, reportAccessDenied } from '../auth/session'

function isProtectedSupplierRequest(request: Request) {
  const url = new URL(request.url)
  return (
    url.pathname.startsWith('/api/admin/suppliers') ||
    (url.pathname.startsWith('/api/suppliers') && request.method !== 'GET')
  )
}

export async function supplierFetch(request: Request) {
  const authenticatedRequest = new Request(request)
  const session = readSession()
  if (session) {
    authenticatedRequest.headers.set(
      'Authorization',
      `${session.tokenType} ${session.accessToken}`,
    )
  }

  const response = await fetch(authenticatedRequest)
  if (
    response.status === 401 &&
    isProtectedSupplierRequest(authenticatedRequest)
  )
    expireSession()
  if (
    response.status === 403 &&
    isProtectedSupplierRequest(authenticatedRequest)
  )
    reportAccessDenied()
  return response
}

export const supplierApi = createClient<paths>({
  baseUrl: '',
  fetch: supplierFetch,
})
