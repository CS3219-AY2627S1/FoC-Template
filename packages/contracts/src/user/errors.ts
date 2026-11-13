/** A field that can receive a validation error from the User Service. */
export type UserField =
  | 'email'
  | 'password'
  | 'passwordConfirmation'
  | 'currentPassword'
  | 'newPassword'
  | 'newPasswordConfirmation'
  | 'code'
  | 'username'
  | 'profilePicture'
  | 'confirmation'

/** Stable, transport-neutral error codes returned by the User Service. */
export type UserApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_ALREADY_REGISTERED'
  | 'EMAIL_NOT_VERIFIED'
  | 'EMAIL_ALREADY_VERIFIED'
  | 'OTP_INVALID'
  | 'OTP_EXPIRED'
  | 'RATE_LIMITED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'PROFILE_NOT_FOUND'
  | 'USERNAME_TAKEN'
  | 'PASSWORD_REUSED'
  | 'USER_NOT_FOUND'
  | 'ALREADY_ADMIN'
  | 'NOT_ADMIN'
  | 'INTERNAL_ERROR'

/**
 * The body of every non-2xx User Service HTTP response.
 *
 * The HTTP status gives transport semantics; `code` gives stable application
 * semantics for clients. `fieldErrors` is present only for invalid inputs.
 * Statuses are mapped as follows: 400 for validation and invalid/expired OTPs,
 * 401 for invalid credentials or no session, 403 for forbidden or unverified
 * users, 404 for a missing profile, 409 for conflicts and reused passwords,
 * 429 for rate limits, and 500 for unexpected failures.
 */
export type UserApiError = {
  code: UserApiErrorCode
  message: string
  fieldErrors?: Partial<Record<UserField, string>>
}
