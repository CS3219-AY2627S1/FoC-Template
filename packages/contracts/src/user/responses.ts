import type { UserApiError } from './errors'
import type { User, UserProfileSummary } from './models'

/** Successful User API result. */
export type ApiSuccess<T> = {
  ok: true
  data: T
}

/** Expected User API failure. Transport and network failures may still reject. */
export type ApiFailure = {
  ok: false
  error: UserApiError
}

/**
 * Uniform result returned by every public UserApi method.
 *
 * The HTTP adapter converts a successful 204 response to
 * `{ ok: true, data: undefined }`; a 202 deletion response includes its
 * pending status in `data`.
 */
export type ApiResult<T> = ApiSuccess<T> | ApiFailure

export type GetUserResponse = User
export type UpdateUserResponse = User
/** The profile is deleted; Cognito cleanup may still be finalized asynchronously. */
export type DeleteUserResponse = { status: 'pending' } | undefined

/** Response from the private profile lookup used by backend services. */
export type GetUserProfileBySubjectResponse = UserProfileSummary
