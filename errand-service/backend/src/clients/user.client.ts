import type { ApiResult, GetUserProfileBySubjectResponse } from '@relay/contracts'
import { ErrandErrors } from '@relay/contracts'
import { getEnv } from '../config/env.js'
import { ErrandServiceError } from '../types/errand.types.js'

export class UserClient {
  async getProfile(sub: string): Promise<GetUserProfileBySubjectResponse | null> {
    const env = getEnv()

    let response: Response
    try {
      response = await fetch(`${env.userApiUrl}/internal/user/profile/${encodeURIComponent(sub)}`, {
        headers: { 'x-user-service-token': env.userServiceInternalToken },
        signal: AbortSignal.timeout(env.timeoutMs),
      })
    } catch {
      throw new ErrandServiceError(
        ErrandErrors.INTERNAL_ERROR,
        'User Service profile lookup is unavailable.',
        503,
      )
    }

    if (response.status === 404) return null
    if (!response.ok) {
      throw new ErrandServiceError(
        ErrandErrors.INTERNAL_ERROR,
        'User Service profile lookup failed.',
        503,
      )
    }

    const body = (await response.json()) as ApiResult<GetUserProfileBySubjectResponse>
    if (!body.ok) {
      throw new ErrandServiceError(
        ErrandErrors.INTERNAL_ERROR,
        'User Service returned an invalid profile response.',
        503,
      )
    }
    return body.data
  }
}
